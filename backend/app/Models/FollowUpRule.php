<?php

namespace App\Models;

use App\Support\Auditable;
use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FollowUpRule extends Model
{
    use Auditable, HasUuid;

    protected $guarded = ['id'];

    protected $casts = [
        'config' => 'array',
        'active' => 'boolean',
    ];

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(Campaign::class);
    }
}
