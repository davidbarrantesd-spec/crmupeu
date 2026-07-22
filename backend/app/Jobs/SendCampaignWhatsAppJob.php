<?php

namespace App\Jobs;

use App\Models\Call;
use App\Models\WhatsappTemplate;
use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SendCampaignWhatsAppJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [30, 300];

    public function __construct(public int $callId) {}

    public function handle(WhatsAppService $service): void
    {
        $call = Call::with(['contact', 'campaign'])->find($this->callId);

        if (! $call || ! $call->contact->isContactable('whatsapp')) {
            return;
        }

        $config = $call->campaign?->whatsapp_config ?? [];
        $templateUuid = $config['template_uuid'] ?? null;
        $template = $templateUuid
            ? WhatsappTemplate::where('uuid', $templateUuid)->first()
            : ($call->campaign?->whatsapp_template_id ? WhatsappTemplate::find($call->campaign->whatsapp_template_id) : null);

        if ($template) {
            $service->sendTemplate($call->contact, $template, sentByType: 'campaign');
        } elseif (! empty($config['message'])) {
            $service->sendText($call->contact, $config['message'], sentByType: 'campaign');
        }
    }
}
