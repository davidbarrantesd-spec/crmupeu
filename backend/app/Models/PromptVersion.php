<?php

namespace App\Models;

use App\Support\Auditable;
use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromptVersion extends Model
{
    use Auditable, HasFactory, HasUuid;

    protected $guarded = ['id'];

    protected $casts = [
        'variables' => 'array',
        'enabled_tools' => 'array',
        'guardrails' => 'array',
        'faq' => 'array',
        'extraction_fields' => 'array',
        'published_at' => 'datetime',
    ];

    public function prompt(): BelongsTo
    {
        return $this->belongsTo(CallPrompt::class, 'call_prompt_id');
    }
}
