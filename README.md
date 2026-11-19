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
| **Login** (`/login`) | Entrar, crear cuenta y recuperar contraseña con Supabase Auth. Al registrarse, el usuario queda ligado a la Org #1 piloto (ver `AUTH_SETUP.md`). |
| **Agenda** (`/dashboard`) | Agenda unificada del día, con alerta de conflictos, Confirmar, Check-in (completed) y Cancelar. **Exige sesión** cuando Supabase está configurado; sin sesión redirige a `/login`. |
| **Calendario** (`/dashboard/calendario`) | Vista tipo Google Calendar por semana y por día (8:00–20:00), con el color del **doctor** que atiende cada cita. La leyenda muestra cada doctor con su color y especialidad, y de dónde llegó la cita (Google Calendar azul, Promotor verde, Link público morado, WhatsApp turquesa). Cada cita marca si es la **primera vez** que viene el cliente o si **ya había venido**, calculado del historial del mismo contacto. Al pulsar una cita se ve el detalle y se puede confirmar, hacer check-in o cancelar. |
| **Nueva cita** (`/dashboard/nueva`) | Crea cita validando el anti-empalme. Si choca, NO se guarda: muestra con quién choca y ofrece guardarla como `conflict`. Permite elegir el **doctor** (opcional): la cita debe caer dentro de su horario. |
| **Doctores** (`/dashboard/doctores`) | Alta, edición y pausa de doctores. Cada uno con **nombre, especialidad** (Doctor general, Ortodoncia y general, Endodoncista, Endodoncista y general, Ortopediatra), **color** en el calendario (se puede cambiar cuando quieras; el nombre del doctor se ve con el fondo de su color y letra que contraste, en Doctores, en la cita, en el calendario y en la leyenda) y **horarios** por día de la semana. Con la casilla **"Solo atiende con cita y anticipo"**, sus citas nacen **en pausa** (ver abajo). Al **quitar** a un doctor no se borra: queda pausado, sus citas pasadas se conservan y ya no se le agendan citas nuevas; se puede volver a activar. Se guarda en localStorage y en Supabase (tabla `doctors`, migración `supabase/migrations/001_doctors.sql`). |
| **Promotores** (`/dashboard/promotores`) | Alta de promotores y liquidación: comisiones **solo sobre citas `completed`**, con `commission_rate` en %. |
| **Servicios** (`/dashboard/servicios`) | Alta/baja de servicios; la duración es la que usa el anti-empalme. |
| **Conectores** (`/dashboard/conectores`) | Estado real: Google Calendar **conectado o pendiente** (con botón Conectar y Sincronizar ahora), Sheets **listo**, WhatsApp **activo o pendiente**. |
| **Link público** (`/dashboard/link`) | Link `vincimia.link/slug`, copiar, y editor del buffer (5/10/15/30 min). |
| **Ajustes** (`/dashboard/ajustes`) | Cambia los datos del negocio (nombre, enlace, tiempo entre citas, **tiempo de descanso** de la clínica, correo de Google Calendar) y borra los datos de ejemplo con doble confirmación. Guarda en localStorage y en Supabase (update en `organizations` + deletes en `appointments`/`contacts`/`services`/`promoters`); no borra la organización ni la cuenta. |
| **Reserva pública** (`/reserva/[slug]`) | El cliente elige servicio, **doctor** (opcional) y fecha, y solo ve horarios libres dentro del horario de ese doctor. Crea la cita en `pending` y el contacto si no existe. |
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
`completed` **del mismo doctor**. Dos doctores pueden atender a la misma
hora porque son agendas paralelas; una cita sin doctor asignado choca con
todas. Además, la cita debe caer dentro del horario del doctor elegido
(ver Doctores). La misma función vive en `src/lib/anti-overlap.ts` y la usan
la Agenda, Nueva cita, el link público y el webhook de Sheets.

Ejemplo con los datos de prueba: Laura Méndez 10:00, 60 min (hasta 11:00)
+ 15 min de buffer = ocupada hasta las 11:15. Una cita a las 10:15 choca.

### Doctores con anticipo: la cita queda en pausa

Si un doctor tiene marcada la casilla **"Solo atiende con cita y
anticipo"** (en Doctores; de ejemplo, la Dra. María Torres, endodoncista),
sus citas nacen **en pausa** (`on_hold`), sin importar por dónde lleguen:
en línea (reserva pública), por teléfono (Nueva cita) o por WhatsApp
(Fase 2, mismo flujo cuando llegue). La cita en pausa **no se confirma ni
bloquea el horario**: otra persona puede pedir ese mismo hueco.

El flujo, en palabras normales, es:

1. El paciente pide la cita y queda **en pausa**.
2. La clínica revisa los horarios del doctor y le **propone horarios**
   al paciente (campo "Horarios propuestos" en la Agenda o en el
   Calendario, ej. "Miércoles 10:00 o jueves 11:30").
