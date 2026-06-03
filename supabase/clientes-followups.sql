-- Portal de Gestao Contabil - Timeline de follow-ups por cliente
-- Esta etapa cria a tabela operacional de acompanhamentos/eventos por cliente.
-- Pode ser executada mais de uma vez com seguranca.

create extension if not exists pgcrypto;

create table if not exists public.clientes_followups (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  criado_por uuid references public.usuarios(id),
  responsavel_usuario_id uuid references public.usuarios(id),

  tipo text not null,
  status text not null default 'Aberto',
  prioridade text not null default 'Media',
  canal text,
  origem text,

  descricao text not null,
  resultado text,
  proxima_acao text,

  data_contato date,
  data_prevista date,
  data_conclusao date,

  contexto_area text,
  contexto_chave text,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint clientes_followups_tipo_not_blank check (length(trim(tipo)) > 0),
  constraint clientes_followups_status_not_blank check (length(trim(status)) > 0),
  constraint clientes_followups_prioridade_not_blank check (length(trim(prioridade)) > 0),
  constraint clientes_followups_descricao_not_blank check (length(trim(descricao)) > 0)
);

create index if not exists idx_followups_cliente_id
  on public.clientes_followups(cliente_id);

create index if not exists idx_followups_status
  on public.clientes_followups(status);

create index if not exists idx_followups_prioridade
  on public.clientes_followups(prioridade);

create index if not exists idx_followups_data_prevista
  on public.clientes_followups(data_prevista);

create index if not exists idx_followups_data_conclusao
  on public.clientes_followups(data_conclusao);

create index if not exists idx_followups_responsavel
  on public.clientes_followups(responsavel_usuario_id);

create index if not exists idx_followups_tipo
  on public.clientes_followups(tipo);

create index if not exists idx_followups_contexto_area
  on public.clientes_followups(contexto_area);

create index if not exists idx_followups_criado_em
  on public.clientes_followups(criado_em desc);

create index if not exists idx_followups_cliente_status_prevista
  on public.clientes_followups(cliente_id, status, data_prevista);

create or replace function public.set_atualizado_em_clientes_followups()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_clientes_followups_set_atualizado_em on public.clientes_followups;
create trigger trg_clientes_followups_set_atualizado_em
before update on public.clientes_followups
for each row
execute function public.set_atualizado_em_clientes_followups();

grant select, insert, update on table public.clientes_followups to authenticated;

alter table public.clientes_followups enable row level security;

drop policy if exists "clientes_followups_select_authenticated_active" on public.clientes_followups;
create policy "clientes_followups_select_authenticated_active"
on public.clientes_followups
for select
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);

drop policy if exists "clientes_followups_insert_authenticated_active" on public.clientes_followups;
create policy "clientes_followups_insert_authenticated_active"
on public.clientes_followups
for insert
to authenticated
with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);

drop policy if exists "clientes_followups_update_authenticated_active" on public.clientes_followups;
create policy "clientes_followups_update_authenticated_active"
on public.clientes_followups
for update
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
)
with check (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
  )
);

-- Sem DELETE nesta fase. A recomendacao e concluir/reabrir follow-up,
-- preservando a trilha operacional do cliente.
