-- ============================================================================
-- Vincimia Agenda — Migración 001: Doctores
-- Aplícala en Supabase → SQL Editor → Run, en el proyecto vincimia-agenda.
-- También está incluida en supabase/schema.sql para instalaciones nuevas.
-- Especialidades (palabras normales, como las dio Salvador):
-- Doctor general, Ortodoncia y general, Endodoncista,
-- Endodoncista y general, Ortopediatra.
-- El horario se guarda en JSON: [{weekday, start, end, active}, ...]
-- weekday: 0 = domingo, 1 = lunes, …, 6 = sábado.
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT 'general'
    CHECK (specialty IN ('general', 'ortodoncia_general', 'endodoncista', 'endodoncista_general', 'ortopediatra')),
  color TEXT NOT NULL DEFAULT '#2563eb',
  schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La cita lleva el doctor que atiende; null = sin asignar.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_doctors_org ON doctors (organization_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments (doctor_id);

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doctors_members" ON doctors;
CREATE POLICY "doctors_members" ON doctors FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Doctores de ejemplo — Org #1 (mismos IDs que en src/lib/demo-data.ts).
-- ---------------------------------------------------------------------------
INSERT INTO doctors (id, organization_id, name, specialty, color, schedule) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Dra. Ana López', 'general', '#2563eb',
   '[{"weekday":1,"start":"09:00","end":"18:00","active":true},{"weekday":2,"start":"09:00","end":"18:00","active":true},{"weekday":3,"start":"09:00","end":"18:00","active":true},{"weekday":4,"start":"09:00","end":"18:00","active":true},{"weekday":5,"start":"09:00","end":"18:00","active":true},{"weekday":6,"start":"09:00","end":"14:00","active":true}]'::jsonb),
  ('a2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Dr. Carlos Ruiz', 'ortodoncia_general', '#7c3aed',
   '[{"weekday":1,"start":"10:00","end":"19:00","active":true},{"weekday":2,"start":"10:00","end":"19:00","active":true},{"weekday":3,"start":"10:00","end":"19:00","active":true},{"weekday":4,"start":"10:00","end":"19:00","active":true},{"weekday":5,"start":"10:00","end":"19:00","active":true}]'::jsonb),
  ('a3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Dra. María Torres', 'endodoncista', '#059669',
   '[{"weekday":1,"start":"09:00","end":"17:00","active":true},{"weekday":3,"start":"09:00","end":"17:00","active":true},{"weekday":5,"start":"09:00","end":"17:00","active":true}]'::jsonb),
  ('a4444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Dr. Jorge Sánchez', 'endodoncista_general', '#ea580c',
   '[{"weekday":2,"start":"09:00","end":"15:00","active":true},{"weekday":4,"start":"09:00","end":"15:00","active":true},{"weekday":6,"start":"09:00","end":"15:00","active":true}]'::jsonb),
  ('a5555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Dra. Lucía Fernández', 'ortopediatra', '#db2777',
   '[{"weekday":1,"start":"09:00","end":"15:00","active":true},{"weekday":2,"start":"09:00","end":"15:00","active":true},{"weekday":3,"start":"09:00","end":"15:00","active":true},{"weekday":4,"start":"09:00","end":"15:00","active":true},{"weekday":5,"start":"09:00","end":"15:00","active":true}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Citas de ejemplo con su doctor (el caso de conflicto queda intacto:
-- Laura 10:00 y Luis 10:15 son de la misma doctora, Dra. Ana López).
UPDATE appointments SET doctor_id = 'a1111111-1111-1111-1111-111111111111'
  WHERE id IN ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003');
UPDATE appointments SET doctor_id = 'a2222222-2222-2222-2222-222222222222'
  WHERE id IN ('d0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000005');
