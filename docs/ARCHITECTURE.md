# Arquitectura — CRM Omnicanal de Cobranzas

## 1. Visión general

Plataforma de gestión de campañas de llamadas automáticas (audio grabado, TTS, IVR y conversacional con IA),
acuerdos de pago, seguimientos y conversaciones de WhatsApp, con auditoría completa.

```
┌─────────────────────────────┐        ┌──────────────────────────────────────────┐
│  Frontend (React + Vite)    │  HTTPS │  Backend (Laravel 12, PHP 8.4)           │
│  - React Router / TanStack  │◄──────►│  - API REST /api/v1 (Sanctum tokens)     │
│  - Zustand / RHF + Zod      │  WS    │  - Domain modules (app/Domain/*)         │
│  - Tailwind + shadcn/ui     │◄──────►│  - Laravel Reverb (tiempo real)          │
│  - Recharts / Lucide        │        │  - Queues (Redis) + Scheduler            │
└─────────────────────────────┘        └───────┬──────────────┬───────────────────┘
                                               │              │
                             ┌─────────────────┤              ├──────────────────┐
                             ▼                 ▼              ▼                  ▼
                      PostgreSQL 16       Redis 7        S3/R2/MinIO      Integraciones
                      (Neon-compatible)   (colas, caché, (grabaciones,    - Twilio Voice
                      UUID públicos       locks)         audios, adjuntos) - Twilio/Meta WhatsApp
                      soft deletes                                         - OpenAI
                      auditoría                                            (adapters + sandbox)
```

### Principios
- **Arquitectura modular orientada a dominios**: cada módulo vive en `app/Domain/<Modulo>` con
  Models, Services, Actions, DTOs, Events, Listeners y Jobs propios.
- **Controladores delgados**: solo validan (FormRequest), delegan a Services/Actions y responden con Resources.
- **Adapters para integraciones**: Twilio, WhatsApp y OpenAI se consumen a través de interfaces
  (`TelephonyProvider`, `WhatsAppProvider`, `LlmProvider`). Sin credenciales reales el sistema
  arranca en **modo sandbox** (drivers fake que simulan el ciclo de vida completo de llamadas y mensajes).
- **Idempotencia**: webhooks y jobs registran claves de idempotencia; locks Redis contra doble ejecución.
- **Auditoría transversal**: trait `Auditable` + `AuditLogger` registran old/new values, usuario, IP y user-agent.

## 2. Estructura de carpetas

```
cobranzas-crm/
├── docker-compose.yml          # postgres :5434, redis :6380, minio :9100
├── docs/                       # arquitectura, BD, manuales, despliegue
├── backend/                    # Laravel 12
│   ├── app/
│   │   ├── Models/             # 27 modelos Eloquent (HasUuid + Auditable)
│   │   ├── Services/           # lógica de negocio por dominio
│   │   │   ├── Campaigns/      # CampaignService, SegmentationService
│   │   │   ├── Calls/          # CallService, TwimlBuilder
│   │   │   ├── Ai/             # AiConversationService, AgentToolExecutor (10 tools + guardrails)
│   │   │   ├── WhatsApp/       # WhatsAppService (ventana 24h, plantillas, entrantes)
│   │   │   ├── FollowUps/      # FollowUpRuleEngine
│   │   │   ├── Contacts/       # ContactService (dedupe/merge/timeline), ImportService
│   │   │   ├── Reports/        # DashboardService
│   │   │   ├── Settings/       # CostGuard (límites y presupuesto)
│   │   │   └── Shared/         # VariableRenderer ({{nombre}}, {{saldo}}, …)
│   │   ├── Integrations/
│   │   │   ├── Telephony/      # TelephonyProvider + TwilioDriver + SandboxDriver
│   │   │   ├── Messaging/      # WhatsAppProvider + TwilioWhatsAppDriver + SandboxDriver
│   │   │   ├── Llm/            # LlmProvider + OpenAiDriver + MockLlmDriver
│   │   │   └── IntegrationManager.php  # resuelve driver: BD cifrada > env > sandbox
│   │   ├── Http/
│   │   │   ├── Controllers/Api/V1/     # 18 controladores + Webhooks/
│   │   │   ├── Resources/              # respuestas JSON consistentes
│   │   │   └── Middleware/             # VerifyTwilioSignature
│   │   ├── Jobs/               # 13 jobs (reintentos, backoff, locks, idempotencia)
│   │   ├── Events/             # CallUpdated, MessageReceived, … (broadcast Reverb)
│   │   ├── Support/            # HasUuid, Auditable
│   │   └── Console/Commands/   # crm:tick (orquestador del scheduler)
│   ├── database/migrations|seeders|factories
│   ├── routes/api.php          # /api/v1 versionado
│   └── tests/Feature|Unit
└── frontend/                   # React 19 + TS + Vite
    ├── src/
    │   ├── api/                # axios client + endpoints tipados
    │   ├── components/ui/      # shadcn-style components
    │   ├── components/…        # tablas, filtros, modales, timeline
    │   ├── features/           # una carpeta por pantalla/módulo
    │   ├── hooks/              # useAuth, useRealtime, usePermissions
    │   ├── stores/             # zustand (auth, ui, notifications)
    │   ├── lib/                # utils, echo, formatos
    │   └── router.tsx
    └── .env.example
```

