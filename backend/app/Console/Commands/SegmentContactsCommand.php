<?php

namespace App\Console\Commands;

use App\Models\Contact;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Clasifica a cada estudiante por su comportamiento de pago. Corre a diario
 * (scheduler) y puede lanzarse manualmente. Los segmentos alimentan el
 * dashboard y la segmentación de campañas.
 *
 * Prioridad de clasificación (la primera que aplique):
 *  1. deudor_inactivo  — debe y ya no estudia (prioridad de cobranza distinta)
 *  2. deudor_cronico   — debe 2+ ciclos distintos, o su deuda más antigua
 *                        supera el año
 *  3. deuda_reciente   — solo debe el ciclo actual
 *  4. pagador_tardio   — está al día pero histórico de pagar tarde
 *  5. buen_pagador     — al día y paga a tiempo
 */
class SegmentContactsCommand extends Command
{
    protected $signature = 'crm:segment {--chunk=500}';

    protected $description = 'Recalcula el segmento de comportamiento de pago de cada contacto';

    /** Días de gracia tras el vencimiento antes de considerar un pago "tardío". */
    protected const LATE_GRACE_DAYS = 15;

    public function handle(\App\Services\Reports\PaymentBehaviorService $behavior): int
    {
        $updated = 0;
        $currentPeriod = self::currentPeriod();

        Contact::query()
            ->whereHas('debts')
            ->with(['debts' => fn ($q) => $q->select(
                'id', 'contact_id', 'status', 'pending_balance', 'original_amount', 'due_date', 'paid_at', 'academic_period'
            )])
            ->chunkById((int) $this->option('chunk'), function ($contacts) use (&$updated, $currentPeriod, $behavior) {
                foreach ($contacts as $contact) {
                    $segment = $this->classify($contact, $currentPeriod);
                    $profile = $behavior->profile($contact);

                    $changed = $contact->payment_segment !== $segment
                        || $contact->payment_behavior !== $profile['payment_behavior']
                        || (int) $contact->payment_score !== (int) $profile['payment_score'];

                    if ($changed) {
                        $contact->updateQuietly($profile + [
                            'payment_segment' => $segment,
                            'payment_segment_updated_at' => now(),
                        ]);
                        $updated++;
                    }
                }
            });

        $this->info("Segmentos y comportamiento recalculados; {$updated} contactos actualizados.");

        return self::SUCCESS;
    }

    protected function classify(Contact $contact, string $currentPeriod): ?string
    {
        $debts = $contact->debts;
        $unpaid = $debts->whereNotIn('status', ['paid', 'cancelled'])->where('pending_balance', '>', 0);
        $paid = $debts->where('status', 'paid');

        if ($unpaid->isNotEmpty()) {
            if ($contact->enrollment_status === 'no_matriculado') {
                return 'deudor_inactivo';
            }

            $periods = $unpaid->pluck('academic_period')->filter()->unique();
            $oldestDue = $unpaid->pluck('due_date')->filter()->min();

            if ($periods->count() >= 2 || ($oldestDue && Carbon::parse($oldestDue)->lt(now()->subYear()))) {
                return 'deudor_cronico';
            }

            return 'deuda_reciente';
        }

        // Sin deuda pendiente: mirar el historial de pagos.
        $withDates = $paid->filter(fn ($d) => $d->paid_at && $d->due_date);

        if ($withDates->isEmpty()) {
            return null; // sin historial suficiente
        }

        $late = $withDates->filter(fn ($d) => $d->paid_at->gt($d->due_date->copy()->addDays(self::LATE_GRACE_DAYS)));

        return $late->count() >= 2 && $late->count() / $withDates->count() >= 0.5
            ? 'pagador_tardio'
            : 'buen_pagador';
    }

    /** Ciclo académico actual estilo UPeU: 2026-1 (mar–jul), 2026-2 (ago–dic). */
    public static function currentPeriod(): string
    {
        $now = now('America/Lima');

        return $now->year.'-'.($now->month >= 8 ? '2' : '1');
    }
}
