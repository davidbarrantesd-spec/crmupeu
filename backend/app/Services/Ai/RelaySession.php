<?php

namespace App\Services\Ai;

use App\Models\Call;
use Closure;
use Illuminate\Support\Facades\DB;
use React\EventLoop\Loop;

/**
 * Maneja UNA conversación de voz vía Twilio ConversationRelay.
 *
 * Twilio transcribe lo que dice el interlocutor y lo envía como mensajes
 * "prompt"; esta clase los pasa por AiConversationService (el mismo motor del
 * simulador) y devuelve la respuesta como mensaje "text", que Twilio convierte
 * a voz en la llamada. El saludo inicial lo pronuncia Twilio (welcomeGreeting
 * del TwiML) y llega como Parameter para incorporarlo al historial del LLM.
 */
class RelaySession
{
    protected ?\App\Models\AiSession $session = null;

    protected bool $ended = false;

    public function __construct(
        protected Call $call,
        protected AiConversationService $ai,
        protected Closure $send,
        protected Closure $close,
        protected Closure $log,
    ) {}

    public function handle(array $message): void
    {
        try {
            match ($message['type'] ?? '') {
                'setup' => $this->setup($message),
                'prompt' => $this->prompt($message),
                'interrupt' => ($this->log)("interrupt call={$this->call->uuid}"),
                'dtmf' => ($this->log)("dtmf {$message['digit']} call={$this->call->uuid}"),
                'error' => ($this->log)("twilio-error call={$this->call->uuid}: ".json_encode($message)),
                default => null,
            };
        } catch (\PDOException|\Illuminate\Database\QueryException $e) {
            // Proceso de larga vida: la conexión a la BD puede haberse cerrado.
            ($this->log)("db-reconnect call={$this->call->uuid}: {$e->getMessage()}");
            DB::reconnect();
            $this->retry($message);
        } catch (\Throwable $e) {
            report($e);
            ($this->log)("error call={$this->call->uuid}: {$e->getMessage()}");
            $this->say('Disculpe, tuvimos un inconveniente técnico. Le llamaremos más tarde.');
            $this->hangupAfter(4);
        }
    }

    protected function retry(array $message): void
    {
        try {
            match ($message['type'] ?? '') {
                'setup' => $this->setup($message),
                'prompt' => $this->prompt($message),
                default => null,
            };
        } catch (\Throwable $e) {
            report($e);
            $this->say('Disculpe, tuvimos un inconveniente técnico. Le llamaremos más tarde.');
            $this->hangupAfter(4);
        }
    }

    protected function setup(array $message): void
    {
        if (($message['callSid'] ?? null) && ! $this->call->twilio_call_sid) {
            $this->call->update(['twilio_call_sid' => $message['callSid']]);
        }

        $version = $this->call->promptVersion
            ?? $this->call->campaign?->promptVersion;

        if (! $version) {
            ($this->log)("sin prompt version call={$this->call->uuid}");
            $this->say('Disculpe, no podemos atenderle en este momento. Hasta luego.');
            $this->hangupAfter(4);

            return;
        }

        $this->session = $this->ai->startSession($version, $this->call->contact, $this->call, 'live');

        // El saludo ya fue pronunciado por Twilio (welcomeGreeting); se añade al
        // historial para que el LLM sepa que la conversación ya está abierta.
        $greeting = $message['customParameters']['greeting'] ?? null;
        if ($greeting) {
            $messages = $this->session->messages;
            $messages[] = ['role' => 'assistant', 'content' => $greeting];
            $this->session->update(['messages' => $messages]);
        }

        ($this->log)("setup ok call={$this->call->uuid} session={$this->session->uuid}");
    }

    protected function prompt(array $message): void
    {
        $text = trim((string) ($message['voicePrompt'] ?? ''));

        if ($text === '' || ! $this->session || $this->ended) {
            return;
        }

        ($this->log)("deudor: {$text}");

        $result = $this->ai->turn($this->session, $text);
        $reply = (string) ($result['reply'] ?? '');

        if ($reply !== '') {
            ($this->log)("agente: {$reply}");
            $this->say($reply);
        }

        if ($result['finished']) {
            // Colgar cuando el TTS haya terminado de pronunciar la despedida
            // (~13 caracteres/segundo hablados + margen).
            $this->hangupAfter(min(12, max(3, (int) ceil(strlen($reply) / 13) + 1)));
        }
    }

    protected function say(string $text): void
    {
        ($this->send)(['type' => 'text', 'token' => $text, 'last' => true]);
    }

    protected function hangupAfter(int $seconds): void
    {
        if ($this->ended) {
            return;
        }
        $this->ended = true;

        Loop::addTimer($seconds, function () {
            ($this->send)(['type' => 'end']);
            Loop::addTimer(1, fn () => ($this->close)());
        });
    }
}
