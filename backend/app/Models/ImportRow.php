<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ImportRow extends Model
{
    protected $guarded = ['id'];

    protected $casts = ['data' => 'array'];

    public function import(): BelongsTo
    {
        return $this->belongsTo(Import::class);
    }
}
