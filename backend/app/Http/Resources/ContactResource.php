<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ContactResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'internal_code' => $this->internal_code,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'full_name' => $this->full_name,
            'dni' => $this->when($request->user()?->can('finance.view') ?? false, $this->dni),
            'phone' => $this->phone,
            'phone_secondary' => $this->phone_secondary,
            'email' => $this->email,
            'city' => $this->city,
            'address' => $this->address,
            'status' => $this->status,
            'source' => $this->source,
            'segment' => $this->segment,
            'call_consent' => $this->call_consent,
            'whatsapp_consent' => $this->whatsapp_consent,
            'do_not_contact' => $this->do_not_contact,
            'do_not_contact_reason' => $this->do_not_contact_reason,
            'phone_valid' => $this->phone_valid,
            'tags' => $this->whenLoaded('tags', fn () => $this->tags->map(fn ($t) => ['uuid' => $t->uuid, 'name' => $t->name, 'color' => $t->color])),
            'debts' => DebtResource::collection($this->whenLoaded('debts')),
            'total_debt' => $this->whenLoaded('debts', fn () => (float) $this->debts->whereNotIn('status', ['paid', 'cancelled'])->sum('pending_balance')),
            // Dimensión académica
            'id_persona' => $this->id_persona,
            'student_code' => $this->student_code,
            'campus_id' => $this->campus_id,
            'faculty_id' => $this->faculty_id,
            'career_id' => $this->career_id,
            'academic_level_id' => $this->academic_level_id,
            'campus' => $this->whenLoaded('campus', fn () => $this->campus?->only(['id', 'name'])),
            'faculty' => $this->whenLoaded('faculty', fn () => $this->faculty?->only(['id', 'name'])),
            'career' => $this->whenLoaded('career', fn () => $this->career?->only(['id', 'name'])),
            'academic_level' => $this->whenLoaded('academicLevel', fn () => $this->academicLevel?->only(['id', 'name'])),
            'modality' => $this->modality,
            'enrollment_status' => $this->enrollment_status,
            'payment_segment' => $this->payment_segment,
            'total_pending' => $this->when(isset($this->total_pending), fn () => (float) $this->total_pending),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
