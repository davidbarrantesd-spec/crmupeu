<?php

namespace Tests\Feature;

use Tests\TestCase;

class PermissionTest extends TestCase
{
    public function test_asesor_cannot_manage_users(): void
    {
        $asesor = $this->userWithRole('Asesor');

        $this->actingAs($asesor)->getJson('/api/v1/users')->assertStatus(403);
        $this->actingAs($asesor)->postJson('/api/v1/users', [])->assertStatus(403);
    }

    public function test_solo_lectura_cannot_create_contacts(): void
    {
        $reader = $this->userWithRole('Solo lectura');

        $this->actingAs($reader)->getJson('/api/v1/contacts')->assertOk();
        $this->actingAs($reader)->postJson('/api/v1/contacts', [
            'first_name' => 'Juan', 'last_name' => 'Pérez', 'phone' => '+51987654321',
        ])->assertStatus(403);
    }

    public function test_asesor_cannot_launch_campaigns(): void
    {
        $asesor = $this->userWithRole('Asesor');
        $campaign = \App\Models\Campaign::factory()->create();

        $this->actingAs($asesor)
            ->postJson("/api/v1/campaigns/{$campaign->uuid}/launch")
            ->assertStatus(403);
    }

    public function test_solo_lectura_cannot_view_audit_logs(): void
    {
        $reader = $this->userWithRole('Solo lectura');

        $this->actingAs($reader)->getJson('/api/v1/audit-logs')->assertStatus(403);
    }

    public function test_auditor_can_view_audit_logs(): void
    {
        $auditor = $this->userWithRole('Auditor');

        $this->actingAs($auditor)->getJson('/api/v1/audit-logs')->assertOk();
    }
}
