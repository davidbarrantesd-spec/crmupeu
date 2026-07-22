<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'conversation_uuid' => $this->whenLoaded('conversation', fn () => $this->conversation->uuid),
            'direction' => $this->direction,
            'type' => $this->type,
            'body' => $this->body,
            'media_url' => $this->media_url,
            'media_mime' => $this->media_mime,
            'status' => $this->status,
            'user' => $this->whenLoaded('user', fn () => $this->user ? ['uuid' => $this->user->uuid, 'name' => $this->user->name] : null),
            'sent_by_type' => $this->sent_by_type,
            'error_message' => $this->error_message,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
