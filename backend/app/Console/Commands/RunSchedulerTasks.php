<?php

namespace App\Console\Commands;

use App\Jobs\DispatchCampaignCallsJob;
use App\Jobs\ProcessFollowUpJob;
use App\Models\Agreement;
use App\Models\Campaign;
use App\Models\FollowUp;
use App\Services\FollowUps\FollowUpRuleEngine;
use Illuminate\Console\Command;

/**
 * Tareas periódicas del sistema (invocadas por el Scheduler cada minuto):
 * - inicia campañas programadas cuya hora llegó
 * - despacha el siguiente lote de llamadas de campañas en ejecución
 * - ejecuta seguimientos automáticos vencidos (solo tipos automatizados)
 * - marca acuerdos vencidos como incumplidos y dispara sus reglas
 */
class RunSchedulerTasks extends Command
{
    protected $signature = 'crm:tick';

    protected $description = 'Ejecuta el ciclo de orquestación de campañas, seguimientos y acuerdos';

    public function handle(FollowUpRuleEngine $ruleEngine): int
    {
        // 1. Campañas programadas que deben iniciar.
        Campaign::where('status', 'scheduled')
            ->where('starts_at', '<=', now())
            ->get()
            ->each(function (Campaign $campaign) {
                $campaign->update(['status' => 'running']);
                \App\Jobs\LaunchCampaignJob::dispatch($campaign->id);
                $this->info("Campaña iniciada: {$campaign->name}");
            });

        // 2. Campañas en ejecución: despachar siguiente lote.
        Campaign::where('status', 'running')->pluck('id')
            ->each(fn ($id) => DispatchCampaignCallsJob::dispatch($id));

        // 3. Seguimientos automáticos vencidos.
        FollowUp::where('status', 'pending')
            ->whereIn('type', ['auto_call', 'ai_call', 'whatsapp'])
            ->where('scheduled_at', '<=', now())
            ->limit(100)
            ->pluck('id')
            ->each(fn ($id) => ProcessFollowUpJob::dispatch($id));

        // 4. Acuerdos vencidos sin cumplir → incumplidos + reglas.
        Agreement::where('status', 'pending')
            ->whereDate('promise_date', '<', now()->subDay()->toDateString())
            ->get()
            ->each(function (Agreement $agreement) use ($ruleEngine) {
                $agreement->update(['status' => 'broken']);
                $ruleEngine->handleBrokenAgreement($agreement);
                $this->info("Acuerdo incumplido: {$agreement->uuid}");
            });

        return self::SUCCESS;
    }
}
