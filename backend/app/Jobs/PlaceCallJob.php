<?php

namespace App\Jobs;

use App\Events\CallUpdated;
use App\Integrations\IntegrationManager;
use App\Models\Call;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

class PlaceCallJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [15, 60];

    public function __construct(public int $callId, public array $options = []) {}

    public function handle(IntegrationManager $integrations): void
    {
        // Lock de idempotencia: nunca marcar dos veces la misma llamada.
        $lock = Cache::lock("place-call-{$this->callId}", 120);

        if (! $lock->get()) {
            return;
        }

        try {
            $call = Call::find($this->callId);

            if (! $call || ! in_array($call->status, ['pending', 'scheduled'])) {
                return;
            }

            if ($this->options) {
                $call->addEvent('options', $this->options);
            }

            $call->update(['status' => 'queued', 'started_at' => now()]);

            try {
                $sid = $integrations->telephony()->placeCall(
                    $call,
                    route('webhooks.twilio.answer', $call->uuid),
                    route('webhooks.twilio.status')
                );

                $call->update(['status' => 'dialing', 'twilio_call_sid' => $sid]);
                $call->addEvent('initiated', ['sid' => $sid, 'driver' => $integrations->telephony()->name()]);
            } catch (\Throwable $e) {
                $call->update([
                    'status' => 'failed',
                    'error_message' => $e->getMessage(),
                    'error_code' => 'PLACE_CALL_ERROR',
                    'ended_at' => now(),
                ]);
                $call->addEvent('error', ['message' => $e->getMessage()]);

                ProcessCallResultJob::dispatch($call->id);
                throw $e;
            }

            broadcast(new CallUpdated($call->fresh()))->toOthers();
        } finally {
            $lock->release();
        }
    }
}
