-- ============================================================================
-- Vincimia Agenda — Migración 007 (Módulo de Reseñas)
-- Pégala en Supabase → SQL Editor → Run, DESPUÉS de la 001–006.
-- No toca nada de lo anterior: solo agrega la columna del link de
-- Google en organizations y dos tablas nuevas (feedback y
-- review_requests). Sin datos de ejemplo: el link de Google arranca
-- vacío y las reseñas empiezan en cero.
--
-- Flujo: cuando una cita se marca completada, /api/appointments/status
-- guarda una fila en review_requests (en cola si WhatsApp no está
-- conectado, enviada si sí) y manda al paciente su link
-- /resena/<slug>. El paciente califica 1–5 estrellas:
--   · 4–5 estrellas → se guarda solo la calificación y se redirige al
--     google_review_url de la organización (Google Maps).
--   · 1–3 estrellas → formulario privado que se guarda en feedback.
-- POLÍTICA DE GOOGLE (prohíbe el review gating): el formulario
-- privado SIEMPRE incluye el enlace discreto "O publicar opinión
-- directamente en Google" y la solicitud se manda a todos los
-- pacientes por igual, sin filtrar a quién se le pide la reseña.
-- ============================================================================

-- 1. Link de reseñas de Google por organización (nullable: arranca
-- vacío hasta que el dueño lo configure en Dashboard → Reseñas).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS google_review_url TEXT;

-- 2. Retroalimentación y calificaciones (1–5 estrellas).
-- appointment_id es opcional: el QR de recepción no tiene cita.
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  client_name TEXT,
  client_contact TEXT,
  comment TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Solicitudes de reseña (cola de WhatsApp al completar una cita).
-- status: queued = en cola (WhatsApp no conectado o bot apagado),
-- sent = enviada, failed = falló el envío, no_phone = sin teléfono.
CREATE TABLE IF NOT EXISTS public.review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone TEXT,
  review_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'failed', 'no_phone')),
  whatsapp_message_id TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_org_created
  ON public.feedback (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_org_unread
  ON public.feedback (organization_id, is_read);
CREATE INDEX IF NOT EXISTS idx_review_requests_org_created
  ON public.review_requests (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_requests_appointment
  ON public.review_requests (appointment_id);

-- 4. RLS activado en las dos tablas nuevas.
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;

-- feedback: cualquier visitante puede DEJAR su calificación (la página
-- pública /resena/[slug] inserta con la llave anon). Nadie más que los
-- miembros de la organización puede leerla ni marcarla como leída.
DROP POLICY IF EXISTS "feedback_public_insert" ON public.feedback;
CREATE POLICY "feedback_public_insert" ON public.feedback
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "feedback_org_read" ON public.feedback;
CREATE POLICY "feedback_org_read" ON public.feedback
  FOR SELECT USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "feedback_org_update" ON public.feedback;
CREATE POLICY "feedback_org_update" ON public.feedback
  FOR UPDATE USING (public.is_org_member(organization_id));

-- review_requests: solo miembros de la organización (la ruta de
-- servidor usa service_role y pasa por encima de RLS).
DROP POLICY IF EXISTS "review_requests_org" ON public.review_requests;
CREATE POLICY "review_requests_org" ON public.review_requests
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- 5. Datos públicos de la organización para la página /resena/[slug].
-- La tabla organizations NO se abre en lectura pública (ahí viven el
-- secreto del webhook y los tokens de Google). Esta función devuelve
-- SOLO los campos públicos y es lo único que la página pública puede
-- leer. SECURITY DEFINER: corre con permisos del dueño de la función,
-- no del visitante anónimo.
CREATE OR REPLACE FUNCTION public.get_public_org(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  google_review_url TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT o.id, o.name, o.slug, o.google_review_url
  FROM public.organizations o
  WHERE o.slug = p_slug
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_org(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_org(TEXT) TO anon, authenticated;
