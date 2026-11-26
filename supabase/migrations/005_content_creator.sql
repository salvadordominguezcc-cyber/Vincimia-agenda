-- 005_content_creator.sql — Creador de contenido (SaaS por negocio)
-- Cada publicación pertenece a una organización (organization_id) y
-- RLS hace que cada negocio vea solo su contenido. Nada se mezcla.
-- Estados: borrador → aprobado → programado → publicado (o pausado).
-- Plan Básico: 8 publicaciones al mes. Plan Pro: ilimitado.
-- El límite se controla en src/lib/content.ts, no solo aquí.

create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  topic text not null,
  title text,
  caption text not null,
  image_prompt text,
  image_url text,
  channels text[] not null default array['facebook', 'instagram'],
  status text not null default 'borrador'
    check (status in ('borrador', 'aprobado', 'programado', 'publicado', 'pausado')),
  scheduled_at timestamptz,
  published_at timestamptz,
  meta_post_id text,
  views int not null default 0,
  messages int not null default 0,
  appointments int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.content_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  topic text not null,
  title text not null,
  caption_template text not null,
  image_prompt text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.content_posts enable row level security;
alter table public.content_templates enable row level security;

-- Solo miembros de la organización ven y editan su contenido.
create policy "content_posts_org" on public.content_posts
  for all using (
    exists (select 1 from public.memberships m
      where m.organization_id = content_posts.organization_id
      and m.user_id = auth.uid())
  );

create policy "content_templates_org" on public.content_templates
  for all using (
    organization_id is null
    or exists (select 1 from public.memberships m
      where m.organization_id = content_templates.organization_id
      and m.user_id = auth.uid())
  );

-- Plantillas por defecto (temas de dolor dental, de Dentiplus).
insert into public.content_templates (topic, title, caption_template, image_prompt, is_default) values
  ('limpieza', 'Limpieza dental', '¿Tus encías sangran al cepillarte? Puede ser gingivitis. Agenda tu limpieza en {negocio} y cuida tu sonrisa. Escríbenos por WhatsApp.', 'Dentista sonriente haciendo limpieza dental, consultorio limpio y luminoso', true),
  ('blanqueamiento', 'Blanqueamiento dental', '¿Tus dientes se ven amarillos o manchados? El blanqueamiento te devuelve la sonrisa. Agenda tu valoración en {negocio}.', 'Sonrisa blanca y brillante, antes y después, consultorio dental', true),
  ('dolor-muela', 'Dolor de muela', '¿Te duele la muela? No esperes a que empeore. Agenda tu valoración urgente en {negocio}, hoy mismo.', 'Paciente con dolor de muela, dentista revisando con cuidado', true),
  ('ortodoncia', 'Ortodoncia', '¿Quieres enderezar tus dientes? La ortodoncia es para todas las edades. Agenda tu valoración en {negocio}.', 'Sonrisa con brackets, adolescente sonriendo', true),
  ('implante', 'Implante dental', '¿Te falta un diente? El implante te devuelve comer y sonreír con confianza. Agenda en {negocio}.', 'Implante dental, sonrisa completa y natural', true),
  ('caries', 'Caries', '¿Tienes una caries? Entre más pronto se atienda, más sencillo es. Agenda tu revisión en {negocio}.', 'Dentista revisando una muela con espejo dental', true),
  ('sensibilidad', 'Sensibilidad dental', '¿Te duelen los dientes con lo frío o caliente? Puede ser sensibilidad. Agenda tu revisión en {negocio}.', 'Persona tomando bebida fría con gesto de sensibilidad, dentista al lado', true)
on conflict do nothing;
