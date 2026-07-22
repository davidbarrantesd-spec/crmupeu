<?php

namespace App\Integrations\Llm;

interface LlmProvider
{
    /**
     * Envía la conversación al modelo y devuelve la respuesta.
     *
     * @param  array  $messages  [{role, content, tool_call_id?, tool_calls?}]
     * @param  array  $tools  definiciones de funciones en formato OpenAI
     * @return array{content: ?string, tool_calls: array<int, array{id: string, name: string, arguments: array}>, tokens: int}
     */
    public function chat(array $messages, array $tools = [], array $options = []): array;

    public function verify(): bool;

    public function name(): string;
}
