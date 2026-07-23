<?php

namespace App\Services\Ai;

use App\Integrations\IntegrationManager;
use App\Models\AiSession;
use App\Models\Call;
use App\Models\Contact;
use App\Models\PromptVersion;

/**
 * Orquesta la conversación entre el interlocutor y el LLM:
 * arma el contexto, ejecuta el loop de tools y persiste cada turno.
 */
class AiConversationService
{
    protected const MAX_TOOL_ROUNDS = 5;

    public function __construct(
        protected IntegrationManager $integrations,
        protected AgentToolExecutor $tools,
    ) {}

    public function startSession(PromptVersion $version, ?Contact $contact, ?Call $call = null, string $mode = 'live'): AiSession
    {
        $session = AiSession::create([
            'call_id' => $call?->id,
            'prompt_version_id' => $version->id,
            'contact_id' => $contact?->id,
            'mode' => $mode,
            'status' => 'active',
            'messages' => [['role' => 'system', 'content' => $this->buildSystemPrompt($version, $contact, $mode)]],
            'user_id' => auth()->id(),
        ]);

        return $session;
    }

    /**
     * Procesa un turno del usuario y devuelve la respuesta del agente.
     *
     * $onText (opcional, voz en vivo): recibe cada fragmento de texto apenas
     * el LLM lo genera, para que el TTS hable sin esperar el turno completo.
     *
     * @return array{reply: ?string, tool_calls: array, finished: bool, structured_result: ?array}
     */
    public function turn(AiSession $session, ?string $userMessage, ?callable $onText = null): array
    {
        $messages = $session->messages ?? [];

        if ($userMessage !== null) {
            $messages[] = ['role' => 'user', 'content' => $userMessage];
        }

        $llm = $this->integrations->llm();
        $definitions = $this->tools->definitions($session->promptVersion?->enabled_tools ?? []);
        $options = $onText ? ['on_text' => $onText] : [];
        $allToolCalls = [];
        $reply = null;

        for ($round = 0; $round < self::MAX_TOOL_ROUNDS; $round++) {
            $response = $llm->chat($messages, $definitions, $options);
            $session->increment('total_tokens', $response['tokens']);

            if (empty($response['tool_calls'])) {
                $reply = $response['content'];
                $messages[] = ['role' => 'assistant', 'content' => $reply];
                break;
            }

            $messages[] = [
                'role' => 'assistant',
                'content' => $response['content'],
                'tool_calls' => array_map(fn ($tc) => [
                    'id' => $tc['id'],
                    'type' => 'function',
                    'function' => ['name' => $tc['name'], 'arguments' => json_encode($tc['arguments'])],
                ], $response['tool_calls']),
            ];

            foreach ($response['tool_calls'] as $toolCall) {
                $result = $this->tools->execute($session->refresh(), $toolCall['name'], $toolCall['arguments']);
                $allToolCalls[] = ['name' => $toolCall['name'], 'arguments' => $toolCall['arguments'], 'result' => $result];
                $messages[] = [
                    'role' => 'tool',
                    'tool_call_id' => $toolCall['id'],
                    'content' => json_encode($result, JSON_UNESCAPED_UNICODE),
                ];
            }

            $session->refresh();
            if ($session->status === 'completed') {
                $farewell = $session->promptVersion?->farewell_message;
                $reply = $farewell ?: 'Gracias por su tiempo. Que tenga un buen día.';
                $messages[] = ['role' => 'assistant', 'content' => $reply];
                break;
            }
        }

        $session->update(['messages' => $messages]);
        $finished = $session->status === 'completed';

        if ($finished && $session->call_id) {
            $this->applyResultToCall($session);
        }

        return [
            'reply' => $reply,
            'tool_calls' => $allToolCalls,
            'finished' => $finished,
            'structured_result' => $finished ? $this->finalResult($session) : null,
        ];
    }

