<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Una fila = un permiso de alcance académico. Los campos en null son comodín:
 * (campus=Lima, faculty=null, career=null) permite TODO el campus Lima.
 * Un usuario sin filas ve todo el sistema.
 */
class UserScope extends Model
{
    protected $fillable = ['user_id', 'campus_id', 'faculty_id', 'career_id'];

    public function campus(): BelongsTo
    {
        return $this->belongsTo(Campus::class);
    }

    public function faculty(): BelongsTo
    {
        return $this->belongsTo(Faculty::class);
    }

    public function career(): BelongsTo
    {
        return $this->belongsTo(Career::class);
    }
}
