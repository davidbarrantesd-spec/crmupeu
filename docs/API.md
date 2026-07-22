# API REST — /api/v1

Base local: `http://localhost:8010/api/v1`. Autenticación: `Authorization: Bearer <token>` (Sanctum).

## Convenciones
- Respuestas de recurso: `{ "data": {...} }`. Listados paginados: `{ "data": [...], "links": {...}, "meta": {current_page, last_page, per_page, total} }`.
- Errores de validación: HTTP 422 `{ "message": "...", "errors": { campo: ["..."] } }`. No autenticado: 401. Sin permiso: 403.
- Identificadores públicos: siempre `uuid` en URLs.
- Filtros por query string; paginación `?page=&per_page=`; búsqueda `?search=`.

## Auth
| Método | Ruta | Body / Notas |
|---|---|---|
| POST | /auth/login | `{email, password}` → `{data:{token, user}}` (user incluye `roles[]`, `permissions[]`) |
| POST | /auth/logout | revoca token |
| GET | /auth/me | usuario actual con roles/permisos |
| POST | /auth/forgot-password | `{email}` |
| POST | /auth/reset-password | `{email, token, password, password_confirmation}` |
| PUT | /auth/password | `{current_password, password, password_confirmation}` |

## Usuarios y roles
- `GET/POST /users`, `GET/PUT/DELETE /users/{uuid}` — campos: name, email, phone, password, status(active|inactive), roles[]
- `GET /roles` — lista con `permissions[]`; `POST /roles`, `PUT /roles/{id}` `{name, permissions:[]}`; `GET /permissions` lista completa agrupada por módulo.

## Contactos
- `GET /contacts` — filtros: `search, status, segment, city, tag, do_not_contact, has_debt, sort`
- `POST /contacts`, `GET/PUT/DELETE /contacts/{uuid}`
- `GET /contacts/{uuid}/timeline` — línea de tiempo unificada `[{type: call|agreement|message|follow_up|note|debt, at, title, description, meta}]`
- `POST /contacts/{uuid}/tags` `{tags:[names]}`; `POST /contacts/{uuid}/notes` `{body}`
- `POST /contacts/{uuid}/merge` `{duplicate_uuid}` — unifica duplicados
- `GET /contacts/duplicates` — grupos de posibles duplicados
- `POST /contacts/export` — descarga CSV
- Campos contacto: internal_code, first_name, last_name, dni, phone, phone_secondary, email, city, address, status, source, segment, call_consent, whatsapp_consent, do_not_contact, do_not_contact_reason, tags[], debts[] (en show)

## Deudas
- `GET /debts` — filtros: `search, status, contact, overdue, min_balance, max_balance, due_before, due_after`
- `POST /debts` (requiere contact_uuid), `GET/PUT/DELETE /debts/{uuid}`

## Importación
- `POST /imports` multipart `{file, type: contacts|debts}` → devuelve `{data:{uuid, headers:[], preview:[[..5 filas]], suggested_mapping:{}}}`
- `POST /imports/{uuid}/mapping` `{column_mapping:{colName: field}}` → valida y encola procesamiento
- `GET /imports` y `GET /imports/{uuid}` — progreso `{status, total_rows, processed_rows, created_count, updated_count, failed_count, duplicate_count}`
- `GET /imports/{uuid}/errors` — filas fallidas (descargable CSV con `?download=1`)

## Campañas
- `GET /campaigns` filtros `status, type, search`; `POST /campaigns`; `GET/PUT/DELETE /campaigns/{uuid}`
- `POST /campaigns/preview-segment` `{segment_filters}` → `{data:{count, sample:[10 contactos]}}`
- Acciones: `POST /campaigns/{uuid}/launch | pause | resume | cancel | schedule {starts_at} | duplicate | test {contact_uuid}`
- `GET /campaigns/{uuid}/progress` → `{total, pending, in_progress, completed, contacted, failed, answered_rate, estimated_cost}`
- `GET /campaigns/{uuid}/contacts` (pivot con intentos/resultado); `POST /campaigns/{uuid}/contacts {contact_uuids:[]}`; `DELETE /campaigns/{uuid}/contacts/{contact_uuid}`
- `POST /campaigns/{uuid}/audio` multipart `{file}` (mp3/wav) → sube a S3
- segment_filters (jsonb): `{min_debt, max_debt, min_days_overdue, debt_status[], city[], segment[], tags[], consent_required, exclude_broken_agreements, max_attempts_lt, previous_campaign_uuid, previous_result[]}`
- dtmf_options: `{"1": {action:"confirm"}, "2": {action:"send_whatsapp", template_uuid}, "3": {action:"transfer_advisor"}, repeat_key:"9", record_response:false}`

