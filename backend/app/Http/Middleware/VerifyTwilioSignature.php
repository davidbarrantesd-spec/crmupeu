<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
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

        $token = config('services.twilio.token');
        $signature = $request->header('X-Twilio-Signature', '');

        if (! $token || ! (new RequestValidator($token))->validate($signature, $request->fullUrl(), $request->post())) {
            logger()->warning('webhook.invalid_signature', ['url' => $request->fullUrl(), 'ip' => $request->ip()]);
            abort(403, 'Firma de Twilio inválida.');
        }

        return $next($request);
    }
}
