<?php

namespace App\Models;

use App\Support\Auditable;
use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Call extends Model
{
    use Auditable, HasFactory, HasUuid;

    public const ACTIVE_STATUSES = ['queued', 'dialing', 'ringing', 'in_progress'];

    public const FINAL_STATUSES = ['completed', 'no_answer', 'busy', 'failed', 'cancelled', 'rejected'];

    protected $guarded = ['id'];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'started_at' => 'datetime',
        'answered_at' => 'datetime',
        'ended_at' => 'datetime',
        'next_follow_up_at' => 'datetime',
        'dtmf_responses' => 'array',
        'structured_result' => 'array',
        'estimated_cost' => 'decimal:4',
    ];

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(Campaign::class);
    }

    public function debt(): BelongsTo
    {
        return $this->belongsTo(Debt::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(CallEvent::class);
    }

    public function recordings(): HasMany
    {
        return $this->hasMany(Recording::class);
    }

    public function transcription(): HasOne
    {
        return $this->hasOne(Transcription::class);
    }

    public function aiSession(): HasOne
    {
        return $this->hasOne(AiSession::class);
    }

    public function promptVersion(): BelongsTo
    {
        return $this->belongsTo(PromptVersion::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isFinal(): bool
    {
        return in_array($this->status, self::FINAL_STATUSES);
    }

    public function addEvent(string $event, array $payload = []): CallEvent
    {
        return $this->events()->create(['event' => $event, 'payload' => $payload ?: null]);
    }
}
