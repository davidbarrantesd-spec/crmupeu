<?php

namespace App\Events;

use App\Models\Call;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CallUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Call $call) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('calls')];
    }

    public function broadcastWith(): array
    {
        return [
            'uuid' => $this->call->uuid,
            'status' => $this->call->status,
            'result' => $this->call->result,
            'contact_uuid' => $this->call->contact?->uuid,
            'campaign_uuid' => $this->call->campaign?->uuid,
            'duration_seconds' => $this->call->duration_seconds,
        ];
    }
}
