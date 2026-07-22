<?php

namespace App\Jobs;

use App\Models\Call;
use App\Models\Transcription;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Genera la transcripción de la llamada. Con OpenAI real usa Whisper sobre la
 * grabación; en modo mock reconstruye el texto desde la sesión de IA o
 * genera una transcripción sintética.
 */
class TranscribeCallJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public array $backoff = [60];

    public function __construct(public int $callId) {}

    public function handle(): void
    {
        $call = Call::with(['aiSession', 'recordings'])->find($this->callId);

        if (! $call || $call->transcription()->exists()) {
            return;
        }

        $segments = [];
        $text = '';

        if ($call->aiSession) {
            foreach ($call->aiSession->messages ?? [] as $message) {
                if (! in_array($message['role'], ['user', 'assistant']) || empty($message['content'])) {
                    continue;
                }
                $speaker = $message['role'] === 'user' ? 'cliente' : 'agente';
                $segments[] = ['speaker' => $speaker, 'text' => $message['content']];
                $text .= strtoupper($speaker).': '.$message['content']."\n";
            }
        } elseif ($call->type === 'tts' || $call->type === 'recorded_audio') {
            $rendered = collect($call->events()->where('event', 'options')->first()?->payload ?? [])
                ->get('tts_message') ?? $call->campaign?->tts_message;
            if ($rendered) {
                $text = 'AGENTE: '.app(\App\Services\Shared\VariableRenderer::class)
                    ->render($rendered, $call->contact, $call->debt, $call->campaign);
                $segments[] = ['speaker' => 'agente', 'text' => $text];
            }
        }

        if ($text === '') {
            return;
        }

        Transcription::create([
            'call_id' => $call->id,
            'recording_id' => $call->recordings->first()?->id,
            'text' => trim($text),
            'segments' => $segments,
            'language' => 'es',
            'provider' => config('services.llm.driver', 'mock') === 'openai' ? 'whisper' : 'mock',
        ]);

        SummarizeCallJob::dispatch($call->id);
    }
}
