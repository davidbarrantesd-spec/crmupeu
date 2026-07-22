<?php

namespace Tests\Feature;

use App\Models\Call;
use App\Models\Contact;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class WebhookTest extends TestCase
{
    public function test_voice_status_updates_call_and_is_idempotent(): void
    {
        Queue::fake();

        $call = Call::factory()->create([
            'status' => 'dialing',
            'result' => null,
            'answered_at' => null,
            'ended_at' => null,
            'twilio_call_sid' => 'CA_TEST_123',
        ]);

        $payload = ['CallSid' => 'CA_TEST_123', 'CallStatus' => 'completed', 'CallDuration' => '42'];

        $this->postJson('/api/v1/webhooks/twilio/voice/status', $payload)->assertOk();

        $call->refresh();
        $this->assertSame('completed', $call->status);
        $this->assertSame(42, $call->duration_seconds);
        Queue::assertPushed(\App\Jobs\ProcessCallResultJob::class, 1);

        // Segundo envío idéntico: duplicado, no procesa de nuevo.
        $this->postJson('/api/v1/webhooks/twilio/voice/status', $payload)
            ->assertOk()
            ->assertJsonPath('duplicate', true);

        Queue::assertPushed(\App\Jobs\ProcessCallResultJob::class, 1);
        $this->assertDatabaseCount('webhook_events', 1);
    }

    public function test_whatsapp_inbound_creates_conversation_and_message(): void
    {
        $contact = Contact::factory()->create(['phone' => '+51999888777']);

        $this->postJson('/api/v1/webhooks/twilio/whatsapp', [
            'MessageSid' => 'SM_TEST_1',
            'From' => 'whatsapp:+51999888777',
            'Body' => 'Hola, quiero pagar mi deuda',
        ])->assertOk();

        $this->assertDatabaseHas('conversations', ['contact_id' => $contact->id, 'status' => 'open']);
        $this->assertDatabaseHas('messages', ['direction' => 'inbound', 'message_sid' => 'SM_TEST_1']);
    }

    public function test_whatsapp_inbound_from_unknown_number_creates_contact(): void
    {
        $this->postJson('/api/v1/webhooks/twilio/whatsapp', [
            'MessageSid' => 'SM_TEST_2',
            'From' => 'whatsapp:+51911222333',
            'Body' => 'Hola',
        ])->assertOk();

        $this->assertDatabaseHas('contacts', ['phone' => '+51911222333', 'source' => 'whatsapp_inbound']);
    }

    public function test_message_status_does_not_regress(): void
    {
        $contact = Contact::factory()->create();
        $conversation = \App\Models\Conversation::factory()->create(['contact_id' => $contact->id]);
        $message = \App\Models\Message::factory()->create([
            'conversation_id' => $conversation->id,
            'direction' => 'outbound',
            'status' => 'read',
            'message_sid' => 'SM_TEST_3',
        ]);

        $this->postJson('/api/v1/webhooks/twilio/whatsapp/status', [
            'MessageSid' => 'SM_TEST_3',
            'MessageStatus' => 'delivered',
        ])->assertOk();

        $this->assertSame('read', $message->fresh()->status);
    }
}
