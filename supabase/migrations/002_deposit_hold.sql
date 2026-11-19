-- ============================================================================
-- Vincimia Agenda — Migración 002: Doctores con anticipo y citas en pausa
-- Aplícala en Supabase → SQL Editor → Run, en el proyecto vincimia-agenda.
-- También está incluida en supabase/schema.sql para instalaciones nuevas.
--
-- Doctor con anticipo (requires_deposit): sus citas en línea, por teléfono
-- y por WhatsApp nacen EN PAUSA (status 'on_hold'), no se confirman ni
-- bloquean el horario. La clínica propone horarios (proposed_times) y solo
-- cuando el paciente acepta se confirma la cita. Todavía no hay cobro en
-- línea: solo el flujo de pausa y confirmación.
-- ============================================================================

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS requires_deposit BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS proposed_times TEXT;

-- Nuevo estado 'on_hold' ("En pausa") en la lista de estados permitidos.
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'conflict', 'on_hold'));

-- Doctora de ejemplo con anticipo: Dra. María Torres (endodoncista).
UPDATE doctors SET requires_deposit = true
  WHERE id = 'a3333333-3333-3333-3333-333333333333';
