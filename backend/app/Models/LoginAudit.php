<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoginAudit extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = ['created_at' => 'datetime'];

    public static function record(string $event, string $email, ?int $userId = null): self
    {
        return static::create([
            'user_id' => $userId,
            'email' => $email,
            'event' => $event,
            'ip' => request()?->ip(),
            'user_agent' => substr((string) request()?->userAgent(), 0, 500),
        ]);
    }
}
