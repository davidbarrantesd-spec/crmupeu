# Manual técnico

## Ciclo de vida de una campaña de llamadas

1. **Creación** (`POST /campaigns`): la campaña nace en `draft` con `segment_filters` (jsonb).
2. **Vista previa** (`POST /campaigns/preview-segment`): `SegmentationService` construye la query
   (siempre excluye sin consentimiento, no-contactar, teléfono inválido) y devuelve conteo + muestra.
3. **Lanzamiento** (`POST /campaigns/{uuid}/launch` o scheduler al llegar `starts_at`):
   - `LaunchCampaignJob` materializa el segmento en `campaign_contacts` (upsert idempotente).
   - `crm:tick` (scheduler, cada minuto) despacha `DispatchCampaignCallsJob` por campaña `running`.
4. **Despacho** (`DispatchCampaignCallsJob`, lock Redis por campaña):
   - valida horario/días permitidos, presupuesto (`isOverBudget` → pausa), límites (`CostGuard`);
   - calcula slots libres = min(concurrencia global, de campaña) − llamadas activas;
   - toma pendientes (o reintentos con `next_attempt_at` vencido y `attempts < max_attempts`);
   - crea `calls` + `PlaceCallJob` (lock por llamada).
5. **Llamada**: `TelephonyProvider->placeCall()` (Twilio real o Sandbox). Twilio pide el TwiML a
   `/webhooks/twilio/voice/answer/{uuid}` (`TwimlBuilder`: Play/Say/Gather/ConversationRelay) y
   notifica estados a `/voice/status` (idempotencia por `sid:estado`).
6. **Cierre** (`ProcessCallResultJob`): costo (`cost_entries` + acumulado campaña), pivot de campaña
   (contacted / reintento con `next_attempt_at`), `FollowUpRuleEngine.handleCallResult()`, acciones
   post-llamada (WhatsApp), broadcast Reverb.
7. **Post-proceso**: `ProcessRecordingJob` (S3 + metadata) → `TranscribeCallJob` → `SummarizeCallJob`.
8. **Fin**: sin pendientes ni activos → `finished`.

## Motor conversacional (IA)

- `AiConversationService.startSession()` arma el system prompt: prompt publicado + contexto del
  contacto + reglas obligatorias (los guardrails también se aplican en código, ver abajo).
- `turn()` ejecuta el loop tool-calling (máx. 5 rondas): `LlmProvider->chat(messages, tools)` →
  ejecuta cada tool con `AgentToolExecutor` → realimenta resultados → respuesta final.
- **Guardrails en código** (no confían en el prompt):
  - `consultar_deuda`/`registrar_acuerdo` fallan sin `identidad_validada`;
  - `enviar_whatsapp` falla sin consentimiento del contacto;
  - no existe ninguna tool que modifique montos de deuda ni aplique descuentos;
  - `consultar_preguntas_frecuentes` solo devuelve respuestas autorizadas del prompt.
- `finalizar_llamada` congela el resultado estructurado estándar (resultado, contactado,
  identidad_validada, fecha/monto compromiso, requiere_asesor, enviar_whatsapp, sentimiento,
  resumen, siguiente_accion) y se copia a `calls.structured_result`.
- **Simulador**: mismas rutas de código con `ai_sessions.mode=simulation` (no persiste acuerdos
  reales); usado por `POST /prompts/{uuid}/simulate`.
- En producción con Twilio real, la voz fluye por **ConversationRelay** (WebSocket) — el TwiML ya
  se genera; el handler WS es el punto de extensión pendiente de infraestructura (requiere host WS
  público). En sandbox la conversación se simula por turnos completos.

## Motor de seguimientos

`follow_up_rules` (globales o por campaña; las de campaña tienen prioridad) mapean
`trigger_event` → `action` → `delay_minutes`. Triggers: call_no_answer, call_busy, call_failed,
payment_promise, agreement_broken, dtmf_whatsapp, dtmf_advisor, max_attempts. El scheduler
(`crm:tick`) ejecuta los seguimientos automáticos vencidos (`ProcessFollowUpJob`), marca acuerdos
vencidos como `broken` (dispara sus reglas) e inicia campañas programadas.

## Colas y confiabilidad

- Todos los jobs: `tries` + `backoff` + locks Redis (`Cache::lock`) contra doble ejecución.
- Webhooks: tabla `webhook_events` con `idempotency_key` unique; eventos duplicados no se reprocesan.
- Estados de mensaje nunca retroceden (read no vuelve a delivered).
- Fallos definitivos quedan en `failed_jobs` (`queue:prune-failed` semanal); reintentar con
  `php artisan queue:retry`.

## Puntos de extensión

- **LAMB u otro sistema institucional**: implementar un `DebtSyncService` que escriba en `debts`
  vía el mismo camino que `ProcessImportJob::importDebt()` y registre en `debt_sync_logs`.
- **Meta Cloud API** en lugar de Twilio WhatsApp: nueva implementación de `WhatsAppProvider`.
- **Otro LLM**: nueva implementación de `LlmProvider` (interfaz de 3 métodos).
- Los drivers se resuelven en `IntegrationManager` (BD cifrada > env > sandbox).

## Comandos útiles

```bash
php artisan crm:tick          # ejecutar un ciclo del orquestador manualmente
php artisan queue:work        # worker
php artisan queue:failed      # ver fallos
php artisan test              # suite completa
```
