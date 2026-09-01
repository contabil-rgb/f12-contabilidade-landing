-- Portal de Gestao Contabil - Remocao segura de versoes do Contrato Social
-- Execute no SQL Editor do Supabase antes de habilitar o botao Remover no portal.
-- Pode ser executado mais de uma vez.

create or replace function public.remover_contrato_social_cliente_portal(
  p_contrato_id uuid
)
returns public.clientes_contratos_sociais
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_cliente public.clientes%rowtype;
  v_contrato public.clientes_contratos_sociais;
begin
  select u.id
    into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.status = 'Ativo'
    and u.perfil_acesso in (
      'coordenador_administrador',
      'setor_contabil_operacional'
    )
  limit 1;

  if v_usuario_id is null then
    raise exception 'Usuario sem permissao para remover contrato social.';
  end if;

  if p_contrato_id is null then
    raise exception 'Contrato social e obrigatorio para remocao.';
  end if;

  select *
    into v_contrato
  from public.clientes_contratos_sociais ccs
  where ccs.id = p_contrato_id
  for update;

  if v_contrato.id is null then
    raise exception 'Contrato social nao encontrado.';
  end if;

  select *
    into v_cliente
  from public.clientes c
  where c.id = v_contrato.cliente_id
  limit 1;

  if v_cliente.id is null then
    raise exception 'Cliente do contrato social nao encontrado.';
  end if;

  if coalesce(v_cliente.arquivado, false) or lower(coalesce(v_cliente.status, '')) = 'inativo' then
    raise exception 'Restaure o cliente antes de remover contrato social.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_contrato.cliente_id::text));

  delete from public.clientes_contratos_sociais ccs
  where ccs.id = v_contrato.id
  returning * into v_contrato;

  return v_contrato;
end;
$$;

revoke all on function public.remover_contrato_social_cliente_portal(uuid) from public;
grant execute on function public.remover_contrato_social_cliente_portal(uuid) to authenticated;
