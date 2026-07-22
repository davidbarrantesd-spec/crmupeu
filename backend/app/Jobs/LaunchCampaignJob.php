<?php

namespace App\Jobs;

use App\Models\Campaign;
use App\Services\Campaigns\CampaignService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Materializa el segmento de la campaña y deja los contactos listos
 * para que DispatchCampaignCallsJob los procese.
 */
class LaunchCampaignJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [30, 120];

    public function __construct(public int $campaignId) {}

    public function handle(CampaignService $service): void
    {
        $campaign = Campaign::find($this->campaignId);

        if (! $campaign || $campaign->status !== 'running') {
            return;
        }

        $count = $service->populateContacts($campaign);

        logger()->info('campaign.launched', ['campaign' => $campaign->uuid, 'contacts' => $count]);

        DispatchCampaignCallsJob::dispatch($campaign->id);
    }
}
