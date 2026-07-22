<?php

namespace App\Integrations\Llm;

/**
 * Driver de desarrollo: agente de cobranzas determinístico basado en reglas.
 * Simula el comportamiento del agente real (valida identidad, informa deuda,
 * registra compromisos vía tools) sin consumir la API de OpenAI.
 */
class MockLlmDriver implements LlmProvider
{
    public function chat(array $messages, array $tools = [], array $options = []): array
    {
        $toolNames = array_column($tools, 'name');

        // Si el último mensaje es el resultado de una tool, responder en función de él
        // (evita repetir la misma tool en bucle).
        $last = end($messages);
        if (($last['role'] ?? null) === 'tool') {
            return $this->afterTool($messages, $last, $toolNames);
        }

        $lastUser = $this->lastMessageOf($messages, 'user');
        $text = mb_strtolower($lastUser ?? '');
        $identityValidated = $this->wasToolCalled($messages, 'validar_identidad');
        $debtQueried = $this->wasToolCalled($messages, 'consultar_deuda');

        // Primer turno: saludo.
        if ($lastUser === null) {
            return $this->reply('Buenos días, le saluda la asistente virtual del área de cobranzas. ¿Tengo el gusto con el titular de la cuenta?');
        }

        // Pide asesor humano.
        if (str_contains($text, 'asesor') || str_contains($text, 'humano') || str_contains($text, 'persona real')) {
            return $this->toolCall('solicitar_asesor', ['motivo' => 'El usuario solicitó hablar con un asesor.'], $toolNames)
                ?? $this->reply('Con gusto lo comunico con un asesor. Un momento por favor.');
        }

        // Despedida / negativa definitiva.
        if (str_contains($text, 'no me interesa') || str_contains($text, 'no llame') || str_contains($text, 'adiós') || str_contains($text, 'adios')) {
            return $this->toolCall('finalizar_llamada', [
                'resultado' => 'refused',
                'resumen' => 'El usuario no desea continuar la llamada.',
                'sentimiento' => 'negativo',
            ], $toolNames) ?? $this->reply('Entiendo, gracias por su tiempo. Que tenga buen día.');
        }

        // Confirma identidad.
        if (! $identityValidated && (str_contains($text, 'sí') || str_contains($text, 'si') || str_contains($text, 'soy yo') || str_contains($text, 'con él') || str_contains($text, 'con ella'))) {
            return $this->toolCall('validar_identidad', ['confirmado' => true], $toolNames)
                ?? $this->reply('Gracias por confirmar.');
        }

        // Tras validar identidad, consulta deuda para informar.
        if ($identityValidated && ! $debtQueried) {
            return $this->toolCall('consultar_deuda', [], $toolNames)
                ?? $this->reply('Le comento que registra un saldo pendiente con nosotros.');
        }

        // Compromiso de pago.
        if (preg_match('/(pagar|pago|deposito|depositar|cancelar).*(mañana|semana|lunes|martes|miercoles|miércoles|jueves|viernes|quincena|fin de mes|\d{1,2})/u', $text)
            || str_contains($text, 'me comprometo')) {
            $date = now()->addDays(7)->toDateString();

            return $this->toolCall('registrar_acuerdo', [
                'fecha_compromiso' => $date,
                'monto' => null,
                'tipo' => 'payment_promise',
                'descripcion' => 'Compromiso de pago registrado durante llamada simulada.',
            ], $toolNames) ?? $this->reply("Perfecto, registro su compromiso de pago para el {$date}.");
        }

        // Pregunta por el monto.
        if (str_contains($text, 'cuánto') || str_contains($text, 'cuanto') || str_contains($text, 'monto') || str_contains($text, 'debo')) {
            return $this->toolCall('consultar_deuda', [], $toolNames)
                ?? $this->reply('Permítame consultar el detalle de su deuda.');
        }

        // Pide información por WhatsApp.
        if (str_contains($text, 'whatsapp') || str_contains($text, 'mensaje')) {
            return $this->toolCall('enviar_whatsapp', ['motivo' => 'El usuario pidió el detalle por WhatsApp.'], $toolNames)
                ?? $this->reply('Le enviaré el detalle por WhatsApp.');
        }

        // Respuesta por defecto: encaminar a compromiso.
        return $this->reply('Entiendo. ¿Le parece si registramos una fecha de pago que le acomode para regularizar su saldo? Puedo agendar el compromiso ahora mismo.');
    }

