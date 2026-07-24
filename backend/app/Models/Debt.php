<?php

namespace App\Models;

use App\Support\Auditable;
use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Debt extends Model
{
    use Auditable, HasFactory, HasUuid, SoftDeletes;

    public const STATUSES = ['pending', 'overdue', 'partial', 'paid', 'refinanced', 'cancelled', 'in_review'];

    protected $guarded = ['id'];

    protected $casts = [
        'original_amount' => 'decimal:2',
        'pending_balance' => 'decimal:2',
        'due_date' => 'date',
        'last_payment_date' => 'date',
        'paid_at' => 'date',
        'extra_data' => 'array',
    ];

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function agreements(): HasMany
    {
        return $this->hasMany(Agreement::class);
    }

    public function daysOverdue(): int
    {
        if (! $this->due_date || $this->due_date->isFuture()) {
            return 0;
        }

        return (int) $this->due_date->diffInDays(now());
    }
}
