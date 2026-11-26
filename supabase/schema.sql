-- ============================================================================
-- Vincimia Agenda — Esquema Supabase (PostgreSQL)
-- Fuente: Documento Maestro de Proyecto — Vincimia (pág. 2).
-- Pégalo TODO en Supabase → SQL Editor → Run.
-- Multi-negocio: cada fila lleva organization_id y RLS activado, así un
-- negocio nunca ve los datos de otro. La service_role (rutas /api/*) pasa
-- por encima de RLS; el navegador solo usa la llave anon.
-- Sin llaves reales en este archivo. El secreto del webhook se genera solo
-- (uuid) y se puede rotar en la tabla organizations.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- 1. ORGANIZACIONES (negocios clientes del SaaS — Org #1 es uso propio)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  buffer_minutes INT NOT NULL DEFAULT 15,
  break_start TEXT,
  break_end TEXT,
  whatsapp_bot_enabled BOOLEAN NOT NULL DEFAULT false,
  -- Conexión a cuenta de Google Calendar secundaria/externa (Fase 1 completa).
  -- En el MVP quedan en false / NULL: NO hay token guardado ni conexión real.
  google_calendar_sync BOOLEAN NOT NULL DEFAULT false,
  connected_google_email TEXT,
  google_calendar_id TEXT NOT NULL DEFAULT 'primary',
  google_refresh_token TEXT,
  last_calendar_sync TIMESTAMPTZ,
  -- Seguridad del webhook para Excel/Sheets de promotores.
  excel_webhook_secret TEXT NOT NULL DEFAULT uuid_generate_v4()::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. MEMBRESÍAS (quién pertenece a cada organización — base del RLS)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

-- Helper RLS: ¿el usuario autenticado es miembro de esta organización?
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE organization_id = org_id AND user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. PROMOTORES EXTERNOS
-- commission_rate es PORCENTAJE (10 = 10 % del precio de la cita).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promoters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  phone TEXT,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

-- ---------------------------------------------------------------------------
-- 4. SERVICIOS DEL NEGOCIO
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 45,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  follow_up_days INT NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4b. DOCTORES (color, especialidad y horarios por doctor)
-- Especialidades: Doctor general, Ortodoncia y general, Endodoncista,
-- Endodoncista y general, Ortopediatra. Horario en JSON por día:
-- [{weekday, start, end, active}] con weekday 0 = domingo … 6 = sábado.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL DEFAULT 'general'
    CHECK (specialty IN ('general', 'ortodoncia_general', 'endodoncista', 'endodoncista_general', 'ortopediatra')),
  color TEXT NOT NULL DEFAULT '#2563eb',
  requires_deposit BOOLEAN NOT NULL DEFAULT false,
  schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 5. CONTACTOS / CLIENTES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  last_visit TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 6. CITAS UNIFICADAS (núcleo anti-empalmes)
-- source: google_calendar | excel_promoter | vincimia_link | whatsapp_bot
-- status: pending | confirmed | completed | cancelled | conflict
-- Solo pending / confirmed / completed bloquean horarios (ver el motor en
-- src/lib/anti-overlap.ts y en src/app/api/webhook/sheets/route.ts).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  promoter_id UUID REFERENCES promoters(id) ON DELETE SET NULL,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 45,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'conflict', 'on_hold')),
  source TEXT NOT NULL DEFAULT 'vincimia_link'
    CHECK (source IN ('google_calendar', 'excel_promoter', 'vincimia_link', 'whatsapp_bot')),
  notes TEXT,
  proposed_times TEXT,
  whatsapp_confirmed BOOLEAN NOT NULL DEFAULT false,
  google_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_appointments_org_start
  ON appointments (organization_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_promoter
  ON appointments (promoter_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_contact
  ON appointments (contact_id);
CREATE INDEX IF NOT EXISTS idx_doctors_org
  ON doctors (organization_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor
  ON appointments (doctor_id);

-- ---------------------------------------------------------------------------
-- 7. RLS ACTIVADO EN TODAS LAS TABLAS
-- ---------------------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE promoters ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

-- Organizaciones: ver solo las propias; crear, solo autenticado.
DROP POLICY IF EXISTS "org_select_members" ON organizations;
CREATE POLICY "org_select_members" ON organizations FOR SELECT
  USING (public.is_org_member(id));
DROP POLICY IF EXISTS "org_insert_auth" ON organizations;
CREATE POLICY "org_insert_auth" ON organizations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "org_update_members" ON organizations;
CREATE POLICY "org_update_members" ON organizations FOR UPDATE
  USING (public.is_org_member(id));

-- Membresías: cada quien ve las suyas.
DROP POLICY IF EXISTS "membership_select_own" ON memberships;
CREATE POLICY "membership_select_own" ON memberships FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_member(organization_id));

-- Promotores, servicios, contactos y citas: solo miembros de la organización.
DROP POLICY IF EXISTS "promoters_members" ON promoters;
CREATE POLICY "promoters_members" ON promoters FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "services_members" ON services;
CREATE POLICY "services_members" ON services FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "contacts_members" ON contacts;
CREATE POLICY "contacts_members" ON contacts FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS "doctors_members" ON doctors;
CREATE POLICY "doctors_members" ON doctors FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "appointments_members" ON appointments;
CREATE POLICY "appointments_members" ON appointments FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 8. DATOS DE EJEMPLO — Org #1: Clínica Dental Sonrisa (para probar hoy)
-- Se crean para la FECHA DE HOY, así la Agenda siempre tiene datos.
-- Caso de conflicto del Documento Maestro (pág. 5):
-- Laura Méndez 10:00 (60 min, hasta 11:00 + 15 min buffer = 11:15) y
-- Luis Soto 10:15 (30 min) se traslapan → Luis queda en "conflict".
-- Para volver a sembrar otro día, borra las citas de ejemplo y vuelve a
-- correr solo esta sección.
-- ---------------------------------------------------------------------------
INSERT INTO organizations (id, name, slug, buffer_minutes, break_start, break_end, whatsapp_bot_enabled, google_calendar_sync)
VALUES ('11111111-1111-1111-1111-111111111111', 'Clínica Dental Sonrisa', 'clinica-sonrisa', 15, '14:00', '15:00', false, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO services (id, organization_id, name, duration_minutes, price, follow_up_days) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Consulta General', 45, 500, 30),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Valoración + Limpieza', 60, 800, 180),
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Revisión Inicial', 30, 350, 30),
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Control de Ortodoncia', 30, 600, 30)
ON CONFLICT (id) DO NOTHING;

INSERT INTO promoters (id, organization_id, name, code, phone, commission_rate) VALUES
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'Carlos M.', 'CARLOS', '+52 686 111 2233', 10.00),
  ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'Ana R.', 'ANA', '+52 686 444 5566', 10.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO contacts (id, organization_id, full_name, phone) VALUES
  ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 'Roberto Gómez', '+52 686 123 4567'),
  ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'Laura Méndez', '+52 686 987 6543'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Luis Soto', '+52 686 555 0199'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Sofía Castro', '+52 686 777 8899'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Mariana Torres', '+52 686 222 3344')
ON CONFLICT (id) DO NOTHING;

INSERT INTO doctors (id, organization_id, name, specialty, color, requires_deposit, schedule) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Dra. Ana López', 'general', '#dc2626', false, '[{"weekday":1,"start":"09:00","end":"18:00","active":true},{"weekday":2,"start":"09:00","end":"18:00","active":true},{"weekday":3,"start":"09:00","end":"18:00","active":true},{"weekday":4,"start":"09:00","end":"18:00","active":true},{"weekday":5,"start":"09:00","end":"18:00","active":true},{"weekday":6,"start":"09:00","end":"14:00","active":true}]'::jsonb),
  ('a2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Dr. Carlos Ruiz', 'ortodoncia_general', '#7c3aed', false, '[{"weekday":1,"start":"10:00","end":"19:00","active":true},{"weekday":2,"start":"10:00","end":"19:00","active":true},{"weekday":3,"start":"10:00","end":"19:00","active":true},{"weekday":4,"start":"10:00","end":"19:00","active":true},{"weekday":5,"start":"10:00","end":"19:00","active":true}]'::jsonb),
  ('a3333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Dra. María Torres', 'endodoncista', '#0891b2', true, '[{"weekday":1,"start":"09:00","end":"17:00","active":true},{"weekday":3,"start":"09:00","end":"17:00","active":true},{"weekday":5,"start":"09:00","end":"17:00","active":true}]'::jsonb),
  ('a4444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Dr. Jorge Sánchez', 'endodoncista_general', '#0891b2', false, '[{"weekday":2,"start":"09:00","end":"15:00","active":true},{"weekday":4,"start":"09:00","end":"15:00","active":true},{"weekday":6,"start":"09:00","end":"15:00","active":true}]'::jsonb),
  ('a5555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Dra. Lucía Fernández', 'ortopediatra', '#dc2626', false, '[{"weekday":1,"start":"09:00","end":"15:00","active":true},{"weekday":2,"start":"09:00","end":"15:00","active":true},{"weekday":3,"start":"09:00","end":"15:00","active":true},{"weekday":4,"start":"09:00","end":"15:00","active":true},{"weekday":5,"start":"09:00","end":"15:00","active":true}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (id, organization_id, contact_id, service_id, promoter_id, doctor_id, start_time, end_time, duration_minutes, price, status, source, notes) VALUES
  ('d0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888888', '22222222-2222-2222-2222-222222222222', NULL, 'a1111111-1111-1111-1111-111111111111', CURRENT_DATE + TIME '09:00', CURRENT_DATE + TIME '09:45', 45, 500, 'completed', 'google_calendar', 'Cita creada a mano en Google Calendar.'),
  ('d0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999', '33333333-3333-3333-3333-333333333333', '66666666-6666-6666-6666-666666666666', 'a1111111-1111-1111-1111-111111111111', CURRENT_DATE + TIME '10:00', CURRENT_DATE + TIME '11:00', 60, 800, 'confirmed', 'excel_promoter', 'Promotor: Carlos M.'),
  ('d0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', '77777777-7777-7777-7777-777777777777', 'a1111111-1111-1111-1111-111111111111', CURRENT_DATE + TIME '10:15', CURRENT_DATE + TIME '10:45', 30, 350, 'conflict', 'excel_promoter', 'CONFLICTO: choca con Laura Méndez 10:00–11:00 + 15 min de buffer (hasta 11:15). No se le cobra comisión.'),
  ('d0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', NULL, 'a2222222-2222-2222-2222-222222222222', CURRENT_DATE + TIME '11:30', CURRENT_DATE + TIME '12:15', 45, 500, 'pending', 'vincimia_link', 'Reservó desde el link público.'),
  ('d0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', 'a2222222-2222-2222-2222-222222222222', CURRENT_DATE + TIME '12:30', CURRENT_DATE + TIME '13:00', 30, 600, 'pending', 'excel_promoter', 'Promotor: Carlos M.')
ON CONFLICT (id) DO NOTHING;
