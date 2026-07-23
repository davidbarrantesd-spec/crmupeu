<?php

namespace App\Services\Ai;

use App\Models\Call;
use Closure;
use React\ChildProcess\Process;
use React\EventLoop\Loop;
use React\EventLoop\TimerInterface;

/**
 * Maneja UNA conversación de voz vía Twilio ConversationRelay.
 *
 * Twilio transcribe lo que dice el interlocutor y lo envía como mensajes
 * "prompt". Cada turno se ejecuta en un proceso hijo (crm:relay-turn) que
 * emite los fragmentos de texto del LLM apenas se generan; aquí se reenvían
 * a Twilio como tokens parciales para que el TTS empiece a hablar de
 * inmediato. El event loop nunca se bloquea: los pings de Twilio se responden
 * a tiempo y varias llamadas pueden conversar en paralelo.
 */
class RelaySession
{
    protected ?\App\Models\AiSession $session = null;

    protected ?Process $turnProcess = null;

    protected ?TimerInterface $turnTimeout = null;

    protected ?string $pendingPrompt = null;

    protected bool $ended = false;

    /** Segundos máximos para un turno completo (LLM + herramientas). */
    protected const TURN_TIMEOUT = 60;

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
        $this->turnProcess?->terminate();
        if ($this->turnTimeout) {
            Loop::cancelTimer($this->turnTimeout);
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
        if ($this->turnProcess !== null) {
            $this->pendingPrompt = $text;

            return;
        }

        ($this->log)("deudor: {$text}");
        $this->runTurn($text);
    }

    /**
     * Ejecuta el turno en un proceso hijo y reenvía su salida NDJSON:
     * tokens de texto en vivo hacia el TTS y el cierre del turno al final.
     */
    protected function runTurn(string $text): void
    {
        $php = escapeshellarg(PHP_BINARY);
        $artisan = escapeshellarg(base_path('artisan'));
        $sessionUuid = escapeshellarg($this->session->uuid);

        $process = new Process("exec {$php} {$artisan} crm:relay-turn {$sessionUuid}", base_path());
        $this->turnProcess = $process;
        $process->start();

        $process->stdin->write(json_encode(['message' => $text], JSON_UNESCAPED_UNICODE));
        $process->stdin->end();

        $stdout = '';
        $streamedAnything = false;

        $process->stdout->on('data', function (string $chunk) use (&$stdout, &$streamedAnything) {
            $stdout .= $chunk;

            while (($pos = strpos($stdout, "\n")) !== false) {
                $line = substr($stdout, 0, $pos);
                $stdout = substr($stdout, $pos + 1);
                $event = json_decode($line, true);

                if (! is_array($event)) {
                    continue;
                }

                if ($event['e'] === 'token') {
                    $streamedAnything = true;
                    ($this->send)(['type' => 'text', 'token' => $event['t'], 'last' => false]);
                } elseif ($event['e'] === 'done') {
                    $this->finishTurn($event, $streamedAnything);
                } elseif ($event['e'] === 'error') {
                    ($this->log)("turn-error: {$event['message']}");
                    $this->sayFinal('Disculpe, ¿me lo puede repetir por favor?');
                }
            }
        });

        $process->stderr->on('data', fn (string $chunk) => ($this->log)('turn-stderr: '.trim($chunk)));

        $process->on('exit', function () {
            $this->turnProcess = null;

            if ($this->turnTimeout) {
                Loop::cancelTimer($this->turnTimeout);
                $this->turnTimeout = null;
            }

            // Atender lo que el interlocutor dijo mientras procesábamos.
            if ($this->pendingPrompt !== null && ! $this->ended) {
                $pending = $this->pendingPrompt;
                $this->pendingPrompt = null;
                ($this->log)("deudor (en espera): {$pending}");
                $this->runTurn($pending);
            }
        });

        $this->turnTimeout = Loop::addTimer(self::TURN_TIMEOUT, function () use ($process) {
            ($this->log)('turn-timeout: matando proceso');
            $process->terminate();
            $this->sayFinal('Disculpe la demora. ¿Me lo puede repetir por favor?');
        });
    }

    protected function finishTurn(array $event, bool $streamedAnything): void
    {
        $reply = (string) ($event['reply'] ?? '');
        $streamed = (int) ($event['streamed'] ?? 0);

        // Texto no streameado (driver sin streaming, o despedida fija del
        // sistema tras finalizar_llamada): enviarlo completo.
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
