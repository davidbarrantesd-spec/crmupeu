<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

class AuthTest extends TestCase
{
    public function test_login_with_valid_credentials_returns_token(): void
    {
        $user = $this->adminUser();

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonStructure(['data' => ['token', 'user' => ['uuid', 'name', 'roles', 'permissions']]]);

        $this->assertDatabaseHas('login_audits', ['email' => $user->email, 'event' => 'login']);
    }

    public function test_login_with_invalid_credentials_fails_and_is_audited(): void
    {
        $user = $this->adminUser();

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'incorrecta',
        ])->assertStatus(422);

        $this->assertDatabaseHas('login_audits', ['email' => $user->email, 'event' => 'failed']);
    }

    public function test_inactive_user_cannot_login(): void
    {
        $user = User::factory()->create(['status' => 'inactive']);

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])->assertStatus(422);
    }

    public function test_me_returns_current_user(): void
    {
        $user = $this->adminUser();

        $this->actingAs($user)
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', $user->email);
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->getJson('/api/v1/contacts')->assertStatus(401);
    }
}
