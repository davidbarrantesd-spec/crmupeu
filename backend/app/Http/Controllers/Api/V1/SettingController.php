<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Integrations\IntegrationManager;
use App\Models\AuditLog;
use App\Models\CostEntry;
use App\Models\Integration;
use App\Models\SystemSetting;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SettingController extends Controller
{
    protected const EDITABLE_SETTINGS = [
        'general.language', 'general.timezone', 'general.default_voice',
        'limits.call_daily_limit', 'limits.call_hourly_limit', 'limits.call_max_concurrency',
        'limits.monthly_budget', 'limits.cost_alert_pct',
        'recordings.retention_days', 'recordings.enabled',
    ];

    public function index()
    {
        $settings = SystemSetting::where('is_encrypted', false)->get()
            ->mapWithKeys(fn ($s) => [$s->key => $s->value]);

        return response()->json(['data' => $settings]);
    }

    public function update(Request $request)
    {
        $data = $request->validate(['settings' => ['required', 'array']]);

        foreach ($data['settings'] as $key => $value) {
            abort_if(! in_array($key, self::EDITABLE_SETTINGS), 422, "Configuración desconocida: {$key}");
            SystemSetting::setValue($key, $value === null ? null : (string) $value, false, explode('.', $key)[0]);
        }

        AuditLog::record('updated', 'settings', null, ['new_values' => $data['settings']]);

        return $this->index();
    }

    // ---- Integraciones ----

    /**
     * Campos de credenciales que espera cada proveedor. Se envían siempre, aunque
     * todavía no haya nada guardado: sin esto la pantalla no puede dibujar los
     * campos para una integración nueva y queda imposible configurarla.
     */
    protected const CREDENTIAL_FIELDS = [
        'twilio' => ['account_sid', 'auth_token', 'phone_number'],
        'whatsapp' => ['account_sid', 'auth_token', 'whatsapp_from'],
        'anthropic' => ['api_key', 'model'],
        'openai' => ['api_key', 'model'],
        'storage' => ['key', 'secret', 'region', 'bucket', 'endpoint'],
    ];

    public function integrations()
    {
        $data = collect(self::CREDENTIAL_FIELDS)->map(function (array $fields, string $provider) {
            $integration = Integration::where('provider', $provider)->first();
            $saved = $integration?->maskedCredentials() ?? [];

            // Cada campo esperado aparece siempre; con su valor enmascarado si ya existe.
            $credentials = collect($fields)
                ->mapWithKeys(fn (string $field) => [$field => $saved[$field] ?? ''])
                ->all();

            return [
                'provider' => $provider,
                'status' => $integration?->status ?? 'sandbox',
                'credentials' => $credentials,
                'config' => $integration?->config ?? [],
                'last_verified_at' => $integration?->last_verified_at?->toIso8601String(),
            ];
        })->values();

        return response()->json(['data' => $data]);
    }

    public function updateIntegration(Request $request, string $provider)
    {
        abort_if(! in_array($provider, ['twilio', 'whatsapp', 'anthropic', 'openai', 'storage']), 404);

        $data = $request->validate([
            'credentials' => ['sometimes', 'array'],
            'config' => ['sometimes', 'array'],
            'status' => ['sometimes', Rule::in(['sandbox', 'active', 'disabled'])],
        ]);

        $integration = Integration::firstOrCreate(['provider' => $provider], ['status' => 'sandbox']);

        if (isset($data['credentials'])) {
            // Mezcla con las existentes: los valores enmascarados (•) no sobreescriben.
            $existing = $integration->getCredentials();
            foreach ($data['credentials'] as $key => $value) {
                if ($value !== null && ! str_contains((string) $value, '•')) {
                    $existing[$key] = $value;
                }
            }
            $integration->setCredentials($existing);
        }

        if (isset($data['config'])) {
            $integration->config = $data['config'];
        }

        if (isset($data['status'])) {
            $integration->status = $data['status'];
        } elseif ($integration->status === 'sandbox' && $this->hasRequiredCredentials($provider, $integration->getCredentials())) {
            // Guardar credenciales completas equivale a querer usarlas: si no se
            // activa aquí, quedarían guardadas pero el sistema seguiría en sandbox.
            $integration->status = 'active';
        }

        $integration->save();

        AuditLog::record('updated', 'integrations', $integration, [
            'new_values' => ['provider' => $provider, 'status' => $integration->status, 'credential_keys' => array_keys($data['credentials'] ?? [])],
        ]);

        return response()->json(['data' => [
            'provider' => $provider,
            'status' => $integration->status,
            'credentials' => $integration->maskedCredentials(),
            'config' => $integration->config,
        ]]);
    }

    /**
     * Credenciales mínimas para que un proveedor pueda operar de verdad.
     * `model`, `endpoint` y similares son opcionales y tienen valor por defecto.
     */
    protected function hasRequiredCredentials(string $provider, array $credentials): bool
    {
        $required = match ($provider) {
            'twilio' => ['account_sid', 'auth_token', 'phone_number'],
            'whatsapp' => ['account_sid', 'auth_token', 'whatsapp_from'],
            'anthropic', 'openai' => ['api_key'],
            'storage' => ['key', 'secret', 'bucket'],
            default => [],
        };

        foreach ($required as $field) {
            if (empty($credentials[$field])) {
                return false;
            }
        }

        return $required !== [];
    }

    public function verifyIntegration(string $provider, IntegrationManager $manager)
    {
        $ok = false;
        $error = null;

        try {
            $ok = match ($provider) {
                'twilio' => $manager->telephony()->verify(),
                'whatsapp' => $manager->whatsapp()->verify(),
                'anthropic', 'openai' => $manager->llm()->verify(),
                'storage' => \Illuminate\Support\Facades\Storage::disk('s3')->put('.verify', (string) now()->timestamp),
                default => abort(404),
            };
        } catch (\Throwable $e) {
            $error = $e->getMessage();
        }

        if ($ok) {
            Integration::where('provider', $provider)->update(['last_verified_at' => now()]);
        }

        return response()->json(['data' => ['ok' => $ok, 'error' => $error]]);
    }

    // ---- Costos ----

    public function costsSummary(Request $request)
    {
        $from = $request->date_from ?? now()->startOfMonth()->toDateString();
        $to = $request->date_to ?? now()->toDateString();

        $query = CostEntry::whereBetween('date', [$from, $to])
            ->when($request->campaign, fn ($q, $v) => $q->whereHas('campaign', fn ($q2) => $q2->where('uuid', $v)));

        return response()->json(['data' => [
            'total' => (float) (clone $query)->sum('amount'),
            'by_type' => (clone $query)->selectRaw('type, sum(amount) as total')->groupBy('type')->pluck('total', 'type'),
            'by_day' => (clone $query)->selectRaw("to_char(date, 'YYYY-MM-DD') as day, sum(amount) as total")->groupBy('day')->orderBy('day')->get(),
            'budget' => (float) SystemSetting::getValue('limits.monthly_budget', 0),
        ]]);
    }
}
