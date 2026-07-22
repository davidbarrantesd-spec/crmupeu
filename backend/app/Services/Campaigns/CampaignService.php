<?php

namespace App\Services\Campaigns;

use App\Jobs\LaunchCampaignJob;
use App\Models\AuditLog;
use App\Models\Campaign;
use App\Models\CampaignContact;
use App\Models\Contact;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CampaignService
{
    public function __construct(protected SegmentationService $segmentation) {}

    public function launch(Campaign $campaign): Campaign
    {
        $this->assertTransition($campaign, ['draft', 'scheduled', 'paused'], 'lanzar');

        $campaign->update(['status' => 'running', 'starts_at' => $campaign->starts_at ?? now()]);
        AuditLog::record('launched', 'campaigns', $campaign);

        LaunchCampaignJob::dispatch($campaign->id);

        return $campaign;
    }

    public function schedule(Campaign $campaign, string $startsAt): Campaign
    {
        $this->assertTransition($campaign, ['draft', 'paused'], 'programar');

        $campaign->update(['status' => 'scheduled', 'starts_at' => $startsAt]);
        AuditLog::record('scheduled', 'campaigns', $campaign);

        return $campaign;
    }

    public function pause(Campaign $campaign): Campaign
    {
        $this->assertTransition($campaign, ['running', 'scheduled'], 'pausar');
        $campaign->update(['status' => 'paused']);
        AuditLog::record('paused', 'campaigns', $campaign);

        return $campaign;
    }

    public function resume(Campaign $campaign): Campaign
    {
        $this->assertTransition($campaign, ['paused'], 'reanudar');
        $campaign->update(['status' => 'running']);
        AuditLog::record('resumed', 'campaigns', $campaign);

        return $campaign;
    }

    public function cancel(Campaign $campaign): Campaign
    {
        $this->assertTransition($campaign, ['draft', 'scheduled', 'running', 'paused'], 'cancelar');

        $campaign->update(['status' => 'cancelled']);
        $campaign->calls()->whereIn('status', ['pending', 'scheduled', 'queued'])
            ->update(['status' => 'cancelled']);
        AuditLog::record('cancelled', 'campaigns', $campaign);

        return $campaign;
    }

    public function duplicate(Campaign $campaign): Campaign
    {
        $copy = $campaign->replicate(['uuid', 'status', 'estimated_cost']);
        $copy->name = $campaign->name.' (copia)';
        $copy->status = 'draft';
        $copy->estimated_cost = 0;
        $copy->created_by = auth()->id();
        $copy->save();

        return $copy;
    }

    /**
     * Materializa el segmento en campaign_contacts. Idempotente.
     */
    public function populateContacts(Campaign $campaign): int
    {
        $query = $this->segmentation->query(
            $campaign->segment_filters ?? [],
            $campaign->type === 'whatsapp' ? 'whatsapp' : 'voice'
        );

        $count = 0;
        $query->with(['debts' => fn ($q) => $q->whereNotIn('status', ['paid', 'cancelled'])->orderByDesc('pending_balance')])
            ->chunkById(500, function ($contacts) use ($campaign, &$count) {
                $rows = [];
                foreach ($contacts as $contact) {
                    $rows[] = [
                        'campaign_id' => $campaign->id,
                        'contact_id' => $contact->id,
                        'debt_id' => $contact->debts->first()?->id,
                        'status' => 'pending',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }
                $count += count($rows);
                DB::table('campaign_contacts')->upsert($rows, ['campaign_id', 'contact_id'], ['debt_id']);
            });

        return $count;
    }

    public function addContacts(Campaign $campaign, array $contactUuids): int
    {
        $contacts = Contact::whereIn('uuid', $contactUuids)->get();
        foreach ($contacts as $contact) {
            CampaignContact::firstOrCreate(
                ['campaign_id' => $campaign->id, 'contact_id' => $contact->id],
                ['debt_id' => $contact->debts()->whereNotIn('status', ['paid', 'cancelled'])->orderByDesc('pending_balance')->value('id')]
            );
        }

        return $contacts->count();
    }

    public function progress(Campaign $campaign): array
    {
        $byStatus = $campaign->campaignContacts()
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')->pluck('total', 'status');

        $calls = $campaign->calls();
        $answered = (clone $calls)->whereNotNull('answered_at')->count();
        $totalCalls = (clone $calls)->count();

        return [
            'total' => $byStatus->sum(),
            'pending' => $byStatus['pending'] ?? 0,
            'in_progress' => $byStatus['in_progress'] ?? 0,
            'contacted' => $byStatus['contacted'] ?? 0,
            'not_contacted' => $byStatus['not_contacted'] ?? 0,
            'completed' => $byStatus['completed'] ?? 0,
            'excluded' => $byStatus['excluded'] ?? 0,
            'calls_total' => $totalCalls,
            'calls_answered' => $answered,
            'answered_rate' => $totalCalls > 0 ? round($answered / $totalCalls * 100, 1) : 0,
            'estimated_cost' => (float) $campaign->estimated_cost,
            'status' => $campaign->status,
        ];
    }

    protected function assertTransition(Campaign $campaign, array $allowedFrom, string $action): void
    {
        if (! in_array($campaign->status, $allowedFrom)) {
            throw ValidationException::withMessages([
                'status' => "No se puede {$action} una campaña en estado '{$campaign->status}'.",
            ]);
        }
    }
}
