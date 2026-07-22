<?php

namespace App\Jobs;

use App\Events\CallUpdated;
use App\Models\Call;
use App\Services\Ai\AiConversationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * SOLO SANDBOX: simula el ciclo de vida de una llamada como lo haría Twilio
 * mediante webhooks. ~75% de las llamadas se contestan; el resto se reparte
 * entre no contesta, ocupado y fallo.
 */
class SimulateCallLifecycleJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public int $callId, public string $sid) {}

    public function handle(AiConversationService $aiService): void
    {
        $call = Call::find($this->callId);

        if (! $call || $call->status === 'cancelled') {
            return;
        }

        $call->update(['status' => 'ringing']);
        $call->addEvent('ringing', ['sandbox' => true]);
        broadcast(new CallUpdated($call))->toOthers();

        // Resultado pseudoaleatorio pero determinístico por SID (reproducible).
        $roll = hexdec(substr(md5($this->sid), 0, 2)) % 100;

        if ($roll < 75) {
            $this->simulateAnswered($call, $aiService);
        } elseif ($roll < 87) {
            $this->finish($call, 'no_answer', 'no_answer');
        } elseif ($roll < 95) {
            $this->finish($call, 'busy', 'busy');
        } else {
            $call->update(['error_message' => 'Simulated carrier error', 'error_code' => 'SBX-500']);
            $this->finish($call, 'failed', 'failed');
        }
    }

    protected function simulateAnswered(Call $call, AiConversationService $aiService): void
    {
        $call->update(['status' => 'in_progress', 'answered_at' => now()]);
        $call->addEvent('answered', ['sandbox' => true]);

        if ($call->type === 'ai_conversational' && $call->promptVersion) {
            $this->simulateAiConversation($call, $aiService);
        } elseif ($call->campaign?->dtmf_options) {
            // 40% de los contestados presionan una tecla configurada.
            $roll = hexdec(substr(md5($this->sid), 2, 2)) % 100;
            if ($roll < 40) {
                $digits = array_keys($call->campaign->dtmf_options);
                $digit = $digits[$roll % count($digits)];
                $call->update(['dtmf_responses' => [['digit' => (string) $digit, 'at' => now()->toIso8601String()]]]);
                $call->addEvent('dtmf', ['digit' => (string) $digit, 'sandbox' => true]);
                app(\App\Services\FollowUps\FollowUpRuleEngine::class)
                    ->handleDtmf($call, $call->campaign->dtmf_options[$digit]['action'] ?? '');
            }
        }

        $duration = 20 + (hexdec(substr(md5($this->sid), 4, 2)) % 160);
        $call->update([
            'status' => 'completed',
            'result' => $call->result ?? 'answered',
            'ended_at' => now(),
            'duration_seconds' => $duration,
        ]);
        $call->addEvent('completed', ['sandbox' => true, 'duration' => $duration]);

        // Simula la grabación si la campaña graba llamadas.
        if ($call->campaign?->record_calls ?? true) {
            ProcessRecordingJob::dispatch($call->id, 'RSBX'.substr(md5($this->sid), 0, 28), 'sandbox://recording', $duration);
        }

        ProcessCallResultJob::dispatch($call->id);
    }

    protected function simulateAiConversation(Call $call, AiConversationService $aiService): void
    {
        $session = $aiService->startSession($call->promptVersion, $call->contact, $call, 'live');

        // Guion del "cliente" simulado: confirma identidad, pregunta el monto y se compromete.
        $script = ['Sí, soy yo, ¿quién habla?', '¿Cuánto es lo que debo exactamente?', 'Está bien, puedo pagar la próxima semana.'];

        $aiService->turn($session, null); // saludo inicial del agente

        foreach ($script as $userLine) {
            $result = $aiService->turn($session->refresh(), $userLine);
            if ($result['finished']) {
                break;
            }
        }

        $session->refresh();
        if ($session->status !== 'completed') {
            $aiService->turn($session, 'Gracias, adiós.');
        }
    }

    protected function finish(Call $call, string $status, string $result): void
    {
        $call->update([
            'status' => $status,
            'result' => $result,
            'ended_at' => now(),
        ]);
        $call->addEvent($status, ['sandbox' => true]);

        ProcessCallResultJob::dispatch($call->id);
    }
}
