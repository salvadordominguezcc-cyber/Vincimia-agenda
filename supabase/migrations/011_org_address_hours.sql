-- 011: dirección y horario de atención del negocio (para el diseño
-- del link de reserva y de Nueva cita: la tarjeta con la dirección y
-- el horario sale de Ajustes, no quemada en el código).
-- Aplicar en Supabase > SQL Editor. Sin aplicar, Ajustes guarda la
-- dirección y el horario solo en el aparato y el servidor los deja
-- pendientes (no rompe el guardado de los demás datos).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS hours_text TEXT;
