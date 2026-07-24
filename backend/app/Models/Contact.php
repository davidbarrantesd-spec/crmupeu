<?php

namespace App\Models;

use App\Support\Auditable;
use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Contact extends Model
{
    use Auditable, HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected $casts = [
        'call_consent' => 'boolean',
        'whatsapp_consent' => 'boolean',
        'do_not_contact' => 'boolean',
        'phone_valid' => 'boolean',
        'extra_data' => 'array',
    ];

    public function debts(): HasMany
    {
        return $this->hasMany(Debt::class);
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, 'contact_tags');
    }

    public function calls(): HasMany
    {
        return $this->hasMany(Call::class);
    }

    public function agreements(): HasMany
    {
        return $this->hasMany(Agreement::class);
    }

    public function followUps(): HasMany
    {
        return $this->hasMany(FollowUp::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }

    public function campaigns(): BelongsToMany
    {
        return $this->belongsToMany(Campaign::class, 'campaign_contacts')
            ->withPivot(['status', 'last_result', 'attempts', 'next_attempt_at'])
            ->withTimestamps();
    }

    public function notes(): MorphMany
    {
        return $this->morphMany(InternalNote::class, 'notable');
    }

    public function campus(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Campus::class);
    }

    public function faculty(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Faculty::class);
    }

    public function career(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(Career::class);
    }

    public function academicLevel(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(AcademicLevel::class);
    }

    /**
     * Restricción DURA de alcance académico: el usuario solo ve estudiantes de
     * los campus/facultades/carreras que tiene asignados (user_scopes). Un
     * usuario sin asignaciones ve todo. Campos null en una asignación actúan
     * de comodín; los contactos sin datos académicos se muestran siempre (aún
     * no clasificados — ocultarlos los volvería inalcanzables para todos).
     */
    public function scopeVisibleTo($query, ?User $user)
    {
        if (! $user || $user->scopes()->count() === 0) {
            return $query;
        }

        $scopes = $user->scopes;

        return $query->where(function ($q) use ($scopes) {
            $q->whereNull('contacts.campus_id')
                ->whereNull('contacts.faculty_id')
                ->whereNull('contacts.career_id');

            foreach ($scopes as $scope) {
                $q->orWhere(function ($sub) use ($scope) {
                    if ($scope->campus_id) {
                        $sub->where('contacts.campus_id', $scope->campus_id);
                    }
                    if ($scope->faculty_id) {
                        $sub->where('contacts.faculty_id', $scope->faculty_id);
                    }
                    if ($scope->career_id) {
                        $sub->where('contacts.career_id', $scope->career_id);
                    }
                });
            }
        });
    }

    public function getFullNameAttribute(): string
    {
        return trim("{$this->first_name} {$this->last_name}");
    }

    public function isContactable(string $channel = 'voice'): bool
    {
        if ($this->do_not_contact || $this->status !== 'active' || ! $this->phone_valid) {
            return false;
        }

        return $channel === 'whatsapp' ? $this->whatsapp_consent : $this->call_consent;
    }
}
