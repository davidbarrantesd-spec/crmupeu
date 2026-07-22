<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class ContactFactory extends Factory
{
    public function definition(): array
    {
        return [
            'internal_code' => 'C'.$this->faker->unique()->numerify('#####'),
            'first_name' => $this->faker->firstName(),
            'last_name' => $this->faker->lastName().' '.$this->faker->lastName(),
            'dni' => $this->faker->unique()->numerify('########'),
            'phone' => '+519'.$this->faker->unique()->numerify('########'),
            'email' => $this->faker->optional(0.7)->safeEmail(),
            'city' => $this->faker->randomElement(['Lima', 'Arequipa', 'Trujillo', 'Cusco', 'Piura', 'Juliaca', 'Tarapoto']),
            'address' => $this->faker->streetAddress(),
            'status' => 'active',
            'source' => 'import',
            'segment' => $this->faker->randomElement(['pregrado', 'posgrado', 'egresados', 'general']),
            'call_consent' => $this->faker->boolean(95),
            'whatsapp_consent' => $this->faker->boolean(90),
            'do_not_contact' => $this->faker->boolean(3),
        ];
    }
}
