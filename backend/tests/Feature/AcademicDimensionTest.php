<?php

namespace Tests\Feature;

use App\Models\Campus;
use App\Models\Career;
use App\Models\Contact;
use App\Models\Faculty;
use Tests\TestCase;

class AcademicDimensionTest extends TestCase
{
    protected function academicContact(array $overrides = []): Contact
    {
        return Contact::factory()->create($overrides + ['status' => 'active']);
    }

    public function test_scope_restringe_contactos_por_carrera(): void
    {
        $campus = Campus::create(['code' => 'lima', 'name' => 'Lima']);
        $faculty = Faculty::create(['code' => 'fia', 'name' => 'FIA']);
        $sistemas = Career::create(['code' => 'ep-sistemas', 'name' => 'Ingeniería de Sistemas', 'faculty_id' => $faculty->id]);
        $civil = Career::create(['code' => 'ep-civil', 'name' => 'Ingeniería Civil', 'faculty_id' => $faculty->id]);

        $inScope = $this->academicContact(['campus_id' => $campus->id, 'faculty_id' => $faculty->id, 'career_id' => $sistemas->id]);
        $outOfScope = $this->academicContact(['campus_id' => $campus->id, 'faculty_id' => $faculty->id, 'career_id' => $civil->id]);

        $user = $this->adminUser();
        $user->scopes()->create(['career_id' => $sistemas->id]);

        $response = $this->actingAs($user)->getJson('/api/v1/contacts?per_page=100')->assertOk();
        $uuids = collect($response->json('data'))->pluck('uuid');

        $this->assertTrue($uuids->contains($inScope->uuid));
        $this->assertFalse($uuids->contains($outOfScope->uuid));

        // Acceso directo por uuid también bloqueado
        $this->actingAs($user)->getJson("/api/v1/contacts/{$outOfScope->uuid}")->assertForbidden();
        $this->actingAs($user)->getJson("/api/v1/contacts/{$inScope->uuid}")->assertOk();
    }

    public function test_usuario_sin_scopes_ve_todo(): void
    {
        $campus = Campus::create(['code' => 'juliaca', 'name' => 'Juliaca']);
        $contact = $this->academicContact(['campus_id' => $campus->id]);

        $response = $this->actingAs($this->adminUser())->getJson('/api/v1/contacts?per_page=100')->assertOk();

        $this->assertTrue(collect($response->json('data'))->pluck('uuid')->contains($contact->uuid));
    }

    public function test_segmentacion_clasifica_comportamientos(): void
    {
        // Crónico: deudas impagas en dos ciclos
        $cronico = $this->academicContact(['enrollment_status' => 'matriculado']);
        foreach (['2025-1', '2025-2'] as $i => $period) {
            $cronico->debts()->create([
                'code' => "C-{$i}", 'concept' => 'Pensión', 'original_amount' => 450,
                'pending_balance' => 450, 'due_date' => now()->subMonths(8 - $i * 4),
                'status' => 'overdue', 'academic_period' => $period,
            ]);
        }

        // Inactivo: debe y no estudia
        $inactivo = $this->academicContact(['enrollment_status' => 'no_matriculado']);
        $inactivo->debts()->create([
            'code' => 'I-1', 'concept' => 'Pensión', 'original_amount' => 450,
            'pending_balance' => 450, 'due_date' => now()->subMonths(3),
            'status' => 'overdue', 'academic_period' => '2026-1',
        ]);

        // Buen pagador: historial pagado a tiempo
        $bueno = $this->academicContact(['enrollment_status' => 'matriculado']);
        foreach ([1, 2] as $i) {
            $due = now()->subMonths($i * 5);
            $bueno->debts()->create([
                'code' => "B-{$i}", 'concept' => 'Pensión', 'original_amount' => 450,
                'pending_balance' => 0, 'due_date' => $due, 'paid_at' => $due->copy()->subDays(3),
                'status' => 'paid', 'academic_period' => '2025-'.$i,
            ]);
        }

        $this->artisan('crm:segment')->assertSuccessful();

        $this->assertSame('deudor_cronico', $cronico->fresh()->payment_segment);
        $this->assertSame('deudor_inactivo', $inactivo->fresh()->payment_segment);
        $this->assertSame('buen_pagador', $bueno->fresh()->payment_segment);
    }

    public function test_dashboard_academico_responde(): void
    {
        $this->actingAs($this->adminUser())
            ->getJson('/api/v1/dashboard/academic')
            ->assertOk()
            ->assertJsonStructure(['data' => ['kpis', 'by_segment', 'by_campus', 'by_faculty', 'top_careers', 'by_period', 'top_debtors']]);
    }

    public function test_catalogo_academico_responde(): void
    {
        $this->actingAs($this->adminUser())
            ->getJson('/api/v1/catalogs/academic')
            ->assertOk()
            ->assertJsonStructure(['data' => ['campuses', 'faculties', 'levels', 'modalities', 'periods', 'segments']]);
    }
}
