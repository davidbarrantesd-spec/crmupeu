<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WebhookEvent extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'payload' => 'array',
        'processed_at' => 'datetime',
    ];

    /**
     * Registra el evento si no fue procesado antes. Devuelve null si es duplicado.
     */
    public static function recordOnce(string $provider, string $eventType, string $idempotencyKey, array $payload): ?self
    {
        if (static::where('idempotency_key', $idempotencyKey)->exists()) {
            return null;
        }

        return static::create([
            'provider' => $provider,
            'event_type' => $eventType,
            'idempotency_key' => $idempotencyKey,
            'payload' => $payload,
        ]);
    }

    public function markProcessed(): void
    {
        $this->update(['status' => 'processed', 'processed_at' => now()]);
    }

    public function markFailed(string $error): void
    {
        $this->update(['status' => 'failed', 'error' => $error]);
    }
}
