# Promotores virtuales — Vincimia Agenda

3 promotores virtuales, uno por fanpage (Facebook e Instagram), y los 3
pasan al mismo WhatsApp del consultorio (+52 686 338 6047) donde se
manda la información para la cita. Todo se ve junto en
**Dashboard → Promotores**, sección "Promotores virtuales".

## Cómo funciona

1. El paciente escribe en una fanpage (Facebook) o en su Instagram.
   El bot contesta **como ese promotor** (su nombre y su estilo), en
   español, con las promociones de bienvenida y la póliza particular.
2. Cuando el paciente quiere agendar, el bot le pasa el link de
   WhatsApp (`wa.me/526863386047`) con su código de promotor ya
   escrito, y le manda la información para la cita: link de reserva,
   código, tratamiento, precios de bienvenida y la nota de la póliza.
3. La cita se crea en Agenda con `promoter_id` (el código del
   promotor que lo mandó). La comisión se liquida igual que con
   promotores humanos: **solo sobre citas completadas**.

## Estado actual (solo local, nada conectado)

- Código listo en local (`~/workspace/vincimia-agenda`), sin subir a
  GitHub ni a Cloudflare, y las migraciones 008 y 009 **sin aplicar**
  en Supabase. Los datos viven en el navegador (modo demo).
- La ruta `POST /api/promotores/chat` responde con IA si hay llaves
  (Gemini o Groq); sin ellas responde con respuestas locales y lo
  marca como **demo · sin conexión a la IA**. Nunca finge una
  conexión real. No hay llamadas a Meta ni a WhatsApp.
- Los webhooks de Messenger (`/api/webhook/messenger`) e Instagram
  (`/api/webhook/instagram`) ya existen en código, con sus libs de
  envío (`src/lib/messenger.ts`, `src/lib/instagram.ts`) y el
  ayudante compartido (`src/lib/meta-channels.ts`), pero **no están
  verificados en Meta ni tienen tokens**: sin `META_PAGE_ACCESS_TOKEN`
  / `META_INSTAGRAM_TOKEN` y `META_VERIFY_TOKEN` no contestan nada.
  La bandeja ya puede enviar por los 3 canales (`POST /api/inbox/send`)
  cuando el canal está conectado; si no, guarda borrador y dice por qué.
- El simulador "Probar" en cada tarjeta permite chatear con el
  promotor sin Meta conectado.

## Lo que tiene que hacer Salvador (solo él puede)

1. **Nombres y estilos de los 3 promotores.** Hoy son de ejemplo
   ("Promotor virtual 1/2/3" con códigos PROMO1/PROMO2/PROMO3).
   Se cambian en Dashboard → Promotores → "Editar nombre, estilo y
   canal" (nombre, persona/estilo, canal y link de la fanpage).
2. **Crear las 3 fanpages de Facebook** del consultorio (una por
   promotor) y **3 cuentas profesionales de Instagram** (Empresa o
   Creador), una por fanpage.
3. **Vincular cada Instagram con su fanpage**: Instagram → Perfil →
   Editar perfil → Página → elegir su fanpage de Facebook.
4. **Crear/autorizar la app de Meta**: Meta for Developers → crear
   la app (o usar la de WhatsApp Business que ya existe) → agregar
   los productos **Messenger** e **Instagram** → en cada producto,
   suscribir la página (otorgar el permiso de mensajes a cada una de
   las 3 fanpages) y conectar su Instagram vinculado.
5. **Verificar los webhooks de Meta**: en la app de Meta, configurar
   un webhook por canal, con la misma palabra secreta
   (`META_VERIFY_TOKEN`, se inventa una vez y se pega igual en Meta
   y en Cloudflare):
   - Messenger → Callback URL:
     `https://vincimia-agenda.pages.dev/api/webhook/messenger`,
     suscribir el campo **messages** (object "page").
   - Instagram → Callback URL:
     `https://vincimia-agenda.pages.dev/api/webhook/instagram`,
     suscribir el campo **messages** (object "instagram").
   Pulsa **Verify and save** en cada uno. El webhook de WhatsApp
   (`/api/webhook/whatsapp` con `WHATSAPP_VERIFY_TOKEN`) es aparte y
   no cambia.
6. **Pegar las llaves en Cloudflare** (proyecto vincimia-agenda →
   Settings → Environment Variables → Production → Retry deployment):
   `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_VERIFY_TOKEN`, `META_PAGE_ACCESS_TOKEN`,
   `META_INSTAGRAM_TOKEN`, `META_VERIFY_TOKEN` y al menos una de
   `GEMINI_API_KEY` o `GROQ_API_KEY` (el cerebro del promotor).
7. **Pegar los links de las fanpages** en Dashboard → Promotores
   (tarjeta de cada virtual → Editar → link de la fanpage).
8. **Aplicar las migraciones 008 y 009** en Supabase (SQL Editor →
   pegar `supabase/migrations/008_promotores_virtuales.sql` y luego
   `supabase/migrations/009_canales_messenger_instagram.sql` → Run)
   cuando el panel migre de localStorage a Supabase, para que las
   conversaciones y los promotores virtuales vivan en la nube.
9. **Registrar cada página y cuenta en el negocio**: en la tabla
   `organizations`, poner `meta_page_id` (id de la página de
   Facebook) y `meta_instagram_id` (id de la cuenta profesional de
   Instagram) del negocio. Sin eso, el webhook no sabe a qué negocio
   llegó el mensaje y no contesta. Y activar el bot por canal
   (`messenger_bot_enabled` / `instagram_bot_enabled`) cuando ese
   canal ya esté autorizado.

## Lo que espera el código (variables y rutas)

