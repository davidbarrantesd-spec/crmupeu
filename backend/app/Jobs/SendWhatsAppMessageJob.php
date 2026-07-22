<?php

namespace App\Jobs;

use App\Events\MessageStatusUpdated;
use App\Integrations\IntegrationManager;
use App\Models\CostEntry;
use App\Models\Message;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

class SendWhatsAppMessageJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [15, 120];

    public function __construct(public int $messageId) {}

    public function handle(IntegrationManager $integrations): void
    {
        $lock = Cache::lock("send-message-{$this->messageId}", 60);

        if (! $lock->get()) {
            return;
        }

        try {
            $message = Message::with('conversation')->find($this->messageId);

            if (! $message || $message->status !== 'queued' || $message->message_sid) {
                return;
            }

            $payload = ['body' => $message->body];

            if ($message->whatsapp_template_id && $message->template?->provider_template_id) {
                $payload = [
                    'template_sid' => $message->template->provider_template_id,
                    'variables' => $message->metadata['variables'] ?? [],
                ];
            }

            if ($message->media_url) {
                $payload['media_url'] = $message->media_url;
            }

            try {
                $sid = $integrations->whatsapp()->send(
                    $message->conversation->phone,
                    $payload,
                    route('webhooks.twilio.whatsapp.status')
                );

                $message->update(['status' => 'sent', 'message_sid' => $sid]);

                CostEntry::create([
                    'campaign_id' => $message->conversation->campaign_id,
                    'message_id' => $message->id,
                    'type' => 'whatsapp',
                    'amount' => 0.005,
                    'date' => now()->toDateString(),
                ]);
            } catch (\Throwable $e) {
                $message->update(['status' => 'failed', 'error_message' => $e->getMessage()]);
                throw $e;
            }

            broadcast(new MessageStatusUpdated($message->fresh()))->toOthers();
        } finally {
            $lock->release();
        }
    }
}