    /**
     * Responde después de recibir el resultado de una herramienta.
     */
    protected function afterTool(array $messages, array $toolMessage, array $toolNames): array
    {
        $toolName = $this->toolNameForResult($messages, $toolMessage);
        $result = json_decode($toolMessage['content'] ?? '{}', true) ?: [];

        if (isset($result['error'])) {
            return $this->reply('Antes de darle esa información necesito validar su identidad. ¿Me confirma que hablo con el titular?');
        }

        return match ($toolName) {
            'validar_identidad' => ($result['identidad_validada'] ?? false)
                ? ($this->wasToolCalled($messages, 'consultar_deuda')
                    ? $this->reply('Gracias por confirmar. ¿En qué puedo ayudarle con su cuenta?')
                    : ($this->toolCall('consultar_deuda', [], $toolNames) ?? $this->reply('Gracias por confirmar.')))
                : $this->toolCall('finalizar_llamada', [
                    'resultado' => 'wrong_number',
                    'resumen' => 'El interlocutor no es el titular.',
                    'sentimiento' => 'neutral',
                ], $toolNames),

            'consultar_deuda' => isset($result['saldo_pendiente'])
                ? $this->reply(sprintf(
                    'Le comento que registra un saldo pendiente de %s %s por %s, con vencimiento %s. ¿Podría indicarme una fecha en la que pueda realizar el pago?',
                    $result['moneda'] ?? 'PEN',
                    number_format((float) $result['saldo_pendiente'], 2),
                    $result['concepto'] ?? 'su cuenta',
                    $result['fecha_vencimiento'] ?? 'vencido',
                ))
                : $this->reply('No registro deudas pendientes en su cuenta. Gracias por su tiempo.'),

            'registrar_acuerdo' => $this->toolCall('finalizar_llamada', [
                'resultado' => 'payment_promise',
                'resumen' => 'El titular se comprometió a pagar el '.($result['fecha'] ?? 'próximamente').'.',
                'sentimiento' => 'positivo',
            ], $toolNames) ?? $this->reply('Su compromiso quedó registrado. Gracias.'),

            'enviar_whatsapp' => $this->reply('Listo, le envié el detalle por WhatsApp. ¿Puedo ayudarle en algo más?'),

            'solicitar_asesor' => $this->toolCall('finalizar_llamada', [
                'resultado' => 'requires_advisor',
                'resumen' => 'Se derivó la llamada a un asesor humano.',
                'sentimiento' => 'neutral',
            ], $toolNames) ?? $this->reply('Lo comunico con un asesor.'),

            'consultar_preguntas_frecuentes' => $this->reply(
                $result['respuesta_autorizada'] ?? 'No tengo esa información, pero un asesor puede ayudarle.'
            ),

            'finalizar_llamada' => $this->reply('Gracias por su tiempo. Que tenga un buen día.'),

            default => $this->reply('Perfecto, continúo con su gestión. ¿Algo más en lo que pueda ayudarle?'),
        };
    }

    protected function toolNameForResult(array $messages, array $toolMessage): ?string
    {
        $id = $toolMessage['tool_call_id'] ?? null;

        foreach (array_reverse($messages) as $message) {
            foreach ($message['tool_calls'] ?? [] as $toolCall) {
                if (($toolCall['id'] ?? null) === $id) {
                    return $toolCall['function']['name'] ?? $toolCall['name'] ?? null;
                }
            }
        }

        return null;
    }

    protected function reply(string $content): array
    {
        return ['content' => $content, 'tool_calls' => [], 'tokens' => str_word_count($content)];
    }

    protected function toolCall(string $name, array $arguments, array $available): ?array
    {
        if ($available && ! in_array($name, $available)) {
            return null;
        }

        return [
            'content' => null,
            'tool_calls' => [[
                'id' => 'mock_'.uniqid(),
                'name' => $name,
                'arguments' => $arguments,
            ]],
            'tokens' => 10,
        ];
    }

    protected function lastMessageOf(array $messages, string $role): ?string
    {
        foreach (array_reverse($messages) as $message) {
            if (($message['role'] ?? null) === $role) {
                return $message['content'] ?? null;
            }
        }

        return null;
    }

    protected function wasToolCalled(array $messages, string $toolName): bool
    {
        foreach ($messages as $message) {
            foreach ($message['tool_calls'] ?? [] as $toolCall) {
                $name = $toolCall['function']['name'] ?? $toolCall['name'] ?? null;
                if ($name === $toolName) {
                    return true;
                }
            }
        }

        return false;
    }

    public function verify(): bool
    {
        return true;
    }

    public function name(): string
    {
        return 'mock';
    }
}
