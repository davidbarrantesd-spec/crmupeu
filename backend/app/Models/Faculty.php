<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Faculty extends Model
{
    protected $fillable = ['code', 'name'];

    public function careers(): HasMany
    {
        return $this->hasMany(Career::class);
    }
}