## 3. Modelo de base de datos (resumen)

Identificador interno `bigint id` + `uuid` público en todas las entidades expuestas.

| Grupo | Tablas |
|---|---|
| Seguridad | `users`, `roles`, `permissions`, `model_has_roles`, `model_has_permissions`, `role_has_permissions`, `personal_access_tokens`, `password_reset_tokens`, `login_audits` |
| Contactos | `contacts`, `tags`, `contact_tags`, `contact_notes` |
| Deuda | `debts` (jsonb `extra_data`), `debt_sync_logs` |
| Campañas | `campaigns` (jsonb `segment_filters`, `schedule_config`, `ai_config`, `dtmf_options`), `campaign_contacts` |
| Llamadas | `calls`, `call_events`, `recordings`, `transcriptions` |
| IA | `call_prompts`, `prompt_versions`, `ai_sessions` (turnos de conversación) |
| Acuerdos/Seguimiento | `agreements`, `follow_ups`, `follow_up_rules` |
| WhatsApp | `conversations`, `messages`, `whatsapp_templates`, `message_templates` (TTS/textos) |
| Operación | `internal_notes`, `assignments`, `webhook_events` (idempotencia), `audit_logs`, `system_settings` (cifrado), `integrations` (credenciales cifradas), `cost_entries`, `imports`, `import_rows` |
| Laravel | `jobs`, `failed_jobs`, `job_batches`, `cache` |

Relaciones clave: `contacts 1─N debts`, `campaigns N─M contacts` (pivot con intentos/resultado),
`calls N─1 contact|campaign`, `calls 1─N call_events|recordings|transcriptions`,
`agreements N─1 contact|debt|call`, `follow_ups N─1 contact|campaign|agreement`,
`conversations N─1 contact` y `1─N messages`.

Índices mínimos: teléfono, DNI (unique parcial), estado, campaña, fechas programadas,
`twilio_call_sid`, `message_sid`, contacto, deuda, `promise_date`. Ver `docs/DATABASE.md`.

## 4. Flujo de llamadas (audio grabado / TTS)

