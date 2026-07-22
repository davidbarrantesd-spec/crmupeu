<?php

namespace App\Models;

use App\Support\Auditable;
use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class Integration extends Model
{
    use Auditable, HasUuid;

    protected $guarded = ['id'];

    protected $hidden = ['credentials'];

    protected $casts = [
        'config' => 'array',
        'last_verified_at' => 'datetime',
    ];

    public function setCredentials(array $credentials): void
    {
        $this->credentials = Crypt::encryptString(json_encode($credentials));
    }

    public function getCredentials(): array
    {
        if (! $this->credentials) {
            return [];
        }

        return json_decode(Crypt::decryptString($this->credentials), true) ?: [];
    }

    /** Claves presentes (enmascaradas) para mostrar en UI sin exponer secretos. */
    public function maskedCredentials(): array
    {
        $masked = [];
        foreach ($this->getCredentials() as $key => $value) {
            $masked[$key] = $value ? substr((string) $value, 0, 4).str_repeat('•', 8) : null;
        }

        return $masked;
    }
}
