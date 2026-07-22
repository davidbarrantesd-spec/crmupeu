# Despliegue en producción

## Topología recomendada

| Pieza | Servicio | Notas |
|---|---|---|
| Frontend | **Vercel** | build estático Vite; `VITE_API_URL` apunta al backend |
| Backend API | **Railway / Render** (o servidor propio) | imagen `backend/Dockerfile` target `web` |
| Worker de colas | Railway/Render (2º servicio, misma imagen, target `worker`) | obligatorio para llamadas y WhatsApp |
| Scheduler | 3er servicio target `scheduler` (o cron `php artisan schedule:run` cada minuto) | orquesta campañas/seguimientos |
| Reverb (WebSockets) | 4º servicio target `reverb` (o Pusher como alternativa) | exponer wss:// |
| PostgreSQL | **Neon** | usar el **pooled connection string** (pgbouncer) en `DATABASE_URL` |
| Redis | Upstash / Railway Redis | colas, caché, locks |
| Archivos | Cloudflare R2 o S3 | bucket para grabaciones/audios/adjuntos |

## Pasos

### 1. Neon
1. Crear proyecto → copiar cadena pooled (`...-pooler.neon.tech`).
2. En el backend: `DB_CONNECTION=pgsql` + `DATABASE_URL=postgres://...` (o variables sueltas) y `sslmode=require`.
3. `php artisan migrate --force` y `php artisan db:seed --class=RolePermissionSeeder --force`
   (NO ejecutar DemoSeeder en producción; crear el primer usuario con tinker o un seeder propio).

### 2. Backend (Railway/Render)
Variables mínimas:
```
APP_ENV=production  APP_DEBUG=false  APP_KEY=(php artisan key:generate --show)
APP_URL=https://api.midominio.com   FRONTEND_URL=https://crm.midominio.com
DATABASE_URL=...    REDIS_URL=...
QUEUE_CONNECTION=redis  CACHE_STORE=redis  SESSION_DRIVER=redis
TELEPHONY_DRIVER=twilio  WHATSAPP_DRIVER=twilio  LLM_DRIVER=openai
TWILIO_ACCOUNT_SID=...  TWILIO_AUTH_TOKEN=...  TWILIO_PHONE_NUMBER=+1...
TWILIO_WHATSAPP_FROM=whatsapp:+1...  TWILIO_VALIDATE_SIGNATURE=true
OPENAI_API_KEY=...  OPENAI_MODEL=gpt-4o
FILESYSTEM_DISK=s3  AWS_* (credenciales R2/S3)  AWS_ENDPOINT=https://<r2>
REVERB_* (host público wss)
```
Desplegar 4 servicios desde la misma imagen con targets web/worker/scheduler/reverb.

### 3. Twilio
- Voice → en el número: sin webhook entrante necesario (las llamadas son salientes; los webhooks
  answer/status/recording se pasan por llamada vía API).
- Messaging/WhatsApp sender → webhook entrante: `https://api.midominio.com/api/v1/webhooks/twilio/whatsapp`
  y status callback: `.../webhooks/twilio/whatsapp/status`.
- Mantener `TWILIO_VALIDATE_SIGNATURE=true` (valida `X-Twilio-Signature` en todos los webhooks).

### 4. Vercel (frontend)
```
cd frontend && vercel --prod
# Variables: VITE_API_URL=https://api.midominio.com/api/v1
#            VITE_REVERB_HOST=reverb.midominio.com  VITE_REVERB_PORT=443  VITE_REVERB_KEY=...
```
SPA fallback: agregar `vercel.json` con rewrite `{"source": "/(.*)", "destination": "/index.html"}`.

### 5. Checklist de producción
- [ ] HTTPS en API y frontend; CORS restringido a `FRONTEND_URL`.
- [ ] `APP_DEBUG=false`; logs estructurados sin datos sensibles.
- [ ] Rotar `APP_KEY`/tokens según política; credenciales de integraciones solo cifradas en BD.
- [ ] Límites configurados: presupuesto mensual, llamadas diarias, concurrencia.
- [ ] Retención de grabaciones configurada y bucket privado (URLs firmadas).
- [ ] Backups de Neon activados.
