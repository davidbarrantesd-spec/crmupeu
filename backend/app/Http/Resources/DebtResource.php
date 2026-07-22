<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DebtResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'contact' => new ContactResource($this->whenLoaded('contact')),
            'contact_uuid' => $this->whenLoaded('contact', fn () => $this->contact->uuid),
            'code' => $this->code,
            'concept' => $this->concept,
            'original_amount' => (float) $this->original_amount,
            'pending_balance' => (float) $this->pending_balance,
            'currency' => $this->currency,
            'due_date' => $this->due_date?->toDateString(),
            'days_overdue' => $this->daysOverdue(),
            'status' => $this->status,
            'installments' => $this->installments,
            'overdue_installments' => $this->overdue_installments,
            'last_payment_date' => $this->last_payment_date?->toDateString(),
            'origin' => $this->origin,
            'observations' => $this->observations,
            'extra_data' => $this->extra_data,
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
