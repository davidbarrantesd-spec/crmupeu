<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Campus extends Model
{
    protected $table = 'campuses';

    protected $fillable = ['code', 'name'];

    public function contacts(): HasMany
    {
        return $this->hasMany(Contact::class);
    }
}
