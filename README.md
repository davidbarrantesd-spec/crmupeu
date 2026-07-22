# Cobranzas CRM — Plataforma omnicanal de llamadas y WhatsApp

CRM especializado en cobranzas: campañas de llamadas automáticas (audio grabado, texto a voz, IVR y
**llamadas conversacionales con IA**), acuerdos de pago, motor de seguimientos y bandeja de WhatsApp
integrada, con auditoría completa, control de costos y roles/permisos granulares.

| Componente | Stack |
|---|---|
| Backend | Laravel 12 · PHP 8.4+ · Sanctum · Reverb · Queues (Redis) · Scheduler |
| Frontend | React + TypeScript + Vite · TanStack Query · Zustand · Tailwind + shadcn-style · Recharts |
| Base de datos | PostgreSQL 16 (compatible Neon) · UUID públicos · soft deletes · auditoría |
| Infra | Redis · MinIO/S3/R2 · Twilio (voz + WhatsApp) · Anthropic Claude / OpenAI · Docker Compose |

## Arranque rápido (local)

Requisitos: PHP 8.4+, Composer, Node 20+, Docker.

```bash
# 1. Infraestructura (Postgres :5434, Redis :6380, MinIO :9100)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # ya viene apuntando a los puertos del compose
composer install
php artisan key:generate
php artisan migrate --seed    # crea roles, permisos y datos demo
php artisan serve --port=8010

# 3. Worker de colas + scheduler + websockets (terminales separadas)
php artisan queue:work
php artisan schedule:work
php artisan reverb:start --port=8081

# 4. Frontend
cd ../frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

**Cuenta demo (solo local):** `admin@example.com` / `Password123!`
(también: supervisor@, asesor@, auditor@ — misma contraseña).

## Modo sandbox (sin credenciales reales)

Sin credenciales de Twilio/OpenAI el sistema arranca con drivers simulados que reproducen el ciclo
completo: las llamadas pasan por marcando → sonando → contestada/no contesta/ocupado, generan
grabación (subida a MinIO), transcripción, resumen, DTMF simulado y disparan las reglas de
seguimiento; los WhatsApp pasan por enviado → entregado → leído y ~45% recibe respuesta entrante
simulada; el agente de IA usa un driver mock determinístico con las mismas 10 tools y guardrails.

Para producción, configure las credenciales en **Configuración → Integraciones** (se cifran en BD)
o vía variables de entorno, y cambie `TELEPHONY_DRIVER/WHATSAPP_DRIVER=twilio`,
`LLM_DRIVER=anthropic` (Claude, con `ANTHROPIC_API_KEY`; modelo por defecto `claude-opus-4-8`)
u `openai`, y `TWILIO_VALIDATE_SIGNATURE=true`.

## Pruebas

```bash
cd backend
php artisan test    # 34 pruebas: auth, permisos, contactos, campañas, webhooks, acuerdos, IA, importación
```

Usa la BD `cobranzas_test` (creada en el Postgres del compose) con drivers sandbox/mock.

## Estructura

```
cobranzas-crm/
├── docker-compose.yml     # postgres, redis, minio (+ buckets)
├── docs/                  # ARCHITECTURE, API, DATABASE, DEPLOYMENT, manuales, openapi.yaml
├── backend/               # Laravel 12 (Dockerfile multi-target: web|worker|scheduler|reverb)
│   ├── app/Models         # 27 modelos con UUID + Auditable
│   ├── app/Services       # Campaigns, Calls, Ai, WhatsApp, FollowUps, Contacts, Reports, Settings
│   ├── app/Integrations   # Telephony/Messaging/Llm: interfaz + driver real + driver sandbox
│   ├── app/Jobs           # 13 jobs con reintentos, backoff, locks e idempotencia
│   └── routes/api.php     # /api/v1 completo (ver docs/API.md)
└── frontend/              # React + Vite (Dockerfile nginx para despliegue estático)
```

## Documentación

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — arquitectura, flujos de llamada/WhatsApp/IA
- [docs/API.md](docs/API.md) — contrato completo de la API REST v1
- [docs/DATABASE.md](docs/DATABASE.md) — diagrama ER y convenciones
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — despliegue en Vercel + Railway/Render + Neon
- [docs/MANUAL_TECNICO.md](docs/MANUAL_TECNICO.md) · [docs/MANUAL_USUARIO.md](docs/MANUAL_USUARIO.md)
- [docs/openapi.yaml](docs/openapi.yaml) — especificación OpenAPI
