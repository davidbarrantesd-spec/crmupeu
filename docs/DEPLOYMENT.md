# Despliegue en producción — crmupeu.eventosupeu.com

Arquitectura objetivo:

| Pieza | Servicio | Dominio |
|---|---|---|
| Frontend (React/Vite) | **Vercel** | `crmupeu.eventosupeu.com` |
| Backend API + worker + scheduler + Reverb | **Railway** (4 servicios, misma imagen) | `api.crmupeu.eventosupeu.com` |
| Base de datos | **Neon** (PostgreSQL) | — |
| Colas, caché, sesiones | **Redis** (plugin de Railway) | — |
| Grabaciones y adjuntos | **Cloudflare R2** o S3 | — |

Repositorio: `https://github.com/davidbarrantesd-spec/crmupeu`

---

## 1. Neon (base de datos)

1. Entra a [console.neon.tech](https://console.neon.tech) → **New Project**.
2. Nombre `crmupeu`, región la más cercana (`aws-us-east-1`).
3. Copia la cadena **Pooled connection** (contiene `-pooler`), la que se usa en
   servidores con muchas conexiones cortas.
4. Guárdala; será `DB_URL` en Railway.

> ⚠️ La variable se llama **`DB_URL`**, no `DATABASE_URL`. Laravel lee `env('DB_URL')`
> en `config/database.php`; `DATABASE_URL` es la convención de Heroku/Vercel y Laravel
> la ignora, cayendo al host por defecto `127.0.0.1:5432` (error `Connection refused`).

> Usa siempre la cadena *pooled*. La directa agota conexiones cuando el worker
> y la API corren en paralelo.

---

## 2. Railway (backend)

### 2.1 Crear el proyecto

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
   → selecciona `davidbarrantesd-spec/crmupeu`.
2. En el servicio que crea por defecto, abre **Settings** y ajusta:
   - **Root Directory**: `backend`
   - **Builder**: `Dockerfile`
   - **Service Name**: `api`

### 2.2 Añadir Redis

**New** → **Database** → **Add Redis**. Railway expone `REDIS_URL` automáticamente.

### 2.3 Variables de entorno (servicio `api`)

Pega esto en **Variables** → *Raw Editor*. El `APP_KEY` está en el archivo local
`DEPLOY-VALORES.txt` (fuera de git).

```
APP_NAME=Cobranzas CRM
APP_ENV=production
APP_DEBUG=false
APP_KEY=<el de DEPLOY-VALORES.txt>
APP_URL=https://api.crmupeu.eventosupeu.com
APP_TIMEZONE=America/Lima
APP_LOCALE=es
FRONTEND_URL=https://crmupeu.eventosupeu.com

DB_CONNECTION=pgsql
DB_URL=<cadena pooled de Neon>

REDIS_URL=${{Redis.REDIS_URL}}
QUEUE_CONNECTION=redis
CACHE_STORE=redis
SESSION_DRIVER=redis

BROADCAST_CONNECTION=reverb
REVERB_APP_ID=crmupeu
REVERB_APP_KEY=<inventa una cadena aleatoria>
REVERB_APP_SECRET=<inventa otra cadena aleatoria>
REVERB_HOST=ws.crmupeu.eventosupeu.com
REVERB_PORT=443
REVERB_SCHEME=https

LOG_CHANNEL=stderr
LOG_LEVEL=warning

# Integraciones — empieza en sandbox y cambia cuando tengas credenciales
TELEPHONY_DRIVER=sandbox
WHATSAPP_DRIVER=sandbox
LLM_DRIVER=anthropic
ANTHROPIC_API_KEY=<tu llave de Anthropic>
ANTHROPIC_MODEL=claude-opus-4-8
TWILIO_VALIDATE_SIGNATURE=true

FILESYSTEM_DISK=s3
AWS_ACCESS_KEY_ID=<R2 / S3>
AWS_SECRET_ACCESS_KEY=<R2 / S3>
AWS_DEFAULT_REGION=auto
AWS_BUCKET=crmupeu
AWS_ENDPOINT=<endpoint de R2>
AWS_USE_PATH_STYLE_ENDPOINT=true

CALL_MAX_CONCURRENCY=5
CALL_DAILY_LIMIT=1000
```

### 2.4 Los otros tres servicios

Repite **New** → **GitHub Repo** → mismo repo, tres veces. En cada uno:
Root Directory `backend`, Builder `Dockerfile`, y en **Settings → Deploy →
Custom Start Command** pon:

| Servicio | Start Command |
|---|---|
| `worker` | `php artisan queue:work --tries=3 --backoff=10 --max-time=3600` |
| `scheduler` | `php artisan schedule:work` |
| `reverb` | `php artisan reverb:start --host=0.0.0.0 --port=$PORT` |

En **Variables** de cada uno usa *Shared Variables* o pega las mismas del `api`.
Los servicios `worker` y `scheduler` no necesitan dominio público.

### 2.5 Migraciones (una sola vez)

En el servicio `api`, pestaña **Settings → Deploy → Pre-Deploy Command**:

```
php artisan migrate --force && php artisan db:seed --class=RolePermissionSeeder --force
```

> **No** ejecutes `DemoSeeder` en producción: crea 120 contactos ficticios y la
> cuenta `admin@example.com`. El `RolePermissionSeeder` solo crea roles y permisos.

### 2.6 Crear tu usuario administrador

Una vez desplegado, en la consola de Railway (`api` → **Connect** → shell):

```bash
php artisan tinker --execute="
\$u = App\Models\User::create([
  'name' => 'David Barrantes',
  'email' => 'claudedti.itam@upeu.edu.pe',
  'password' => 'CAMBIA_ESTA_CLAVE',
  'status' => 'active',
]);
\$u->assignRole('Superadministrador');
echo 'usuario creado';
"
```

---

## 3. Vercel (frontend)

1. [vercel.com/new](https://vercel.com/new) → **Import Git Repository** →
   `davidbarrantesd-spec/crmupeu`.
2. **Root Directory**: `frontend` (importante — el repo es un monorepo).
3. Framework: Vite (se autodetecta). El `vercel.json` ya trae el rewrite de SPA.
4. **Environment Variables**:

```
VITE_API_URL=https://api.crmupeu.eventosupeu.com/api/v1
VITE_REVERB_HOST=ws.crmupeu.eventosupeu.com
VITE_REVERB_PORT=443
VITE_REVERB_KEY=<el mismo REVERB_APP_KEY de Railway>
VITE_REVERB_SCHEME=https
```

> `VITE_REVERB_SCHEME=https` es obligatorio en producción: sirve el WebSocket por
> `wss://`. Con `ws://` el navegador lo bloquea por contenido mixto y el tiempo
> real cae al polling de respaldo.

5. **Deploy**.

> Vite embebe estas variables en tiempo de compilación: si cambias una, hay que
> redesplegar (no basta con guardarla).

---

## 4. Dominios

### 4.1 Frontend

En Vercel: **Settings → Domains** → añade `crmupeu.eventosupeu.com`.
Vercel te dará un registro CNAME. En el DNS de `eventosupeu.com`:

```
crmupeu    CNAME    cname.vercel-dns.com.
```

### 4.2 Backend y WebSocket

En Railway, servicio `api` → **Settings → Networking → Custom Domain** →
`api.crmupeu.eventosupeu.com`. Repite en `reverb` con `ws.crmupeu.eventosupeu.com`.
Railway te da un CNAME para cada uno:

```
api    CNAME    <valor que da Railway>.up.railway.app.
ws     CNAME    <valor que da Railway>.up.railway.app.
```

---

## 5. Twilio (cuando actives llamadas reales)

1. Compra un número con capacidad **Voice**.
2. En **Configuración → Integraciones → Twilio** del CRM, pega Account SID,
   Auth Token y el número; pulsa **Verificar**.
3. Cambia en Railway `TELEPHONY_DRIVER=twilio`.
4. Webhook de WhatsApp entrante (cuando lo actives):
   `https://api.crmupeu.eventosupeu.com/api/v1/webhooks/twilio/whatsapp`

Los webhooks de voz se pasan por llamada vía API, no hay que configurarlos en la
consola de Twilio.

---

## 6. Verificación post-despliegue

```bash
# API viva
curl https://api.crmupeu.eventosupeu.com/up

# Login (debe devolver un token)
curl -X POST https://api.crmupeu.eventosupeu.com/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"claudedti.itam@upeu.edu.pe","password":"TU_CLAVE"}'
```

Checklist:

- [ ] `APP_DEBUG=false` en Railway
- [ ] `TWILIO_VALIDATE_SIGNATURE=true`
- [ ] `DemoSeeder` **no** ejecutado en producción
- [ ] Backups automáticos activados en Neon
- [ ] Límites de costo configurados en **Configuración → Costos y límites**
- [ ] Bucket de R2/S3 privado (las grabaciones se sirven con URL firmada)

---

## Costos mensuales estimados

| Servicio | Costo |
|---|---|
| Vercel Hobby | $0 |
| Neon (free tier) | $0 hasta 0.5 GB |
| Railway Hobby (4 servicios + Redis) | ~$5–15 según uso |
| Cloudflare R2 | $0 hasta 10 GB |
| Número Twilio | ~$1 + consumo por minuto |
| Anthropic | por uso |
