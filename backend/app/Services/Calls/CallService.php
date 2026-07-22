<?php

namespace App\Services\Calls;

use App\Jobs\PlaceCallJob;
use App\Models\AuditLog;
use App\Models\Call;
use App\Models\Campaign;
use App\Models\CampaignContact;
use App\Models\Contact;
use App\Models\CostEntry;
use App\Services\Settings\CostGuard;
use Illuminate\Validation\ValidationException;

class CallService
{
    public function __construct(protected CostGuard $costGuard) {}

    /**
     * Crea y encola una llamada manual desde la ficha del contacto.
     */
    public function createManualCall(Contact $contact, array $data): Call
    {
        if (! $contact->isContactable('voice')) {
            throw ValidationException::withMessages([
                'contact' => 'El contacto no es contactable por voz (sin consentimiento, no contactar o teléfono inválido).',
            ]);
        }

        $this->costGuard->assertCallAllowed();

        $call = Call::create([
            'contact_id' => $contact->id,
            'campaign_id' => $data['campaign_id'] ?? null,
            'debt_id' => $data['debt_id'] ?? $contact->debts()->whereNotIn('status', ['paid', 'cancelled'])->value('id'),
            'type' => $data['type'],
            'to_number' => $contact->phone,
            'from_number' => $data['from_number'] ?? config('services.twilio.phone_number'),
            'status' => 'pending',
            'scheduled_at' => $data['scheduled_at'] ?? now(),
            'user_id' => auth()->id(),
            'prompt_version_id' => $data['prompt_version_id'] ?? null,
        ]);

        $call->addEvent('created', ['manual' => true, 'tts_message' => $data['tts_message'] ?? null, 'audio_url' => $data['audio_url'] ?? null]);

        PlaceCallJob::dispatch($call->id, [
            'tts_message' => $data['tts_message'] ?? null,
            'audio_url' => $data['audio_url'] ?? null,
        ]);

        return $call;
    }

    /**
     * Crea la llamada correspondiente a un contacto de campaña.
     */
    public function createForCampaignContact(Campaign $campaign, CampaignContact $campaignContact): Call
    {
        $contact = $campaignContact->contact;

        $call = Call::create([
            'contact_id' => $contact->id,
            'campaign_id' => $campaign->id,
            'debt_id' => $campaignContact->debt_id,
            'type' => $campaign->type === 'mixed' ? 'recorded_audio' : $campaign->type,
            'to_number' => $contact->phone,
            'from_number' => $campaign->from_number ?: config('services.twilio.phone_number'),
            'status' => 'pending',
            'scheduled_at' => now(),
            'attempt_number' => $campaignContact->attempts + 1,
            'prompt_version_id' => $campaign->prompt_version_id,
        ]);

        $campaignContact->update([
            'status' => 'in_progress',
            'attempts' => $campaignContact->attempts + 1,
            'last_attempt_at' => now(),
        ]);

        return $call;
    }

    public function cancel(Call $call): Call
    {
        if ($call->isFinal()) {
            throw ValidationException::withMessages(['status' => 'La llamada ya finalizó.']);
        }

        if ($call->twilio_call_sid) {
            app(\App\Integrations\IntegrationManager::class)->telephony()->cancelCall($call->twilio_call_sid);
        }

        $call->update(['status' => 'cancelled', 'ended_at' => now()]);
        $call->addEvent('cancelled', ['by' => auth()->id()]);
        AuditLog::record('cancelled', 'calls', $call);

        return $call;
    }

    /**
     * Registra el costo estimado de una llamada finalizada.
     */
    public function recordCost(Call $call): void
    {
        $minutes = max(1, (int) ceil(($call->duration_seconds ?? 0) / 60));
        $cost = round($minutes * 0.014, 4); // tarifa referencial saliente Twilio

        $call->update(['estimated_cost' => $cost]);

        CostEntry::create([
            'campaign_id' => $call->campaign_id,
            'call_id' => $call->id,
            'type' => 'call',
            'amount' => $cost,
            'date' => now()->toDateString(),
        ]);

        if ($call->campaign_id) {
            $call->campaign?->increment('estimated_cost', $cost);
        }
    }
}
