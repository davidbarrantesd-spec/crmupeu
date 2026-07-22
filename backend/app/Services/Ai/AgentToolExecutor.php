<?php

namespace App\Services\Ai;

use App\Models\Agreement;
use App\Models\AiSession;
use App\Models\FollowUp;
use App\Models\InternalNote;
use App\Services\WhatsApp\WhatsAppService;

/**
 * Ejecuta las herramientas del agente de IA. Los guardrails se aplican AQUÍ
 * (no solo en el prompt): sin identidad validada no se revela información de
 * deuda; la IA nunca modifica montos de deuda ni aplica descuentos.
 */
class AgentToolExecutor
{
    public const TOOLS = [
        'obtener_contacto', 'validar_identidad', 'consultar_deuda', 'registrar_acuerdo',
        'registrar_observacion', 'programar_seguimiento', 'enviar_whatsapp',
        'solicitar_asesor', 'finalizar_llamada', 'consultar_preguntas_frecuentes',
    ];

    public function __construct(protected WhatsAppService $whatsAppService) {}

    public function definitions(array $enabled = []): array
    {
        $all = [
            [
                'name' => 'obtener_contacto',
                'description' => 'Obtiene los datos básicos (no sensibles) del contacto de la llamada.',
                'parameters' => ['type' => 'object', 'properties' => (object) [], 'required' => []],
            ],
            [
                'name' => 'validar_identidad',
                'description' => 'Registra que el interlocutor confirmó o negó ser el titular. Llamar antes de revelar información de deuda.',
                'parameters' => ['type' => 'object', 'properties' => [
                    'confirmado' => ['type' => 'boolean', 'description' => 'true si confirmó ser el titular'],
                ], 'required' => ['confirmado']],
            ],
            [
                'name' => 'consultar_deuda',
                'description' => 'Consulta el detalle de la deuda del contacto. Requiere identidad validada.',
                'parameters' => ['type' => 'object', 'properties' => (object) [], 'required' => []],
            ],
            [
                'name' => 'registrar_acuerdo',
                'description' => 'Registra un compromiso de pago con fecha y monto opcional. Requiere identidad validada.',
                'parameters' => ['type' => 'object', 'properties' => [
                    'fecha_compromiso' => ['type' => 'string', 'description' => 'Fecha YYYY-MM-DD'],
                    'monto' => ['type' => ['number', 'null'], 'description' => 'Monto comprometido, opcional'],
                    'tipo' => ['type' => 'string', 'enum' => ['payment_promise', 'partial_payment', 'refinance', 'dispute']],
                    'descripcion' => ['type' => 'string'],
                ], 'required' => ['fecha_compromiso']],
            ],
            [
                'name' => 'registrar_observacion',
                'description' => 'Guarda una observación o nota sobre la llamada.',
                'parameters' => ['type' => 'object', 'properties' => [
                    'observacion' => ['type' => 'string'],
                ], 'required' => ['observacion']],
            ],
            [
                'name' => 'programar_seguimiento',
                'description' => 'Programa un seguimiento futuro (llamada o verificación).',
                'parameters' => ['type' => 'object', 'properties' => [
                    'fecha' => ['type' => 'string', 'description' => 'Fecha YYYY-MM-DD'],
                    'tipo' => ['type' => 'string', 'enum' => ['auto_call', 'ai_call', 'whatsapp', 'manual_call', 'payment_verification']],
                    'motivo' => ['type' => 'string'],
                ], 'required' => ['fecha', 'tipo']],
            ],
            [
                'name' => 'enviar_whatsapp',
                'description' => 'Envía al contacto un WhatsApp con el resumen de su deuda. Requiere consentimiento del contacto.',
                'parameters' => ['type' => 'object', 'properties' => [
                    'motivo' => ['type' => 'string'],
                ], 'required' => []],
            ],
            [
                'name' => 'solicitar_asesor',
                'description' => 'Deriva la llamada a un asesor humano y crea la tarea correspondiente.',
                'parameters' => ['type' => 'object', 'properties' => [
                    'motivo' => ['type' => 'string'],
                ], 'required' => ['motivo']],
            ],
            [
                'name' => 'finalizar_llamada',
                'description' => 'Termina la conversación y registra el resultado final estructurado.',
                'parameters' => ['type' => 'object', 'properties' => [
                    'resultado' => ['type' => 'string', 'enum' => ['payment_promise', 'refused', 'no_debt_claimed', 'wrong_number', 'requires_advisor', 'answered', 'callback_requested']],
                    'resumen' => ['type' => 'string'],
                    'sentimiento' => ['type' => 'string', 'enum' => ['positivo', 'neutral', 'negativo']],
                ], 'required' => ['resultado', 'resumen']],
            ],
            [
                'name' => 'consultar_preguntas_frecuentes',
                'description' => 'Busca la respuesta autorizada a una pregunta frecuente. Solo responder con información devuelta por esta herramienta.',
                'parameters' => ['type' => 'object', 'properties' => [
                    'pregunta' => ['type' => 'string'],
                ], 'required' => ['pregunta']],
            ],
        ];

        return $enabled
            ? array_values(array_filter($all, fn ($t) => in_array($t['name'], $enabled)))
            : $all;
    }

