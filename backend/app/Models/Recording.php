<?php

namespace App\Models;

use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Recording extends Model
{
    use HasUuid;

    protected $guarded = ['id'];

    protected $casts = ['metadata' => 'array'];

    public function call(): BelongsTo
    {
        return $this->belongsTo(Call::class);
    }
}
