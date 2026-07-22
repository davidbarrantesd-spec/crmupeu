<?php

namespace Tests\Feature;

use App\Models\CallPrompt;
use App\Models\Contact;
use App\Models\Debt;
use App\Services\Ai\AgentToolExecutor;
use Tests\TestCase;

class AiSimulatorTest extends TestCase
{
    protected function makePrompt(): CallPrompt
    {
        $prompt = CallPrompt::create(['name' => 'Test', 'type' => 'collections', 'status' => 'published']);
        $prompt->versions()->create([
            'version' => 1,
            'status' => 'published',
            'published_at' => now(),
            'system_prompt' => 'Eres un agente de cobranzas.',
            'enabled_tools' => AgentToolExecutor::TOOLS,
            'max_duration_seconds' => 300,
        ]);

        return $prompt;
    }

    public function test_full_simulated_conversation_reaches_payment_promise(): void
    {
        $admin = $this->adminUser();
        $prompt = $this->makePrompt();
        $contact = Contact::factory()->create();
        Debt::factory()->create(['contact_id' => $contact->id, 'pending_balance' => 1200, 'status' => 'overdue']);

        // Inicio: saludo del agente.
        $start = $this->actingAs($admin)->postJson("/api/v1/prompts/{$prompt->uuid}/simulate", [
            'contact_uuid' => $contact->uuid,
        ]);
        $start->assertOk();
        $session = $start->json('data.session_uuid');
        $this->assertNotEmpty($start->json('data.reply'));

        // Confirmación de identidad → el agente consulta la deuda.
        $turn1 = $this->actingAs($admin)->postJson("/api/v1/prompts/{$prompt->uuid}/simulate", [
            'session_uuid' => $session,
            'message' => 'Sí, soy yo',
        ]);
        $tools1 = collect($turn1->json('data.tool_calls'))->pluck('name');
        $this->assertTrue($tools1->contains('validar_identidad'));

        // Compromiso de pago → acuerdo + fin de llamada.
        $turn2 = $this->actingAs($admin)->postJson("/api/v1/prompts/{$prompt->uuid}/simulate", [
            'session_uuid' => $session,
            'message' => 'Puedo pagar la próxima semana',
        ]);
        $turn2->assertOk();
        $this->assertTrue($turn2->json('data.finished'));
        $this->assertSame('payment_promise', $turn2->json('data.structured_result.resultado'));
        $this->assertTrue($turn2->json('data.structured_result.identidad_validada'));
    }

    public function test_guardrail_blocks_debt_query_without_identity(): void
    {
        $prompt = $this->makePrompt();
        $contact = Contact::factory()->create();
        Debt::factory()->create(['contact_id' => $contact->id]);

        $version = $prompt->versions()->first();
        $service = app(\App\Services\Ai\AiConversationService::class);
        $session = $service->startSession($version, $contact, null, 'simulation');

        $executor = app(AgentToolExecutor::class);
        $result = $executor->execute($session, 'consultar_deuda', []);

        $this->assertArrayHasKey('error', $result);
        $this->assertStringContainsString('GUARDRAIL', $result['error']);
    }

    public function test_guardrail_blocks_whatsapp_without_consent(): void
    {
        $prompt = $this->makePrompt();
        $contact = Contact::factory()->create(['whatsapp_consent' => false]);

        $version = $prompt->versions()->first();
        $service = app(\App\Services\Ai\AiConversationService::class);
        $session = $service->startSession($version, $contact, null, 'simulation');

        $result = app(AgentToolExecutor::class)->execute($session, 'enviar_whatsapp', []);

        $this->assertArrayHasKey('error', $result);
    }
}
