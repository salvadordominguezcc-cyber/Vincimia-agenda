-- ============================================================================
-- Vincimia Agenda — Migración 004 (Fase 2: WhatsApp)
-- Pégala en Supabase → SQL Editor → Run, DESPUÉS de la 001, 002 y 003.
-- Google Calendar no necesita migración: sus columnas ya están en
-- supabase/schema.sql (google_refresh_token, google_calendar_sync,
-- connected_google_email, google_calendar_id, last_calendar_sync).
-- WhatsApp: solo se guardan el número y si el bot está activado para
-- el negocio. El token de Meta (WHATSAPP_TOKEN) NUNCA se guarda en la
-- base de datos: vive en Cloudflare como variable de entorno.
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_business_number TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_connected BOOLEAN NOT NULL DEFAULT false;

-- El bot se activa por negocio en la página Conectores (cuando el
-- número de WhatsApp Business ya esté creado en Meta y el token
-- guardado en Cloudflare). Por defecto queda apagado: nada se envía
-- solo hasta que Salvador lo active.
