<?php

namespace Tests\Feature;

use App\Models\Contact;
use Tests\TestCase;

class ContactTest extends TestCase
{
    public function test_create_contact_normalizes_phone(): void
    {
        $this->actingAs($this->adminUser())
            ->postJson('/api/v1/contacts', [
                'first_name' => 'María',
                'last_name' => 'Quispe',
                'phone' => '987 654 321',
                'city' => 'Lima',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.phone', '+51987654321');

        $this->assertDatabaseHas('contacts', ['phone' => '+51987654321', 'source' => 'manual']);
    }

    public function test_invalid_phone_is_rejected(): void
    {
        $this->actingAs($this->adminUser())
            ->postJson('/api/v1/contacts', [
                'first_name' => 'X', 'last_name' => 'Y', 'phone' => '12',
            ])
            ->assertStatus(422);
    }

    public function test_contact_crud_and_audit(): void
    {
        $admin = $this->adminUser();
        // Ciudad inicial fijada a propósito: la factory elige al azar de una
        // lista que incluye 'Cusco', y si coincidía, el update no cambiaba nada,
        // Eloquent no disparaba el evento `updated` y no había registro que auditar.
        $contact = Contact::factory()->create(['city' => 'Lima']);

        $this->actingAs($admin)
            ->putJson("/api/v1/contacts/{$contact->uuid}", ['city' => 'Cusco'])
            ->assertOk()
            ->assertJsonPath('data.city', 'Cusco');

        $this->assertDatabaseHas('audit_logs', [
            'module' => 'contacts',
            'action' => 'updated',
            'auditable_id' => $contact->id,
        ]);

        $this->actingAs($admin)->deleteJson("/api/v1/contacts/{$contact->uuid}")->assertOk();
        $this->assertSoftDeleted('contacts', ['id' => $contact->id]);
    }

    public function test_merge_moves_debts_and_deletes_duplicate(): void
    {
        $admin = $this->adminUser();
        $primary = Contact::factory()->create();
        $duplicate = Contact::factory()->create();
        \App\Models\Debt::factory()->create(['contact_id' => $duplicate->id]);

        $this->actingAs($admin)
            ->postJson("/api/v1/contacts/{$primary->uuid}/merge", ['duplicate_uuid' => $duplicate->uuid])
            ->assertOk();

        $this->assertSoftDeleted('contacts', ['id' => $duplicate->id]);
        $this->assertDatabaseHas('debts', ['contact_id' => $primary->id]);
    }

    public function test_timeline_returns_unified_events(): void
    {
        $admin = $this->adminUser();
        $contact = Contact::factory()->create();
        \App\Models\Call::factory()->create(['contact_id' => $contact->id]);
        \App\Models\Agreement::factory()->create(['contact_id' => $contact->id]);

        $response = $this->actingAs($admin)->getJson("/api/v1/contacts/{$contact->uuid}/timeline");

        $response->assertOk();
        $types = collect($response->json('data'))->pluck('type');
        $this->assertTrue($types->contains('call'));
        $this->assertTrue($types->contains('agreement'));
    }
}
