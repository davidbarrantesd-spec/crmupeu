<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\Reports\DashboardService;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function index(Request $request, DashboardService $service)
    {
        $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        return response()->json(['data' => $service->build($request->date_from, $request->date_to)]);
    }

    public function academic(Request $request, \App\Services\Reports\AcademicDashboardService $service)
    {
        $filters = $request->validate([
            'campus_id' => ['nullable', 'integer'],
            'faculty_id' => ['nullable', 'integer'],
            'career_id' => ['nullable', 'integer'],
            'academic_period' => ['nullable', 'string', 'max:10'],
        ]);

        return response()->json(['data' => $service->build($request->user(), $filters)]);
    }
}