| Variable | Dónde | Para qué |
| --- | --- | --- |
| `GEMINI_API_KEY` | Cloudflare (servidor) | Cerebro del promotor (se intenta primero). Sin ella, se prueba Groq. |
| `GROQ_API_KEY` | Cloudflare (servidor) | Cerebro del promotor (segundo intento). |
| `WHATSAPP_TOKEN` | Cloudflare (servidor) | WhatsApp Cloud API (Fase 2, ya documentada en FASE2_SETUP.md). |
| `WHATSAPP_PHONE_NUMBER_ID` | Cloudflare (servidor) | ID del número de WhatsApp Business (no el número). |
| `WHATSAPP_VERIFY_TOKEN` | Cloudflare (servidor) | Secreto del webhook de WhatsApp, igual en Meta y en Cloudflare. |
| `META_PAGE_ACCESS_TOKEN` | Cloudflare (servidor) | Token de la página de Facebook: contesta por Messenger. Sin él, el webhook de Messenger no contesta. |
| `META_INSTAGRAM_TOKEN` | Cloudflare (servidor) | Token de Instagram (página con permiso instagram_messaging). Sin él, el webhook de Instagram no contesta. |
| `META_VERIFY_TOKEN` | Cloudflare (servidor) | Palabra secreta compartida para verificar los webhooks de Messenger e Instagram, igual en Meta y en Cloudflare. |
| `NEXT_PUBLIC_SITE_URL` | Cloudflare / `.env.local` | Base del link de reserva (`/reserva/<slug>`). |

Rutas:

- `POST /api/promotores/chat` — `{ promoter_code, channel, message,
  patient_name?, patient_phone?, org_name?, org_slug?, promoter? }`.
  Responde `{ reply, modo, ia_conectada, quiere_agendar, treatment,
  handoff, info_cita }`. `modo` es `ia-gemini`, `ia-groq` o `demo`.
- `GET /api/whatsapp/status` — estado real de la conexión de WhatsApp.
- `POST /api/webhook/whatsapp` — webhook de Meta (ya existe).
- `POST /api/webhook/messenger` — webhook de Messenger (GET verifica
  con `META_VERIFY_TOKEN`; POST contesta con el promotor virtual del
  canal, mismo cerebro que `/api/promotores/chat`). Sin token o sin
  negocio registrado por `meta_page_id`, no contesta nada.
- `POST /api/webhook/instagram` — webhook de Instagram, igual que el
  de Messenger (negocio por `meta_instagram_id`).
- `GET /api/meta/status` — estado real de Messenger e Instagram
  (configurado o pendiente, sin exponer tokens). Lo usan Conectores
  y la bandeja.
- `POST /api/inbox/send` — envía una respuesta de la bandeja por
  WhatsApp, Messenger o Instagram (`{ organization_id, channel,
  recipient, text, conversation_id? }`, con el secreto de la
  organización). Sin token del canal responde 503 y explica por qué;
  nunca simula el envío.

El número único de WhatsApp del consultorio es **+52 686 338 6047**
(`wa.me/526863386047`). Vive en `src/lib/virtual-promoters.ts`
(`WHATSAPP_CLINICA`); si el número cambia, se cambia ahí.

## Reglas de contenido (el bot no las rompe)

- Todo en español. Nada de texto en inglés.
- Precios de bienvenida, solo para clientes de primera vez:
  limpieza $350, resina chica $250, reconstrucción $400, endodoncia
  $2,200. Cualquier otro tratamiento dice "pregunta por tu precio".
- Póliza particular: sin costo de activación ($0); descuentos hasta
  50%, garantías, abonos en tratamientos mayores y consultas sin costo
  por 1 año. La valoración sin costo se activa SOLO al asistir y
  registrarse en el consultorio.
- Ningún nombre de marca de clínica va fijo en las personas ni en los
  mensajes: se usa el nombre de la organización del panel.

## Archivos

- `src/lib/types.ts` — `Promoter` extendido (`is_virtual`,
  `persona`, `channel`, `fanpage_url`) y `PromoterConversation`.
- `src/lib/virtual-promoters.ts` — 3 promotores por defecto, pase a
  WhatsApp, plantilla de información para la cita y respuestas demo.
- `src/lib/virtual-promoters-server.ts` — IA (Gemini, luego Groq),
  solo servidor.
- `src/app/api/promotores/chat/route.ts` — ruta de chat.
- `src/lib/meta-channels.ts` — ayudante compartido de Messenger e
  Instagram (verificación del webhook, lectura de eventos, envío por
  Graph API y respuesta con el promotor virtual del canal).
- `src/lib/messenger.ts` y `src/lib/instagram.ts` — libs de envío
  por Messenger e Instagram (espejo de `src/lib/whatsapp.ts`).
- `src/app/api/webhook/messenger/route.ts` y
  `src/app/api/webhook/instagram/route.ts` — webhooks de Meta.
- `src/app/api/meta/status/route.ts` — estado real de los dos canales.
- `src/app/api/inbox/send/route.ts` — envío de la bandeja por los
  3 canales.
- `src/app/dashboard/promotores/page.tsx` — panel + simulador.
- `src/app/dashboard/bandeja/page.tsx` — bandeja con filtro por
  canal y envío real por el canal de cada conversación.
- `src/app/dashboard/conectores/page.tsx` — tarjetas de estado de
  Messenger e Instagram (Pendiente y por qué).
- `src/lib/store.ts` / `src/lib/demo-data.ts` — almacén demo con
  conversaciones y los 3 virtuales sembrados.
- `supabase/migrations/008_promotores_virtuales.sql` — migración sin
  aplicar.
- `supabase/migrations/009_canales_messenger_instagram.sql` —
  migración sin aplicar (ids de Meta por negocio, interruptores del
  bot por canal, `meta_sender_id` en bandeja y embudo).
