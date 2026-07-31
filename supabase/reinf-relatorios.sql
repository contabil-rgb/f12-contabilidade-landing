-- Portal de Gestao Contabil - Historico de relatorios REINF gerados
-- Execute no SQL Editor do Supabase antes de usar o botao "Salvar relatorio" no modal da REINF.

create extension if not exists pgcrypto;

create table if not exists public.reinf_relatorios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  cnpj text not null,
  razao_social text not null,
  nome_identificacao text,
  responsavel text,
  revisor text,
  periodicidade text not null,
  ano_referencia text,
  meses jsonb not null default '[]'::jsonb,
  assunto text not null,
  corpo_mensagem text not null,
  socios jsonb not null default '[]'::jsonb,
  criado_por uuid references public.usuarios(id),
  criado_por_nome text,
  criado_por_email text,
  criado_em timestamp with time zone not null default now(),
  constraint reinf_relatorios_periodicidade_check check (periodicidade in ('Mensal', 'Trimestral')),
  constraint reinf_relatorios_meses_array_check check (jsonb_typeof(meses) = 'array'),
  constraint reinf_relatorios_socios_array_check check (jsonb_typeof(socios) = 'array')
);

create index if not exists idx_reinf_relatorios_cliente_id
  on public.reinf_relatorios(cliente_id);

create index if not exists idx_reinf_relatorios_criado_em
  on public.reinf_relatorios(criado_em desc);

alter table public.reinf_relatorios enable row level security;

create or replace function public.is_portal_usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
  );
$$;

drop policy if exists reinf_relatorios_select_authenticated_active on public.reinf_relatorios;
create policy reinf_relatorios_select_authenticated_active
on public.reinf_relatorios
for select
to authenticated
using (public.is_portal_usuario_ativo());

create or replace function public.salvar_reinf_relatorio_portal(
  p_relatorio jsonb
)
returns public.reinf_relatorios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_cliente public.clientes%rowtype;
  v_cliente_id uuid;
  v_periodicidade text;
  v_ano_referencia text;
  v_meses jsonb;
  v_assunto text;
  v_corpo text;
  v_socios jsonb;
  v_total_socios integer;
  v_relatorio public.reinf_relatorios;
begin
  select *
    into v_usuario
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.status = 'Ativo'
    and u.perfil_acesso in (
      'coordenador_administrador',
      'setor_contabil_operacional'
    )
  limit 1;

  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para salvar relatorio REINF.';
  end if;

  if p_relatorio is null or jsonb_typeof(p_relatorio) <> 'object' then
    raise exception 'Relatorio REINF invalido.';
  end if;

  v_cliente_id := nullif(p_relatorio->>'cliente_id', '')::uuid;
  if v_cliente_id is null then
    raise exception 'Cliente do relatorio REINF e obrigatorio.';
  end if;

  select *
    into v_cliente
  from public.clientes c
  where c.id = v_cliente_id
  limit 1;

  if v_cliente.id is null then
    raise exception 'Cliente nao encontrado para salvar relatorio REINF.';
  end if;

  v_periodicidade := coalesce(nullif(btrim(p_relatorio->>'periodicidade'), ''), 'Trimestral');
  if v_periodicidade not in ('Mensal', 'Trimestral') then
    raise exception 'Periodicidade do relatorio REINF invalida.';
  end if;

  v_ano_referencia := nullif(btrim(p_relatorio->>'ano_referencia'), '');
  v_meses := coalesce(p_relatorio->'meses', '[]'::jsonb);
  v_socios := coalesce(p_relatorio->'socios', '[]'::jsonb);
  v_assunto := nullif(btrim(p_relatorio->>'assunto'), '');
  v_corpo := nullif(btrim(p_relatorio->>'corpo_mensagem'), '');

  if jsonb_typeof(v_meses) <> 'array' then
    raise exception 'Meses do relatorio REINF devem ser uma lista.';
  end if;

  if jsonb_typeof(v_socios) <> 'array' then
    raise exception 'Socios do relatorio REINF devem ser uma lista.';
  end if;

  select count(*)
    into v_total_socios
  from jsonb_array_elements(v_socios);

  if v_total_socios < 1 then
    raise exception 'Inclua pelo menos um socio no relatorio REINF.';
  end if;

  if v_total_socios > 50 then
    raise exception 'Limite de 50 socios por relatorio REINF excedido.';
  end if;

  if v_assunto is null then
    raise exception 'Assunto do relatorio REINF e obrigatorio.';
  end if;

  if v_corpo is null then
    raise exception 'Mensagem do relatorio REINF e obrigatoria.';
  end if;

  insert into public.reinf_relatorios (
    cliente_id,
    cnpj,
    razao_social,
    nome_identificacao,
    responsavel,
    revisor,
    periodicidade,
    ano_referencia,
    meses,
    assunto,
    corpo_mensagem,
    socios,
    criado_por,
    criado_por_nome,
    criado_por_email
  )
  values (
    v_cliente.id,
    coalesce(nullif(v_cliente.cnpj, ''), nullif(p_relatorio->>'cnpj', ''), 'Nao informado'),
    coalesce(nullif(v_cliente.razao_social, ''), nullif(p_relatorio->>'razao_social', ''), 'Cliente sem razao social'),
    coalesce(nullif(v_cliente.nome_identificacao, ''), nullif(p_relatorio->>'nome_identificacao', '')),
    coalesce(nullif(v_cliente.responsavel, ''), nullif(p_relatorio->>'responsavel', '')),
    coalesce(nullif(v_cliente.revisor, ''), nullif(p_relatorio->>'revisor', '')),
    v_periodicidade,
    v_ano_referencia,
    v_meses,
    v_assunto,
    v_corpo,
    v_socios,
    v_usuario.id,
    v_usuario.nome,
    v_usuario.email
  )
  returning * into v_relatorio;

  return v_relatorio;
end;
$$;

revoke all on function public.salvar_reinf_relatorio_portal(jsonb) from public;
grant execute on function public.salvar_reinf_relatorio_portal(jsonb) to authenticated;

create or replace function public.excluir_reinf_relatorio_portal(
  p_relatorio_id uuid
)
returns public.reinf_relatorios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_relatorio public.reinf_relatorios;
begin
  select *
    into v_usuario
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.status = 'Ativo'
    and u.perfil_acesso = 'coordenador_administrador'
  limit 1;

  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para excluir relatorio REINF.';
  end if;

  if p_relatorio_id is null then
    raise exception 'Relatorio REINF e obrigatorio para exclusao.';
  end if;

  delete from public.reinf_relatorios r
  where r.id = p_relatorio_id
  returning * into v_relatorio;

  if v_relatorio.id is null then
    raise exception 'Relatorio REINF nao encontrado.';
  end if;

  return v_relatorio;
end;
$$;

revoke all on function public.excluir_reinf_relatorio_portal(uuid) from public;
grant execute on function public.excluir_reinf_relatorio_portal(uuid) to authenticated;

grant select on table public.reinf_relatorios to authenticated;
