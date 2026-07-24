<?php

namespace App\Services\Reports;

use App\Models\Contact;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Analiza el comportamiento de pago de un estudiante a lo largo de TODA su
 * trayectoria: puntualidad, atraso promedio, patrón de "pagar a fin de
 * ciclo", tendencia reciente y un score 0-100. Un alumno de 4to año ya tiene
 * ~7 ciclos de historia — este perfil la condensa.
 *
 * Comportamientos:
 *  - puntual         ≥80% de pagos dentro de la gracia (15 días)
 *  - fin_de_ciclo    ≥50% de pagos en el tramo final del ciclo (jun-jul / nov-dic)
 *  - demora_leve     paga, pero tarde (atraso promedio ≤45 días)
 *  - demora_cronica  atrasos largos sistemáticos
 *  - sin_historial   menos de 2 pagos registrados (no se puede juzgar aún)
 */
class PaymentBehaviorService
{
    public const GRACE_DAYS = 15;

    public const BEHAVIORS = [
        'puntual' => 'Puntual',
        'demora_leve' => 'Demora leve',
        'demora_cronica' => 'Demora crónica',
        'fin_de_ciclo' => 'Paga a fin de ciclo',
        'sin_historial' => 'Sin historial',
    ];

    /**
     * Calcula el perfil a partir de las deudas ya cargadas del contacto.
     *
     * @return array{payment_behavior: string, payment_score: ?int, on_time_rate: ?float, avg_delay_days: ?int, end_of_cycle_rate: ?float, cycles_with_debt: int, payment_trend: ?string}
     */
    public function profile(Contact $contact): array
    {
        $debts = $contact->debts;
        $cycles = $debts->pluck('academic_period')->filter()->unique()->count();

        $paid = $debts->filter(fn ($d) => $d->status === 'paid' && $d->paid_at && $d->due_date)
            ->sortBy('paid_at')->values();

        if ($paid->count() < 2) {
            return [
                'payment_behavior' => 'sin_historial',
                'payment_score' => null,
                'on_time_rate' => null,
                'avg_delay_days' => null,
                'end_of_cycle_rate' => null,
                'cycles_with_debt' => $cycles,
                'payment_trend' => null,
            ];
        }

        $delays = $paid->map(fn ($d) => max(0, $d->due_date->diffInDays($d->paid_at, false)));
        $onTimeRate = $paid->filter(fn ($d, $i) => $delays[$i] <= self::GRACE_DAYS)->count() / $paid->count();
        $avgDelay = (int) round($delays->avg());
        $eocRate = $paid->filter(fn ($d) => $this->isEndOfCycle($d->paid_at, $d->academic_period))->count() / $paid->count();

        $behavior = match (true) {
            $eocRate >= 0.5 && $onTimeRate < 0.8 => 'fin_de_ciclo',
            $onTimeRate >= 0.8 => 'puntual',
            $avgDelay <= 45 => 'demora_leve',
            default => 'demora_cronica',
        };

        // Score 0-100: 60% puntualidad + 40% magnitud del atraso (90 días = 0 pts).
        $score = (int) round(100 * (0.6 * $onTimeRate + 0.4 * max(0, 1 - $avgDelay / 90)));

        return [
            'payment_behavior' => $behavior,
            'payment_score' => $score,
            'on_time_rate' => round($onTimeRate, 3),
            'avg_delay_days' => $avgDelay,
            'end_of_cycle_rate' => round($eocRate, 3),
            'cycles_with_debt' => $cycles,
            'payment_trend' => $this->trend($paid, $delays),
        ];
    }

    /**
     * Historial por ciclo para la ficha del estudiante: cada periodo con el
     * resultado de sus pagos (a tiempo / tarde / pendiente / vencido).
     */
    public function timeline(Contact $contact): Collection
    {
        return $contact->debts
            ->filter(fn ($d) => $d->academic_period)
            ->groupBy('academic_period')
            ->sortKeys()
            ->map(function ($debts, $period) {
                $statuses = $debts->map(function ($d) {
                    if ($d->status === 'paid') {
                        $delay = $d->paid_at && $d->due_date ? max(0, $d->due_date->diffInDays($d->paid_at, false)) : 0;

                        return $delay <= self::GRACE_DAYS ? 'a_tiempo' : 'tarde';
                    }

                    return $d->due_date && $d->due_date->isPast() ? 'vencido' : 'pendiente';
                });

                return [
                    'period' => $period,
                    'debts' => $debts->count(),
                    'amount' => (float) $debts->sum('original_amount'),
                    'pending' => (float) $debts->whereNotIn('status', ['paid', 'cancelled'])->sum('pending_balance'),
                    // el peor estado del ciclo define su color
                    'status' => collect(['vencido', 'pendiente', 'tarde', 'a_tiempo'])
                        ->first(fn ($s) => $statuses->contains($s)),
                    'avg_delay' => (int) round($debts
                        ->filter(fn ($d) => $d->status === 'paid' && $d->paid_at && $d->due_date)
                        ->map(fn ($d) => max(0, $d->due_date->diffInDays($d->paid_at, false)))
                        ->avg() ?? 0),
                ];
            })->values();
    }

    /** Pago en el tramo final del ciclo: jun-jul (ciclo 1) o nov-dic (ciclo 2). */
    protected function isEndOfCycle(Carbon $paidAt, ?string $period): bool
    {
        if (! $period || ! str_contains($period, '-')) {
            return false;
        }

        [, $semester] = explode('-', $period);

        return $semester === '1'
            ? in_array($paidAt->month, [6, 7])
            : in_array($paidAt->month, [11, 12]);
    }

    /**
     * Tendencia: atraso promedio de los 2 últimos ciclos con pagos vs los
     * anteriores. Diferencia de ±7 días marca mejora/empeora.
     */
    protected function trend(Collection $paid, Collection $delays): ?string
    {
        $byPeriod = $paid->zip($delays)
            ->filter(fn ($pair) => $pair[0]->academic_period)
            ->groupBy(fn ($pair) => $pair[0]->academic_period)
            ->sortKeys()
            ->map(fn ($pairs) => $pairs->avg(fn ($pair) => $pair[1]));

        if ($byPeriod->count() < 3) {
            return 'estable';
        }

        $recent = $byPeriod->slice(-2)->avg();
        $earlier = $byPeriod->slice(0, -2)->avg();

        return match (true) {
            $recent <= $earlier - 7 => 'mejorando',
            $recent >= $earlier + 7 => 'empeorando',
            default => 'estable',
        };
    }
}