    /**
     * Ejecuta una tool y devuelve el resultado JSON que verá el modelo.
     */
    public function execute(AiSession $session, string $tool, array $args): array
    {
        $state = $session->structured_result ?? [];
        $contact = $session->contact;

        $result = match ($tool) {
            'obtener_contacto' => $contact ? [
                'nombre' => $contact->first_name,
                'apellido' => $contact->last_name,
                'ciudad' => $contact->city,
            ] : ['error' => 'Contacto no disponible.'],

            'validar_identidad' => $this->validarIdentidad($session, $args),

            'consultar_deuda' => $this->consultarDeuda($session),

            'registrar_acuerdo' => $this->registrarAcuerdo($session, $args),

            'registrar_observacion' => $this->registrarObservacion($session, $args),

            'programar_seguimiento' => $this->programarSeguimiento($session, $args),

            'enviar_whatsapp' => $this->enviarWhatsApp($session, $args),

            'solicitar_asesor' => $this->solicitarAsesor($session, $args),

            'finalizar_llamada' => $this->finalizarLlamada($session, $args),

            'consultar_preguntas_frecuentes' => $this->consultarFaq($session, $args),

            default => ['error' => "Herramienta desconocida: {$tool}"],
        };

        $toolCalls = $session->tool_calls ?? [];
        $toolCalls[] = ['tool' => $tool, 'arguments' => $args, 'result' => $result, 'at' => now()->toIso8601String()];
        $session->update(['tool_calls' => $toolCalls]);

        return $result;
    }

    protected function validarIdentidad(AiSession $session, array $args): array
    {
        $confirmed = (bool) ($args['confirmado'] ?? false);
        $this->mergeResult($session, ['identidad_validada' => $confirmed, 'contactado' => true]);

        return ['identidad_validada' => $confirmed];
    }

    protected function consultarDeuda(AiSession $session): array
    {
        if (! $this->identityValidated($session)) {
            return ['error' => 'GUARDRAIL: No se puede revelar información de deuda sin validar la identidad del titular.'];
        }

        $debt = $session->contact?->debts()->whereNotIn('status', ['paid', 'cancelled'])->orderByDesc('pending_balance')->first();
        if (! $debt) {
            return ['deuda' => null, 'mensaje' => 'El contacto no registra deudas pendientes.'];
        }

        return [
            'codigo' => $debt->code,
            'concepto' => $debt->concept,
            'saldo_pendiente' => (float) $debt->pending_balance,
            'moneda' => $debt->currency,
            'fecha_vencimiento' => $debt->due_date?->toDateString(),
            'cuotas_vencidas' => $debt->overdue_installments,
        ];
    }

    protected function registrarAcuerdo(AiSession $session, array $args): array
    {
        if (! $this->identityValidated($session)) {
            return ['error' => 'GUARDRAIL: No se puede registrar un acuerdo sin validar identidad.'];
        }

        $contact = $session->contact;
        $debt = $contact?->debts()->whereNotIn('status', ['paid', 'cancelled'])->orderByDesc('pending_balance')->first();

        if ($session->mode === 'simulation') {
            $this->mergeResult($session, [
                'resultado' => 'payment_promise',
                'fecha_compromiso' => $args['fecha_compromiso'] ?? null,
                'monto_comprometido' => $args['monto'] ?? null,
            ]);

            return ['acuerdo_registrado' => true, 'simulacion' => true, 'fecha' => $args['fecha_compromiso'] ?? null];
        }

        $agreement = Agreement::create([
            'contact_id' => $contact->id,
            'debt_id' => $debt?->id,
            'call_id' => $session->call_id,
            'type' => $args['tipo'] ?? 'payment_promise',
            'description' => $args['descripcion'] ?? 'Compromiso registrado por agente IA.',
            'amount' => $args['monto'] ?? null,
            'promise_date' => $args['fecha_compromiso'],
            'status' => 'pending',
            'created_by_type' => 'ai',
        ]);

        $this->mergeResult($session, [
            'resultado' => 'payment_promise',
            'fecha_compromiso' => $args['fecha_compromiso'],
            'monto_comprometido' => $args['monto'] ?? null,
            'siguiente_accion' => 'verificar_pago',
        ]);

        FollowUp::create([
            'contact_id' => $contact->id,
            'campaign_id' => $session->call?->campaign_id,
            'agreement_id' => $agreement->id,
            'call_id' => $session->call_id,
            'type' => 'payment_verification',
            'scheduled_at' => \Carbon\Carbon::parse($args['fecha_compromiso'])->addDay()->setTime(9, 0),
            'channel' => 'internal',
            'status' => 'pending',
        ]);

        return ['acuerdo_registrado' => true, 'acuerdo_uuid' => $agreement->uuid, 'fecha' => $args['fecha_compromiso']];
    }

