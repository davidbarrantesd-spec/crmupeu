<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ConversationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'contact' => new ContactResource($this->whenLoaded('contact')),
            'phone' => $this->phone,
            'status' => $this->status,
            'priority' => $this->priority,
            'assignee' => $this->whenLoaded('assignee', fn () => $this->assignee ? ['uuid' => $this->assignee->uuid, 'name' => $this->assignee->name] : null),
            'last_message_at' => $this->last_message_at?->toIso8601String(),
            'last_inbound_at' => $this->last_inbound_at?->toIso8601String(),
            'within_24h_window' => $this->isWithin24hWindow(),
            'unread_count' => $this->unread_count,
            'last_message' => $this->whenLoaded('messages', fn () => $this->messages->first() ? new MessageResource($this->messages->first()) : null),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
