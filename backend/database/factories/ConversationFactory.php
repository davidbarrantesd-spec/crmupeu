<?php

namespace Database\Factories;

use App\Models\Contact;
use Illuminate\Database\Eloquent\Factories\Factory;

class ConversationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'contact_id' => Contact::factory(),
            'channel' => 'whatsapp',
            'phone' => '+519'.$this->faker->numerify('########'),
            'status' => $this->faker->randomElement(['open', 'open', 'pending', 'closed']),
            'priority' => 5,
            'last_message_at' => $this->faker->dateTimeBetween('-3 days', 'now'),
            'last_inbound_at' => $this->faker->optional(0.6)->dateTimeBetween('-20 hours', 'now'),
            'unread_count' => $this->faker->numberBetween(0, 4),
        ];
    }
}
