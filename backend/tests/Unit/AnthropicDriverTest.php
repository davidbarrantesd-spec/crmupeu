<?php

namespace Tests\Unit;

use App\Integrations\Llm\AnthropicDriver;
use PHPUnit\Framework\TestCase;

class AnthropicDriverTest extends TestCase
{
    protected AnthropicDriver $driver;

    protected function setUp(): void
    {
        $this->driver = new AnthropicDriver('sk-ant-test');
    }

    public function test_system_message_is_extracted_from_messages(): void
    {
        [$system, $messages] = $this->driver->convertMessages([
            ['role' => 'system', 'content' => 'Eres un agente de cobranzas.'],
            ['role' => 'user', 'content' => 'Hola'],
        ]);

        $this->assertSame('Eres un agente de cobranzas.', $system);
        $this->assertSame([['role' => 'user', 'content' => 'Hola']], $messages);
    }

    public function test_assistant_tool_calls_become_tool_use_blocks(): void
    {
        [, $messages] = $this->driver->convertMessages([
            ['role' => 'user', 'content' => 'Sí, soy yo'],
            [
                'role' => 'assistant',
                'content' => null,
                'tool_calls' => [[
                    'id' => 'call_1',
                    'type' => 'function',
                    'function' => ['name' => 'validar_identidad', 'arguments' => '{"confirmado":true}'],
                ]],
            ],
            ['role' => 'tool', 'tool_call_id' => 'call_1', 'content' => '{"identidad_validada":true}'],
        ]);

        $this->assertCount(3, $messages);

        $assistant = $messages[1];
        $this->assertSame('assistant', $assistant['role']);
        $this->assertSame('tool_use', $assistant['content'][0]['type']);
        $this->assertSame('call_1', $assistant['content'][0]['id']);
        $this->assertSame('validar_identidad', $assistant['content'][0]['name']);
        $this->assertSame(['confirmado' => true], $assistant['content'][0]['input']);

        $toolResult = $messages[2];
        $this->assertSame('user', $toolResult['role']);
        $this->assertSame('tool_result', $toolResult['content'][0]['type']);
        $this->assertSame('call_1', $toolResult['content'][0]['toolUseID']);
    }

    public function test_consecutive_tool_results_merge_into_one_user_message(): void
    {
        [, $messages] = $this->driver->convertMessages([
            [
                'role' => 'assistant',
                'content' => null,
                'tool_calls' => [
                    ['id' => 'call_a', 'type' => 'function', 'function' => ['name' => 'obtener_contacto', 'arguments' => '{}']],
                    ['id' => 'call_b', 'type' => 'function', 'function' => ['name' => 'consultar_deuda', 'arguments' => '{}']],
                ],
            ],
            ['role' => 'tool', 'tool_call_id' => 'call_a', 'content' => '{"nombre":"Ana"}'],
            ['role' => 'tool', 'tool_call_id' => 'call_b', 'content' => '{"saldo":100}'],
        ]);

        // Ambos resultados deben quedar en UN solo mensaje user (requisito de la API).
        $this->assertCount(2, $messages);
        $this->assertCount(2, $messages[1]['content']);
        $this->assertSame('call_a', $messages[1]['content'][0]['toolUseID']);
        $this->assertSame('call_b', $messages[1]['content'][1]['toolUseID']);
    }

    public function test_tools_are_converted_to_input_schema_format(): void
    {
        $converted = $this->driver->convertTools([[
            'name' => 'registrar_acuerdo',
            'description' => 'Registra un compromiso de pago.',
            'parameters' => [
                'type' => 'object',
                'properties' => ['fecha_compromiso' => ['type' => 'string']],
                'required' => ['fecha_compromiso'],
            ],
        ]]);

        $this->assertSame('registrar_acuerdo', $converted[0]['name']);
        $this->assertArrayHasKey('inputSchema', $converted[0]);
        $this->assertArrayNotHasKey('parameters', $converted[0]);
        $this->assertSame(['fecha_compromiso'], $converted[0]['inputSchema']['required']);
    }

    public function test_empty_assistant_messages_are_dropped(): void
    {
        [, $messages] = $this->driver->convertMessages([
            ['role' => 'user', 'content' => 'Hola'],
            ['role' => 'assistant', 'content' => ''],
            ['role' => 'user', 'content' => '¿Cuánto debo?'],
        ]);

        $this->assertCount(2, $messages);
        $this->assertSame('user', $messages[0]['role']);
        $this->assertSame('user', $messages[1]['role']);
    }
}
