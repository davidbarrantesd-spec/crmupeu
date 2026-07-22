<?php

namespace App\Models;

use App\Support\Auditable;
use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class CallPrompt extends Model
{
    use Auditable, HasFactory, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    public function versions(): HasMany
    {
        return $this->hasMany(PromptVersion::class);
    }

    public function publishedVersion(): HasOne
    {
        return $this->hasOne(PromptVersion::class)->where('status', 'published')->latest('version');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
