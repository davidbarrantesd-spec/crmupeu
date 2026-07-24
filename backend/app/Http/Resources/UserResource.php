<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'status' => $this->status,
            'roles' => $this->getRoleNames(),
            'permissions' => $this->getAllPermissions()->pluck('name'),
            'scopes' => $this->scopes()->with(['campus:id,name', 'faculty:id,name', 'career:id,name'])->get()
                ->map(fn ($s) => [
                    'id' => $s->id,
                    'campus_id' => $s->campus_id,
                    'faculty_id' => $s->faculty_id,
                    'career_id' => $s->career_id,
                    'campus' => $s->campus?->only(['id', 'name']),
                    'faculty' => $s->faculty?->only(['id', 'name']),
                    'career' => $s->career?->only(['id', 'name']),
                ]),
            'last_login_at' => $this->last_login_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
