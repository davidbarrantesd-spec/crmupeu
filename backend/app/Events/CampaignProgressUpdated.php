<?php

namespace App\Events;

use App\Models\Campaign;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CampaignProgressUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Campaign $campaign) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('campaigns.'.$this->campaign->uuid)];
    }

    public function broadcastWith(): array
    {
        return app(\App\Services\Campaigns\CampaignService::class)->progress($this->campaign);
    }
}