    /**
     * Resultado estructurado con el formato estándar del sistema.
     */
    public function finalResult(AiSession $session): array
    {
        $r = $session->structured_result ?? [];

        return [
            'resultado' => $r['resultado'] ?? 'answered',
            'contactado' => $r['contactado'] ?? true,
            'identidad_validada' => $r['identidad_validada'] ?? false,
            'fecha_compromiso' => $r['fecha_compromiso'] ?? null,
            'monto_comprometido' => $r['monto_comprometido'] ?? null,
            'requiere_asesor' => $r['requiere_asesor'] ?? false,
            'enviar_whatsapp' => $r['enviar_whatsapp'] ?? false,
            'sentimiento' => $r['sentimiento'] ?? 'neutral',
            'resumen' => $r['resumen'] ?? '',
            'siguiente_accion' => $r['siguiente_accion'] ?? null,
        ];
    }

    protected function applyResultToCall(AiSession $session): void
    {
        $result = $this->finalResult($session);
        $call = $session->call;

        $call?->update([
            'result' => $result['resultado'],
            'summary' => $result['resumen'],
            'structured_result' => $result,
        ]);
    }

    protected function buildSystemPrompt(PromptVersion $version, ?Contact $contact, string $mode = 'live'): string
    {
        $guardrails = $version->guardrails ?? [];
        $forbidden = implode(', ', $guardrails['forbidden_data'] ?? []);
        $rules = implode("\n- ", $guardrails['security_rules'] ?? []);

        $context = $contact
            ? "Estás llamando a {$contact->full_name}".($contact->city ? " de {$contact->city}" : '').'.'
            : 'Estás en una conversación de prueba.';

        // Deudas precargadas: evita una ronda completa de LLM + herramienta a
        // mitad de la llamada (la mayor fuente de silencios). Solo se revelan
        // tras validar identidad, como exigen las reglas.
        $debtContext = null;
        if ($contact) {
            $debts = $contact->debts()
                ->whereIn('status', ['pending', 'overdue', 'partial'])
                ->orderBy('due_date')
                ->limit(3)
                ->get();

            if ($debts->isNotEmpty()) {
                $lines = $debts->map(fn ($d) => "- {$d->concept}: {$d->currency} ".number_format((float) $d->pending_balance, 2)
                    .", venció el {$d->due_date?->format('d/m/Y')}")->implode("\n");
                $debtContext = "DEUDA DEL CONTACTO (dato confirmado del sistema, no necesitas consultar_deuda):\n{$lines}";
            }
        }

        // En llamadas de voz el texto se pronuncia con TTS: frases cortas y
        // habladas, nada de listas ni símbolos, y jamás silencio sin aviso.
        $voiceRules = $mode === 'live'
            ? "ESTILO DE VOZ (esto se pronuncia por teléfono):\n"
            ."- Frases cortas: máximo 2 oraciones por respuesta.\n"
            ."- Lenguaje hablado natural y cálido, español latino formal (trato de usted).\n"
            ."- Nunca uses listas, viñetas, símbolos ni formatos: solo texto corrido pronunciable.\n"
            ."- Di los montos en palabras naturales: 'cuatrocientos cincuenta soles', no 'S/450.00'.\n"
            ."- Si vas a usar una herramienta, di ANTES una frase breve como 'Permítame un momento, por favor'."
            : null;

        return implode("\n\n", array_filter([
            $version->system_prompt,
            $version->instructions ? "INSTRUCCIONES:\n{$version->instructions}" : null,
            "CONTEXTO: {$context}",
            $debtContext,
            $voiceRules,
            "REGLAS OBLIGATORIAS:\n"
            ."- Nunca inventes información: usa solo datos devueltos por las herramientas.\n"
            ."- Nunca modifiques montos de deuda ni ofrezcas descuentos no autorizados.\n"
            ."- Valida la identidad (herramienta validar_identidad) antes de revelar cualquier dato de deuda.\n"
            ."- Si no tienes la información, dilo y ofrece derivar a un asesor.\n"
            ."- No prometas acciones que no puedas ejecutar con tus herramientas."
            .($forbidden ? "\n- Datos prohibidos de mencionar: {$forbidden}." : '')
            .($rules ? "\n- {$rules}" : ''),
            'Al terminar la conversación SIEMPRE llama a la herramienta finalizar_llamada con el resultado y resumen.',
        ]));
    }
}
