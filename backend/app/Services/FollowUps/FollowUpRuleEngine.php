<?php

namespace App\Services\FollowUps;

use App\Models\Agreement;
use App\Models\Call;
use App\Models\FollowUp;
use App\Models\FollowUpRule;

/**
 * Motor de reglas de seguimiento: ante un evento (resultado de llamada,
 * acuerdo incumplido, DTMF, etc.) genera la acción configurada.
 */
class FollowUpRuleEngine
{
    /**
     * Evalúa reglas para el resultado de una llamada finalizada.
     */
    public function handleCallResult(Call $call): void
    {
        $trigger = match ($call->status) {
            'no_answer' => 'call_no_answer',
            'busy' => 'call_busy',
            'failed' => 'call_failed',
            default => match ($call->result) {
                'payment_promise' => 'payment_promise',
                default => null,
            },
        };

        if (! $trigger) {
            return;
        }

        $campaign = $call->campaign;
        $maxAttempts = $campaign?->max_attempts ?? 3;

        if (in_array($trigger, ['call_no_answer', 'call_busy', 'call_failed']) && $call->attempt_number >= $maxAttempts) {
            $this->apply($this->rulesFor('max_attempts', $call->campaign_id), $call);

            $call->campaign_id && \App\Models\CampaignContact::where('campaign_id', $call->campaign_id)
                ->where('contact_id', $call->contact_id)
                ->update(['status' => 'not_contacted']);

            return;
        }

        $this->apply($this->rulesFor($trigger, $call->campaign_id), $call);
    }

    public function handleDtmf(Call $call, string $action): void
    {
        $trigger = match ($action) {
            'send_whatsapp' => 'dtmf_whatsapp',
            'transfer_advisor' => 'dtmf_advisor',
            default => null,
        };

        if ($trigger) {
            $this->apply($this->rulesFor($trigger, $call->campaign_id), $call);
        }
    }

    public function handleBrokenAgreement(Agreement $agreement): void
    {
        $rules = $this->rulesFor('agreement_broken', null);

        foreach ($rules as $rule) {
            $this->createFollowUp($rule, [
                'contact_id' => $agreement->contact_id,
                'agreement_id' => $agreement->id,
            ]);
        }
    }

    /** @return \Illuminate\Support\Collection<int, FollowUpRule> */
    protected function rulesFor(string $trigger, ?int $campaignId)
    {
        $rules = FollowUpRule::where('active', true)
            ->where('trigger_event', $trigger)
            ->where(function ($q) use ($campaignId) {
                $q->whereNull('campaign_id');
                if ($campaignId) {
                    $q->orWhere('campaign_id', $campaignId);
                }
            })
            ->get();

        // Las reglas específicas de campaña tienen prioridad sobre las globales.
        $campaignRules = $rules->whereNotNull('campaign_id');

        return $campaignRules->isNotEmpty() ? $campaignRules : $rules;
    }

    protected function apply($rules, Call $call): void
    {
        foreach ($rules as $rule) {
            $this->createFollowUp($rule, [
                'contact_id' => $call->contact_id,
                'campaign_id' => $call->campaign_id,
                'call_id' => $call->id,
                'attempt_number' => $call->attempt_number + 1,
            ]);
        }
    }

    protected function createFollowUp(FollowUpRule $rule, array $attributes): FollowUp
    {
        $type = match ($rule->action) {
            'retry_call' => 'auto_call',
            'schedule_ai_call' => 'ai_call',
            'send_whatsapp' => 'whatsapp',
            'create_advisor_task' => 'advisor_task',
            'verify_payment' => 'payment_verification',
            default => 'advisor_task',
        };

        return FollowUp::create($attributes + [
            'type' => $type,
            'scheduled_at' => now()->addMinutes($rule->delay_minutes),
            'channel' => $type === 'whatsapp' ? 'whatsapp' : ($type === 'advisor_task' ? 'internal' : 'voice'),
            'priority' => $rule->config['priority'] ?? 5,
            'status' => 'pending',
            'follow_up_rule_id' => $rule->id,
        ]);
    }
}
