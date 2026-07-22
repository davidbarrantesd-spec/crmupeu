<?php

namespace App\Http\Middleware;

use App\Models\Integration;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Twilio\Security\RequestValidator;

/**
 * Valida la firma X-Twilio-Signature de los webhooks.
 * Desactivable solo en sandbox (TWILIO_VALIDATE_SIGNATURE=false).
 */
class VerifyTwilioSignature
{
    public function handle(Request $request, Closure $next)
    {
        if (! filter_var(config('services.twilio.validate_signature'), FILTER_VALIDATE_BOOL)) {
            return $next($request);
        }

        $token = $this->resolveToken();
        $signature = $request->header('X-Twilio-Signature', '');

        if (! $token || ! (new RequestValidator($token))->validate($signature, $request->fullUrl(), $request->post())) {
            logger()->warning('webhook.invalid_signature', ['url' => $request->fullUrl(), 'ip' => $request->ip()]);
            abort(403, 'Firma de Twilio inválida.');
        }

        return $next($request);
    }

    /**
     * El token puede venir del entorno o de las credenciales cifradas que se
     * guardan desde la pantalla de Integraciones. Sin este fallback, configurar
     * Twilio solo por la interfaz dejaba los webhooks rechazados con 403.
     * Cache corto: los webhooks llegan en ráfagas durante las campañas.
     */
    protected function resolveToken(): ?string
    {
        $token = config('services.twilio.token');

        if ($token) {
            return $token;
        }

        return Cache::remember('twilio-webhook-token', 60, function () {
            $integration = Integration::where('provider', 'twilio')->where('status', 'active')->first();

            return $integration?->getCredentials()['auth_token'] ?? '';
        }) ?: null;
    }
}
