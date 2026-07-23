<?php

namespace App\Console\Commands;

use App\Models\Call;
use App\Services\Ai\AiConversationService;
use App\Services\Ai\RelaySession;
use GuzzleHttp\Psr7\HttpFactory;
use GuzzleHttp\Psr7\Message;
use Illuminate\Console\Command;
use Psr\Http\Message\RequestInterface;
use Ratchet\RFC6455\Handshake\RequestVerifier;
use Ratchet\RFC6455\Handshake\ServerNegotiator;
use Ratchet\RFC6455\Messaging\CloseFrameChecker;
use Ratchet\RFC6455\Messaging\Frame;
use Ratchet\RFC6455\Messaging\FrameInterface;
use Ratchet\RFC6455\Messaging\MessageBuffer;
use Ratchet\RFC6455\Messaging\MessageInterface;
use React\EventLoop\Loop;
use React\Socket\ConnectionInterface;
use React\Socket\SocketServer;

/**
 * Servidor WebSocket para Twilio ConversationRelay (voz conversacional IA).
 *
 * Ruta: GET /relay/{callUuid}?token={hmac} con upgrade a WebSocket.
 * El token es hash_hmac('sha256', uuid, APP_KEY) — lo genera TwimlBuilder;
 * ninguna conexión sin token válido llega a tocar la base de datos.
 *
 * Se construye sobre react/socket + ratchet/rfc6455 (las mismas piezas que usa
 * Laravel Reverb) porque Ratchet "completo" no es compatible con Symfony 8.
 */
class RelayServerCommand extends Command
{
    protected $signature = 'crm:relay {--host=0.0.0.0} {--port=}';

    protected $description = 'Servidor WebSocket ConversationRelay para llamadas conversacionales con IA';

    public function handle(AiConversationService $ai): int
    {
        $host = $this->option('host');
        $port = $this->option('port') ?: env('PORT', 8090);

        $negotiator = new ServerNegotiator(new RequestVerifier, new HttpFactory);
        $socket = new SocketServer("{$host}:{$port}");

        $socket->on('connection', function (ConnectionInterface $conn) use ($negotiator, $ai) {
            $buffer = '';

            $onHandshake = function (string $data) use (&$buffer, &$onHandshake, $conn, $negotiator, $ai) {
                $buffer .= $data;

                if (! str_contains($buffer, "\r\n\r\n")) {
                    return; // cabeceras incompletas todavía
                }

                $conn->removeListener('data', $onHandshake);

                try {
                    $request = Message::parseRequest($buffer);
                } catch (\Throwable) {
                    $conn->end("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");

                    return;
                }

                // Healthcheck / navegador: responder HTTP plano sin upgrade.
                if (strtolower($request->getHeaderLine('Upgrade')) !== 'websocket') {
                    $body = 'crm-relay ok';
                    $conn->end("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ".strlen($body)."\r\n\r\n".$body);

                    return;
                }

                $call = $this->authorize($request);

                if (! $call) {
                    $conn->end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n");

                    return;
                }

                $response = $negotiator->handshake($request);

                if ($response->getStatusCode() !== 101) {
                    $conn->end(Message::toString($response));

                    return;
                }

                $conn->write(Message::toString($response));
                $this->openSession($conn, $call, $ai);
            };

            $conn->on('data', $onHandshake);
        });

        $this->info("ConversationRelay escuchando en {$host}:{$port}");
        Loop::run();

        return self::SUCCESS;
    }

    /**
     * Valida el token HMAC de la URL y carga la llamada. Devuelve null si algo
     * no cuadra (llamada inexistente o token inválido).
     */
    protected function authorize(RequestInterface $request): ?Call
    {
        $path = $request->getUri()->getPath();

        if (! preg_match('#^/relay/([0-9a-f-]{36})$#', $path, $matches)) {
            return null;
        }

        $uuid = $matches[1];
        parse_str($request->getUri()->getQuery(), $query);
        $token = (string) ($query['token'] ?? '');

        $expected = hash_hmac('sha256', $uuid, config('app.key'));

        if (! $token || ! hash_equals($expected, $token)) {
            $this->warn("token inválido para {$uuid}");

            return null;
        }

        return Call::with(['contact', 'debt', 'campaign', 'promptVersion'])
            ->where('uuid', $uuid)
            ->first();
    }

    protected function openSession(ConnectionInterface $conn, Call $call, AiConversationService $ai): void
    {
        $send = fn (array $message) => $conn->write(
            (new Frame(json_encode($message, JSON_UNESCAPED_UNICODE)))->getContents()
        );

        $session = new RelaySession(
            call: $call,
            ai: $ai,
            send: $send,
            close: fn () => $conn->end(),
            log: fn (string $line) => $this->line('['.now()->format('H:i:s')."] {$line}"),
        );

        $messageBuffer = new MessageBuffer(
            new CloseFrameChecker,
            onMessage: function (MessageInterface $message) use ($session) {
                $payload = json_decode($message->getPayload(), true);

                if (is_array($payload)) {
                    $session->handle($payload);
                }
            },
            onControl: function (FrameInterface $frame) use ($conn) {
                match ($frame->getOpcode()) {
                    Frame::OP_PING => $conn->write((new Frame($frame->getPayload(), opcode: Frame::OP_PONG))->getContents()),
                    Frame::OP_CLOSE => $conn->end((new Frame($frame->getPayload(), opcode: Frame::OP_CLOSE))->getContents()),
                    default => null,
                };
            },
            sender: fn (string $data) => $conn->write($data),
        );

        $conn->on('data', [$messageBuffer, 'onData']);
        $conn->on('close', function () use ($session, $call) {
            $session->onDisconnect();
            $this->line("desconectado call={$call->uuid}");
        });

        $this->info("conexión aceptada call={$call->uuid} contacto={$call->contact?->full_name}");
    }
}
