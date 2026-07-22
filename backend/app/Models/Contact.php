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
