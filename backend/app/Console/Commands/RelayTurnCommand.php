<?php

namespace App\Console\Commands;

use App\Models\AiSession;
use App\Services\Ai\AiConversationService;
use Illuminate\Console\Command;

/**
 * Ejecuta UN turno de conversación de voz y emite NDJSON por stdout.
 *
 * Lo invoca el servidor crm:relay como proceso hijo: así el LLM (que tarda
 * segundos) nunca bloquea el event loop del WebSocket — los pings de Twilio
 * se responden a tiempo y varias llamadas pueden conversar en paralelo.
 *
 * Entrada:  argumento session (uuid) + JSON por stdin {"message": "..."}
 * Salida:   una línea JSON por evento:
 *   {"e":"token","t":"..."}   fragmento de texto apenas lo genera el LLM
 *   {"e":"done","reply":"...","streamed":n,"finished":bool}
 *   {"e":"error","message":"..."}
 */
class RelayTurnCommand extends Command
{
    protected $signature = 'crm:relay-turn {session : uuid de la AiSession}';

    protected $description = 'Ejecuta un turno de conversación de voz (uso interno de crm:relay)';

    public function handle(AiConversationService $ai): int
    {
        $input = json_decode((string) stream_get_contents(STDIN), true) ?: [];
        $message = $input['message'] ?? null;

        $session = AiSession::where('uuid', $this->argument('session'))->first();

        if (! $session) {
            $this->emit(['e' => 'error', 'message' => 'sesión no encontrada']);

            return self::FAILURE;
        }

        $streamed = '';

        try {
            $result = $ai->turn($session, $message, function (string $chunk) use (&$streamed) {
                $streamed .= $chunk;
                $this->emit(['e' => 'token', 't' => $chunk]);
            });

            $this->emit([
                'e' => 'done',
                'reply' => $result['reply'],
                'streamed' => mb_strlen($streamed),
                'finished' => $result['finished'],
            ]);

            return self::SUCCESS;
        } catch (\Throwable $e) {
            report($e);
            $this->emit(['e' => 'error', 'message' => $e->getMessage()]);

            return self::FAILURE;
        }
    }

    protected function emit(array $event): void
    {
        // stdout sin buffering: el padre necesita cada token al instante.
        fwrite(STDOUT, json_encode($event, JSON_UNESCAPED_UNICODE)."\n");
        fflush(STDOUT);
    }
}
