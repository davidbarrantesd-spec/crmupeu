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

        // Agregados por segmento y por comportamiento en SQL puro (escala a
        // 15k+ estudiantes sin cargar filas a memoria): conteo desde contacts,
        // montos pendientes desde debts en una sola pasada cada uno.
        $bySegment = $this->groupedByContactField($user, 'payment_segment', AcademicCatalogController::SEGMENTS, 'segment');
        $byBehavior = $this->groupedByContactField($user, 'payment_behavior', \App\Services\Reports\PaymentBehaviorService::BEHAVIORS, 'behavior');

        // Matriz comportamiento × año de carrera: "los de 4to año ya se sabe
        // cómo pagan". Año ≈ ceil(ciclos con actividad / 2).
        $behaviorByYear = Contact::query()
            ->visibleTo($user)
            ->whereNotNull('payment_behavior')
            ->where('cycles_with_debt', '>', 0)
            ->groupBy('year', 'payment_behavior')
            ->selectRaw("least(ceil(cycles_with_debt / 2.0), 5) as year, payment_behavior, count(*) as count, round(avg(payment_score)) as avg_score")
            ->orderBy('year')
            ->get();

        // Carreras con mejor y peor cultura de pago (score promedio).
        $scoreByCareer = Contact::query()
            ->visibleTo($user)
            ->whereNotNull('payment_score')
            ->join('careers', 'careers.id', '=', 'contacts.career_id')
            ->groupBy('careers.name')
            ->havingRaw('count(*) >= 3')
            ->selectRaw('careers.name, round(avg(payment_score)) as avg_score, count(*) as students')
            ->orderByDesc('avg_score')
            ->get();

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
                'avg_score' => (int) (Contact::visibleTo($user)->whereNotNull('payment_score')->avg('payment_score') ?? 0),
            ],
            'by_segment' => $bySegment,
            'by_behavior' => $byBehavior,
            'behavior_by_year' => $behaviorByYear,
            'score_by_career' => $scoreByCareer,
            'by_campus' => $byGroup('campuses', 'campus_id')->get(),
            'by_faculty' => $byGroup('faculties', 'faculty_id')->get(),
            'top_careers' => $topCareers,
            'by_period' => $byPeriod,
            'top_debtors' => $topDebtors,
        ];
    }

    /**
     * Conteo + monto pendiente agrupado por una columna de contacts, en dos
     * consultas agregadas (sin traer filas): apto para decenas de miles.
     *
     * @param  array<string, string>  $labels
     */
    protected function groupedByContactField(?User $user, string $field, array $labels, string $key): \Illuminate\Support\Collection
    {
        $counts = Contact::visibleTo($user)
            ->whereNotNull($field)
            ->groupBy($field)
            ->selectRaw("{$field} as k, count(*) as count")
            ->pluck('count', 'k');

        $amounts = Contact::visibleTo($user)
            ->whereNotNull($field)
            ->join('debts', fn ($j) => $j->on('debts.contact_id', '=', 'contacts.id')
                ->whereNull('debts.deleted_at')
                ->whereNotIn('debts.status', ['paid', 'cancelled']))
            ->groupBy($field)
            ->selectRaw("contacts.{$field} as k, sum(debts.pending_balance) as amount")
            ->pluck('amount', 'k');

        return collect($labels)
            ->map(fn ($label, $value) => [
                $key => $value,
                'label' => $label,
                'count' => (int) ($counts[$value] ?? 0),
                'amount' => (float) ($amounts[$value] ?? 0),
            ])
            ->filter(fn ($row) => $row['count'] > 0)
            ->values();
    }
}