3. Solo cuando el paciente acepta, la clínica pulsa **Confirmar cita**.
   Antes de confirmar se vuelve a revisar que el horario siga libre
   para ese doctor: si otro paciente lo tomó mientras tanto, no se
   confirma y la clínica propone otro horario.

Todavía **no hay cobro en línea**: solo el flujo de pausa y
confirmación. La migración es `supabase/migrations/002_deposit_hold.sql`
(columna `requires_deposit` en `doctors`, estado `on_hold` y columna
`proposed_times` en `appointments`).

### Tiempo de descanso de la clínica

En **Ajustes** se pone el **tiempo de descanso** (hora de comida, ej.
14:00–15:00). En esa hora no se muestran ni se permiten citas, en ningún
canal: ni en línea, ni por teléfono, ni por WhatsApp, ni por Sheets. El
calendario la marca con una banda sombreada. Si se deja vacío, no hay
descanso. La migración es `supabase/migrations/003_break.sql` (columnas
`break_start` y `break_end` en `organizations`).

### Mensaje de confirmación (con aviso para pacientes nuevos)

Al confirmar una cita, en la Agenda y en el Calendario aparece el
**mensaje para el paciente**, listo para copiar y mandar por WhatsApp
(en la Fase 2 lo manda el bot solo, con este mismo texto, ver
`src/lib/messages.ts`). Si es la **primera vez** que viene el paciente,
el mensaje agrega: *"Te recomendamos llegar 15 minutos antes para llenar
tu historial clínico."* Si ya había venido, no lleva ese aviso.

## Fase 2 — Google Calendar y WhatsApp (conexiones reales)

El código ya está; las cuentas se conectan siguiendo `FASE2_SETUP.md`.

| Pieza | Qué hace |
|---|---|
| **Google Calendar** | OAuth con la cuenta secundaria (`prompt: select_account`, `access_type: offline`): el refresh_token se guarda en `organizations.google_refresh_token` y nunca sale de la base de datos. Rutas: `/api/google-calendar/auth`, `/api/google-calendar/callback`, `/api/google-calendar/sync`, `/api/google-calendar/disconnect`, `/api/google-calendar/status`. La sincronización es en dos vías: las citas de la nube sin evento suben a Google (al confirmar, mover o cancelar, y con "Sincronizar ahora"); los eventos escritos a mano en Google (próximos 30 días) bajan a la agenda pasando por el anti-empalme y el descanso (si chocan, quedan como conflicto). Sin credenciales (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) Conectores dice Pendiente. |
| **WhatsApp** | API oficial de WhatsApp Cloud API (Meta). Rutas: `/api/webhook/whatsapp` (verificación con `WHATSAPP_VERIFY_TOKEN` y respuestas: Confirmo → confirmada, Cancelar → cancelada, otro texto → resumen de su cita), `/api/whatsapp/send` (manda la confirmación de una cita), `/api/whatsapp/status`, `/api/whatsapp/toggle` (interruptor por negocio) y `/api/appointments/status` (al confirmar en la Agenda, actualiza la cita en la nube, la sube a Google y manda la confirmación por WhatsApp). Usa el mismo texto de `src/lib/messages.ts` (aviso de 15 minutos solo si es primera vez). Con plantilla (`WHATSAPP_TEMPLATE_NAME`) llega siempre; con texto libre solo si el paciente escribió en las últimas 24 horas. Costo Meta: primeros 1,000 mensajes de servicio al mes gratis, luego ~$0.16 MXN por mensaje de utilidad en México. |
| **Migración 004** | `supabase/migrations/004_fase2_whatsapp.sql`: columnas `whatsapp_phone_number_id`, `whatsapp_business_number` y `whatsapp_connected` en `organizations`. Google no necesita migración. |

**Límite honesto:** la sincronización y el bot trabajan sobre las
citas de la **nube** (Supabase). El panel todavía lee sus datos del
aparato (localStorage): una cita creada solo en el aparato no se sube
a Google ni se manda por WhatsApp hasta la migración del panel a
Supabase (siguiente paso, no parte de esta fase).

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
- **Autenticación:** el panel exige login con Supabase Auth cuando
  Supabase está configurado (ver `AUTH_SETUP.md`: Site URL y Redirect
  URLs en Supabase). Sin Supabase configurado, el panel sigue en modo
  demo local sin login. La reserva pública no pide login.
- **Los datos del panel todavía viven en localStorage (demo):** el login
  protege la puerta del panel, pero la Agenda, Nueva cita, Promotores y
  Servicios aún leen/escriben el almacén local del navegador, no las
  tablas de Supabase. Migrar ese almacén a Supabase (con RLS) es el
  siguiente paso; el webhook de Sheets sí escribe ya en la nube.
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
