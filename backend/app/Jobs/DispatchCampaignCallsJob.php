<?php

namespace App\Jobs;

use App\Models\Campaign;
use App\Services\Calls\CallService;
use App\Services\Settings\CostGuard;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

/**
 * Toma el siguiente lote de contactos pendientes de una campaña en ejecución,
 * respetando horario permitido, concurrencia máxima y límites de costo.
 * El scheduler lo ejecuta cada minuto para todas las campañas activas.
 */
class DispatchCampaignCallsJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public int $campaignId) {}

    public function handle(CallService $callService, CostGuard $costGuard): void
    {
        // Lock para evitar despachos dobles de la misma campaña.
        $lock = Cache::lock("campaign-dispatch-{$this->campaignId}", 55);

        if (! $lock->get()) {
            return;
        }

        try {
            $campaign = Campaign::find($this->campaignId);

            if (! $campaign || $campaign->status !== 'running') {
                return;
            }

            if (! $campaign->isWithinAllowedWindow()) {
                return;
            }

            if ($campaign->isOverBudget()) {
                $campaign->update(['status' => 'paused']);
                logger()->warning('campaign.paused_over_budget', ['campaign' => $campaign->uuid]);

                return;
            }

            if ($campaign->ends_at && now()->gt($campaign->ends_at)) {
                $campaign->update(['status' => 'finished']);

                return;
            }

            try {
                $costGuard->assertCallAllowed();
            } catch (\Illuminate\Validation\ValidationException) {
                return; // Límite diario o presupuesto alcanzado.
            }

            $maxConcurrent = $costGuard->maxConcurrency($campaign->max_concurrent_calls);
            $active = $campaign->calls()->whereIn('status', \App\Models\Call::ACTIVE_STATUSES)->count();
            $slots = max(0, $maxConcurrent - $active);

            if ($slots === 0) {
                return;
            }

            $pending = $campaign->campaignContacts()
                ->where(function ($q) {
                    $q->where('status', 'pending')
                        ->orWhere(fn ($q2) => $q2->where('status', 'in_progress')
                            ->whereNotNull('next_attempt_at')
                            ->where('next_attempt_at', '<=', now()));
                })
                ->where('attempts', '<', $campaign->max_attempts)
                ->orderBy('next_attempt_at')
                ->limit($slots)
                ->get();

            if ($pending->isEmpty()) {
                // Sin pendientes ni llamadas activas → campaña finalizada.
                if ($active === 0 && ! $campaign->campaignContacts()->whereIn('status', ['pending', 'in_progress'])->exists()) {
                    $campaign->update(['status' => 'finished']);
                }

                return;
            }

            foreach ($pending as $campaignContact) {
                $call = $callService->createForCampaignContact($campaign, $campaignContact);
                PlaceCallJob::dispatch($call->id);
            }
        } finally {
            $lock->release();
        }
    }
}
