-- Portal de Gestao Contabil - Hardening de public.clientes
-- Etapa 4.2: funcao segura para inativar cliente.
-- Pode ser executado mais de uma vez.

-- Esta etapa ainda nao remove as permissoes diretas de update em clientes.
-- A reducao dessas permissoes ficara para uma etapa posterior, depois que
-- criacao e atualizacao tambem estiverem passando por funcoes seguras.

create or replace function public.inativar_cliente_portal(p_cliente_id uuid)
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
    raise exception 'Usuario sem permissao para inativar clientes.';
  end if;

  update public.clientes
  set
    status = 'Inativo',
    atualizado_em = now()
  where id = p_cliente_id
  returning * into v_cliente;

  if not found then
    raise exception 'Cliente nao encontrado.';
  end if;

  return v_cliente;
end;
$$;

revoke all on function public.inativar_cliente_portal(uuid) from public;
grant execute on function public.inativar_cliente_portal(uuid) to authenticated;