    protected function registrarObservacion(AiSession $session, array $args): array
    {
        if ($session->mode !== 'simulation' && $session->contact) {
            InternalNote::create([
                'notable_type' => \App\Models\Contact::class,
                'notable_id' => $session->contact->id,
                'user_id' => $session->user_id ?? \App\Models\User::role('Superadministrador')->first()?->id ?? 1,
                'body' => '[IA] '.($args['observacion'] ?? ''),
            ]);
        }

        return ['observacion_registrada' => true];
    }

    protected function programarSeguimiento(AiSession $session, array $args): array
    {
        if ($session->mode !== 'simulation' && $session->contact) {
            FollowUp::create([
                'contact_id' => $session->contact->id,
                'campaign_id' => $session->call?->campaign_id,
                'call_id' => $session->call_id,
                'type' => $args['tipo'],
                'scheduled_at' => \Carbon\Carbon::parse($args['fecha'])->setTime(10, 0),
                'channel' => in_array($args['tipo'], ['whatsapp']) ? 'whatsapp' : 'voice',
                'status' => 'pending',
                'notes' => $args['motivo'] ?? null,
            ]);
        }

        return ['seguimiento_programado' => true, 'fecha' => $args['fecha']];
    }

    protected function enviarWhatsApp(AiSession $session, array $args): array
    {
        $contact = $session->contact;
        if (! $contact?->whatsapp_consent) {
            return ['error' => 'GUARDRAIL: El contacto no tiene consentimiento para WhatsApp.'];
        }

        $this->mergeResult($session, ['enviar_whatsapp' => true]);

        if ($session->mode === 'simulation') {
            return ['whatsapp_programado' => true, 'simulacion' => true];
        }

        $debt = $contact->debts()->whereNotIn('status', ['paid', 'cancelled'])->orderByDesc('pending_balance')->first();
        $body = "Hola {$contact->first_name}, como conversamos, le compartimos el detalle de su cuenta"
            .($debt ? ": {$debt->concept}, saldo pendiente {$debt->currency} ".number_format((float) $debt->pending_balance, 2)
                .($debt->due_date ? ", vencimiento {$debt->due_date->format('d/m/Y')}" : '') : '').'.';

        $this->whatsAppService->sendText($contact, $body, sentByType: 'ai');

        return ['whatsapp_enviado' => true];
    }

    protected function solicitarAsesor(AiSession $session, array $args): array
    {
        $this->mergeResult($session, ['requiere_asesor' => true, 'siguiente_accion' => 'asignar_asesor']);

        if ($session->mode !== 'simulation' && $session->contact) {
            FollowUp::create([
                'contact_id' => $session->contact->id,
                'campaign_id' => $session->call?->campaign_id,
                'call_id' => $session->call_id,
                'type' => 'advisor_task',
                'scheduled_at' => now(),
                'channel' => 'internal',
                'priority' => 2,
                'status' => 'pending',
                'notes' => $args['motivo'] ?? 'Solicitado durante llamada IA.',
            ]);
        }

        return ['derivado_a_asesor' => true];
    }

    protected function finalizarLlamada(AiSession $session, array $args): array
    {
        $this->mergeResult($session, [
            'resultado' => $args['resultado'] ?? 'answered',
            'resumen' => $args['resumen'] ?? '',
            'sentimiento' => $args['sentimiento'] ?? 'neutral',
            'finalizada' => true,
        ]);

        $session->update(['status' => 'completed']);

        return ['llamada_finalizada' => true];
    }

    protected function consultarFaq(AiSession $session, array $args): array
    {
        $faq = $session->promptVersion?->faq ?? [];
        $question = mb_strtolower($args['pregunta'] ?? '');

        foreach ($faq as $item) {
            $keywords = array_filter(explode(' ', mb_strtolower($item['q'] ?? '')));
            $matches = count(array_filter($keywords, fn ($w) => mb_strlen($w) > 3 && str_contains($question, $w)));
            if ($matches >= 1) {
                return ['respuesta_autorizada' => $item['a'] ?? ''];
            }
        }

        return ['respuesta_autorizada' => null, 'mensaje' => 'No hay respuesta autorizada para esta pregunta. Indicar que un asesor puede ayudar.'];
    }

    protected function identityValidated(AiSession $session): bool
    {
        return (bool) (($session->structured_result ?? [])['identidad_validada'] ?? false);
    }

    protected function mergeResult(AiSession $session, array $data): void
    {
        $session->update(['structured_result' => array_merge($session->structured_result ?? [], $data)]);
    }
}
