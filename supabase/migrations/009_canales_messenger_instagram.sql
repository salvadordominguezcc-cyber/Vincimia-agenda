-- ============================================================================
-- Vincimia Agenda — Migración 009 (Canales Messenger e Instagram)
-- Pégala en Supabase → SQL Editor → Run, DESPUÉS de la 001–008.
-- NO ESTÁ APLICADA: los webhooks de Messenger e Instagram y la bandeja
-- corren en modo pendiente hasta que el dueño la aplique y registre
-- sus páginas. Sin ella, los webhooks responden 200 sin contestar
-- nada (no saben a qué negocio pertenece cada página).
--
-- Qué agrega:
-- 1. En `organizations`: el id de la página de Facebook y el id de
--    la cuenta de Instagram del negocio (para que el webhook sepa a
--    qué negocio llegó cada mensaje), y el interruptor del bot por
--    canal (Messenger / Instagram), igual que whatsapp_bot_enabled.
--    Los TOKENS nunca se guardan aquí: viven en Cloudflare
--    (META_PAGE_ACCESS_TOKEN, META_INSTAGRAM_TOKEN, META_VERIFY_TOKEN).
-- 2. En `conversations` (migración 006): el id de Meta de quien
--    escribe (PSID en Messenger, IGSID en Instagram) y el id de la
--    página/cuenta, para que la bandeja sepa a quién responder por
--    cada canal. El teléfono puede ser null en estos canales.
-- ============================================================================

-- 1. Negocio: ids de Meta + interruptores del bot por canal.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS meta_page_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_instagram_id TEXT,
  ADD COLUMN IF NOT EXISTS messenger_bot_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS instagram_bot_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS messenger_connected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS instagram_connected BOOLEAN NOT NULL DEFAULT false;

-- 2. Bandeja: a quién responder por Messenger / Instagram.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS meta_sender_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_page_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_meta_sender
  ON public.conversations (organization_id, channel, meta_sender_id);

-- 3. Sin datos de ejemplo: los ids de Meta los pone el dueño en la
-- base de datos (o desde el panel, cuando se agregue el campo) al
-- activar cada canal. Nada se siembra aquí.
-- Nota: la sección 3 original (embudo de promotores virtuales,
-- tabla promoter_conversations de la migración 008) se eliminó el
-- 2026-11-26 junto con los promotores virtuales.
