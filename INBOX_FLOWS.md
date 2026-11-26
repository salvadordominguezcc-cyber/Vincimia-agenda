# Bandeja de equipo + editor visual de flujos — Vincimia Agenda

Bandeja de equipo y editor visual con cajitas, construidos con el
stack actual a **costo $0**: sin suscripciones nuevas, sin React Flow
ni paquetes externos. Las cajitas son componentes propios con divs.

## Stack ($0)

| Pieza | Herramienta | Costo |
|---|---|---|
| App y panel | Next.js 14 + TypeScript + Tailwind (ya estaba) | $0 |
| Editor visual | Componentes propios con divs (sin React Flow) | $0 |
| Base de datos | Supabase, tablas + RLS (migración 006) | $0 en plan gratis |
| Mensajes | API oficial de WhatsApp / Meta (Fase 2, ya estaba) | Solo lo que cobra Meta por mensaje |
| Tiempo real | Supabase Realtime (cuando se conecte) | $0 en plan gratis |

No se instaló ningún paquete nuevo. No hay respond.io ($79–$159
USD/mes) ni Chatwoot en servidor aparte.

## Qué hay en el código

- `src/lib/inbox.ts` — tipos `Conversation`, `InboxMessage`,
  `FlowNode`, `Flow`; canales whatsapp/facebook/instagram (en
  pantalla "Messenger" para el canal de la fanpage); estados
  abierta/asignada/resuelta; asignación a recepcionista/admin;
  tipos de nodo mensaje/pregunta/condicion/agendar/confirmar/
  transferir; flujo de ejemplo y conversaciones de ejemplo. Cada
  conversación guarda su destinatario: teléfono en WhatsApp,
  `metaSenderId` (PSID/IGSID) en Messenger e Instagram.
- `src/app/dashboard/bandeja/page.tsx` — **Bandeja**: lista de
  conversaciones, filtro por estado **y por canal**, detalle, asignar
  a Recepción o Admin, marcar resuelta / reabrir, y escribir respuesta.
  El botón **Enviar** manda la respuesta por el canal de la
  conversación (ruta `/api/inbox/send`); si el canal no está
  conectado o no hay destinatario, guarda borrador y dice por qué.
  La sección Canales muestra el estado real de Messenger e Instagram
  (`/api/meta/status`).
- `src/lib/messenger.ts` y `src/lib/instagram.ts` — envío por
  Messenger e Instagram (espejo de `src/lib/whatsapp.ts`).
- `src/lib/meta-channels.ts` — verificación de webhooks, lectura de
  eventos de Meta, envío por Graph API y respuesta con el bot
  unificado del canal (cerebro en `src/lib/unified-bot.ts`).
- `src/app/api/webhook/messenger/route.ts` y
  `src/app/api/webhook/instagram/route.ts` — webhooks de Meta: guardan
  el mensaje en la bandeja y contestan con el bot unificado del
  canal. Sin token o sin negocio registrado por `meta_page_id` /
  `meta_instagram_id`, no contestan nada.
- `src/app/api/meta/status/route.ts` — estado real de Messenger e
  Instagram, sin exponer tokens.
- `src/app/api/inbox/send/route.ts` — envío de la bandeja por
  WhatsApp, Messenger o Instagram. Sin token del canal responde 503
  y explica por qué; nunca simula el envío.
- `src/app/dashboard/flujos/page.tsx` — **Flujos**: agregar nodo
  por tipo, editar título y texto, conectar el nodo siguiente con
  un selector, borrar nodo, activar/pausar, volver al ejemplo.
- `supabase/migrations/006_inbox_flows.sql` — tablas
  `conversations`, `inbox_messages` y `flows`, con
  `organization_id` + RLS por `memberships`, como la migración 005.
  Cada negocio ve solo su bandeja y sus flujos.
- `supabase/migrations/009_canales_messenger_instagram.sql` —
  ids de Meta por negocio (`meta_page_id`, `meta_instagram_id`),
  interruptores del bot por canal y `meta_sender_id` en bandeja y
  embudo del promotor. Sin aplicar.
- `INBOX_FLOWS.md` — este documento.

## Flujo de ejemplo (viene sembrado)

```
Paciente escribe → Pregunta servicio → Propone horarios
  → Confirma cita → Recordatorio
```

1. Saludo: "Hola, soy Vincimia Agenda de Dentiplus. ¿En qué te ayudo?"
2. Pregunta servicio: limpieza, blanqueamiento, ortodoncia o revisión.
3. Propone horarios: horarios libres del doctor, sin empalmes.
4. Confirma cita: pasa a Confirmada (con aviso de llegar 15 minutos
   antes si es primera vez).
5. Recordatorio: el día antes, "Responde Confirmo si vas a venir,
   o Cancelar si no puedes."

## Proceso del equipo (en palabras normales)

1. Llega un mensaje de WhatsApp, Messenger o Instagram a la bandeja.
2. Alguien del equipo lo toma: se asigna a Recepción o a Admin.
3. Contesta desde la bandeja con Enviar (si el canal está conectado)
   o lo deja como borrador si el canal sigue pendiente.
4. Cuando se atiende, se marca resuelta. Si vuelve a escribir, se
   reabre.
5. El bot sigue el flujo que armó el negocio en Flujos; si el
   paciente pide algo que el bot no sabe, se transfiere a un humano.

## Datos de ejemplo

Las conversaciones de ejemplo usan los contactos demo de la agenda
(Laura Méndez, Luis Soto, Sofía Castro, Mariana Torres, Roberto
Gómez). No son mensajes reales. En modo demo, bandeja y flujos
viven en localStorage (`vincimia-bandeja-v1`, `vincimia-flujos-v1`),
igual que el resto del panel.

## Pendientes (no simulado)

- **Probar el envío real con un canal conectado:** la ruta
  `/api/inbox/send` ya existe y la bandeja ya tiene el botón Enviar,
  pero ningún canal está conectado todavía (faltan los tokens en
  Cloudflare y la verificación del webhook en Meta). Sin eso, el
  envío responde 503 y la respuesta queda como borrador.
- **Verificar los webhooks de Messenger e Instagram en Meta:**
  las rutas ya existen (`/api/webhook/messenger`,
  `/api/webhook/instagram`, verificación con `META_VERIFY_TOKEN`),
  pero Meta no las ha verificado y ningún negocio tiene registrado
  su `meta_page_id` / `meta_instagram_id`. Sin eso, los mensajes que
  lleguen no se contestan ni se guardan en la bandeja.
- **Tiempo real:** la bandeja hoy se actualiza al recargar. Falta
  Supabase Realtime para que un mensaje nuevo aparezca solo y para
  que dos personas no contesten lo mismo a la vez.
- **Ejecución del flujo:** el editor guarda las cajitas, pero el
  bot todavía no las recorre solo. Falta un ejecutor que, en los
  webhooks, lea el flujo activo del negocio, mande el texto del nodo
  actual y avance al `next_id` según la respuesta.
- **Migraciones 006 y 009 en Supabase:** los archivos están en
  `supabase/migrations/`; hay que aplicarlos en el SQL Editor del
  proyecto vincimia-agenda para que las tablas existan en la nube.
  El panel demo no lo necesita.