```
Campaña "Ejecutándose"
  → LaunchCampaignJob: segmenta contactos (con consentimiento, sin DNC), crea calls "pendiente"
  → DispatchCampaignCallsJob (cada minuto vía scheduler, respeta horario/días/concurrencia/límites de costo)
      → PlaceCallJob (lock redis por call)
          → TelephonyProvider->placeCall()  [Twilio real o Sandbox]
          → call.status = "marcando", guarda CallSid
  → Webhook /api/v1/webhooks/twilio/voice/status  (firma validada + idempotencia)
      → ProcessCallStatusJob: ringing → in-progress → completed/no-answer/busy/failed
      → TwiML answer URL reproduce <Play> (audio S3) o <Say> (TTS con variables {{nombre}}, {{saldo}}…)
      → <Gather> DTMF: 1=confirmar, 2=WhatsApp, 3=asesor → acciones registradas
  → Al finalizar: ProcessRecordingJob (descarga → S3, solo metadata en PG)
  → FollowUpRuleEngine evalúa resultado → reintentos / WhatsApp / tarea asesor
  → Broadcast CallUpdated (Reverb) → frontend en tiempo real
```

## 5. Flujo de WhatsApp

```
Saliente:  asesor/campaña/IA → SendWhatsAppMessageJob → WhatsAppProvider->send()
           → message.status = queued → webhook status → sent/delivered/read/failed
Entrante:  webhook /webhooks/twilio/whatsapp (firma + idempotencia)
           → busca/crea conversación por teléfono → guarda mensaje → reabre si estaba cerrada
           → marca ventana 24h → broadcast MessageReceived → bandeja en tiempo real
Plantillas: fuera de ventana 24h solo se permiten plantillas aprobadas.
```

## 6. Flujo conversacional con IA

```
Llamada conversacional → TwiML conecta audio (ConversationRelay/Media Streams en real;
                          sesión simulada por turnos en sandbox)
  → AiConversationService arma el contexto: prompt publicado (versión) + datos del contacto/deuda permitidos
  → Loop: transcripción del usuario → LlmProvider->chat(mensajes, tools)
      tools: obtener_contacto, validar_identidad, consultar_deuda, registrar_acuerdo,
             registrar_observacion, programar_seguimiento, enviar_whatsapp, solicitar_asesor,
             finalizar_llamada, consultar_preguntas_frecuentes  (todas devuelven JSON)
      guardrails: no inventar, no modificar deuda, no descuentos no autorizados,
                  no revelar datos sin validar identidad (enforced en las tools, no solo en el prompt)
  → Al cerrar: genera resultado estructurado {resultado, contactado, identidad_validada,
     fecha_compromiso, monto_comprometido, requiere_asesor, enviar_whatsapp, sentimiento,
     resumen, siguiente_accion} → guarda en call.structured_result
  → Crea acuerdo/seguimiento/WhatsApp según el resultado → auditoría
  → Simulador: POST /api/v1/prompts/{id}/simulate permite chatear con el agente antes de lanzar campaña.
```

## 7. Plan de implementación

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Docker, Postgres, Redis, MinIO, Sanctum, roles/permisos, migraciones, layout base | ✅ |
| 2 | Contactos, deudas, importación Excel/CSV, campañas, segmentación con preview | ✅ |
| 3 | Twilio Voice (adapter+sandbox), audio, TTS, estados, webhooks firmados | ✅ |
| 4 | OpenAI (adapter+mock), prompts versionados, tools, transcripción, resumen, acuerdos | ✅ |
| 5 | WhatsApp, bandeja, plantillas, Reverb tiempo real | ✅ |
| 6 | Motor de seguimientos, reglas, scheduler, automatizaciones | ✅ |
| 7 | Dashboard, reportes, auditoría, costos/límites, pruebas, documentación | ✅ |

## 8. Seguridad

- Sanctum con tokens de API + expiración; rate limiting por ruta (`throttle:api`, login 5/min).
- Validación de firma `X-Twilio-Signature` en todos los webhooks (desactivable solo en sandbox).
- Credenciales de integraciones cifradas con `Crypt` (AES-256-GCM) en `integrations.credentials`.
- Roles y permisos por módulo/acción (spatie/laravel-permission) aplicados vía Policies y middleware.
- Lista de no contactar + consentimientos verificados por el segmentador antes de cada campaña.
- Auditoría de accesos, cambios de deuda/acuerdos/prompts/permisos, escucha y descarga de grabaciones.
- Logs estructurados sin datos sensibles; UUID públicos contra enumeración; soft deletes.
