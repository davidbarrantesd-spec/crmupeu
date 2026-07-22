<?php

namespace App\Models;

use App\Support\Auditable;
use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class WhatsappTemplate extends Model
{
    use Auditable, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected $casts = ['variables' => 'array'];

    public function render(array $vars): string
    {
        $body = $this->body;
        foreach ($vars as $key => $value) {
            $body = str_replace('{{'.$key.'}}', (string) $value, $body);
        }

        return $body;
    }
}
