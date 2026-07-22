<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FollowUpResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'contact' => new ContactResource($this->whenLoaded('contact')),
            'campaign' => $this->whenLoaded('campaign', fn () => $this->campaign ? ['uuid' => $this->campaign->uuid, 'name' => $this->campaign->name] : null),
            'agreement_uuid' => $this->whenLoaded('agreement', fn () => $this->agreement?->uuid),
            'type' => $this->type,
            'scheduled_at' => $this->scheduled_at?->toIso8601String(),
            'channel' => $this->channel,
            'priority' => $this->priority,
            'status' => $this->status,
            'attempt_number' => $this->attempt_number,
            'rule' => $this->whenLoaded('rule', fn () => $this->rule ? ['uuid' => $this->rule->uuid, 'name' => $this->rule->name] : null),
            'assignee' => $this->whenLoaded('assignee', fn () => $this->assignee ? ['uuid' => $this->assignee->uuid, 'name' => $this->assignee->name] : null),
            'result' => $this->result,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