## Llamadas
- `GET /calls` filtros `status, result, type, campaign, contact, date_from, date_to, search`
- `GET /calls/{uuid}` — incluye events[], recordings[], transcription, summary, structured_result, ai_session
- `POST /calls` — llamada manual `{contact_uuid, type: recorded_audio|tts|ai_conversational|manual, campaign_uuid?, tts_message?, audio_url?, prompt_version_uuid?}`
- `POST /calls/{uuid}/cancel`
- `GET /calls/{uuid}/recording-url` — URL firmada (audita escucha)

## Prompts IA
- `GET/POST /prompts`, `GET/PUT/DELETE /prompts/{uuid}`
- `POST /prompts/{uuid}/versions` (nueva versión), `POST /prompts/{uuid}/versions/{version}/publish`, `.../restore`
- `POST /prompts/{uuid}/duplicate`
- `POST /prompts/{uuid}/simulate` `{session_uuid?, message, contact_uuid?}` → `{data:{session_uuid, reply, tool_calls:[], finished, structured_result?}}` — simulador de conversación
- Version: system_prompt, instructions, greeting_message, farewell_message, variables{}, enabled_tools[], guardrails{forbidden_data[], security_rules[]}, faq[{q,a}], extraction_fields[], max_duration_seconds

## Acuerdos
- `GET /agreements` filtros `status, contact, date_from, date_to, promise_date_from, promise_date_to`
- `POST /agreements` `{contact_uuid, debt_uuid?, call_uuid?, type, amount, promise_date, description}`
- `PUT /agreements/{uuid}` (cambio estado con `status` + `observations`)

## Seguimientos
- `GET /follow-ups` filtros `status, type, assigned_to, date_from, date_to, priority`
- `POST /follow-ups`, `PUT /follow-ups/{uuid}` (completar: `{status:'done', result, notes}`)
- `GET/POST /follow-up-rules`, `PUT/DELETE /follow-up-rules/{uuid}` — `{name, trigger_event, action, delay_minutes, config, campaign_uuid?, active}`

## WhatsApp
- `GET /conversations` filtros `status, assigned_to, search, unread`
- `GET /conversations/{uuid}` — incluye contact con debts/agreements resumen, `within_24h_window`
- `GET /conversations/{uuid}/messages?before=` (paginado hacia atrás)
- `POST /conversations/{uuid}/messages` `{body}` o `{template_uuid, variables{}}` o multipart `{file}`
- Acciones: `POST /conversations/{uuid}/assign {user_uuid}` | `/close` | `/reopen` | `/read` | `PUT` `{priority}`
- `POST /conversations` `{contact_uuid, template_uuid, variables}` — iniciar conversación
- `GET/POST/PUT/DELETE /whatsapp-templates`; `GET/POST/PUT/DELETE /templates` (TTS/textos, type: tts|whatsapp_text)

## Dashboard y reportes
- `GET /dashboard` → `{data:{kpis:{total_contacts,total_debt,active_campaigns,calls_scheduled,calls_made,calls_answered,calls_missed,agreements_total,agreements_fulfilled,agreements_broken,whatsapp_sent,whatsapp_replied,pending_conversations,estimated_cost,contact_rate,conversion_rate,estimated_recovery}, charts:{calls_by_day:[],results_by_campaign:[],agreements_by_status:[],messages_by_day:[],funnel:[],hourly_answer_rate:[]}}}`
- `GET /reports/calls|agreements|campaigns|advisors` — filtros + `?export=csv|xlsx`
- `GET /audit-logs` filtros `user, module, action, date_from, date_to`

## Configuración
- `GET /settings`, `PUT /settings` `{settings:{key:value}}`
- `GET /integrations` (credenciales enmascaradas + status sandbox|active), `PUT /integrations/{provider}` `{credentials{}, config{}}`, `POST /integrations/{provider}/verify`
- `GET /costs/summary?date_from&date_to&campaign` → totales por tipo/día

## Webhooks (Twilio → backend, sin auth Bearer; firma validada)
- `POST /webhooks/twilio/voice/status`, `/voice/answer/{call_uuid}`, `/voice/gather/{call_uuid}`, `/voice/recording`
- `POST /webhooks/twilio/whatsapp` (entrantes), `/whatsapp/status`

## Tiempo real (Laravel Reverb, protocolo Pusher)
- ws://localhost:8081, key `cobranzas-key`. Auth endpoint: `/broadcasting/auth` (Bearer).
- Canales privados: `private-calls` (`CallUpdated`), `private-conversations` (`MessageReceived`, `MessageStatusUpdated`, evento incluye conversation resumida), `private-campaigns.{uuid}` (`CampaignProgressUpdated`).
