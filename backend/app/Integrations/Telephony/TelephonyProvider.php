<?php

namespace App\Integrations\Telephony;

use App\Models\Call;

interface TelephonyProvider
{
    /**
     * Inicia una llamada saliente. Devuelve el SID del proveedor.
     */
    public function placeCall(Call $call, string $answerUrl, string $statusCallbackUrl): string;

    /**
     * Cancela/termina una llamada en curso.
     */
    public function cancelCall(string $callSid): void;

    /**
     * Descarga una grabación remota y devuelve su contenido binario.
     */
    public function fetchRecording(string $recordingUrl): string;

    /**
     * Verifica credenciales contra el proveedor.
     */
    public function verify(): bool;

    public function name(): string;
}
