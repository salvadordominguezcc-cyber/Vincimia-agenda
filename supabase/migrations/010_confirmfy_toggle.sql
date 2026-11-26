-- ============================================================================
-- Vincimia Agenda — Migración 010 (Interruptor de confirmaciones de Vincimia)
-- Pégala en Supabase → SQL Editor → Run, DESPUÉS de la 001–009.
-- NO ESTÁ APLICADA: hasta que se aplique, el código trata la columna
-- ausente como activada (comportamiento actual, sin cambios).
--
-- Qué agrega:
-- En `organizations`: `vincimia_confirmations_enabled` (BOOLEAN, por
-- defecto TRUE). Es el interruptor de Dashboard → Conectores →
-- "Confirmaciones de Vincimia (formato Confirmafy)".
--
-- Para qué sirve: mientras Confirmafy siga activo, el dueño apaga este
-- interruptor y Vincimia NO crea/actualiza el evento en Google Calendar
-- con el formato Confirmafy (título "🟢 Nombre / teléfono / tratamiento")
-- NI manda la confirmación por WhatsApp al paciente, así no hay doble
-- envío ni dos eventos por la misma cita. La cita sí se guarda en
-- Vincimia. Cuando se cancele Confirmafy, se vuelve a prender y todo
-- funciona como antes. El aviso interno al dueño (tarjeta FORMATO DE
-- CITA por WhatsApp) y la solicitud de reseña al completar NO dependen
-- de este interruptor: no llegan al paciente y no se empalman con
-- Confirmafy.
--
-- RLS: la columna vive en `organizations`, ya cubierta por las políticas
-- existentes; solo el service_role la escribe (ruta
-- /api/confirmations/toggle, con el secreto del negocio).
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS vincimia_confirmations_enabled BOOLEAN NOT NULL DEFAULT true;
