<?php

namespace Database\Seeders;

use App\Models\Agreement;
use App\Models\Call;
use App\Models\CallPrompt;
use App\Models\Campaign;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Debt;
use App\Models\FollowUpRule;
use App\Models\Message;
use App\Models\MessageTemplate;
use App\Models\Tag;
use App\Models\User;
use App\Models\WhatsappTemplate;
use App\Services\Ai\AgentToolExecutor;
use Illuminate\Database\Seeder;

/**
 * Datos de demostración SOLO para ambiente local.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        // ---- Usuarios ----
        $admin = User::factory()->create([
            'name' => 'Administrador Demo',
            'email' => 'admin@example.com',
            'password' => 'Password123!',
        ]);
        $admin->assignRole('Superadministrador');

        $supervisor = User::factory()->create(['name' => 'Sofía Supervisor', 'email' => 'supervisor@example.com', 'password' => 'Password123!']);
        $supervisor->assignRole('Supervisor');

        $asesor1 = User::factory()->create(['name' => 'Andrés Asesor', 'email' => 'asesor@example.com', 'password' => 'Password123!']);
        $asesor1->assignRole('Asesor');

        $auditor = User::factory()->create(['name' => 'Aurora Auditor', 'email' => 'auditor@example.com', 'password' => 'Password123!']);
        $auditor->assignRole('Auditor');

        // ---- Etiquetas ----
        $tags = collect(['prioritario', 'mora-alta', 'refinanciado', 'nuevo', 'contacto-difícil'])
            ->map(fn ($name) => Tag::create(['name' => $name, 'color' => fake()->hexColor()]));

        // ---- Contactos con deudas ----
        $contacts = Contact::factory(120)->create();
        $contacts->each(function (Contact $contact) use ($tags) {
            Debt::factory(fake()->numberBetween(1, 3))->create(['contact_id' => $contact->id]);
            $contact->tags()->attach($tags->random(fake()->numberBetween(0, 2))->pluck('id'));
        });

        // ---- Plantillas ----
        $waTemplate = WhatsappTemplate::create([
            'name' => 'recordatorio_pago',
            'language' => 'es',
            'category' => 'utility',
            'body' => 'Hola {{nombre}}, le recordamos que tiene un saldo pendiente de S/ {{saldo}} con vencimiento {{fecha_vencimiento}}. Responda a este mensaje si desea ayuda con su pago.',
            'status' => 'approved',
        ]);

        WhatsappTemplate::create([
            'name' => 'confirmacion_compromiso',
            'language' => 'es',
            'category' => 'utility',
            'body' => 'Hola {{nombre}}, confirmamos su compromiso de pago de S/ {{saldo}} para el {{fecha_compromiso}}. Gracias.',
            'status' => 'approved',
        ]);

        MessageTemplate::create([
            'name' => 'Aviso de vencimiento TTS',
            'type' => 'tts',
            'body' => 'Hola {{nombre}}, le informamos que mantiene un saldo pendiente de {{saldo}} soles con vencimiento el {{fecha_vencimiento}}. Presione 1 para confirmar que recibió este mensaje.',
            'voice' => 'Polly.Mia',
            'language' => 'es-MX',
        ]);

        // ---- Prompt de IA con versión publicada ----
        $prompt = CallPrompt::create([
            'name' => 'Agente de cobranzas estándar',
            'type' => 'collections',
            'description' => 'Agente conversacional para recordatorio de deuda y registro de compromisos de pago.',
            'status' => 'published',
            'created_by' => $admin->id,
        ]);

        $version = $prompt->versions()->create([
            'version' => 1,
            'status' => 'published',
            'published_at' => now(),
            'system_prompt' => 'Eres una asistente virtual del área de cobranzas de una institución educativa. Eres amable, empática y profesional. Tu objetivo es informar al titular sobre su deuda pendiente y lograr un compromiso de pago concreto (fecha y monto). Hablas en español peruano formal pero cercano.',
            'instructions' => "1. Saluda y verifica que hablas con el titular.\n2. Solo tras validar identidad, informa la deuda usando consultar_deuda.\n3. Busca un compromiso de pago con fecha concreta.\n4. Si pide hablar con una persona, usa solicitar_asesor.\n5. Si pide información por escrito, usa enviar_whatsapp.\n6. Cierra siempre con finalizar_llamada.",
            'greeting_message' => 'Buenos días, le saluda la asistente virtual del área de cobranzas. ¿Tengo el gusto con {{nombre_completo}}?',
            'farewell_message' => 'Gracias por su tiempo. Que tenga un excelente día.',
            'variables' => ['nombre', 'apellido', 'saldo', 'fecha_vencimiento'],
            'enabled_tools' => AgentToolExecutor::TOOLS,
            'guardrails' => [
                'forbidden_data' => ['DNI completo', 'datos de otros alumnos', 'información interna'],
                'security_rules' => ['No ofrecer descuentos ni condonaciones', 'No amenazar ni presionar', 'Máximo 5 minutos de conversación'],
            ],
            'faq' => [
                ['q' => 'dónde puedo pagar', 'a' => 'Puede pagar en caja de la institución, por transferencia al BCP o desde la plataforma virtual con su código de alumno.'],
                ['q' => 'puedo pagar en partes', 'a' => 'Sí, puede solicitar un fraccionamiento en el área de finanzas. Un asesor puede ayudarle con el trámite.'],
                ['q' => 'ya pagué', 'a' => 'Si ya realizó el pago, este puede tardar hasta 48 horas en reflejarse. Puede enviar su comprobante por WhatsApp.'],
            ],
            'extraction_fields' => ['fecha_compromiso', 'monto_comprometido', 'sentimiento'],
            'max_duration_seconds' => 300,
            'created_by' => $admin->id,
        ]);

        // ---- Campañas ----
        $campaignTts = Campaign::factory()->create([
            'name' => 'Recordatorio de vencimiento julio',
            'type' => 'tts',
            'status' => 'draft',
            'segment_filters' => ['min_debt' => 100, 'debt_status' => ['pending', 'overdue']],
            'dtmf_options' => [
                '1' => ['action' => 'confirm'],
                '2' => ['action' => 'send_whatsapp', 'template_uuid' => $waTemplate->uuid],
                '3' => ['action' => 'transfer_advisor'],
            ],
            'post_call_actions' => ['send_whatsapp_after_answer' => false],
            'created_by' => $admin->id,
            'supervisor_id' => $supervisor->id,
        ]);

        Campaign::factory()->create([
            'name' => 'Gestión IA mora mayor a 30 días',
            'type' => 'ai_conversational',
            'status' => 'draft',
            'segment_filters' => ['min_days_overdue' => 30, 'debt_status' => ['overdue']],
            'prompt_version_id' => $version->id,
            'greeting_message' => 'Buenos días, le saluda la asistente virtual del área de cobranzas.',
            'created_by' => $admin->id,
            'supervisor_id' => $supervisor->id,
        ]);

        // ---- Historial de llamadas, acuerdos y conversaciones ----
        $contacts->random(60)->each(function (Contact $contact) use ($campaignTts) {
            Call::factory(fake()->numberBetween(1, 3))->create([
                'contact_id' => $contact->id,
                'campaign_id' => fake()->boolean(70) ? $campaignTts->id : null,
                'debt_id' => $contact->debts()->value('id'),
            ]);
        });

        $contacts->random(30)->each(function (Contact $contact) {
            Agreement::factory()->create([
                'contact_id' => $contact->id,
                'debt_id' => $contact->debts()->value('id'),
                'call_id' => $contact->calls()->value('id'),
            ]);
        });

        $contacts->random(25)->each(function (Contact $contact) use ($asesor1) {
            $conversation = Conversation::factory()->create([
                'contact_id' => $contact->id,
                'phone' => $contact->phone,
                'assigned_to' => fake()->boolean(60) ? $asesor1->id : null,
            ]);
            Message::factory(fake()->numberBetween(2, 8))->create(['conversation_id' => $conversation->id]);
        });

        // ---- Reglas de seguimiento globales ----
        $rules = [
            ['name' => 'Reintento si no contesta', 'trigger_event' => 'call_no_answer', 'action' => 'retry_call', 'delay_minutes' => 120],
            ['name' => 'Reintento si ocupado', 'trigger_event' => 'call_busy', 'action' => 'retry_call', 'delay_minutes' => 30],
            ['name' => 'Verificar pago tras compromiso', 'trigger_event' => 'payment_promise', 'action' => 'verify_payment', 'delay_minutes' => 1440],
            ['name' => 'Nueva llamada si incumple acuerdo', 'trigger_event' => 'agreement_broken', 'action' => 'schedule_ai_call', 'delay_minutes' => 60],
            ['name' => 'Enviar plantilla si pide WhatsApp', 'trigger_event' => 'dtmf_whatsapp', 'action' => 'send_whatsapp', 'delay_minutes' => 1, 'config' => ['template_uuid' => $waTemplate->uuid]],
            ['name' => 'Tarea de asesor si lo solicita', 'trigger_event' => 'dtmf_advisor', 'action' => 'create_advisor_task', 'delay_minutes' => 0, 'config' => ['priority' => 2]],
            ['name' => 'Derivar al llegar al máximo de intentos', 'trigger_event' => 'max_attempts', 'action' => 'create_advisor_task', 'delay_minutes' => 0],
        ];

        foreach ($rules as $rule) {
            FollowUpRule::create($rule + ['active' => true]);
        }
    }
}
