<?php

namespace App\Integrations\Llm;

use OpenAI;

class OpenAiDriver implements LlmProvider
{
    public function __construct(
        protected string $apiKey,
        protected string $model = 'gpt-4o',
    ) {}

    public function chat(array $messages, array $tools = [], array $options = []): array
    {
        $client = OpenAI::client($this->apiKey);

        $params = [
            'model' => $options['model'] ?? $this->model,
            'messages' => $messages,
            'temperature' => $options['temperature'] ?? 0.4,
            'max_tokens' => $options['max_tokens'] ?? 500,
        ];

        if ($tools) {
            $params['tools'] = array_map(fn ($tool) => ['type' => 'function', 'function' => $tool], $tools);
        }

        $response = $client->chat()->create($params);
        $choice = $response->choices[0];

        $toolCalls = [];
        foreach ($choice->message->toolCalls ?? [] as $toolCall) {
            $toolCalls[] = [
                'id' => $toolCall->id,
                'name' => $toolCall->function->name,
                'arguments' => json_decode($toolCall->function->arguments, true) ?: [],
            ];
        }

        return [
            'content' => $choice->message->content,
            'tool_calls' => $toolCalls,
            'tokens' => $response->usage?->totalTokens ?? 0,
        ];
    }

    public function verify(): bool
    {
        OpenAI::client($this->apiKey)->models()->list();

        return true;
    }

    public function name(): string
    {
        return 'openai';
    }
}
