<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AcademicLevel;
use App\Models\Campus;
use App\Models\Contact;
use App\Models\Debt;
use App\Models\Faculty;

class AcademicCatalogController extends Controller
{
    /** Etiquetas de los segmentos de comportamiento de pago (ver crm:segment). */
    public const SEGMENTS = [
        'deudor_cronico' => 'Deudor crónico',
        'deudor_inactivo' => 'Deudor inactivo',
        'pagador_tardio' => 'Pagador tardío',
        'buen_pagador' => 'Buen pagador',
        'deuda_reciente' => 'Deuda reciente',
    ];

    public const MODALITIES = ['presencial', 'semipresencial', 'virtual'];

    public function academic()
    {
        return response()->json(['data' => [
            'campuses' => Campus::orderBy('name')->get(['id', 'code', 'name']),
            'faculties' => Faculty::with('careers:id,code,name,faculty_id')
                ->orderBy('name')->get(['id', 'code', 'name']),
            'levels' => AcademicLevel::orderBy('id')->get(['id', 'code', 'name', 'category']),
            'modalities' => self::MODALITIES,
            'periods' => Debt::whereNotNull('academic_period')
                ->distinct()->orderByDesc('academic_period')->pluck('academic_period'),
            'segments' => collect(self::SEGMENTS)
                ->map(fn ($label, $key) => ['key' => $key, 'label' => $label])->values(),
        ]]);
    }
}
