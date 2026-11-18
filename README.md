# Vincimia Agenda — MVP

Gestión inteligente de citas con **motor anti-empalmes**: una sola agenda
que unifica Google Calendar, promotores por Google Sheets y link público de
reserva. Ninguna cita se guarda si choca con otra, considerando el buffer
configurable (15 min por defecto).

**Stack:** Next.js 14 + TypeScript + Tailwind CSS + Supabase + Cloudflare
Pages + GitHub. El mismo stack del POS de EL RODEO.
**Costo al inicio:** $0 (planes gratis de Supabase y Cloudflare).

> Nombre definitivo: **Vincimia Agenda** (se propuso "Vincimia Asistente
> Virtual" y Salvador lo corrigió: le gusta más Vincimia Agenda).
> **Vincimia IA** (app de contenido con IA) fue discontinuada por decisión
> de Salvador el 2026-11-18: su repo viejo (Vincimia-ia) y su proyecto
> Supabase viejo (vincimia-ia) se están borrando. Este proyecto es limpio:
> no reutiliza sus tablas ni su código. Solo se conserva su correo maestro
> **iavincimia@gmail.com**, que se reutiliza aquí para las llaves y, si hace
> falta, como cuenta secundaria de Google Calendar.

## Qué hace este MVP (alcance recortado)

| Pantalla / pieza | Qué hace |
|---|---|
| **Agenda** (`/dashboard`) | Agenda unificada del día, con alerta de conflictos, Confirmar, Check-in (completed) y Cancelar. |
| **Nueva cita** (`/dashboard/nueva`) | Crea cita validando el anti-empalme. Si choca, NO se guarda: muestra con quién choca y ofrece guardarla como `conflict`. |
| **Promotores** (`/dashboard/promotores`) | Alta de promotores y liquidación: comisiones **solo sobre citas `completed`**, con `commission_rate` en %. |
| **Servicios** (`/dashboard/servicios`) | Alta/baja de servicios; la duración es la que usa el anti-empalme. |
| **Conectores** (`/dashboard/conectores`) | Estado real: Google Calendar **pendiente**, Sheets **listo**, WhatsApp **Fase 2**. |
| **Link público** (`/dashboard/link`) | Link `vincimia.link/slug`, copiar, y editor del buffer (5/10/15/30 min). |
| **Reserva pública** (`/reserva/[slug]`) | El cliente elige servicio, fecha y solo ve horarios libres. Crea la cita en `pending` y el contacto si no existe. |
| **Webhook Sheets** (`/api/webhook/sheets`) | Recibe filas de Google Sheets con secreto Bearer, corre el anti-empalme en Supabase y responde `success` o `conflict`. |
| **Edge Function** (`supabase/functions/sync-excel-promoter`) | Misma lógica del webhook, para quien prefiera que viva en Supabase. Usa una u otra, no las dos. |

### Flujo de estados

```
pending → confirmed → completed (check-in en recepción)
   ↘ cancelled / conflict
```

Las comisiones se liquidan **solo** sobre `completed`. Las citas en
`conflict` o `cancelled` no bloquean horarios ni generan comisión.

### Motor anti-empalmes (la regla central)

Una cita nueva choca si su intervalo `[inicio, fin + buffer)` se traslapa
con el de una cita existente en estado `pending`, `confirmed` o
`completed`. La misma función vive en `src/lib/anti-overlap.ts` y la usan
la Agenda, Nueva cita, el link público y el webhook de Sheets.

Ejemplo con los datos de prueba: Laura Méndez 10:00, 60 min (hasta 11:00)
+ 15 min de buffer = ocupada hasta las 11:15. Una cita a las 10:15 choca.

## Piloto: las clínicas de Salvador (decisión 2026-11-18)

Vincimia Agenda se queda como **SaaS aparte para vender a otras clínicas**.
El ERP dental solo la usará como su motor de agenda, **sin mezclar los
códigos**, y solo después de que Agenda esté terminada. Las clínicas de
Salvador son el piloto: ahí se prueban el anti-empalme, la unificación con
Google Calendar y las citas de promotores antes de venderlo a otros.

## Probar en tu computadora (5 minutos, sin cuentas)

```bash
cd vincimia-agenda
npm install
npm run dev
```

Abre http://localhost:3000. Entra a **Ver la agenda demo**: verás la
Clínica Dental Sonrisa (Org #1) con 5 citas de hoy, incluido el conflicto
de Luis Soto 10:15.

**Pruebas que conviene hacer:**

1. En **Nueva cita**, crea Consulta General hoy a las 10:00 o 10:15 →
   debe bloquearse y mostrar el conflicto con Laura Méndez.
2. Guárdala como conflicto → aparece en rojo en la Agenda y no genera
   comisión en Promotores.
3. En **Agenda**, confirma la cita de Sofía Castro 11:30 y hazle
   Check-in → pasa a completada.
4. En **Promotores**, Carlos M. solo cobra por las completadas.
5. Abre **/reserva/clinica-sonrisa** → los horarios 10:00 y 10:30 no
   aparecen libres; reserva a las 13:30 y verás que nace en pendiente.
6. En **Conectores**, pulsa **Probar webhook** con la cita 10:00 →
   debe responder conflicto (con Supabase) o 503 honesto (sin Supabase).

Los datos demo viven solo en tu navegador (localStorage) y se regeneran
cada día. Botón **Restablecer demo** en la Agenda para volver a empezar.

## Ponerlo en vivo

### Paso 1 — Supabase (la base de datos)

1. Entra a https://supabase.com con el correo maestro **iavincimia@gmail.com**
   y crea un proyecto nuevo llamado **`vincimia-agenda`** (nombre limpio,
   distinto del proyecto viejo `vincimia-ia` que se está borrando).
2. Espera a que diga Healthy. Entra a **SQL Editor → New query**.
3. Abre `supabase/schema.sql`, cópialo **todo** y pégalo. Pulsa **Run**.
   Crea las tablas `organizations`, `memberships`, `promoters`,
   `services`, `contacts` y `appointments`, con **RLS activado**, y
   siembra la Org #1 con sus datos de ejemplo para hoy.
4. Copia tus llaves en **Settings → API**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - anon public → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role (secreta, pulsa Reveal) → `SUPABASE_SERVICE_ROLE_KEY`
5. El secreto del webhook está en la tabla `organizations`, columna
   `excel_webhook_secret`. Cópialo para el script de Sheets (paso 5).
   Para rotarlo: `UPDATE organizations SET excel_webhook_secret =
   gen_random_uuid()::text WHERE slug = 'clinica-sonrisa';`

### Paso 2 — GitHub

```bash
git init
git add .
git commit -m "Vincimia Agenda MVP"
git branch -M main
git remote add origin https://github.com/salvadordominguezcc-cyber/Vincimia-agenda.git
git push -u origin main
```

### Paso 3 — Cloudflare Pages (el link público)

1. https://dash.cloudflare.com → **Workers & Pages → Create → Pages →
   Connect to Git**. Elige el repo, rama `main`.
2. **Build command:** `npm run build:cloudflare`.
   **Build output directory:** `.vercel/output/static`.
3. En **Environment variables** (Production) pega:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (secreta, solo la ve el servidor)
   - `NEXT_PUBLIC_SITE_URL` = `https://vincimia-agenda.pages.dev`
4. **Settings → Functions → Compatibility Flags:** activa
   `nodejs_compat` para Production y Preview (también está en
   `wrangler.toml`).
5. Pulsa **Save and Deploy**. Link: `https://vincimia-agenda.pages.dev`.

El dominio `vincimia.link/slug` del Documento Maestro es el dominio
público previsto; hoy el link funciona con `.pages.dev`. Para usarlo hay
que comprar el dominio y apuntarlo a Cloudflare.

### Paso 4 — Probar en vivo

1. Abre tu link → **Agenda** → las 5 citas de ejemplo deben aparecer.
2. Crea una cita a las 10:15 → debe bloquearse.
3. Reserva desde `/reserva/clinica-sonrisa` → nace en pendiente.

### Paso 5 — Conectar Google Sheets (promotores)

1. En la hoja de promotores: **Extensiones → Apps Script**.
2. Pega todo el archivo `scripts/apps-script-sheets.gs`.
3. Cambia las 3 constantes: `SUPABASE_WEBHOOK_URL` (tu link
   `.pages.dev/api/webhook/sheets`), `API_SECRET_KEY` (el
   `excel_webhook_secret` de Supabase) y `ORGANIZATION_ID`.
4. Guarda y escribe una fila: Fecha | Hora | Cliente | Teléfono |
   Promotor. La columna Estado se llena sola: 🟢 Confirmado o
   ⚠️ Conflicto.

## Conectar Google Calendar (Fase 1 completa, pendiente)

Hoy la pestaña **Conectores** dice la verdad: **pendiente, sin token**.
Falta:

1. Proyecto en Google Cloud con la Calendar API activada.
2. OAuth con `prompt: 'select_account'` para elegir la cuenta secundaria
   (correo maestro **iavincimia@gmail.com**, si hace falta) sin cerrar la
   sesión principal.
3. Guardar el `refresh_token` en `organizations.google_refresh_token` y
   poner `google_calendar_sync = true`.
4. Sincronizar en ambos sentidos (leer eventos manuales, escribir las
   citas aprobadas). La ruta `/api/google-calendar/status` ya responde el
   estado real desde Supabase.

## Fuera del MVP — Fase 2 (pendiente, no simulado)

- **Bot de WhatsApp IA** y confirmación automática por WhatsApp.
  Ninguna cita se marca como confirmada por WhatsApp en este MVP; la
  confirmación es manual en la Agenda. Falta: cuenta de WhatsApp Cloud
  API (Meta), plantillas aprobadas y costo por mensaje.
- Telefonía / contestador IA.
- Cobro mensual (Stripe / Mercado Pago) y página pública de precios.
- Multi-sucursal y facturación CFDI.

## Limitaciones honestas

- **Modo demo sin Supabase:** los datos viven en localStorage del
  navegador, no se comparten entre dispositivos y el webhook responde
  503. Es solo para probar el anti-empalme sin cuentas.
- **Sin autenticación en el panel demo:** cualquiera que abra el link ve
  la agenda de ejemplo. Al conectar Supabase, el RLS protege los datos,
  pero el login (Auth) es el siguiente paso antes de usarlo con clientes
  reales: hoy el panel no pide usuario ni contraseña.
- **El webhook y la Edge Function hacen lo mismo:** usa solo una de las
  dos rutas para Sheets, no las dos.
- **Sin sincronización en tiempo real:** si dos personas crean la misma
  hora a la vez, la segunda validación puede no ver la primera. Para el
  volumen de una clínica es suficiente; el candado fuerte (una restricción
  de exclusión en Postgres) queda como mejora.
- La cita de ejemplo de Roberto Gómez 09:00 marcada como origen
  "Google Calendar" es solo un dato de ejemplo para mostrar la fuente en
  la agenda; no hay ninguna conexión real detrás hasta completar la
  Fase 1.

## Qué es cada carpeta

```
vincimia-agenda/
├── src/app/                  / (portada), /dashboard, /reserva/[slug]
│   ├── dashboard/            Agenda, Nueva cita, Promotores, Servicios,
│   │                         Conectores, Link público
│   └── api/                  /api/health, /api/webhook/sheets,
│                             /api/google-calendar/status
├── src/lib/
│   ├── anti-overlap.ts       ⭐ Motor anti-empalmes (una sola regla)
│   ├── types.ts              Tablas de Supabase en TypeScript
│   ├── demo-data.ts          Clínica Dental Sonrisa (Org #1, hoy)
│   ├── store.ts              Almacén demo (localStorage) + crear cita
│   └── supabase.ts           Cliente Supabase (navegador y servidor)
├── supabase/
│   ├── schema.sql            ⭐ Base de datos + RLS + datos de ejemplo
│   └── functions/sync-excel-promoter/  Edge Function del webhook
├── scripts/apps-script-sheets.gs  ⭐ Pegar en Google Sheets
├── public/                   Icono y manifest PWA
├── package.json              npm run dev / build / build:cloudflare
├── wrangler.toml             Proyecto vincimia-agenda en Cloudflare
└── .env.example              Variables (copia a .env.local, sin llaves reales)
```
