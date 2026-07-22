<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
        'created_at' => 'datetime',
    ];

    public static function record(string $action, string $module, ?Model $auditable = null, array $extra = []): self
    {
        return static::create(array_merge([
            'user_id' => auth()->id(),
            'action' => $action,
            'module' => $module,
            'auditable_type' => $auditable ? $auditable::class : null,
            'auditable_id' => $auditable?->getKey(),
            'ip' => request()?->ip(),
            'user_agent' => substr((string) request()?->userAgent(), 0, 500),
        ], $extra));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
