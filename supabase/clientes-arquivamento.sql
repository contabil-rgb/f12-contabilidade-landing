-- Portal de Gestao Contabil - Arquivamento de clientes
-- Cria um controle proprio de arquivamento sem excluir clientes.
-- Pode ser executado mais de uma vez.

alter table public.clientes
  add column if not exists arquivado boolean not null default false,
  add column if not exists arquivado_em timestamptz,
  add column if not exists arquivado_por uuid,
  add column if not exists arquivado_motivo text;

create index if not exists idx_clientes_arquivado
  on public.clientes(arquivado);

update public.clientes
set
  arquivado = true,
  arquivado_em = coalesce(arquivado_em, atualizado_em, now()),
  arquivado_motivo = coalesce(arquivado_motivo, 'Migrado do status Inativo')
where coalesce(arquivado, false) = false
  and lower(coalesce(status, '')) = 'inativo';

create or replace function public.arquivar_cliente_portal(
  p_cliente_id uuid,
  p_motivo text default null
)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
begin
  if not exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
  ) then
    raise exception 'Usuario sem permissao para arquivar clientes.';
  end if;

  update public.clientes
  set
    arquivado = true,
    arquivado_em = now(),
    arquivado_por = auth.uid(),
    arquivado_motivo = nullif(btrim(coalesce(p_motivo, '')), ''),
    status = case when lower(coalesce(status, '')) = 'inativo' then 'Ativo' else coalesce(nullif(btrim(coalesce(status, '')), ''), 'Ativo') end,
    atualizado_em = now()
  where id = p_cliente_id
  returning * into v_cliente;

  if not found then
    raise exception 'Cliente nao encontrado.';
  end if;

  return v_cliente;
end;
$$;

revoke all on function public.arquivar_cliente_portal(uuid, text) from public;
grant execute on function public.arquivar_cliente_portal(uuid, text) to authenticated;

create or replace function public.restaurar_cliente_portal(p_cliente_id uuid)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
begin
  if not exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
  ) then
    raise exception 'Usuario sem permissao para restaurar clientes.';
  end if;

  update public.clientes
  set
    arquivado = false,
    arquivado_em = null,
    arquivado_por = null,
    arquivado_motivo = null,
    status = case when lower(coalesce(status, '')) = 'inativo' then 'Ativo' else status end,
    atualizado_em = now()
  where id = p_cliente_id
  returning * into v_cliente;

  if not found then
    raise exception 'Cliente nao encontrado.';
  end if;

  return v_cliente;
end;
$$;

revoke all on function public.restaurar_cliente_portal(uuid) from public;
grant execute on function public.restaurar_cliente_portal(uuid) to authenticated;

create or replace function public.inativar_cliente_portal(p_cliente_id uuid)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.arquivar_cliente_portal(p_cliente_id, 'Inativado pelo portal');
end;
$$;

revoke all on function public.inativar_cliente_portal(uuid) from public;
grant execute on function public.inativar_cliente_portal(uuid) to authenticated;
