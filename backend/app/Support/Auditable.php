<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Support\Facades\Auth;

trait Auditable
{
    protected static function bootAuditable(): void
    {
        static::created(fn ($model) => $model->writeAudit('created', [], $model->getAttributes()));
        static::updated(fn ($model) => $model->writeAudit('updated', $model->getOriginal(), $model->getChanges()));
        static::deleted(fn ($model) => $model->writeAudit('deleted', $model->getOriginal(), []));
    }

    public function writeAudit(string $action, array $old, array $new, ?string $reason = null): void
    {
        $hidden = array_merge($this->getHidden(), ['password', 'remember_token', 'credentials']);
        $old = array_diff_key($old, array_flip($hidden));
        $new = array_diff_key($new, array_flip($hidden));
        unset($new['updated_at'], $old['updated_at']);

        AuditLog::create([
            'user_id' => Auth::id(),
            'action' => $action,
            'module' => $this->auditModule ?? str(class_basename($this))->snake()->plural()->toString(),
            'auditable_type' => static::class,
            'auditable_id' => $this->getKey(),
            'old_values' => $old ?: null,
            'new_values' => $new ?: null,
            'ip' => request()?->ip(),
            'user_agent' => substr((string) request()?->userAgent(), 0, 500),
            'reason' => $reason,
        ]);
    }
}
