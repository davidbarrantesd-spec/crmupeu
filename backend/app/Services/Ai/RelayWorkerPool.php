<?php

namespace App\Services\Ai;

use Closure;
use React\ChildProcess\Process;

/**
 * Pool de workers persistentes (crm:relay-worker) para los turnos de voz.
 *
 * Cada worker es un proceso PHP ya arrancado con conexión a BD y cliente LLM
 * vivos: despachar un turno cuesta una línea por stdin en vez de un fork+boot.
 * Un worker atiende un turno a la vez; si todos están ocupados la petición
 * espera en cola. Workers caídos o reciclados (MAX_TURNS) se reemplazan solos.
 */
class RelayWorkerPool
{
    /** @var array<int, array{process: Process, busy: bool, buffer: string, handler: ?Closure}> */
    protected array $workers = [];

    /** @var array<int, array{request: array, onEvent: Closure}> */
    protected array $queue = [];

    protected int $nextRequestId = 1;

    protected bool $stopping = false;

    public function __construct(
        protected int $size,
        protected Closure $log,
    ) {}

    public function start(): void
    {
        for ($i = 0; $i < $this->size; $i++) {
            $this->spawn($i);
        }
    }

    public function stop(): void
    {
        $this->stopping = true;

        foreach ($this->workers as $worker) {
            $worker['process']->terminate();
        }
    }

    /**
     * Despacha un turno. $onEvent recibe cada evento NDJSON del worker
     * (token/done/error); tras done o error el worker queda libre.
     */
    public function dispatch(string $sessionUuid, ?string $message, Closure $onEvent): void
    {
        $request = [
            'id' => 't'.$this->nextRequestId++,
            'session' => $sessionUuid,
            'message' => $message,
        ];

        foreach ($this->workers as $i => $worker) {
            if (! $worker['busy']) {
                $this->assign($i, $request, $onEvent);

                return;
            }
        }

        $this->queue[] = ['request' => $request, 'onEvent' => $onEvent];
        ($this->log)('pool: sin workers libres, turno en cola ('.count($this->queue).')');
    }

    protected function assign(int $i, array $request, Closure $onEvent): void
    {
        $this->workers[$i]['busy'] = true;
        $this->workers[$i]['handler'] = function (array $event) use ($i, $onEvent) {
            $finished = in_array($event['e'] ?? '', ['done', 'error']);

            $onEvent($event);

            if ($finished) {
                $this->release($i);
            }
        };

        $this->workers[$i]['process']->stdin->write(json_encode($request, JSON_UNESCAPED_UNICODE)."\n");
    }

    protected function release(int $i): void
    {
        if (! isset($this->workers[$i])) {
            return;
        }

        $this->workers[$i]['busy'] = false;
        $this->workers[$i]['handler'] = null;
        $this->drainQueue();
    }

    protected function drainQueue(): void
    {
        if ($this->queue === []) {
            return;
        }

        foreach ($this->workers as $i => $worker) {
            if (! $worker['busy'] && $this->queue !== []) {
                $pending = array_shift($this->queue);
                $this->assign($i, $pending['request'], $pending['onEvent']);
            }
        }
    }

    protected function spawn(int $i): void
    {
        $php = escapeshellarg(PHP_BINARY);
        $artisan = escapeshellarg(base_path('artisan'));

        $process = new Process("exec {$php} {$artisan} crm:relay-worker", base_path());
        $process->start();

        $this->workers[$i] = ['process' => $process, 'busy' => false, 'buffer' => '', 'handler' => null];

        $process->stdout->on('data', function (string $chunk) use ($i) {
            $this->workers[$i]['buffer'] .= $chunk;

            while (($pos = strpos($this->workers[$i]['buffer'], "\n")) !== false) {
                $line = substr($this->workers[$i]['buffer'], 0, $pos);
                $this->workers[$i]['buffer'] = substr($this->workers[$i]['buffer'], $pos + 1);
                $event = json_decode($line, true);

                if (! is_array($event)) {
                    continue;
                }

                if (($event['e'] ?? '') === 'ready') {
                    ($this->log)("pool: worker {$i} listo");

                    continue;
                }

                if ($this->workers[$i]['handler']) {
                    ($this->workers[$i]['handler'])($event);
                }
            }
        });

        $process->stderr->on('data', fn (string $chunk) => ($this->log)("pool: worker {$i} stderr: ".trim($chunk)));

        $process->on('exit', function () use ($i) {
            if ($this->stopping) {
                return;
            }

            // Si murió a mitad de un turno, avisar al que esperaba.
            if ($this->workers[$i]['handler'] ?? null) {
                ($this->workers[$i]['handler'])(['e' => 'error', 'message' => 'worker reiniciado']);
            }

            ($this->log)("pool: worker {$i} terminó, levantando reemplazo");
            $this->spawn($i);
            $this->drainQueue();
        });
    }
}
