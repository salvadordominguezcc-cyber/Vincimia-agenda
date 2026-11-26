# Módulo de Reseñas — Vincimia Agenda

Calificación del paciente después de su visita: 4–5 estrellas van a
Google Maps, 1–3 estrellas quedan como comentario privado en el panel.
El disparo es la cita completada (check-in). Todo con el stack actual
(Next.js + Supabase + Cloudflare Pages), sin paquetes de pago. El QR
se genera en el navegador con `qrcode.react`.

## Qué se construyó (solo local, sin subir a GitHub ni a Cloudflare)

| Pieza | Archivo |
|---|---|
| Migración (sin aplicar en vivo) | `supabase/migrations/007_reviews.sql` |
| Tipos y ayudas puras | `src/lib/reviews.ts` |
| Página pública de calificación | `src/app/resena/[slug]/page.tsx` |
| Panel de reseñas | `src/app/dashboard/resenas/page.tsx` |
| Disparo al completar la cita | `src/app/api/appointments/status/route.ts` + `src/lib/server-appointments.ts` (`queueReviewRequest`) |
| Envío por WhatsApp | `src/lib/whatsapp.ts` (`sendWhatsAppReview`) |
| Texto del mensaje (nube y demo, el mismo) | `src/lib/reviews.ts` (`reviewRequestText`) |
| Navegación | `src/app/dashboard/layout.tsx` (entrada "Reseñas") |
| Mensaje para copiar a mano en modo demo | `src/app/dashboard/page.tsx` y `src/app/dashboard/calendario/page.tsx` (al hacer check-in) |
| Datos demo (localStorage) | `src/lib/store.ts` (`feedback`, `reviewRequests`), `src/lib/types.ts` (`Organization.google_review_url`) |

## Flujo

1. La recepcionista marca la cita como completada (check-in) en
   Agenda o en Calendario.
2. La ruta `/api/appointments/status` guarda la solicitud en
   `review_requests` y, si WhatsApp está conectado y el bot activado,
   manda al paciente: "Hola {nombre}, gracias por tu visita a
   {clínica}. ¿Cómo calificarías tu experiencia hoy? Califica aquí:
   {link}". Si WhatsApp NO está conectado, la solicitud queda en cola
   (`queued`) con el motivo. **Nada se simula como enviado.** Si la
   cita ya tenía una solicitud enviada o en cola, no se vuelve a
   mandar. En modo demo (sin Supabase), el mensaje aparece en el
   panel listo para copiar a mano.
3. El paciente abre `/resena/<slug>?cita=<id>` y califica 1–5:
   - **4–5 estrellas:** se guarda solo la calificación (para las
     métricas) y se redirige al `google_review_url` de la clínica.
     Sin link de Google configurado, se muestra el agradecimiento y
     se dice con honestidad que el link aún no está configurado.
   - **1–3 estrellas:** formulario privado (nombre opcional,
     WhatsApp opcional, comentario obligatorio) que se guarda en
     `feedback`.
4. En **Dashboard → Reseñas**: promedio, total, conteo por estrellas,
   comentarios privados (marcar como leído), link público, QR para
   recepción (descargar/imprimir) y el campo del link de Google.
   También se ven las solicitudes de WhatsApp con su estado
   (Enviada / En cola / Falló / Sin teléfono).

## Política de Google (review gating)

Google Business Profile prohíbe filtrar reseñas: no se puede pedir
la reseña solo a los contentos ni bloquear el camino a Google de los
descontentos. Por eso:

- La solicitud se manda a **todos** los pacientes al completar su
  cita, sin filtrar.
- El formulario privado **siempre** incluye el enlace discreto
  "O publicar opinión directamente en Google" hacia el
  `google_review_url` de la clínica.
- No se puede detectar en tiempo real cuándo se publica una reseña
  en Google: lo que el panel muestra es la calificación que el
  paciente tocó (4–5) y los comentarios privados que dejó. La
  publicación real en Google la hace el paciente en Google Maps.

## Aplicar la migración 007 en Supabase (pendiente)

No está aplicada en vivo. Cuando Salvador lo pida:

1. Supabase → proyecto `vincimia-agenda` → SQL Editor → New query.
2. Pegar todo `supabase/migrations/007_reviews.sql` → Run.
3. Verificar: `select * from feedback;` y
   `select * from review_requests;` deben existir vacías, y
   `select google_review_url from organizations;` debe devolver NULL
   para la Org #1 (sin link inventado).

La migración agrega `google_review_url` (nullable) a `organizations`,
crea `feedback` y `review_requests` con RLS, y la función
`get_public_org(slug)` que devuelve SOLO los campos públicos de la
organización (id, nombre, slug, google_review_url). La tabla
`organizations` NO se abre en lectura pública: ahí viven el secreto
del webhook y los tokens de Google.

## Configurar el link de Google (falta de Salvador)

Un link por clínica, en **Dashboard → Reseñas → Link de reseñas de
Google**. Se consigue en Google Business Profile → la ficha de la
clínica → Compartir → "Escribir reseña" (empieza con
`https://g.page/r/…` o `https://www.google.com/maps/…`). Sin él, las
4–5 estrellas se guardan pero no llegan a Google Maps.

## Envío automático por WhatsApp (falta de Salvador)

El envío automático necesita lo mismo que la Fase 2 (ver
`FASE2_SETUP.md`): token y número en Cloudflare, webhook verificado
en Meta y bot activado en Dashboard → Conectores. Mientras no esté
conectado, las solicitudes quedan en cola y el panel lo muestra.
Opcional: plantilla de Meta `WHATSAPP_REVIEW_TEMPLATE_NAME`
(categoría Utility, idioma es_MX, 3 huecos en orden: nombre del
paciente, nombre del negocio, link de calificación). Sin plantilla,
se usa texto libre, que solo llega si el paciente escribió en las
últimas 24 horas.

## Cómo probar (modo demo, sin tocar la nube)

1. `npm install && npm run dev`, abrir `http://localhost:3000`.
2. **Página pública:** ir a `/resena/clinica-sonrisa` → tocar 2
   estrellas → llenar el comentario → Enviar → debe decir "¡Gracias
   por tus comentarios!". Luego tocar 4 estrellas → como no hay link
   de Google en demo, muestra el agradecimiento con el aviso.
3. **Panel:** Dashboard → Reseñas → debe aparecer la calificación
   (promedio 2.0, 1 calificación, 1 sin leer) y el comentario con el
   botón "Marcar como leído". El QR debe verse y el botón "Descargar
   QR" baja el SVG.
4. **Disparo:** en Agenda, hacer check-in a una cita de hoy →
   aparece la tarjeta verde "Mensaje para el paciente" con el texto
   de solicitud de reseña y su link `/resena/clinica-sonrisa?cita=…`.
5. **Link de Google:** en Reseñas, pegar un link (cualquiera con
   `https://`) y guardar; volver a `/resena/clinica-sonrisa`, tocar 5
   estrellas → debe redirigir a ese link a los ~1.2 s.
6. **En la nube (después de aplicar la 007):** lo mismo, pero los
   datos se guardan en Supabase; en Reseñas debe desaparecer el aviso
   de migración pendiente.

## Lo que NO hace este módulo

- No publica reseñas en Google por el paciente (Google no lo permite
  por API: el paciente escribe su reseña en Google Maps).
- No detecta cuándo se publica una reseña en Google.
- No cobra ni trae planes de Stripe: el cobro llega con la Fase 4
  (SaaS). El plan del PDF (Gratis/Pro $19 USD/Clínica $49 USD) es
  referencia, no está implementado.
