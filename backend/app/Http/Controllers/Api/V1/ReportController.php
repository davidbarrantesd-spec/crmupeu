<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Agreement;
use App\Models\AuditLog;
use App\Models\Call;
use App\Models\Campaign;
use App\Models\FollowUp;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    public function calls(Request $request)
    {
        $query = Call::query()
            ->with(['contact', 'campaign'])
            ->when($request->campaign, fn ($q, $v) => $q->whereHas('campaign', fn ($q2) => $q2->where('uuid', $v)))
            ->when($request->type, fn ($q, $v) => $q->where('type', $v))
            ->when($request->result, fn ($q, $v) => $q->where('result', $v))
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->date_from, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($request->date_to, fn ($q, $v) => $q->where('created_at', '<=', $v.' 23:59:59'))
            ->latest();

        if ($request->export) {
            return $this->exportCsv('reporte_llamadas', ['fecha', 'contacto', 'telefono', 'campaña', 'tipo', 'estado', 'resultado', 'duracion_seg', 'intento', 'costo'],
                $query, fn ($c) => [
                    $c->created_at->format('Y-m-d H:i'), $c->contact?->full_name, $c->to_number,
                    $c->campaign?->name, $c->type, $c->status, $c->result, $c->duration_seconds,
                    $c->attempt_number, $c->estimated_cost,
                ]);
        }

        return \App\Http\Resources\CallResource::collection($query->paginate($request->integer('per_page', 25)));
    }

    public function agreements(Request $request)
    {
        $query = Agreement::query()
            ->with(['contact', 'debt', 'creator'])
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->date_from, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($request->date_to, fn ($q, $v) => $q->where('created_at', '<=', $v.' 23:59:59'))
            ->latest();

        if ($request->export) {
            return $this->exportCsv('reporte_acuerdos', ['fecha', 'contacto', 'deuda', 'tipo', 'monto', 'fecha_compromiso', 'estado', 'origen', 'creado_por'],
                $query, fn ($a) => [
                    $a->created_at->format('Y-m-d H:i'), $a->contact?->full_name, $a->debt?->code,
                    $a->type, $a->amount, $a->promise_date?->format('Y-m-d'), $a->status,
                    $a->created_by_type, $a->creator?->name,
                ]);
        }

        return \App\Http\Resources\AgreementResource::collection($query->paginate($request->integer('per_page', 25)));
    }

    public function campaigns(Request $request)
    {
        $rows = Campaign::query()
            ->withCount('campaignContacts')
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->date_from, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($request->date_to, fn ($q, $v) => $q->where('created_at', '<=', $v.' 23:59:59'))
            ->get()
            ->map(function ($campaign) {
                $calls = $campaign->calls();

                return [
                    'uuid' => $campaign->uuid,
                    'name' => $campaign->name,
                    'type' => $campaign->type,
                    'status' => $campaign->status,
                    'contacts' => $campaign->campaign_contacts_count,
                    'calls_total' => (clone $calls)->count(),
                    'calls_answered' => (clone $calls)->whereNotNull('answered_at')->count(),
                    'agreements' => Agreement::whereIn('call_id', (clone $calls)->pluck('id'))->count(),
                    'estimated_cost' => (float) $campaign->estimated_cost,
                    'created_at' => $campaign->created_at->toIso8601String(),
                ];
            });

        if ($request->export) {
            return response()->streamDownload(function () use ($rows) {
                $out = fopen('php://output', 'w');
                fputcsv($out, ['campaña', 'tipo', 'estado', 'contactos', 'llamadas', 'contestadas', 'acuerdos', 'costo']);
                foreach ($rows as $r) {
                    fputcsv($out, [$r['name'], $r['type'], $r['status'], $r['contacts'], $r['calls_total'], $r['calls_answered'], $r['agreements'], $r['estimated_cost']]);
                }
                fclose($out);
            }, 'reporte_campanas.csv', ['Content-Type' => 'text/csv']);
        }

        return response()->json(['data' => $rows]);
    }

    public function advisors(Request $request)
    {
        $rows = FollowUp::query()
            ->whereNotNull('assigned_to')
            ->when($request->date_from, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($request->date_to, fn ($q, $v) => $q->where('created_at', '<=', $v.' 23:59:59'))
            ->join('users', 'users.id', '=', 'follow_ups.assigned_to')
            ->select('users.name',
                DB::raw('count(*) as tareas'),
                DB::raw("count(*) filter (where follow_ups.status = 'done') as completadas"),
                DB::raw("count(*) filter (where follow_ups.status = 'pending') as pendientes"))
            ->groupBy('users.name')
            ->get();

        return response()->json(['data' => $rows]);
    }

    protected function exportCsv(string $name, array $headers, $query, callable $mapper)
    {
        AuditLog::record('exported', 'reports', null, ['new_values' => ['report' => $name]]);

        return response()->streamDownload(function () use ($headers, $query, $mapper) {
            $out = fopen('php://output', 'w');
            fputcsv($out, $headers);
            $query->chunk(500, function ($chunk) use ($out, $mapper) {
                foreach ($chunk as $row) {
                    fputcsv($out, $mapper($row));
                }
            });
            fclose($out);
        }, $name.'_'.now()->format('Ymd_His').'.csv', ['Content-Type' => 'text/csv']);
    }
}
