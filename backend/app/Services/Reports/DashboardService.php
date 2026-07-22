<?php

namespace App\Services\Reports;

use App\Models\Agreement;
use App\Models\Call;
use App\Models\Campaign;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\CostEntry;
use App\Models\Debt;
use App\Models\FollowUp;
use App\Models\Message;
use Illuminate\Support\Facades\DB;

class DashboardService
{
    public function build(?string $from = null, ?string $to = null): array
    {
        $from = $from ? \Carbon\Carbon::parse($from)->startOfDay() : now()->subDays(30)->startOfDay();
        $to = $to ? \Carbon\Carbon::parse($to)->endOfDay() : now()->endOfDay();
        $period = fn ($q, $col = 'created_at') => $q->whereBetween($col, [$from, $to]);

        $callsQuery = fn () => $period(Call::query());
        $callsMade = $callsQuery()->whereNotIn('status', ['pending', 'scheduled', 'cancelled'])->count();
        $callsAnswered = $callsQuery()->whereNotNull('answered_at')->count();

        $agreements = fn () => $period(Agreement::query());
        $agreementsTotal = $agreements()->count();
        $agreementsFulfilled = $agreements()->where('status', 'fulfilled')->count();

        $whatsappSent = $period(Message::query())->where('direction', 'outbound')->count();
        $whatsappReplied = $period(Message::query())->where('direction', 'inbound')->count();

        $kpis = [
            'total_contacts' => Contact::count(),
            'total_debt' => (float) Debt::whereNotIn('status', ['paid', 'cancelled'])->sum('pending_balance'),
            'active_campaigns' => Campaign::whereIn('status', ['running', 'scheduled'])->count(),
            'calls_scheduled' => Call::whereIn('status', ['pending', 'scheduled', 'queued'])->count(),
            'calls_made' => $callsMade,
            'calls_answered' => $callsAnswered,
            'calls_missed' => $callsQuery()->whereIn('status', ['no_answer', 'busy', 'failed'])->count(),
            'agreements_total' => $agreementsTotal,
            'agreements_fulfilled' => $agreementsFulfilled,
            'agreements_broken' => $agreements()->where('status', 'broken')->count(),
            'whatsapp_sent' => $whatsappSent,
            'whatsapp_replied' => $whatsappReplied,
            'derived_cases' => $period(FollowUp::query())->where('type', 'advisor_task')->count(),
            'pending_conversations' => Conversation::whereIn('status', ['open', 'pending'])->where('unread_count', '>', 0)->count(),
            'estimated_cost' => (float) $period(CostEntry::query(), 'date')->sum('amount'),
            'contact_rate' => $callsMade > 0 ? round($callsAnswered / $callsMade * 100, 1) : 0,
            'conversion_rate' => $callsAnswered > 0 ? round($agreementsTotal / $callsAnswered * 100, 1) : 0,
            'estimated_recovery' => (float) $agreements()->whereIn('status', ['pending', 'fulfilled'])->sum('amount'),
        ];

        $charts = [
            'calls_by_day' => $period(Call::query())
                ->select(DB::raw("to_char(created_at, 'YYYY-MM-DD') as day"),
                    DB::raw('count(*) as total'),
                    DB::raw('count(answered_at) as answered'))
                ->groupBy('day')->orderBy('day')->get(),

            'results_by_campaign' => Call::query()
                ->whereBetween('calls.created_at', [$from, $to])
                ->whereNotNull('campaign_id')
                ->join('campaigns', 'campaigns.id', '=', 'calls.campaign_id')
                ->select('campaigns.name',
                    DB::raw("count(*) filter (where answered_at is not null) as contestadas"),
                    DB::raw("count(*) filter (where calls.status in ('no_answer','busy')) as no_contestadas"),
                    DB::raw("count(*) filter (where calls.status = 'failed') as fallidas"))
                ->groupBy('campaigns.name')->limit(10)->get(),

            'agreements_by_status' => $agreements()
                ->select('status', DB::raw('count(*) as total'))
                ->groupBy('status')->get(),

            'messages_by_day' => $period(Message::query())
                ->select(DB::raw("to_char(created_at, 'YYYY-MM-DD') as day"),
                    DB::raw("count(*) filter (where direction = 'outbound') as enviados"),
                    DB::raw("count(*) filter (where direction = 'inbound') as recibidos"))
                ->groupBy('day')->orderBy('day')->get(),

            'hourly_answer_rate' => $period(Call::query())
                ->whereNotIn('status', ['pending', 'scheduled', 'cancelled'])
                ->select(DB::raw('extract(hour from created_at)::int as hour'),
                    DB::raw('count(*) as total'),
                    DB::raw('count(answered_at) as answered'))
                ->groupBy('hour')->orderBy('hour')->get(),

            'funnel' => [
                ['stage' => 'Contactos en campañas', 'value' => DB::table('campaign_contacts')->distinct('contact_id')->count('contact_id')],
                ['stage' => 'Llamadas realizadas', 'value' => $callsMade],
                ['stage' => 'Contestadas', 'value' => $callsAnswered],
                ['stage' => 'Acuerdos', 'value' => $agreementsTotal],
                ['stage' => 'Acuerdos cumplidos', 'value' => $agreementsFulfilled],
            ],

            'advisor_performance' => FollowUp::query()
                ->whereBetween('follow_ups.created_at', [$from, $to])
                ->whereNotNull('assigned_to')
                ->join('users', 'users.id', '=', 'follow_ups.assigned_to')
                ->select('users.name',
                    DB::raw('count(*) as total'),
                    DB::raw("count(*) filter (where follow_ups.status = 'done') as completados"))
                ->groupBy('users.name')->get(),
        ];

        return ['kpis' => $kpis, 'charts' => $charts];
    }
}
