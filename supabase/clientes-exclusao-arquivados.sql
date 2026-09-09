-- Portal de Gestao Contabil - Exclusao definitiva de clientes arquivados
-- Cria uma RPC segura para excluir apenas clientes arquivados/inativos.
-- A funcao retorna os caminhos dos arquivos no Storage para limpeza pelo frontend.
-- Pode ser executado mais de uma vez.

create or replace function public.excluir_cliente_arquivado_portal(p_cliente_id uuid)
returns table (
  cliente_id uuid,
  cliente_nome text,
  arquivos_storage text[],
  anexos_count integer,
  contratos_sociais_count integer,
  relatorios_reinf_desvinculados_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes%rowtype;
  v_anexos_paths text[] := array[]::text[];
  v_contratos_paths text[] := array[]::text[];
begin
  if p_cliente_id is null then
    raise exception 'Cliente nao informado.';
  end if;

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
    raise exception 'Usuario sem permissao para excluir clientes arquivados.';
  end if;

  select *
  into v_cliente
  from public.clientes c
  where c.id = p_cliente_id
  for update;

  if not found then
    raise exception 'Cliente nao encontrado.';
  end if;

  if coalesce(v_cliente.arquivado, false) = false
    and lower(coalesce(v_cliente.status, '')) <> 'inativo'
  then
    raise exception 'Somente clientes arquivados ou inativos podem ser excluidos.';
  end if;

  select
    coalesce(array_agg(distinct nullif(btrim(a.caminho_arquivo), '')), array[]::text[]),
    count(*)::integer
  into v_anexos_paths, anexos_count
  from public.anexos a
  where a.cliente_id = p_cliente_id;

  select
    coalesce(array_agg(distinct nullif(btrim(ccs.caminho_arquivo), '')), array[]::text[]),
    count(*)::integer
  into v_contratos_paths, contratos_sociais_count
  from public.clientes_contratos_sociais ccs
  where ccs.cliente_id = p_cliente_id;

  select count(*)::integer
  into relatorios_reinf_desvinculados_count
  from public.reinf_relatorios rr
  where rr.cliente_id = p_cliente_id;

  select coalesce(array_agg(distinct caminho), array[]::text[])
  into arquivos_storage
  from (
    select unnest(v_anexos_paths || v_contratos_paths) as caminho
  ) paths
  where caminho is not null
    and btrim(caminho) <> '';

  cliente_id := v_cliente.id;
  cliente_nome := coalesce(
    nullif(btrim(v_cliente.nome_identificacao), ''),
    nullif(btrim(v_cliente.razao_social), ''),
    v_cliente.cnpj,
    v_cliente.id::text
  );

  delete from public.clientes c
  where c.id = p_cliente_id;

  return next;
end;
$$;

revoke all on function public.excluir_cliente_arquivado_portal(uuid) from public;
grant execute on function public.excluir_cliente_arquivado_portal(uuid) to authenticated;
