<?php

namespace App\Services\Campaigns;

use App\Models\Contact;
use Illuminate\Database\Eloquent\Builder;

/**
 * Construye la consulta de contactos elegibles a partir de los filtros
 * jsonb `segment_filters` de una campaña. Siempre excluye contactos
 * sin consentimiento, marcados como no contactar o con teléfono inválido.
 */
class SegmentationService
{
    public function query(array $filters, string $channel = 'voice'): Builder
    {
        $query = Contact::query()
            ->where('status', 'active')
            ->where('do_not_contact', false)
            ->where('phone_valid', true);

        if ($channel === 'whatsapp') {
            $query->where('whatsapp_consent', true);
        } else {
            $query->where('call_consent', true);
        }

        if (! empty($filters['city'])) {
            $query->whereIn('city', (array) $filters['city']);
        }

        if (! empty($filters['segment'])) {
            $query->whereIn('segment', (array) $filters['segment']);
        }

        if (! empty($filters['tags'])) {
            $query->whereHas('tags', fn ($q) => $q->whereIn('name', (array) $filters['tags']));
        }

        // Filtros académicos (campus/facultad/carrera/nivel/modalidad/matrícula/segmento)
        foreach (['campus_id', 'faculty_id', 'career_id', 'academic_level_id'] as $field) {
            if (! empty($filters[$field])) {
                $query->whereIn($field, (array) $filters[$field]);
            }
        }
        foreach (['modality', 'enrollment_status', 'payment_segment'] as $field) {
            if (! empty($filters[$field])) {
                $query->whereIn($field, (array) $filters[$field]);
            }
        }
        if (! empty($filters['academic_period'])) {
            $query->whereHas('debts', fn ($q) => $q
                ->whereNotIn('status', ['paid', 'cancelled'])
                ->whereIn('academic_period', (array) $filters['academic_period']));
        }

        $debtFilters = array_filter([
            'min_debt' => $filters['min_debt'] ?? null,
            'max_debt' => $filters['max_debt'] ?? null,
            'min_days_overdue' => $filters['min_days_overdue'] ?? null,
            'debt_status' => $filters['debt_status'] ?? null,
            'due_before' => $filters['due_before'] ?? null,
            'due_after' => $filters['due_after'] ?? null,
        ], fn ($v) => $v !== null && $v !== []);

        if ($debtFilters) {
            $query->whereHas('debts', function ($q) use ($debtFilters) {
                $q->whereNotIn('status', ['paid', 'cancelled']);
                if (isset($debtFilters['min_debt'])) {
                    $q->where('pending_balance', '>=', $debtFilters['min_debt']);
                }
                if (isset($debtFilters['max_debt'])) {
                    $q->where('pending_balance', '<=', $debtFilters['max_debt']);
                }
                if (isset($debtFilters['min_days_overdue'])) {
                    $q->where('due_date', '<=', now()->subDays((int) $debtFilters['min_days_overdue']));
                }
                if (! empty($debtFilters['debt_status'])) {
                    $q->whereIn('status', (array) $debtFilters['debt_status']);
                }
                if (isset($debtFilters['due_before'])) {
                    $q->where('due_date', '<=', $debtFilters['due_before']);
                }
                if (isset($debtFilters['due_after'])) {
                    $q->where('due_date', '>=', $debtFilters['due_after']);
                }
            });
        }

        if (! empty($filters['exclude_broken_agreements'])) {
            $query->whereDoesntHave('agreements', fn ($q) => $q->where('status', 'broken'));
        }

        if (! empty($filters['broken_agreements_only'])) {
            $query->whereHas('agreements', fn ($q) => $q->where('status', 'broken'));
        }

        if (! empty($filters['previous_campaign_uuid'])) {
            $query->whereHas('campaigns', function ($q) use ($filters) {
                $q->where('campaigns.uuid', $filters['previous_campaign_uuid']);
                if (! empty($filters['previous_result'])) {
                    $q->whereIn('campaign_contacts.last_result', (array) $filters['previous_result']);
                }
            });
        }

        if (isset($filters['max_attempts_lt'])) {
            $query->whereDoesntHave('campaigns', function ($q) use ($filters) {
                $q->where('campaign_contacts.attempts', '>=', (int) $filters['max_attempts_lt']);
            });
        }

        return $query;
    }

    /**
     * @return array{count: int, sample: \Illuminate\Support\Collection}
     */
    public function preview(array $filters, string $channel = 'voice'): array
    {
        $query = $this->query($filters, $channel);

        return [
            'count' => (clone $query)->count(),
            'sample' => $query->with('debts')->limit(10)->get(),
        ];
    }
}
