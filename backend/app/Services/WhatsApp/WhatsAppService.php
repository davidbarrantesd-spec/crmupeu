<?php

namespace App\Services\WhatsApp;

use App\Jobs\SendWhatsAppMessageJob;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\WhatsappTemplate;
use App\Services\Shared\VariableRenderer;
use Illuminate\Validation\ValidationException;

class WhatsAppService
{
    public function __construct(protected VariableRenderer $renderer) {}

    public function findOrCreateConversation(Contact $contact): Conversation
    {
        return Conversation::firstOrCreate(
            ['contact_id' => $contact->id, 'channel' => 'whatsapp'],
            ['phone' => $contact->phone, 'status' => 'open']
        );
    }

    /**
     * Envía texto libre. Solo permitido dentro de la ventana de 24 horas
     * (salvo modo sandbox, donde se simula).
     */
    public function sendText(Contact $contact, string $body, ?int $userId = null, string $sentByType = 'user', ?string $mediaUrl = null): Message
    {
        $this->assertConsent($contact);
        $conversation = $this->findOrCreateConversation($contact);

        if (! $conversation->isWithin24hWindow() && $sentByType === 'user' && config('services.whatsapp.driver') !== 'sandbox') {
            throw ValidationException::withMessages([
                'window' => 'La ventana de 24 horas expiró: use una plantilla aprobada.',
            ]);
        }

        $message = $conversation->messages()->create([
            'direction' => 'outbound',
            'type' => $mediaUrl ? 'document' : 'text',
            'body' => $body,
            'media_url' => $mediaUrl,
            'status' => 'queued',
            'user_id' => $userId,
            'sent_by_type' => $sentByType,
        ]);

        $conversation->update(['last_message_at' => now()]);
        SendWhatsAppMessageJob::dispatch($message->id);

        return $message;
    }

    public function sendTemplate(Contact $contact, WhatsappTemplate $template, array $variables = [], ?int $userId = null, string $sentByType = 'user'): Message
    {
        $this->assertConsent($contact);
        $conversation = $this->findOrCreateConversation($contact);

        $autoVars = $this->renderer->variables($contact);
        $body = $template->render($variables + $autoVars);

        $message = $conversation->messages()->create([
            'direction' => 'outbound',
            'type' => 'template',
            'body' => $body,
            'status' => 'queued',
            'whatsapp_template_id' => $template->id,
            'user_id' => $userId,
            'sent_by_type' => $sentByType,
            'metadata' => ['variables' => $variables],
        ]);

        $conversation->update(['last_message_at' => now()]);
        SendWhatsAppMessageJob::dispatch($message->id);

        return $message;
    }

    /**
     * Procesa un mensaje entrante (webhook).
     */
    public function receiveInbound(string $fromPhone, string $body, ?string $messageSid = null, ?string $mediaUrl = null, ?string $mediaMime = null): Message
    {
        $phone = str_replace('whatsapp:', '', $fromPhone);

        $contact = Contact::where('phone', $phone)
            ->orWhere('phone_secondary', $phone)
            ->first();

        if (! $contact) {
            $contact = Contact::create([
                'first_name' => 'Desconocido',
                'last_name' => $phone,
                'phone' => $phone,
                'status' => 'active',
                'source' => 'whatsapp_inbound',
            ]);
        }

        $conversation = $this->findOrCreateConversation($contact);

        if ($conversation->status === 'closed') {
            $conversation->status = 'open';
        }

        $message = $conversation->messages()->create([
            'direction' => 'inbound',
            'type' => $mediaUrl ? 'document' : 'text',
            'body' => $body,
            'media_url' => $mediaUrl,
            'media_mime' => $mediaMime,
            'status' => 'delivered',
            'message_sid' => $messageSid,
            'sent_by_type' => 'user',
        ]);

        $conversation->forceFill([
            'last_message_at' => now(),
            'last_inbound_at' => now(),
            'unread_count' => $conversation->unread_count + 1,
        ])->save();

        event(new \App\Events\MessageReceived($message));

        return $message;
    }

    protected function assertConsent(Contact $contact): void
    {
        if (! $contact->isContactable('whatsapp')) {
            throw ValidationException::withMessages([
                'contact' => 'El contacto no tiene consentimiento para WhatsApp o está marcado como no contactar.',
            ]);
        }
    }
}
