<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class SystemSetting extends Model
{
    protected $guarded = ['id'];

    protected $casts = ['is_encrypted' => 'boolean'];

    public static function getValue(string $key, mixed $default = null): mixed
    {
        $setting = static::where('key', $key)->first();
        if (! $setting) {
            return $default;
        }

        return $setting->is_encrypted && $setting->value !== null
            ? Crypt::decryptString($setting->value)
            : $setting->value;
    }

    public static function setValue(string $key, ?string $value, bool $encrypted = false, string $group = 'general'): self
    {
        return static::updateOrCreate(
            ['key' => $key],
            [
                'value' => $encrypted && $value !== null ? Crypt::encryptString($value) : $value,
                'is_encrypted' => $encrypted,
                'group' => $group,
            ]
        );
    }
}
