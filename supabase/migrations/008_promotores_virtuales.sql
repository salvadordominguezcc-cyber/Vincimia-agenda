-- ============================================================================
-- Vincimia Agenda — Migración 008 (Promotores virtuales)
-- Pégala en Supabase → SQL Editor → Run, DESPUÉS de la 001–007.
-- NO ESTÁ APLICADA: el módulo corre en modo demo (localStorage) hasta
-- que el dueño la aplique y migre el panel a Supabase.
--
-- Decisión de diseño: NO se crea otra tabla de promotores. Se extiende
-- la tabla `promoters` que ya existe (misma comisión, mismo código,
-- mismas citas con promoter_id): un promotor virtual es un promotor
-- con is_virtual = true, persona y canal. Lo único nuevo es la tabla
-- `promoter_conversations`, el embudo previo a la cita (la charla con
-- el paciente), porque las citas ya existen en `appointments`.
--
-- Flujo: 3 fanpages (Facebook e Instagram), un promotor virtual en
-- cada una, y los 3 pasan al mismo WhatsApp del consultorio
-- (+52 686 338 6047) donde se manda la información para la cita. Cada
-- paciente queda registrado con el código de su promotor, así la
-- comisión se liquida igual que con promotores humanos: solo sobre
-- citas completadas.
-- ============================================================================

-- 1. Campos del promotor virtual en la tabla que ya existe.
ALTER TABLE public.promoters
  ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS persona TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT
    CHECK (channel IS NULL OR channel IN ('facebook', 'instagram', 'whatsapp')),
  ADD COLUMN IF NOT EXISTS fanpage_url TEXT;

-- 2. Conversaciones de los promotores virtuales (una fila por paciente
-- y promotor). status: conversando = charlando en la fanpage,
-- en_whatsapp = ya pasó al WhatsApp único, cita_confirmada /
-- cita_completada = la cita con ese promoter_id llegó a ese estado,
-- sin_respuesta = el paciente dejó de contestar.
CREATE TABLE IF NOT EXISTS public.promoter_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  promoter_id UUID NOT NULL REFERENCES public.promoters(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'facebook'
    CHECK (channel IN ('facebook', 'instagram', 'whatsapp')),
  patient_name TEXT,
  patient_phone TEXT,
  treatment TEXT,
  status TEXT NOT NULL DEFAULT 'conversando'
    CHECK (status IN ('conversando', 'en_whatsapp', 'cita_confirmada', 'cita_completada', 'sin_respuesta')),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promoter_conversations_org_created
  ON public.promoter_conversations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promoter_conversations_promoter
  ON public.promoter_conversations (promoter_id, created_at DESC);

-- 3. RLS: solo miembros de la organización (la ruta de servidor usa
-- service_role y pasa por encima de RLS).
ALTER TABLE public.promoter_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promoter_conversations_org" ON public.promoter_conversations;
CREATE POLICY "promoter_conversations_org" ON public.promoter_conversations
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- 4. Sin datos de ejemplo: los 3 promotores virtuales por defecto
-- viven en el código (src/lib/virtual-promoters.ts) y se crean desde
-- Dashboard → Promotores. Nada se siembra aquí: el dueño pone los
-- nombres, los estilos y los links de sus fanpages.
