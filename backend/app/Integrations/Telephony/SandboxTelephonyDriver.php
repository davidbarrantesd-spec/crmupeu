<?php

namespace App\Integrations\Telephony;

use App\Jobs\SimulateCallLifecycleJob;
use App\Models\Call;
use Illuminate\Support\Str;

/**
 * Driver de desarrollo: simula el ciclo de vida completo de una llamada
 * (marcando → sonando → contestada/no contestada → finalizada) sin Twilio real.
 */
class SandboxTelephonyDriver implements TelephonyProvider
{
    public function placeCall(Call $call, string $answerUrl, string $statusCallbackUrl): string
    {
        $sid = 'SBX'.Str::upper(Str::random(31));

        SimulateCallLifecycleJob::dispatch($call->id, $sid)->delay(now()->addSeconds(2));

        return $sid;
    }

    public function cancelCall(string $callSid): void
    {
        // En sandbox no hay llamada real que cancelar.
    }

    public function fetchRecording(string $recordingUrl): string
    {
        // Devuelve un WAV de silencio de 1 segundo (44 bytes header + samples) para pruebas.
        $sampleRate = 8000;
        $samples = str_repeat("\x00\x00", $sampleRate);
        $dataSize = strlen($samples);

        return 'RIFF'.pack('V', 36 + $dataSize).'WAVEfmt '
            .pack('VvvVVvv', 16, 1, 1, $sampleRate, $sampleRate * 2, 2, 16)
            .'data'.pack('V', $dataSize).$samples;
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
