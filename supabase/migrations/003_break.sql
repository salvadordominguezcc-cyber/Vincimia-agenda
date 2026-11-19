-- ============================================================================
-- Vincimia Agenda — Migración 003: Tiempo de descanso de la clínica
-- Aplícala en Supabase → SQL Editor → Run, en el proyecto vincimia-agenda.
-- También está incluida en supabase/schema.sql para instalaciones nuevas.
--
-- Tiempo de descanso / hora de comida de la clínica (texto "HH:MM").
-- En esa hora no se muestran ni se permiten citas, en ningún canal
-- (en línea, por teléfono, por WhatsApp o por Sheets). Vacío (NULL) =
-- sin descanso.
-- ============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS break_start TEXT,
  ADD COLUMN IF NOT EXISTS break_end TEXT;

-- Descanso de ejemplo de la Org #1: 14:00–15:00 (hora de comida).
UPDATE organizations SET break_start = '14:00', break_end = '15:00'
  WHERE id = '11111111-1111-1111-1111-111111111111';
