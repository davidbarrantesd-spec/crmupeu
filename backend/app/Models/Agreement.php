<?php

namespace App\Models;

use App\Support\Auditable;
use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Agreement extends Model
{
    use Auditable, HasFactory, HasUuid, SoftDeletes;

    public const STATUSES = ['pending', 'fulfilled', 'broken', 'rescheduled', 'cancelled', 'in_review'];

    protected $guarded = ['id'];

    protected $casts = [
        'amount' => 'decimal:2',
        'promise_date' => 'date',
        'verified_at' => 'datetime',
    ];

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function debt(): BelongsTo
    {
        return $this->belongsTo(Debt::class);
    }

    public function call(): BelongsTo
    {
        return $this->belongsTo(Call::class);
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
