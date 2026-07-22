<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class CampaignFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => 'Campaña '.$this->faker->words(2, true),
            'description' => $this->faker->sentence(),
            'type' => $this->faker->randomElement(['recorded_audio', 'tts', 'ai_conversational']),
            'status' => 'draft',
            'timezone' => 'America/Lima',
            'allowed_from' => '08:00',
            'allowed_until' => '20:00',
            'allowed_days' => [1, 2, 3, 4, 5],
            'max_attempts' => 3,
            'retry_minutes' => 120,
            'max_concurrent_calls' => 5,
            'priority' => 5,
            'language' => 'es-MX',
            'tts_message' => 'Hola {{nombre}}, le informamos que mantiene un saldo pendiente de {{saldo}} soles con vencimiento el {{fecha_vencimiento}}.',
            'record_calls' => true,
        ];
    }
}
