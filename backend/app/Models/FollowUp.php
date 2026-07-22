<?php

namespace App\Models;

use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FollowUp extends Model
{
    use HasFactory, HasUuid;

    public const TYPES = ['auto_call', 'ai_call', 'whatsapp', 'manual_call', 'payment_verification', 'advisor_task'];

    protected $guarded = ['id'];

    protected $casts = ['scheduled_at' => 'datetime'];

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(Campaign::class);
    }

    public function agreement(): BelongsTo
    {
        return $this->belongsTo(Agreement::class);
    }

    public function call(): BelongsTo
    {
        return $this->belongsTo(Call::class);
    }

    public function rule(): BelongsTo
    {
        return $this->belongsTo(FollowUpRule::class, 'follow_up_rule_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }
}
