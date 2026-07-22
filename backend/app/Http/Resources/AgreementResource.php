<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AgreementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'contact' => new ContactResource($this->whenLoaded('contact')),
            'debt' => new DebtResource($this->whenLoaded('debt')),
            'call_uuid' => $this->whenLoaded('call', fn () => $this->call?->uuid),
            'type' => $this->type,
            'description' => $this->description,
            'amount' => $this->amount !== null ? (float) $this->amount : null,
            'promise_date' => $this->promise_date?->toDateString(),
            'status' => $this->status,
            'created_by_type' => $this->created_by_type,
            'creator' => $this->whenLoaded('creator', fn () => $this->creator ? ['uuid' => $this->creator->uuid, 'name' => $this->creator->name] : null),
            'verified_at' => $this->verified_at?->toIso8601String(),
            'observations' => $this->observations,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
