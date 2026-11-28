-- 012: marca "aviso al grupo" por cita (la tarjeta de confirmación ya
-- se reenvió al grupo de WhatsApp de promotores o sigue pendiente).
-- Aplicar en Supabase > SQL Editor. Sin aplicar, el panel guarda la
-- marca solo en el aparato y el servidor la deja pendiente (no rompe
-- nada: ni Google, ni WhatsApp, ni la hoja, ni la confirmación).

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS group_notified BOOLEAN NOT NULL DEFAULT false;
