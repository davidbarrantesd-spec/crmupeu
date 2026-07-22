<?php

namespace App\Integrations\Llm;

use Anthropic\Client;
use Anthropic\Messages\TextBlock;
use Anthropic\Messages\ToolUseBlock;

/**
 * Driver para la API de Anthropic (Claude) con tool calling.
 *
 * El resto del sistema (AiConversationService, AgentToolExecutor, MockLlmDriver)
 * habla el formato interno estilo OpenAI; este driver traduce en ambos sentidos:
 *  - mensajes internos → formato Messages de Anthropic (system aparte,
 *    tool_calls → bloques tool_use, rol "tool" → bloques tool_result)
 *  - respuesta de Anthropic → {content, tool_calls[{id,name,arguments}], tokens}
 */
class AnthropicDriver implements LlmProvider
{
    public function __construct(
        protected string $apiKey,
        protected string $model = 'claude-opus-4-8',
    ) {}

    protected function client(): Client
    {
        return new Client(apiKey: $this->apiKey);
    }

    public function chat(array $messages, array $tools = [], array $options = []): array
    {
        [$system, $anthropicMessages] = $this->convertMessages($messages);

        $params = [
            'model' => $options['model'] ?? $this->model,
            'maxTokens' => $options['max_tokens'] ?? 1024,
            'messages' => $anthropicMessages,
            // Latencia conversacional: esfuerzo bajo salvo que se indique otro.
            'outputConfig' => ['effort' => $options['effort'] ?? 'low'],
        ];

        if ($system !== null) {
            $params['system'] = $system;
        }

        if ($tools) {
            $params['tools'] = $this->convertTools($tools);
        }

        $response = $this->client()->messages->create(...$params);

        $content = null;
        $toolCalls = [];

        foreach ($response->content as $block) {
            if ($block instanceof TextBlock || $block->type === 'text') {
                $content = ($content ?? '').$block->text;
            } elseif ($block instanceof ToolUseBlock || $block->type === 'tool_use') {
                $toolCalls[] = [
                    'id' => $block->id,
                    'name' => $block->name,
                    'arguments' => (array) $block->input,
                ];
            }
        }

        return [
            'content' => $content,
            'tool_calls' => $toolCalls,
            'tokens' => ($response->usage->inputTokens ?? 0) + ($response->usage->outputTokens ?? 0),
        ];
    }

    /**
     * Convierte los mensajes internos (estilo OpenAI) al formato de Anthropic.
     *
     * @return array{0: ?string, 1: array} [system, messages]
     */
    public function convertMessages(array $messages): array
    {
        $system = null;
        $converted = [];

        foreach ($messages as $message) {
            $role = $message['role'] ?? 'user';

            if ($role === 'system') {
                $system = trim(($system ? $system."\n\n" : '').($message['content'] ?? ''));

                continue;
            }

            if ($role === 'tool') {
                // Los resultados de tools van como bloques tool_result dentro de un
                // mensaje user; resultados consecutivos (tools en paralelo) se agrupan
                // en UN solo mensaje user.
                $block = [
                    'type' => 'tool_result',
                    'toolUseID' => $message['tool_call_id'] ?? '',
                    'content' => (string) ($message['content'] ?? ''),
                ];

                $last = $converted ? array_key_last($converted) : null;
                if ($last !== null
                    && $converted[$last]['role'] === 'user'
                    && is_array($converted[$last]['content'])
                    && ($converted[$last]['content'][0]['type'] ?? null) === 'tool_result') {
                    $converted[$last]['content'][] = $block;
                } else {
                    $converted[] = ['role' => 'user', 'content' => [$block]];
                }

                continue;
            }

            if ($role === 'assistant' && ! empty($message['tool_calls'])) {
                $blocks = [];

                if (! empty($message['content'])) {
                    $blocks[] = ['type' => 'text', 'text' => $message['content']];
                }

                foreach ($message['tool_calls'] as $toolCall) {
                    $arguments = $toolCall['function']['arguments'] ?? $toolCall['arguments'] ?? '{}';
                    $blocks[] = [
                        'type' => 'tool_use',
                        'id' => $toolCall['id'],
                        'name' => $toolCall['function']['name'] ?? $toolCall['name'],
                        'input' => is_string($arguments) ? (json_decode($arguments, true) ?: []) : (array) $arguments,
                    ];
                }

                $converted[] = ['role' => 'assistant', 'content' => $blocks];

                continue;
            }

            // user o assistant de texto plano; omitir asistentes vacíos.
            if ($role === 'assistant' && ($message['content'] ?? '') === '') {
                continue;
            }

            $converted[] = ['role' => $role, 'content' => (string) ($message['content'] ?? '')];
        }

        return [$system, $converted];
    }

    /**
     * Convierte definiciones de tools (formato OpenAI: parameters) a Anthropic (inputSchema).
     */
    public function convertTools(array $tools): array
    {
        return array_map(fn (array $tool) => [
            'name' => $tool['name'],
            'description' => $tool['description'] ?? '',
            'inputSchema' => $tool['parameters'] ?? $tool['input_schema'] ?? ['type' => 'object', 'properties' => (object) []],
        ], $tools);
    }

    public function verify(): bool
    {
        // Petición mínima: si las credenciales son inválidas, el SDK lanza excepción.
        $this->client()->messages->create(
            model: $this->model,
            maxTokens: 1,
            messages: [['role' => 'user', 'content' => 'ping']],
        );

        return true;
    }

    public function name(): string
    {
        return 'anthropic';
    }
}
