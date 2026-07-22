<?php

namespace Tests\Feature;

use App\Models\Agreement;
use App\Models\Contact;
use App\Models\Debt;
use App\Models\FollowUpRule;
use Tests\TestCase;

class AgreementTest extends TestCase
{
    public function test_create_agreement_schedules_verification_follow_up(): void
    {
        $contact = Contact::factory()->create();
        $debt = Debt::factory()->create(['contact_id' => $contact->id]);

        $this->actingAs($this->adminUser())
            ->postJson('/api/v1/agreements', [
                'contact_uuid' => $contact->uuid,
                'debt_uuid' => $debt->uuid,
                'type' => 'payment_promise',
                'amount' => 350.50,
                'promise_date' => now()->addDays(5)->toDateString(),
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseHas('follow_ups', [
            'contact_id' => $contact->id,
            'type' => 'payment_verification',
            'status' => 'pending',
        ]);
    }

    public function test_marking_agreement_broken_triggers_rule_engine(): void
    {
        FollowUpRule::create([
            'name' => 'Regla incumplimiento',
            'trigger_event' => 'agreement_broken',
            'action' => 'schedule_ai_call',
            'delay_minutes' => 60,
            'active' => true,
        ]);

        $agreement = Agreement::factory()->create(['status' => 'pending']);

        $this->actingAs($this->adminUser())
            ->putJson("/api/v1/agreements/{$agreement->uuid}", [
                'status' => 'broken',
                'observations' => 'No realizó el pago comprometido.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'broken');

        $this->assertDatabaseHas('follow_ups', [
            'agreement_id' => $agreement->id,
            'type' => 'ai_call',
        ]);
    }

    public function test_agreement_changes_are_audited(): void
    {
        $agreement = Agreement::factory()->create(['status' => 'pending']);

        $this->actingAs($this->adminUser())
            ->putJson("/api/v1/agreements/{$agreement->uuid}", ['status' => 'fulfilled']);

        $this->assertDatabaseHas('audit_logs', [
            'module' => 'agreements',
            'action' => 'updated',
            'auditable_id' => $agreement->id,
        ]);
    }
}
