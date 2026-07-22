<?php

namespace Database\Factories;

use App\Models\Contact;
use Illuminate\Database\Eloquent\Factories\Factory;

class DebtFactory extends Factory
{
    public function definition(): array
    {
        $original = $this->faker->randomFloat(2, 150, 6000);
        $pending = $this->faker->randomFloat(2, 50, $original);

        return [
            'contact_id' => Contact::factory(),
            'code' => 'D'.$this->faker->unique()->numerify('######'),
            'concept' => $this->faker->randomElement(['Pensión de enseñanza', 'Matrícula', 'Cuota de financiamiento', 'Mora acumulada', 'Servicio de laboratorio']),
            'original_amount' => $original,
            'pending_balance' => $pending,
            'currency' => 'PEN',
            'due_date' => $this->faker->dateTimeBetween('-120 days', '+30 days'),
            'status' => $this->faker->randomElement(['pending', 'overdue', 'overdue', 'partial', 'pending']),
            'installments' => $this->faker->numberBetween(1, 10),
            'overdue_installments' => $this->faker->numberBetween(0, 4),
            'origin' => 'import',
        ];
    }
}
