# Fase 2 — lo que Salvador debe conectar (Google Calendar + WhatsApp)

El código de la Fase 2 ya está en la app. Nada se simula: si una
cuenta no está conectada, la página **Conectores** dice Pendiente y
por qué. Esta guía es lo que falta hacer **fuera del código**, una
vez, en Google Cloud, en Meta y en Cloudflare.

Proyecto: **vincimia-agenda** (Supabase ref `ktqhsmerzxukrsxqalnk`).
Correo del dueño: salvadordominguezcc@gmail.com.
Correo maestro de Vincimia: iavincimia@gmail.com (se usa como cuenta
secundaria de Google Calendar y para las llaves de IA).

---

## 1. Migración 004 en Supabase (WhatsApp)

Supabase → proyecto **vincimia-agenda** → **SQL Editor** → New query:

1. Abre el archivo `supabase/migrations/004_fase2_whatsapp.sql` del
   repo, copia TODO su contenido y pégalo en la consulta.
2. Pulsa **Run**. Debe decir **Success. No rows returned**.
3. No borra nada: solo agrega 3 columnas a `organizations`
   (`whatsapp_phone_number_id`, `whatsapp_business_number`,
   `whatsapp_connected`).

Google Calendar no necesita migración: sus columnas ya estaban en
`supabase/schema.sql`.

---

## 2. Google Calendar — cuenta secundaria

### 2.1 Crear el proyecto en Google Cloud

