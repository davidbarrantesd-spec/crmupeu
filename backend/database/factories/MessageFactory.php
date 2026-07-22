<?php

namespace Database\Factories;

use App\Models\Conversation;
use Illuminate\Database\Eloquent\Factories\Factory;

class MessageFactory extends Factory
{
    public function definition(): array
    {
        $inbound = $this->faker->boolean(45);

        return [
            'conversation_id' => Conversation::factory(),
            'direction' => $inbound ? 'inbound' : 'outbound',
            'type' => 'text',
            'body' => $inbound
                ? $this->faker->randomElement(['Hola, ¿de qué se trata?', 'Voy a pagar esta semana.', '¿Cuánto debo?', 'Ya realicé el pago.', 'No puedo pagar aún.'])
                : $this->faker->randomElement(['Le recordamos su saldo pendiente.', 'Gracias por su respuesta.', '¿Le ayudamos con un cronograma de pago?']),
            'status' => $inbound ? 'delivered' : $this->faker->randomElement(['sent', 'delivered', 'read']),
            'message_sid' => 'SM'.$this->faker->unique()->md5(),
            'sent_by_type' => $inbound ? 'user' : $this->faker->randomElement(['user', 'campaign', 'ai']),
            'created_at' => $this->faker->dateTimeBetween('-3 days', 'now'),
        ];
    }
}
