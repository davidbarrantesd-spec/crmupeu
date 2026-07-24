# Especificación de integración LAMB → Cobranzas CRM

**Para:** Equipo de desarrollo de LAMB (sistema académico UPeU)
**De:** Cobranzas CRM (crmupeu.eventosupeu.com)
**Versión:** 1.0 — julio 2026

## Resumen

El CRM de Cobranzas consulta a LAMB para mantener sincronizados a los estudiantes y sus
deudas. LAMB solo necesita **exponer 2 endpoints REST de solo lectura**. El CRM los
consume así:

1. **Sincronización incremental** cada 30 minutos: trae solo lo modificado desde la
   última corrida (`updated_since`).
2. **Consulta individual en tiempo real** durante una llamada de cobranza (opcional,
   fase 2): confirma el saldo al momento de hablar con el estudiante.

La llave maestra es **`id_persona`** (identificador único e inmutable de la persona en
LAMB). El CRM nunca escribe en LAMB.

---

## Endpoint 1 — Listado incremental de estudiantes con deuda

```
GET /api/v1/students?updated_since=2026-07-23T15:00:00Z&page=1&per_page=200
Authorization: Bearer <token>
Accept: application/json
```

| Parámetro | Tipo | Descripción |
|---|---|---|
| `updated_since` | ISO-8601, opcional | Solo registros cuya deuda o datos cambiaron después de esta fecha. Sin él: dump completo (primera carga) |
| `page` / `per_page` | int | Paginación estándar (per_page máx. 500) |

**Importante:** un estudiante debe aparecer en la respuesta cuando cambie CUALQUIERA de:
sus datos personales, su matrícula, una deuda (nueva, pagada, monto), para que el CRM
capte los pagos y deje de llamar a quien ya pagó.

### Respuesta (200)

```json
{
  "data": [
    {
      "id_persona": "P0012345",
      "codigo_estudiante": "202112345",
      "dni": "71234567",
      "nombres": "Juan Carlos",
      "apellidos": "Quispe Mamani",
      "celular": "+51987654321",
      "email": "juan.quispe@upeu.edu.pe",
      "campus":   { "code": "LIM", "name": "Lima" },
      "facultad": { "code": "FIA", "name": "Facultad de Ingeniería y Arquitectura" },
      "carrera":  { "code": "EP-SIS", "name": "Ingeniería de Sistemas" },
      "nivel": "Pregrado",
      "modalidad": "presencial",
      "estado_matricula": "matriculado",
      "deudas": [
        {
          "codigo": "PEN-2026-1-000123",
          "concepto": "Pensión de enseñanza marzo 2026",
          "monto_original": 450.00,
          "saldo_pendiente": 450.00,
          "moneda": "PEN",
          "fecha_vencimiento": "2026-03-15",
          "periodo": "2026-1",
          "estado": "overdue",
          "fecha_pago": null
        }
      ],
      "updated_at": "2026-07-23T14:55:02Z"
    }
  ],
  "meta": { "current_page": 1, "last_page": 12, "total": 2350 }
}
```

### Tipos y valores exactos

| Campo | Tipo | Reglas |
|---|---|---|
| `id_persona` | string ≤40 | **Obligatorio, único por persona, inmutable** |
| `codigo_estudiante` | string ≤40 | Puede cambiar entre matrículas |
| `dni` | string ≤20 | |
| `celular` | string | Formato internacional preferido (`+51...`); el CRM normaliza |
| `campus.code` / `facultad.code` / `carrera.code` | string ≤80 | Códigos estables de LAMB (el CRM crea/actualiza sus catálogos con ellos) |
| `nivel` | string | `Pregrado`, `Maestría`, `Doctorado`, u otros (catálogo abierto) |
| `modalidad` | string | `presencial` \| `semipresencial` \| `virtual` |
| `estado_matricula` | string | `matriculado` \| `no_matriculado` |
| `deudas[].codigo` | string ≤60 | **Único por estudiante e inmutable** (llave de upsert de la deuda) |
| `deudas[].periodo` | string | Formato `AAAA-S`: `2026-1`, `2025-2` |
| `deudas[].estado` | string | `pending` \| `overdue` \| `partial` \| `paid` \| `refinanced` \| `cancelled` |
| `deudas[].fecha_pago` | date/null | **Fecha en que quedó pagada** — imprescindible para clasificar el comportamiento de pago |
| montos | decimal(12,2) | Punto decimal, sin separador de miles |

Incluir **también las deudas pagadas de los últimos 4 ciclos** (no solo las pendientes):
el CRM las usa para clasificar a los estudiantes como buen pagador / pagador tardío.

---

## Endpoint 2 — Consulta individual en tiempo real (fase 2)

```
GET /api/v1/students/{id_persona}
Authorization: Bearer <token>
```

Misma estructura que un elemento de `data` del endpoint 1. Requisito de latencia:
**responder en < 500 ms**, porque se consulta en medio de una llamada telefónica.
404 si el `id_persona` no existe.

---

## Seguridad (requisitos no negociables)

1. **HTTPS** obligatorio.
2. **Token Bearer** de al menos 64 caracteres aleatorios, rotable. Se intercambia una
   sola vez por canal seguro y el CRM lo guarda cifrado.
3. **Solo lectura**: estos endpoints jamás modifican datos de LAMB. Ideal: usuario de BD
   de solo lectura sobre una vista dedicada (p. ej. `VW_DEUDAS_COBRANZA`).
4. **Mínimo dato**: solo los campos listados arriba. Sin historial académico, notas ni
   datos familiares.
5. **Rate limiting**: 120 req/min es más que suficiente para el CRM.
6. **Log de auditoría**: registrar token, IP, fecha y parámetros de cada consulta.
7. Recomendado: publicar detrás de **Cloudflare Tunnel + Service Token** para no abrir
   ningún puerto en el firewall (el CRM corre fuera de la red UPeU). Alternativa: DMZ
   con allowlist.

---

## Configuración del lado CRM (referencia)

El CRM ya tiene todo listo; cuando LAMB esté disponible solo se configuran dos
variables y la sincronización arranca sola cada 30 minutos:

```
LAMB_API_URL=https://lamb.upeu.edu.pe/api/v1
LAMB_API_TOKEN=<token>
```

Comandos: `php artisan crm:sync-lamb` (incremental) · `php artisan crm:sync-lamb --full`
(carga completa inicial). Tras cada sincronización el CRM recalcula automáticamente los
segmentos de comportamiento de pago.

Mientras LAMB no exista, el CRM opera con importación manual Excel/CSV usando la misma
estructura (plantilla descargable en la pantalla Importar).

## Contacto técnico

Dudas sobre esta especificación: David Barrantes (DTI) — davidbarrantes@upeu.edu.pe
