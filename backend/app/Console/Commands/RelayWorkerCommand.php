<?php

namespace App\Console\Commands;

use App\Models\AiSession;
use App\Services\Ai\AiConversationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Worker PERSISTENTE de turnos de voz: arranca una vez y procesa turnos en
 * bucle leyendo NDJSON por stdin. Frente a un proceso por turno, mantiene
 * vivos el framework, la conexión a la BD y el cliente HTTP del LLM (TLS
 * reutilizado), recortando ~1s de latencia por turno.
 *
 * Entrada (una línea por petición):  {"id":"t1","session":"uuid","message":"..."}
 * Salida (una línea por evento, siempre con el id de la petición):
 *   {"id":"t1","e":"ready"}                  al arrancar (sin id) y al quedar libre
 *   {"id":"t1","e":"token","t":"..."}
 *   {"id":"t1","e":"done","reply":...,"streamed":n,"finished":bool}
 *   {"id":"t1","e":"error","message":"..."}
 *
 * Se recicla tras MAX_TURNS para evitar fugas de memoria en procesos eternos.
 */
class RelayWorkerCommand extends Command
{
    protected $signature = 'crm:relay-worker';

    protected $description = 'Worker persistente de turnos de voz (uso interno de crm:relay)';

    protected const MAX_TURNS = 200;

    public function handle(AiConversationService $ai): int
    {
        // Precalentar ANTES de declararse listo: conexión a la BD abierta y
        // credenciales del LLM leídas/desencriptadas. Sin esto, el primer
        // turno que atiende cada worker paga ~1.5s extra.
        DB::connection()->getPdo();
        app(\App\Integrations\IntegrationManager::class)->llm();

        // La misma instancia del servicio vive todo el proceso: su
        // IntegrationManager memoiza el driver LLM (y su conexión TLS).
        $this->emit(['e' => 'ready']);

        $served = 0;

        while (($line = fgets(STDIN)) !== false) {
            $request = json_decode(trim($line), true);

            if (! is_array($request) || ! isset($request['id'], $request['session'])) {
                continue;
            }

            $this->serve($ai, $request);

            if (++$served >= self::MAX_TURNS) {
                break; // el pool detecta la salida y levanta un reemplazo fresco
            }
        }

        return self::SUCCESS;
    }

    protected function serve(AiConversationService $ai, array $request): void
    {
        $id = $request['id'];

        try {
            $this->turn($ai, $request);
        } catch (\PDOException|\Illuminate\Database\QueryException $e) {
            // Conexión a BD caducada entre llamadas: reconectar y reintentar una vez.
            DB::reconnect();

            try {
                $this->turn($ai, $request);
            } catch (\Throwable $e2) {
                report($e2);
                $this->emit(['id' => $id, 'e' => 'error', 'message' => $e2->getMessage()]);
            }
        } catch (\Throwable $e) {
            report($e);
            $this->emit(['id' => $id, 'e' => 'error', 'message' => $e->getMessage()]);
        }
    }

    protected function turn(AiConversationService $ai, array $request): void
    {
        $id = $request['id'];

        $session = AiSession::where('uuid', $request['session'])->first();

        if (! $session) {
            $this->emit(['id' => $id, 'e' => 'error', 'message' => 'sesión no encontrada']);

            return;
        }

        // En voz manda la latencia: VOICE_LLM_MODEL permite usar un modelo
        // más rápido (p.ej. Haiku) solo para llamadas, sin tocar el resto.
        $llmOptions = array_filter(['model' => env('VOICE_LLM_MODEL')]);

        $streamed = '';

        $result = $ai->turn($session, $request['message'] ?? null, function (string $chunk) use ($id, &$streamed) {
            $streamed .= $chunk;
            $this->emit(['id' => $id, 'e' => 'token', 't' => $chunk]);
        }, $llmOptions);

        $this->emit([
            'id' => $id,
            'e' => 'done',
            'reply' => $result['reply'],
            'streamed' => mb_strlen($streamed),
            'finished' => $result['finished'],
        ]);
    }

    protected function emit(array $event): void
    {
        fwrite(STDOUT, json_encode($event, JSON_UNESCAPED_UNICODE)."\n");
        fflush(STDOUT);
    }
}
