<?php

namespace Tests\Feature;

use App\Models\Campaign;
use App\Models\Contact;
use App\Models\Debt;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class CampaignTest extends TestCase
{
    public function test_create_campaign(): void
    {
        $this->actingAs($this->adminUser())
            ->postJson('/api/v1/campaigns', [
                'name' => 'Campaña de prueba',
                'type' => 'tts',
                'tts_message' => 'Hola {{nombre}}, su saldo es {{saldo}}.',
                'segment_filters' => ['min_debt' => 100],
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.status', 'draft');
    }

    public function test_preview_segment_counts_eligible_contacts(): void
    {
        $eligible = Contact::factory()->create(['call_consent' => true, 'do_not_contact' => false]);
        Debt::factory()->create(['contact_id' => $eligible->id, 'pending_balance' => 500, 'status' => 'overdue']);

        $noConsent = Contact::factory()->create(['call_consent' => false]);
        Debt::factory()->create(['contact_id' => $noConsent->id, 'pending_balance' => 500, 'status' => 'overdue']);

        $dnc = Contact::factory()->create(['do_not_contact' => true]);
        Debt::factory()->create(['contact_id' => $dnc->id, 'pending_balance' => 500, 'status' => 'overdue']);

        $response = $this->actingAs($this->adminUser())
            ->postJson('/api/v1/campaigns/preview-segment', [
                'segment_filters' => ['min_debt' => 100],
            ]);

        $response->assertOk()->assertJsonPath('data.count', 1);
    }

    public function test_launch_transitions_status_and_dispatches_job(): void
    {
        Queue::fake();

        $campaign = Campaign::factory()->create(['status' => 'draft']);

        $this->actingAs($this->adminUser())
            ->postJson("/api/v1/campaigns/{$campaign->uuid}/launch")
            ->assertOk()
            ->assertJsonPath('data.status', 'running');

        Queue::assertPushed(\App\Jobs\LaunchCampaignJob::class);

        $this->assertDatabaseHas('audit_logs', ['module' => 'campaigns', 'action' => 'launched']);
    }

    public function test_cannot_launch_finished_campaign(): void
    {
        $campaign = Campaign::factory()->create(['status' => 'finished']);

        $this->actingAs($this->adminUser())
            ->postJson("/api/v1/campaigns/{$campaign->uuid}/launch")
            ->assertStatus(422);
    }

    public function test_pause_and_resume(): void
    {
        Queue::fake();
        $campaign = Campaign::factory()->create(['status' => 'draft']);
        $admin = $this->adminUser();

        $this->actingAs($admin)->postJson("/api/v1/campaigns/{$campaign->uuid}/launch");
        $this->actingAs($admin)->postJson("/api/v1/campaigns/{$campaign->uuid}/pause")
            ->assertOk()->assertJsonPath('data.status', 'paused');
        $this->actingAs($admin)->postJson("/api/v1/campaigns/{$campaign->uuid}/resume")
            ->assertOk()->assertJsonPath('data.status', 'running');
    }

    public function test_populate_contacts_excludes_non_contactable(): void
    {
        $eligible = Contact::factory()->create();
        Debt::factory()->create(['contact_id' => $eligible->id, 'pending_balance' => 800, 'status' => 'overdue']);

        $dnc = Contact::factory()->create(['do_not_contact' => true]);
        Debt::factory()->create(['contact_id' => $dnc->id, 'pending_balance' => 800, 'status' => 'overdue']);

        $campaign = Campaign::factory()->create([
            'status' => 'running',
            'segment_filters' => ['min_debt' => 100],
        ]);

        $count = app(\App\Services\Campaigns\CampaignService::class)->populateContacts($campaign);

        $this->assertSame(1, $count);
        $this->assertDatabaseHas('campaign_contacts', ['campaign_id' => $campaign->id, 'contact_id' => $eligible->id]);
        $this->assertDatabaseMissing('campaign_contacts', ['campaign_id' => $campaign->id, 'contact_id' => $dnc->id]);
    }
}
