<?php

namespace Database\Factories;

use App\Models\Contact;
use Illuminate\Database\Eloquent\Factories\Factory;

class CallFactory extends Factory
{
    public function definition(): array
    {
        $answered = $this->faker->boolean(70);
        $created = $this->faker->dateTimeBetween('-30 days', 'now');

        return [
            'contact_id' => Contact::factory(),
            'type' => $this->faker->randomElement(['recorded_audio', 'tts', 'ai_conversational']),
            'to_number' => '+519'.$this->faker->numerify('########'),
            'from_number' => '+15005550006',
            'status' => $answered ? 'completed' : $this->faker->randomElement(['no_answer', 'busy', 'failed']),
            'result' => $answered ? $this->faker->randomElement(['answered', 'payment_promise', 'refused']) : 'no_answer',
            'started_at' => $created,
            'answered_at' => $answered ? $created : null,
            'ended_at' => $created,
            'duration_seconds' => $answered ? $this->faker->numberBetween(15, 240) : 0,
            'estimated_cost' => $answered ? $this->faker->randomFloat(4, 0.014, 0.08) : 0,
            'twilio_call_sid' => 'CA'.$this->faker->unique()->md5(),
            'attempt_number' => $this->faker->numberBetween(1, 3),
            'created_at' => $created,
            'updated_at' => $created,
        ];
    }
}
