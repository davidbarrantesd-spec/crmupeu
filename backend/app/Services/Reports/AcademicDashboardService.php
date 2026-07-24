<?php

namespace App\Services\Reports;

use App\Http\Controllers\Api\V1\AcademicCatalogController;
use App\Models\Contact;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Agregados académicos del dashboard: deuda por campus/facultad/carrera,
 * segmentos de comportamiento de pago, top deudores y evolución por ciclo.
 * Todo respeta el alcance académico del usuario (visibleTo).
 */
class AcademicDashboardService
{
    public function build(?User $user, array $filters = []): array
    {
        $contactIds = Contact::query()
            ->visibleTo($user)
            ->when($filters['campus_id'] ?? null, fn ($q, $v) => $q->where('campus_id', $v))
            ->when($filters['faculty_id'] ?? null, fn ($q, $v) => $q->where('faculty_id', $v))
            ->when($filters['career_id'] ?? null, fn ($q, $v) => $q->where('career_id', $v))
            ->select('id');

        $pending = DB::table('debts')
            ->joinSub($contactIds, 'visible', 'visible.id', '=', 'debts.contact_id')
            ->whereNull('debts.deleted_at')
            ->whereNotIn('debts.status', ['paid', 'cancelled'])
            ->where('debts.pending_balance', '>', 0)
            ->when($filters['academic_period'] ?? null, fn ($q, $v) => $q->where('debts.academic_period', $v));

        $kpis = (clone $pending)->selectRaw('
                count(distinct debts.contact_id) as students_with_debt,
                coalesce(sum(debts.pending_balance), 0) as total_pending,
                coalesce(sum(debts.pending_balance) filter (where debts.due_date < now()), 0) as total_overdue
            ')->first();

        $bySegment = Contact::query()
            ->visibleTo($user)
            ->whereNotNull('payment_segment')
            ->withWhereHas('debts', fn ($q) => $q->whereNotIn('status', ['paid', 'cancelled']))
            ->get()
            ->groupBy('payment_segment')
            ->map(fn ($contacts, $segment) => [
                'segment' => $segment,
                'label' => AcademicCatalogController::SEGMENTS[$segment] ?? $segment,
                'count' => $contacts->count(),
                'amount' => (float) $contacts->sum(fn ($c) => $c->debts
                    ->whereNotIn('status', ['paid', 'cancelled'])->sum('pending_balance')),
            ])->values();

        // buen_pagador y pagador_tardio no tienen deuda pendiente (se clasifican
        // por historial): contarlos aparte para que sus tarjetas no desaparezcan.
        foreach (['buen_pagador', 'pagador_tardio'] as $historical) {
            if ($bySegment->contains(fn ($s) => $s['segment'] === $historical)) {
                continue;
            }

            $count = Contact::visibleTo($user)->where('payment_segment', $historical)->count();

            if ($count > 0) {
                $bySegment->push([
                    'segment' => $historical,
                    'label' => AcademicCatalogController::SEGMENTS[$historical],
                    'count' => $count,
                    'amount' => 0.0,
                ]);
            }
        }

        $byGroup = fn (string $table, string $fk) => (clone $pending)
            ->join('contacts', 'contacts.id', '=', 'debts.contact_id')
            ->join($table, "{$table}.id", '=', "contacts.{$fk}")
            ->groupBy("{$table}.name")
            ->selectRaw("{$table}.name, count(distinct debts.contact_id) as count, sum(debts.pending_balance) as amount")
            ->orderByDesc('amount');

        $topCareers = (clone $pending)
            ->join('contacts', 'contacts.id', '=', 'debts.contact_id')
            ->join('careers', 'careers.id', '=', 'contacts.career_id')
            ->leftJoin('faculties', 'faculties.id', '=', 'careers.faculty_id')
            ->groupBy('careers.name', 'faculties.name')
            ->selectRaw('careers.name, faculties.name as faculty, count(distinct debts.contact_id) as count, sum(debts.pending_balance) as amount')
            ->orderByDesc('amount')
            ->limit(10)->get();

        $byPeriod = (clone $pending)
            ->whereNotNull('debts.academic_period')
            ->groupBy('debts.academic_period')
            ->selectRaw('debts.academic_period as period, sum(debts.pending_balance) as amount')
            ->orderBy('debts.academic_period')
            ->get();

        $topContacts = Contact::query()
            ->visibleTo($user)
            ->with(['career:id,name', 'campus:id,name'])
            ->withSum(['debts as total_pending' => fn ($q) => $q->whereNotIn('status', ['paid', 'cancelled'])], 'pending_balance')
            ->whereHas('debts', fn ($q) => $q->whereNotIn('status', ['paid', 'cancelled'])->where('pending_balance', '>', 0))
            ->orderByDesc('total_pending')
            ->limit(10)
            ->get();

        // Agregados de ciclos en UNA consulta (evita N+1: con BD remota cada
        // roundtrip extra se paga caro).
        $periodStats = DB::table('debts')
            ->whereIn('contact_id', $topContacts->pluck('id'))
            ->whereNull('deleted_at')
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->groupBy('contact_id')
            ->selectRaw('contact_id, count(distinct academic_period) as periods_count, min(academic_period) as oldest_period')
            ->get()->keyBy('contact_id');

        $topDebtors = $topContacts->map(fn ($c) => [
            'uuid' => $c->uuid,
            'full_name' => $c->full_name,
            'career' => $c->career?->name,
            'campus' => $c->campus?->name,
            'total_pending' => (float) $c->total_pending,
            'periods_count' => (int) ($periodStats[$c->id]->periods_count ?? 0),
            'oldest_period' => $periodStats[$c->id]->oldest_period ?? null,
            'payment_segment' => $c->payment_segment,
        ]);

        $studentsWithDebt = (int) ($kpis->students_with_debt ?? 0);
        $totalPending = (float) ($kpis->total_pending ?? 0);

        return [
            'kpis' => [
                'students_with_debt' => $studentsWithDebt,
                'total_pending' => $totalPending,
                'total_overdue' => (float) ($kpis->total_overdue ?? 0),
                'avg_debt' => $studentsWithDebt > 0 ? round($totalPending / $studentsWithDebt, 2) : 0,
            ],
            'by_segment' => $bySegment,
            'by_campus' => $byGroup('campuses', 'campus_id')->get(),
            'by_faculty' => $byGroup('faculties', 'faculty_id')->get(),
            'top_careers' => $topCareers,
            'by_period' => $byPeriod,
            'top_debtors' => $topDebtors,
        ];
    }
}
