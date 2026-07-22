<?php

namespace App\Jobs;

use App\Events\CallUpdated;
use App\Models\Call;
use App\Models\CampaignContact;
use App\Services\Calls\CallService;
use App\Services\FollowUps\FollowUpRuleEngine;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Se ejecuta cuando una llamada llega a estado final: actualiza el pivot de
 * campaña, registra costo, evalúa reglas de seguimiento y acciones post-llamada.
 */
class ProcessCallResultJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [10, 60];

    public function __construct(public int $callId) {}

    public function handle(CallService $callService, FollowUpRuleEngine $ruleEngine): void
    {
        $call = Call::with(['campaign', 'contact'])->find($this->callId);

        if (! $call || ! $call->isFinal()) {
            return;
        }

        if ($call->duration_seconds) {
            $callService->recordCost($call);
        }

        if ($call->campaign_id) {
            $pivotStatus = match ($call->status) {
                'completed' => 'contacted',
                'cancelled' => 'excluded',
                default => null, // no_answer/busy/failed → sigue in_progress para reintento
            };

            $update = ['last_result' => $call->result ?? $call->status];

            if ($pivotStatus) {
                $update['status'] = $pivotStatus;
            } elseif ($call->campaign) {
                $update['next_attempt_at'] = now()->addMinutes($call->campaign->retry_minutes);
            }

            CampaignContact::where('campaign_id', $call->campaign_id)
                ->where('contact_id', $call->contact_id)
                ->update($update);
        }

        $ruleEngine->handleCallResult($call);

        // Acciones post-llamada configuradas en la campaña (ej. WhatsApp tras contestar).
        $actions = $call->campaign?->post_call_actions ?? [];
        if (($actions['send_whatsapp_after_answer'] ?? false) && $call->answered_at && $call->contact->isContactable('whatsapp')) {
            SendCampaignWhatsAppJob::dispatch($call->id);
        }

        broadcast(new CallUpdated($call))->toOthers();

        if ($call->campaign_id) {
            event(new \App\Events\CampaignProgressUpdated($call->campaign));
        }
    }
}
