<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $logs = AuditLog::query()
            ->with('user')
            ->when($request->user_uuid, fn ($q, $v) => $q->whereHas('user', fn ($q2) => $q2->where('uuid', $v)))
            ->when($request->module, fn ($q, $v) => $q->where('module', $v))
            ->when($request->action, fn ($q, $v) => $q->where('action', $v))
            ->when($request->date_from, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($request->date_to, fn ($q, $v) => $q->where('created_at', '<=', $v.' 23:59:59'))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 25));

        return response()->json([
            'data' => $logs->map(fn ($log) => [
                'id' => $log->id,
                'user' => $log->user?->name ?? 'Sistema',
                'action' => $log->action,
                'module' => $log->module,
                'auditable_type' => $log->auditable_type ? class_basename($log->auditable_type) : null,
                'auditable_id' => $log->auditable_id,
                'old_values' => $log->old_values,
                'new_values' => $log->new_values,
                'ip' => $log->ip,
                'user_agent' => $log->user_agent,
                'reason' => $log->reason,
                'created_at' => $log->created_at->toIso8601String(),
            ]),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
            ],
        ]);
    }
}
