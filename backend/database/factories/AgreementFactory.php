<?php

namespace Database\Factories;

use App\Models\Contact;
use Illuminate\Database\Eloquent\Factories\Factory;

class AgreementFactory extends Factory
{
    public function definition(): array
    {
        return [
            'contact_id' => Contact::factory(),
            'type' => 'payment_promise',
            'description' => 'Compromiso de pago registrado en llamada.',
            'amount' => $this->faker->randomFloat(2, 100, 2000),
            'promise_date' => $this->faker->dateTimeBetween('-10 days', '+20 days'),
            'status' => $this->faker->randomElement(['pending', 'pending', 'fulfilled', 'broken']),
            'created_by_type' => $this->faker->randomElement(['user', 'ai']),
        ];
    }
}
