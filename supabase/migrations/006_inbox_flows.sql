-- 006_inbox_flows.sql — Bandeja de equipo + flujos visuales (costo $0)
-- Sin suscripciones nuevas: Next.js + Supabase + API de Meta (Fase 2).
-- Cada conversación, mensaje y flujo pertenece a una organización
-- (organization_id) y RLS hace que cada negocio vea solo lo suyo.
-- Nada se mezcla entre clínicas.
-- Estados de conversación: abierta → asignada → resuelta.
-- Tipos de nodo de flujo: mensaje, pregunta, condicion, agendar,
-- confirmar, transferir. El nodo guarda next_id (siguiente cajita).

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  contact_name text not null,
  contact_phone text,
  channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'facebook', 'instagram')),
  status text not null default 'abierta'
    check (status in ('abierta', 'asignada', 'resuelta')),
  assigned_to text,
  assigned_role text check (assigned_role in ('recepcionista', 'admin')),
  last_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender text not null default 'paciente'
    check (sender in ('paciente', 'equipo', 'bot')),
  text text not null,
  meta_message_id text,
  is_draft boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  nodes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.flows enable row level security;

-- Solo miembros de la organización ven y editan su bandeja y flujos.
create policy "conversations_org" on public.conversations
  for all using (
    exists (select 1 from public.memberships m
      where m.organization_id = conversations.organization_id
      and m.user_id = auth.uid())
  );

create policy "inbox_messages_org" on public.inbox_messages
  for all using (
    exists (select 1 from public.memberships m
      where m.organization_id = inbox_messages.organization_id
      and m.user_id = auth.uid())
  );

create policy "flows_org" on public.flows
  for all using (
    exists (select 1 from public.memberships m
      where m.organization_id = flows.organization_id
      and m.user_id = auth.uid())
  );

create index if not exists idx_conversations_org_status
  on public.conversations (organization_id, status);
create index if not exists idx_inbox_messages_conversation
  on public.inbox_messages (conversation_id, created_at);
create index if not exists idx_flows_org
  on public.flows (organization_id);