1. Entra a [Google Cloud Console](https://console.cloud.google.com)
   con salvadordominguezcc@gmail.com.
2. Crea un proyecto nuevo, nombre sugerido **Vincimia Agenda**.
3. En **APIs & Services → Library**, busca **Google Calendar API** y
   pulsa **Enable**.
4. En **APIs & Services → OAuth consent screen**:
   - Tipo de usuario: **External**.
   - Nombre de la app: **Vincimia Agenda**, correo de soporte:
     salvadordominguezcc@gmail.com.
   - En **Test users** agrega el correo de la cuenta secundaria que
     se va a conectar (la que va a prestar su calendario, por
     ejemplo iavincimia@gmail.com). Mientras la app esté en modo
     "Testing", solo los correos de esa lista pueden conectar.
   - Scopes: agrega `https://www.googleapis.com/auth/calendar`,
     `openid`, `email`, `profile`.
5. En **APIs & Services → Credentials → Create Credentials →
   OAuth client ID**:
   - Tipo: **Web application**, nombre: **Vincimia Agenda Web**.
   - **Authorized redirect URI** (exacto, sin espacios):
     `https://vincimia-agenda.pages.dev/api/google-calendar/callback`
   - Guarda. Google te muestra el **Client ID** y el **Client
     Secret**: cópialos, son las dos llaves que van en Cloudflare.

### 2.2 Guardar las llaves en Cloudflare

Cloudflare → proyecto **vincimia-agenda** → **Settings →
Environment variables** → **Add** (Production):

| Variable | Valor |
|---|---|
| `GOOGLE_CLIENT_ID` | El Client ID de Google Cloud |
| `GOOGLE_CLIENT_SECRET` | El Client Secret de Google Cloud |
| `GOOGLE_REDIRECT_URI` | `https://vincimia-agenda.pages.dev/api/google-calendar/callback` |

Pulsa **Save** y luego en **Deployments → Retry deployment** del
último despliegue, para que las variables entren en vivo.

### 2.3 Conectar la cuenta secundaria en la app

1. Abre https://vincimia-agenda.pages.dev, entra y ve a
   **Dashboard → Conectores**.
2. En Google Calendar pulsa **Conectar cuenta secundaria**.
3. Google te pedirá elegir una cuenta: elige la **cuenta
   secundaria** (por ejemplo iavincimia@gmail.com), no tu correo
   personal. Es la cuenta cuyo calendario se va a sincronizar.
4. Acepta el permiso de calendario. La app vuelve a Conectores y
   debe decir **Conectado** con ese correo.
5. Pulsa **Sincronizar ahora**: las citas de la nube sin evento
   suben a Google y los eventos escritos a mano en Google bajan a la
   agenda sin empalmar (si chocan, quedan como conflicto).

La cuenta secundaria es aparte solo para la agenda: la app no toca
tu calendario personal.

---

## 3. WhatsApp — bot de confirmación

### 3.1 Crear la cuenta en Meta

1. Entra a [Meta for Developers](https://developers.facebook.com)
   con salvadordominguezcc@gmail.com y crea una app tipo
   **Business**, nombre sugerido **Vincimia Agenda**.
2. En la app, agrega el producto **WhatsApp** (si te lo pide, crea
   un portafolio de negocio / Business Portfolio).
3. En **WhatsApp → API Setup** verás un número de prueba de Meta.
   Para usar tu propio número de negocio: en **WhatsApp → Phone
   numbers → Add phone number**, registra el número de WhatsApp
   Business de la clínica (tiene que ser un número que pueda
   recibir SMS o llamada para verificarse). No puede ser el WhatsApp
   personal del mismo teléfono.
4. En **API Setup** copia:
   - **Phone number ID** (el ID del número, no el número en sí).
   - **Temporary access token** (dura 24 horas, solo para probar)
     o crea un **token permanente** en **Business Settings →
     System Users** (recomendado para producción).
5. Crea la **plantilla de confirmación** (opcional pero
   recomendada, para que el mensaje llegue aunque el paciente no
   haya escrito en las últimas 24 horas): en **WhatsApp → Message
   Templates → Create template**, categoría **Utility**, idioma
   **es_MX**, nombre sugerido `confirmacion_cita`, cuerpo con 4
   huecos en orden: nombre, servicio, fecha, hora. Ejemplo:
   `Hola {{1}}, tu cita de {{2}} está confirmada para el {{3}} a
   las {{4}}. Te esperamos.` Espera a que Meta la apruebe.
6. Configura el **webhook** en **WhatsApp → Configuration**:
   - **Callback URL:**
     `https://vincimia-agenda.pages.dev/api/webhook/whatsapp`
   - **Verify token:** inventa una palabra secreta (por ejemplo
     `vincimia-2026`) y guárdala: es la misma que va en Cloudflare.
   - Pulsa **Verify and save** y suscribe el campo **messages**.

### 3.2 Guardar las llaves en Cloudflare

Cloudflare → proyecto **vincimia-agenda** → **Settings →
Environment variables** → **Add** (Production):

| Variable | Valor |
|---|---|
| `WHATSAPP_TOKEN` | El token de la app de Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | El Phone number ID de Meta |
| `WHATSAPP_VERIFY_TOKEN` | La misma palabra secreta del webhook |
| `WHATSAPP_TEMPLATE_NAME` | `confirmacion_cita` (solo si creaste la plantilla) |

Pulsa **Save** y **Retry deployment**.

### 3.3 Activar el bot en la app

1. En **Dashboard → Conectores**, en WhatsApp debe decir que el
   número está configurado.
2. Pulsa **Activar el bot**.
3. A partir de ahí, al confirmar una cita en la Agenda, el bot
   manda solo la confirmación por WhatsApp, con el aviso de llegar
   15 minutos antes si es la primera vez del paciente.
4. Si el paciente responde **Confirmo**, la cita queda confirmada;
   si responde **Cancelar**, queda cancelada. Cualquier otro
   mensaje recibe su resumen de cita.

### 3.4 Costo de los mensajes (Meta)

- Los mensajes que **manda el paciente nunca se cobran**.
- Los primeros **1,000 mensajes de servicio al mes por número son
  gratis**.
- Después, un mensaje de utilidad (confirmación) en México cuesta
  unos **$0.16 pesos** (tarifa de Meta vigente desde el 1 de
  octubre de 2026). Una clínica que manda 200 confirmaciones al mes
  pagaría unos $32 pesos al mes a Meta.
- El texto libre solo llega si el paciente escribió en las últimas
  24 horas; la plantilla llega siempre, por eso se recomienda.

---

## 4. Cómo probar (después del despliegue automático)

1. **Google:** Conectores → Conectar → Sincronizar ahora. Revisa
   que la cita aparezca en el Google Calendar de la cuenta
   secundaria y que un evento escrito a mano en Google aparezca en
   la Agenda.
2. **WhatsApp:** confirma una cita que esté en la nube (por ejemplo
   una creada por el webhook de Sheets o la semilla) y revisa que el
   paciente reciba el mensaje. Responde **Confirmo** desde ese
   teléfono y revisa que la cita quede confirmada en la Agenda.
3. **Sin cuentas conectadas:** Conectores debe decir Pendiente en
   las dos, y confirmar una cita debe seguir funcionando en la
   Agenda, con el mensaje listo para copiar a mano.

## 5. Límites honestos de esta Fase 2

- La sincronización trabaja sobre las **citas de la nube**
  (Supabase): las que crea el webhook de Sheets, la semilla y el
  servidor. El panel todavía lee sus datos del aparato
  (localStorage), así que una cita creada solo en el aparato no se
  sube a Google ni se manda por WhatsApp hasta la migración del
  panel a Supabase (siguiente paso, no parte de esta fase).
- Google usa la zona horaria de la clínica
  (America/Mexico_City, UTC-6).
- El bot contesta Confirmo / Cancelar; no agenda citas nuevas por
  chat todavía (eso es el bot de WhatsApp IA completo, con Gemini y
  Groq, que usa este mismo webhook como base).
