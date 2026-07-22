<?php

namespace App\Jobs;

use App\Events\MessageStatusUpdated;
use App\Models\Message;
use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * SOLO SANDBOX: simula entrega → lectura del mensaje y, a veces,
 * una respuesta entrante del contacto para probar la bandeja.
 */
class SimulateWhatsAppLifecycleJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public string $sid, public string $to) {}

    public function handle(WhatsAppService $service): void
    {
        $message = Message::where('message_sid', $this->sid)->first();

        if (! $message) {
            return;
        }

        $message->update(['status' => 'delivered']);
        broadcast(new MessageStatusUpdated($message))->toOthers();

        $roll = hexdec(substr(md5($this->sid), 0, 2)) % 100;

        if ($roll < 80) {
            $message->update(['status' => 'read']);
            broadcast(new MessageStatusUpdated($message->fresh()))->toOthers();
        }

        // 45% responde a los pocos segundos.
        if ($roll < 45) {
            $replies = [
                'Hola, sí he recibido su mensaje.',
                '¿Me puede dar más información?',
                'Voy a pagar esta semana, gracias.',
                'No puedo pagar todavía, ¿puedo pagar en partes?',
                'Por favor no me escriban más.',
            ];

            $service->receiveInbound(
                $this->to,
                $replies[$roll % count($replies)],
                'SBI'.substr(md5($this->sid.'reply'), 0, 29)
            );
        }
    }
}
