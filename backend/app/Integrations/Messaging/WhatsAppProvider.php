<?php

namespace App\Integrations\Messaging;

interface WhatsAppProvider
{
    /**
     * Envía un mensaje de WhatsApp. Devuelve el SID del proveedor.
     *
     * @param  array{body?: string, template_sid?: string, variables?: array, media_url?: string}  $payload
     */
    public function send(string $to, array $payload, string $statusCallbackUrl): string;

    public function verify(): bool;

    public function name(): string;
}
