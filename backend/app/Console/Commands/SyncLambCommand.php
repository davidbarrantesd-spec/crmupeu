<?php

namespace App\Console\Commands;

use App\Models\AcademicLevel;
use App\Models\Campus;
use App\Models\Career;
use App\Models\Contact;
use App\Models\Faculty;
use App\Models\SystemSetting;
use App\Services\Contacts\ContactService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Sincronización incremental con LAMB (sistema académico UPeU).
 *
 * Consume la API REST de LAMB (ver docs/INTEGRACION-LAMB.md) trayendo los
 * estudiantes/deudas modificados desde la última corrida. Es inofensivo si
 * LAMB aún no está configurado: sale silenciosamente sin LAMB_API_URL.
 *
 * Llave maestra: id_persona (único por persona en LAMB).
 */
class SyncLambCommand extends Command
{
    protected $signature = 'crm:sync-lamb {--full : Ignora el cursor y trae todo}';

    protected $description = 'Sincroniza estudiantes y deudas desde LAMB (incremental)';

    public function handle(): int
    {
        $baseUrl = rtrim((string) config('services.lamb.url'), '/');
        $token = (string) config('services.lamb.token');

        if ($baseUrl === '' || $token === '') {
            $this->line('LAMB no configurado (LAMB_API_URL / LAMB_API_TOKEN); nada que hacer.');

            return self::SUCCESS;
        }

        $cursor = $this->option('full') ? null : SystemSetting::getValue('lamb.sync_cursor');
        $page = 1;
        $processed = 0;

        do {
            $response = Http::withToken($token)
                ->acceptJson()
                ->timeout(60)
                ->retry(2, 2000)
                ->get("{$baseUrl}/students", array_filter([
                    'updated_since' => $cursor,
                    'page' => $page,
                    'per_page' => 200,
                ]));

            if ($response->failed()) {
                $this->error("LAMB respondió {$response->status()}");

                return self::FAILURE;
            }

            $body = $response->json();

            foreach ($body['data'] ?? [] as $student) {
                $this->upsertStudent($student);
                $processed++;
            }

            $hasMore = ($body['meta']['current_page'] ?? 1) < ($body['meta']['last_page'] ?? 1);
            $page++;
        } while ($hasMore);

        SystemSetting::setValue('lamb.sync_cursor', now()->toIso8601String(), false, 'lamb');
        $this->info("Sincronizados {$processed} estudiantes desde LAMB.");

        if ($processed > 0) {
            $this->call('crm:segment');
        }

        return self::SUCCESS;
    }

    protected function upsertStudent(array $s): void
    {
        $campusId = isset($s['campus']) ? Campus::firstOrCreate(
            ['code' => $s['campus']['code'] ?? Str::slug($s['campus']['name'])],
            ['name' => $s['campus']['name']]
        )->id : null;

        $facultyId = isset($s['facultad']) ? Faculty::firstOrCreate(
            ['code' => $s['facultad']['code'] ?? Str::slug($s['facultad']['name'])],
            ['name' => $s['facultad']['name']]
        )->id : null;

        $careerId = isset($s['carrera']) ? Career::firstOrCreate(
            ['code' => $s['carrera']['code'] ?? Str::slug($s['carrera']['name'])],
            ['name' => $s['carrera']['name'], 'faculty_id' => $facultyId]
        )->id : null;

        $levelId = isset($s['nivel']) ? AcademicLevel::firstOrCreate(
            ['code' => Str::slug($s['nivel'])],
            ['name' => $s['nivel'], 'category' => str_contains(mb_strtolower($s['nivel']), 'pregrado') ? 'pregrado' : 'posgrado']
        )->id : null;

        $contact = Contact::updateOrCreate(
            ['id_persona' => $s['id_persona']],
            array_filter([
                'student_code' => $s['codigo_estudiante'] ?? null,
                'first_name' => $s['nombres'] ?? null,
                'last_name' => $s['apellidos'] ?? null,
                'dni' => $s['dni'] ?? null,
                'phone' => ContactService::normalizePhone($s['celular'] ?? null),
                'email' => $s['email'] ?? null,
                'campus_id' => $campusId,
                'faculty_id' => $facultyId,
                'career_id' => $careerId,
                'academic_level_id' => $levelId,
                'modality' => $s['modalidad'] ?? null,
                'enrollment_status' => $s['estado_matricula'] ?? null,
            ], fn ($v) => $v !== null) + ['source' => 'lamb', 'lamb_synced_at' => now()]
        );

        foreach ($s['deudas'] ?? [] as $d) {
            $contact->debts()->withTrashed()->updateOrCreate(
                ['code' => $d['codigo']],
                [
                    'concept' => $d['concepto'] ?? 'Deuda LAMB',
                    'original_amount' => (float) ($d['monto_original'] ?? $d['saldo_pendiente'] ?? 0),
                    'pending_balance' => (float) ($d['saldo_pendiente'] ?? 0),
                    'currency' => $d['moneda'] ?? 'PEN',
                    'due_date' => $d['fecha_vencimiento'] ?? null,
                    'academic_period' => $d['periodo'] ?? null,
                    'status' => $d['estado'] ?? (($d['saldo_pendiente'] ?? 0) > 0 ? 'pending' : 'paid'),
                    'paid_at' => $d['fecha_pago'] ?? null,
                    'origin' => 'lamb',
                    'deleted_at' => null,
                ]
            );
        }
    }
}
