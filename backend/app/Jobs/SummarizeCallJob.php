<?php

namespace App\Jobs;

use App\Integrations\IntegrationManager;
use App\Models\Call;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Genera un resumen de la transcripción con el LLM (o heurística en mock).
 */
class SummarizeCallJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public array $backoff = [60];

    public function __construct(public int $callId) {}

    public function handle(IntegrationManager $integrations): void
    {
        $call = Call::with('transcription')->find($this->callId);

        if (! $call || ! $call->transcription || $call->summary) {
            return;
        }

        $llm = $integrations->llm();

        if (in_array($llm->name(), ['anthropic', 'openai'])) {
            $response = $llm->chat([
                ['role' => 'system', 'content' => 'Resume la siguiente llamada de cobranzas en máximo 3 frases en español. Indica si hubo compromiso de pago, fecha y monto.'],
                ['role' => 'user', 'content' => $call->transcription->text],
            ]);
            $summary = $response['content'] ?? '';
        } else {
            $result = $call->structured_result ?? [];
            $summary = $result['resumen']
                ?? 'Llamada '.($call->answered_at ? 'contestada' : 'no contestada')
                .($call->result ? " con resultado {$call->result}" : '')
                .'. Duración: '.($call->duration_seconds ?? 0).'s.';
        }

        $call->update(['summary' => $summary]);
    }
}
