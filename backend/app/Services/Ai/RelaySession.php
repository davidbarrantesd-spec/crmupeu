<?php

namespace App\Services\Ai;

use App\Models\Call;
use Closure;
use React\EventLoop\Loop;
use React\EventLoop\TimerInterface;

/**
 * Maneja UNA conversación de voz vía Twilio ConversationRelay.
 *
 * Twilio transcribe lo que dice el interlocutor y lo envía como mensajes
 * "prompt". Cada turno se despacha al RelayWorkerPool (procesos PHP
 * precalentados con BD y cliente LLM vivos) que emite los fragmentos de texto
 * apenas el LLM los genera; aquí se reenvían a Twilio como tokens parciales
 * para que el TTS empiece a hablar de inmediato. El event loop nunca se
 * bloquea: los pings de Twilio se responden a tiempo y varias llamadas
 * conversan en paralelo.
 */
class RelaySession
{
    protected ?\App\Models\AiSession $session = null;

    protected bool $turnActive = false;

    /** Descarta eventos tardíos de un turno que ya expiró por timeout. */
    protected int $turnGeneration = 0;

    protected ?TimerInterface $turnTimeout = null;

    protected ?string $pendingPrompt = null;

    protected bool $ended = false;

    /** Segundos máximos para un turno completo (LLM + herramientas). */
    protected const TURN_TIMEOUT = 60;

    public function __construct(
        protected Call $call,
        protected AiConversationService $ai,
        protected RelayWorkerPool $pool,
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
                'dtmf' => ($this->log)('dtmf '.($message['digit'] ?? '?')." call={$this->call->uuid}"),
                'error' => ($this->log)("twilio-error call={$this->call->uuid}: ".json_encode($message)),
                default => null,
            };
        } catch (\PDOException|\Illuminate\Database\QueryException $e) {
            // Proceso de larga vida: la conexión a la BD puede haberse cerrado
            // entre llamadas. Reconectar y reintentar una vez.
            ($this->log)("db-reconnect call={$this->call->uuid}: {$e->getMessage()}");
            \Illuminate\Support\Facades\DB::reconnect();

            try {
                if (($message['type'] ?? '') === 'setup') {
                    $this->setup($message);
                }
            } catch (\Throwable $e2) {
                report($e2);
                $this->sayFinal('Disculpe, tuvimos un inconveniente técnico. Le llamaremos más tarde.');
                $this->hangupAfter(4);
            }
        } catch (\Throwable $e) {
            report($e);
            ($this->log)("error call={$this->call->uuid}: {$e->getMessage()}");
            $this->sayFinal('Disculpe, tuvimos un inconveniente técnico. Le llamaremos más tarde.');
            $this->hangupAfter(4);
        }
    }

    public function onDisconnect(): void
    {
        $this->ended = true;
        $this->turnGeneration++;

        if ($this->turnTimeout) {
            Loop::cancelTimer($this->turnTimeout);
            $this->turnTimeout = null;
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
            $this->sayFinal('Disculpe, no podemos atenderle en este momento. Hasta luego.');
            $this->hangupAfter(4);

            return;
        }

        $this->session = $this->ai->startSession($version, $this->call->contact, $this->call, 'live');

        // El saludo ya fue pronunciado por Twilio (welcomeGreeting); se añade
        // al historial para que el LLM sepa que la conversación está abierta.
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

        // Si el interlocutor habla mientras el turno anterior aún procesa,
        // se guarda solo lo último y se atiende al terminar.
        if ($this->turnActive) {
            $this->pendingPrompt = $text;

            return;
        }

        ($this->log)("deudor: {$text}");
        $this->runTurn($text);
    }

    protected function runTurn(string $text): void
    {
        $this->turnActive = true;
        $generation = ++$this->turnGeneration;
        $spawnedAt = microtime(true);
        $streamedAnything = false;

        $this->turnTimeout = Loop::addTimer(self::TURN_TIMEOUT, function () use ($generation) {
            if ($generation !== $this->turnGeneration || $this->ended) {
                return;
            }
            ($this->log)('turn-timeout');
            $this->turnGeneration++; // invalida eventos tardíos del worker
            $this->turnActive = false;
            $this->sayFinal('Disculpe la demora. ¿Me lo puede repetir por favor?');
        });

        $this->pool->dispatch($this->session->uuid, $text, function (array $event) use ($generation, $spawnedAt, &$streamedAnything) {
            if ($generation !== $this->turnGeneration || $this->ended) {
                return; // turno expirado o llamada terminada
            }

            switch ($event['e']) {
                case 'token':
                    if (! $streamedAnything) {
                        ($this->log)(sprintf('primer token a %.2fs', microtime(true) - $spawnedAt));
                    }
                    $streamedAnything = true;
                    ($this->send)(['type' => 'text', 'token' => $event['t'], 'last' => false]);
                    break;

                case 'done':
                    $this->completeTurn($event, $streamedAnything);
                    break;

                case 'error':
                    ($this->log)('turn-error: '.($event['message'] ?? '?'));
                    $this->completeTurn(null, $streamedAnything);
                    $this->sayFinal('Disculpe, ¿me lo puede repetir por favor?');
                    break;
            }
        });
    }

    protected function completeTurn(?array $event, bool $streamedAnything): void
    {
        $this->turnActive = false;

        if ($this->turnTimeout) {
            Loop::cancelTimer($this->turnTimeout);
            $this->turnTimeout = null;
        }

        if ($event !== null) {
            $reply = (string) ($event['reply'] ?? '');
            $streamed = (int) ($event['streamed'] ?? 0);

            // Texto no streameado (driver sin streaming, o despedida fija del
            // sistema): enviarlo completo.
            if ($reply !== '' && mb_strlen($reply) > $streamed) {
                $remainder = $streamed > 0 ? mb_substr($reply, $streamed) : $reply;
                ($this->send)(['type' => 'text', 'token' => $remainder, 'last' => true]);
            } else {
                // Cerrar el mensaje en curso para que el TTS pronuncie lo pendiente.
                ($this->send)(['type' => 'text', 'token' => ($streamedAnything ? '' : ' '), 'last' => true]);
            }

            if ($reply !== '') {
                ($this->log)("agente: {$reply}");
            }

            if (! empty($event['finished'])) {
                $this->hangupAfter(min(12, max(3, (int) ceil(mb_strlen($reply) / 13) + 1)));

                return;
            }
        }

        // Atender lo que el interlocutor dijo mientras procesábamos.
        if ($this->pendingPrompt !== null && ! $this->ended) {
            $pending = $this->pendingPrompt;
            $this->pendingPrompt = null;
            ($this->log)("deudor (en espera): {$pending}");
            $this->runTurn($pending);
        }
    }

    protected function sayFinal(string $text): void
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
