<?php

namespace App\Jobs;

use App\Models\FollowUp;
use App\Models\WhatsappTemplate;
use App\Services\Calls\CallService;
use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

/**
 * Ejecuta un seguimiento vencido: reintento de llamada, llamada IA,
 * WhatsApp o deja la tarea lista para un asesor.
 */
class ProcessFollowUpJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public array $backoff = [60];

    public function __construct(public int $followUpId) {}

    public function handle(CallService $callService, WhatsAppService $whatsAppService): void
    {
        $lock = Cache::lock("follow-up-{$this->followUpId}", 120);

        if (! $lock->get()) {
            return;
        }

        try {
            $followUp = FollowUp::with(['contact', 'campaign', 'agreement'])->find($this->followUpId);

            if (! $followUp || $followUp->status !== 'pending') {
                return;
            }

            $followUp->update(['status' => 'in_progress']);
            $contact = $followUp->contact;

            switch ($followUp->type) {
                case 'auto_call':
                case 'ai_call':
                    if (! $contact->isContactable('voice')) {
                        $followUp->update(['status' => 'cancelled', 'result' => 'contacto_no_contactable']);

                        return;
                    }

                    $promptVersionId = $followUp->campaign?->prompt_version_id;
                    $call = \App\Models\Call::create([
                        'contact_id' => $contact->id,
                        'campaign_id' => $followUp->campaign_id,
                        'type' => $followUp->type === 'ai_call' && $promptVersionId ? 'ai_conversational' : ($followUp->campaign?->type ?? 'tts'),
                        'to_number' => $contact->phone,
                        'from_number' => $followUp->campaign?->from_number ?: config('services.twilio.phone_number'),
                        'status' => 'pending',
                        'scheduled_at' => now(),
                        'attempt_number' => $followUp->attempt_number,
                        'prompt_version_id' => $promptVersionId,
                    ]);
                    PlaceCallJob::dispatch($call->id);
                    $followUp->update(['status' => 'done', 'result' => 'llamada_creada', 'call_id' => $call->id]);
                    break;

                case 'whatsapp':
                    if (! $contact->isContactable('whatsapp')) {
                        $followUp->update(['status' => 'cancelled', 'result' => 'sin_consentimiento_whatsapp']);

                        return;
                    }

                    $templateUuid = $followUp->rule?->config['template_uuid'] ?? null;
                    $template = $templateUuid ? WhatsappTemplate::where('uuid', $templateUuid)->first() : WhatsappTemplate::first();

                    if ($template) {
                        $whatsAppService->sendTemplate($contact, $template, sentByType: 'system');
                        $followUp->update(['status' => 'done', 'result' => 'whatsapp_enviado']);
                    } else {
                        $followUp->update(['status' => 'cancelled', 'result' => 'sin_plantilla']);
                    }
                    break;

                case 'payment_verification':
                case 'advisor_task':
                case 'manual_call':
                default:
                    // Tareas humanas: permanecen pendientes de gestión, solo se marcan como listas.
                    $followUp->update(['status' => 'pending']);
                    break;
            }
        } finally {
            $lock->release();
        }
    }
}
