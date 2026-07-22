<?php

namespace App\Integrations\Messaging;

use App\Jobs\SimulateWhatsAppLifecycleJob;
use Illuminate\Support\Str;

/**
 * Driver de desarrollo: simula envío, entrega, lectura y respuestas entrantes.
 */
class SandboxWhatsAppDriver implements WhatsAppProvider
{
    public function send(string $to, array $payload, string $statusCallbackUrl): string
    {
        $sid = 'SBM'.Str::upper(Str::random(31));

        SimulateWhatsAppLifecycleJob::dispatch($sid, $to)->delay(now()->addSeconds(2));

        return $sid;
    }

    public function verify(): bool
    {
        return true;
    }

    public function name(): string
    {
        return 'sandbox';
    }
}
