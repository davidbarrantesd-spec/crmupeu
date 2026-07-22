<?php

namespace App\Models;

use App\Support\Auditable;
use App\Support\HasUuid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class MessageTemplate extends Model
{
    use Auditable, HasUuid, SoftDeletes;

    protected $guarded = ['id'];

    protected $casts = ['speech_rate' => 'decimal:2'];
}
