<?php

namespace App\Models;

use App\Support\Auditable;
use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Campaign extends Model
{
    use Auditable, HasFactory, HasUuid, SoftDeletes;

    public const TYPES = ['recorded_audio', 'tts', 'ivr', 'ai_conversational', 'whatsapp', 'mixed'];

    public const STATUSES = ['draft', 'scheduled', 'running', 'paused', 'finished', 'cancelled'];

    protected $guarded = ['id'];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'allowed_days' => 'array',
        'segment_filters' => 'array',
        'dtmf_options' => 'array',
        'whatsapp_config' => 'array',
        'post_call_actions' => 'array',
        'follow_up_rules' => 'array',
        'budget_limit' => 'decimal:2',
        'estimated_cost' => 'decimal:2',
        'record_calls' => 'boolean',
    ];

    public function contacts(): BelongsToMany
    {
        return $this->belongsToMany(Contact::class, 'campaign_contacts')
            ->withPivot(['id', 'status', 'last_result', 'attempts', 'next_attempt_at', 'debt_id'])
            ->withTimestamps();
    }

    public function campaignContacts(): HasMany
    {
        return $this->hasMany(CampaignContact::class);
    }

    public function calls(): HasMany
    {
        return $this->hasMany(Call::class);
    }

    public function promptVersion(): BelongsTo
    {
        return $this->belongsTo(PromptVersion::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function supervisor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'supervisor_id');
    }

    public function isWithinAllowedWindow(): bool
    {
        $now = now($this->timezone);
        $days = $this->allowed_days ?: [1, 2, 3, 4, 5, 6, 7];

        if (! in_array($now->isoWeekday(), $days)) {
            return false;
        }

        return $now->format('H:i:s') >= $this->allowed_from
            && $now->format('H:i:s') <= $this->allowed_until;
    }

    public function isOverBudget(): bool
    {
        return $this->budget_limit !== null && $this->estimated_cost >= $this->budget_limit;
    }
}
