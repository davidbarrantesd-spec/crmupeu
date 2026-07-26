<?php

namespace App\Services\Reports;

use App\Models\Contact;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Análisis de cartera con lógica de banca peruana (SBS).
 *
 * Calificación por días de atraso actual (la deuda vencida más antigua):
 *   normal ≤8 · cpp 9-30 · deficiente 31-60 · dudoso 61-120 · perdida >120
 *
 * Provisión estimada por categoría (tasas estándar SBS para consumo):
 * la "pérdida esperada" = saldo pendiente × tasa — el indicador que usan los
 * bancos para dimensionar cuánto de la cartera probablemente no se cobre.
 */
class CreditAnalysisService
{
    public const RATINGS = [
        'normal' => 'Normal',
        'cpp' => 'CPP',
        'deficiente' => 'Deficiente',
        'dudoso' => 'Dudoso',
        'perdida' => 'Pérdida',
    ];

    /** Tasas de provisión SBS (aprox. créditos de consumo). */
    public const PROVISIONS = [
        'normal' => 0.01,
        'cpp' => 0.05,
        'deficiente' => 0.25,
        'dudoso' => 0.60,
        'perdida' => 1.00,
    ];

    /** Días de atraso máximos por categoría (el resto es 'perdida'). */
    public const THRESHOLDS = ['normal' => 8, 'cpp' => 30, 'deficiente' => 60, 'dudoso' => 120];

    /** Estrategia de campaña recomendada por calificación. */
    public const STRATEGIES = [
        'normal' => [
            'titulo' => 'Prevención suave',
            'canal' => 'WhatsApp',
            'campana' => 'whatsapp',
            'prioridad' => 'baja',
            'detalle' => 'Recordatorio amable ANTES del vencimiento. No llamar: mantener la buena relación y el hábito de pago.',
        ],
        'cpp' => [
            'titulo' => 'Recordatorio activo',
            'canal' => 'TTS + WhatsApp',
            'campana' => 'tts',
            'prioridad' => 'media',
            'detalle' => 'Mensaje de voz automático + WhatsApp con el monto y fecha. Tono cordial: la mayoría paga con un empujón.',
        ],
        'deficiente' => [
            'titulo' => 'Gestión conversacional',
            'canal' => 'Llamada IA',
            'campana' => 'ai_conversational',
            'prioridad' => 'alta',
            'detalle' => 'Llamada IA que negocia fecha y registra compromiso de pago. Reintentar 2-3 veces en horarios distintos.',
        ],
        'dudoso' => [
            'titulo' => 'Negociación intensiva',
            'canal' => 'Llamada IA + gestor',
            'campana' => 'ai_conversational',
            'prioridad' => 'alta',
            'detalle' => 'Llamada IA con oferta de fraccionamiento; si no responde en 1 semana, escalar a gestor humano.',
        ],
        'perdida' => [
            'titulo' => 'Recuperación especializada',
            'canal' => 'Gestor humano',
            'campana' => null,
            'prioridad' => 'crítica',
            'detalle' => 'Gestión personalizada: convenio de refinanciamiento o evaluación de castigo. La automatización ya no basta.',
        ],
    ];

    public static function rate(int $delayDays, bool $hasUnpaid): string
    {
        if (! $hasUnpaid || $delayDays <= self::THRESHOLDS['normal']) {
            return 'normal';
        }

        foreach (['cpp', 'deficiente', 'dudoso'] as $rating) {
            if ($delayDays <= self::THRESHOLDS[$rating]) {
                return $rating;
            }
        }

        return 'perdida';
    }

    public function build(?User $user, array $filters = []): array
    {
        $base = fn () => Contact::query()
            ->visibleTo($user)
            ->whereNotNull('credit_rating')
            ->when($filters['campus_id'] ?? null, fn ($q, $v) => $q->where('campus_id', $v))
            ->when($filters['faculty_id'] ?? null, fn ($q, $v) => $q->where('faculty_id', $v))
            ->when($filters['career_id'] ?? null, fn ($q, $v) => $q->where('career_id', $v));

        // Conteos + saldos por calificación en dos consultas agregadas.
        $counts = $base()->groupBy('credit_rating')->selectRaw('credit_rating as k, count(*) as c')->pluck('c', 'k');

        $amounts = $base()
            ->join('debts', fn ($j) => $j->on('debts.contact_id', '=', 'contacts.id')
                ->whereNull('debts.deleted_at')
                ->whereNotIn('debts.status', ['paid', 'cancelled']))
            ->groupBy('credit_rating')
            ->selectRaw('contacts.credit_rating as k, sum(debts.pending_balance) as amount')
            ->pluck('amount', 'k');

        $carteraTotal = (float) $amounts->sum();

        $byRating = collect(self::RATINGS)->map(function ($label, $rating) use ($counts, $amounts, $carteraTotal) {
            $amount = (float) ($amounts[$rating] ?? 0);

            return [
                'rating' => $rating,
                'label' => $label,
                'count' => (int) ($counts[$rating] ?? 0),
                'amount' => $amount,
                'pct_amount' => $carteraTotal > 0 ? round($amount / $carteraTotal * 100, 1) : 0,
                'provision_rate' => self::PROVISIONS[$rating],
                'expected_loss' => round($amount * self::PROVISIONS[$rating], 2),
                'strategy' => self::STRATEGIES[$rating],
            ];
        })->values();

        $enRiesgo = $byRating->whereIn('rating', ['deficiente', 'dudoso', 'perdida']);

        // Matriz calificación × año de carrera.
        $ratingByYear = $base()
            ->where('cycles_with_debt', '>', 0)
            ->groupBy('year', 'credit_rating')
            ->selectRaw('least(ceil(cycles_with_debt / 2.0), 5) as year, credit_rating, count(*) as count')
            ->orderBy('year')
            ->get();

        // Recuperación por ciclo: cuánto de lo facturado en cada ciclo se cobró.
        $recovery = DB::table('debts')
            ->joinSub($base()->select('contacts.id'), 'visible', 'visible.id', '=', 'debts.contact_id')
            ->whereNull('debts.deleted_at')
            ->whereNotNull('debts.academic_period')
            ->where('debts.status', '!=', 'cancelled')
            ->groupBy('debts.academic_period')
            ->selectRaw("debts.academic_period as period,
                sum(debts.original_amount) as billed,
                sum(debts.original_amount - debts.pending_balance) as recovered,
                round(sum(debts.original_amount - debts.pending_balance) / nullif(sum(debts.original_amount), 0) * 100, 1) as recovery_rate")
            ->orderBy('debts.academic_period')
            ->get();

        return [
            'kpis' => [
                'students_rated' => (int) $counts->sum(),
                'cartera_total' => $carteraTotal,
                'cartera_en_riesgo' => (float) $enRiesgo->sum('amount'),
                'pct_en_riesgo' => $carteraTotal > 0 ? round($enRiesgo->sum('amount') / $carteraTotal * 100, 1) : 0,
                'perdida_esperada' => (float) $byRating->sum('expected_loss'),
                'avg_score' => (int) ($base()->whereNotNull('payment_score')->avg('payment_score') ?? 0),
            ],
            'by_rating' => $byRating,
            'rating_by_year' => $ratingByYear,
            'recovery_by_period' => $recovery,
        ];
    }
}
