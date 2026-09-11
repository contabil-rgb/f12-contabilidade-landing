-- Portal de Gestao Contabil - Checklist de documentos mensais
-- Etapa 1: funcoes RPC para uso pelo portal.
-- Execute depois de supabase/checklist.sql.
-- Pode ser executado mais de uma vez com seguranca.

create or replace function public.get_portal_usuario_ativo()
returns public.usuarios
language sql
stable
security definer
set search_path = public
as $$
  select u.*
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.status = 'Ativo'
    and u.perfil_acesso in (
      'coordenador_administrador',
      'setor_contabil_operacional'
    )
  limit 1;
$$;

create or replace function public.salvar_checklist_item_portal(p_item jsonb)
returns public.checklist_itens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_id uuid;
  v_descricao text;
  v_ordem integer;
  v_ativo boolean;
  v_existente public.checklist_itens;
  v_item public.checklist_itens;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para salvar item do checklist.';
  end if;

  if p_item is null or jsonb_typeof(p_item) <> 'object' then
    raise exception 'Item do checklist invalido.';
  end if;

  v_id := nullif(btrim(coalesce(p_item->>'id', '')), '')::uuid;
  v_descricao := nullif(btrim(coalesce(p_item->>'descricao', '')), '');
  v_ordem := coalesce(nullif(btrim(coalesce(p_item->>'ordem', '')), '')::integer, 0);
  v_ativo := coalesce(nullif(btrim(coalesce(p_item->>'ativo', '')), '')::boolean, true);

  if v_descricao is null then
    raise exception 'Descricao do item do checklist e obrigatoria.';
  end if;

  select *
    into v_existente
  from public.checklist_itens i
  where lower(btrim(i.descricao)) = lower(btrim(v_descricao))
    and (v_id is null or i.id <> v_id)
  limit 1;

  if v_existente.id is not null then
    if v_existente.ativo = false then
      update public.checklist_itens
      set descricao = v_existente.descricao,
          ordem = v_ordem,
          ativo = true
      where id = v_existente.id
      returning * into v_item;
      return v_item;
    end if;

    raise exception 'Ja existe um item de checklist cadastrado com essa descricao: %.', v_existente.descricao;
  end if;

  if v_id is not null then
    update public.checklist_itens
    set descricao = v_descricao,
        ordem = v_ordem,
        ativo = v_ativo
    where id = v_id
    returning * into v_item;

    if v_item.id is null then
      raise exception 'Item do checklist nao encontrado.';
    end if;

    return v_item;
  end if;

  insert into public.checklist_itens (descricao, ordem, ativo)
  values (v_descricao, v_ordem, v_ativo)
  returning * into v_item;

  return v_item;
end;
$$;

revoke all on function public.salvar_checklist_item_portal(jsonb) from public;
grant execute on function public.salvar_checklist_item_portal(jsonb) to authenticated;

create or replace function public.excluir_checklist_item_portal(p_item_id uuid)
returns public.checklist_itens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_item public.checklist_itens;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para desativar item do checklist.';
  end if;

  if p_item_id is null then
    raise exception 'Item do checklist e obrigatorio.';
  end if;

  update public.checklist_itens
  set ativo = false
  where id = p_item_id
  returning * into v_item;

  if v_item.id is null then
    raise exception 'Item do checklist nao encontrado.';
  end if;

  return v_item;
end;
$$;

revoke all on function public.excluir_checklist_item_portal(uuid) from public;
grant execute on function public.excluir_checklist_item_portal(uuid) to authenticated;

create or replace function public.salvar_checklist_cliente_itens_portal(
  p_cliente_id uuid,
  p_itens jsonb
)
returns setof public.checklist_clientes_itens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_item jsonb;
  v_item_id uuid;
  v_ordem integer;
  v_ativo boolean;
  v_pos integer := 0;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para salvar itens do cliente.';
  end if;

  if p_cliente_id is null then
    raise exception 'Cliente e obrigatorio para salvar checklist.';
  end if;

  if not exists (select 1 from public.clientes c where c.id = p_cliente_id) then
    raise exception 'Cliente nao encontrado para salvar checklist.';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'Itens do checklist devem ser uma lista.';
  end if;

  update public.checklist_clientes_itens
  set ativo = false
  where cliente_id = p_cliente_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_pos := v_pos + 1;
    v_item_id := case
      when jsonb_typeof(v_item) = 'object' then nullif(btrim(coalesce(v_item->>'item_id', v_item->>'id', '')), '')::uuid
      else nullif(btrim(trim(both '"' from v_item::text)), '')::uuid
    end;
    v_ordem := case
      when jsonb_typeof(v_item) = 'object' then coalesce(nullif(btrim(coalesce(v_item->>'ordem', '')), '')::integer, v_pos)
      else v_pos
    end;
    v_ativo := case
      when jsonb_typeof(v_item) = 'object' then coalesce(nullif(btrim(coalesce(v_item->>'ativo', '')), '')::boolean, true)
      else true
    end;

    if v_item_id is null then
      raise exception 'Item do checklist invalido na posicao %.', v_pos;
    end if;

    if not exists (select 1 from public.checklist_itens i where i.id = v_item_id and i.ativo = true) then
      raise exception 'Item do checklist nao encontrado ou inativo: %.', v_item_id;
    end if;

    insert into public.checklist_clientes_itens (cliente_id, item_id, ordem, ativo)
    values (p_cliente_id, v_item_id, v_ordem, v_ativo)
    on conflict (cliente_id, item_id)
    do update set ordem = excluded.ordem,
                  ativo = excluded.ativo;
  end loop;

  return query
  select *
  from public.checklist_clientes_itens cci
  where cci.cliente_id = p_cliente_id
  order by cci.ordem, cci.criado_em;
end;
$$;

revoke all on function public.salvar_checklist_cliente_itens_portal(uuid, jsonb) from public;
grant execute on function public.salvar_checklist_cliente_itens_portal(uuid, jsonb) to authenticated;

create or replace function public.salvar_checklist_status_portal(p_status jsonb)
returns public.checklist_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_cliente_id uuid;
  v_item_id uuid;
  v_ano integer;
  v_mes integer;
  v_status text;
  v_row public.checklist_status;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para salvar status do checklist.';
  end if;

  if p_status is null or jsonb_typeof(p_status) <> 'object' then
    raise exception 'Status do checklist invalido.';
  end if;

  v_cliente_id := nullif(btrim(coalesce(p_status->>'cliente_id', '')), '')::uuid;
  v_item_id := nullif(btrim(coalesce(p_status->>'item_id', '')), '')::uuid;
  v_ano := nullif(btrim(coalesce(p_status->>'ano', '')), '')::integer;
  v_mes := nullif(btrim(coalesce(p_status->>'mes', '')), '')::integer;
  v_status := upper(coalesce(nullif(btrim(coalesce(p_status->>'status', '')), ''), 'PENDENTE'));

  if v_cliente_id is null or v_item_id is null then
    raise exception 'Cliente e item sao obrigatorios para salvar status do checklist.';
  end if;

  if v_ano is null or v_mes is null or v_ano < 2000 or v_ano > 2100 or v_mes < 1 or v_mes > 12 then
    raise exception 'Competencia invalida para status do checklist.';
  end if;

  if v_status not in ('PENDENTE', 'OK', 'NA', 'ERP') then
    raise exception 'Status do checklist invalido: %.', v_status;
  end if;

  if not exists (
    select 1
    from public.checklist_clientes_itens cci
    where cci.cliente_id = v_cliente_id
      and cci.item_id = v_item_id
      and cci.ativo = true
  ) then
    raise exception 'Item nao esta ativo no checklist deste cliente.';
  end if;

  insert into public.checklist_status (
    cliente_id,
    item_id,
    ano,
    mes,
    status,
    atualizado_por
  )
  values (
    v_cliente_id,
    v_item_id,
    v_ano,
    v_mes,
    v_status,
    v_usuario.id
  )
  on conflict (cliente_id, item_id, ano, mes)
  do update set status = excluded.status,
                atualizado_por = excluded.atualizado_por
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.salvar_checklist_status_portal(jsonb) from public;
grant execute on function public.salvar_checklist_status_portal(jsonb) to authenticated;

create or replace function public.salvar_checklist_status_lote_portal(p_statuses jsonb)
returns setof public.checklist_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status jsonb;
begin
  if p_statuses is null or jsonb_typeof(p_statuses) <> 'array' then
    raise exception 'Statuses do checklist devem ser uma lista.';
  end if;

  for v_status in select * from jsonb_array_elements(p_statuses)
  loop
    return query select * from public.salvar_checklist_status_portal(v_status);
  end loop;
end;
$$;

revoke all on function public.salvar_checklist_status_lote_portal(jsonb) from public;
grant execute on function public.salvar_checklist_status_lote_portal(jsonb) to authenticated;

create or replace function public.salvar_checklist_contato_portal(p_contato jsonb)
returns public.checklist_contatos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_cliente_id uuid;
  v_email text;
  v_cc text;
  v_row public.checklist_contatos;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para salvar contato do checklist.';
  end if;

  if p_contato is null or jsonb_typeof(p_contato) <> 'object' then
    raise exception 'Contato do checklist invalido.';
  end if;

  v_cliente_id := nullif(btrim(coalesce(p_contato->>'cliente_id', '')), '')::uuid;
  v_email := nullif(btrim(coalesce(p_contato->>'email', '')), '');
  v_cc := nullif(btrim(coalesce(p_contato->>'cc', '')), '');

  if v_cliente_id is null then
    raise exception 'Cliente e obrigatorio para salvar contato do checklist.';
  end if;

  if v_email is not null and position('@' in v_email) = 0 then
    raise exception 'E-mail do checklist invalido.';
  end if;

  insert into public.checklist_contatos (cliente_id, email, cc)
  values (v_cliente_id, v_email, v_cc)
  on conflict (cliente_id)
  do update set email = excluded.email,
                cc = excluded.cc
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.salvar_checklist_contato_portal(jsonb) from public;
grant execute on function public.salvar_checklist_contato_portal(jsonb) to authenticated;

create or replace function public.registrar_checklist_envio_portal(p_envio jsonb)
returns public.checklist_envios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_cliente_id uuid;
  v_competencias jsonb;
  v_destinatario text;
  v_cc text;
  v_assunto text;
  v_qtd_pendencias integer;
  v_email_resend_id text;
  v_row public.checklist_envios;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para registrar envio do checklist.';
  end if;

  if p_envio is null or jsonb_typeof(p_envio) <> 'object' then
    raise exception 'Envio do checklist invalido.';
  end if;

  v_cliente_id := nullif(btrim(coalesce(p_envio->>'cliente_id', '')), '')::uuid;
  v_competencias := coalesce(p_envio->'competencias', '[]'::jsonb);
  v_destinatario := nullif(btrim(coalesce(p_envio->>'destinatario', '')), '');
  v_cc := nullif(btrim(coalesce(p_envio->>'cc', '')), '');
  v_assunto := nullif(btrim(coalesce(p_envio->>'assunto', '')), '');
  v_qtd_pendencias := coalesce(nullif(btrim(coalesce(p_envio->>'qtd_pendencias', '')), '')::integer, 0);
  v_email_resend_id := nullif(btrim(coalesce(p_envio->>'email_resend_id', '')), '');

  if v_cliente_id is null then
    raise exception 'Cliente e obrigatorio para registrar envio do checklist.';
  end if;

  if jsonb_typeof(v_competencias) <> 'array' then
    raise exception 'Competencias do envio do checklist devem ser uma lista.';
  end if;

  if v_destinatario is null then
    raise exception 'Destinatario e obrigatorio para registrar envio do checklist.';
  end if;

  if v_assunto is null then
    raise exception 'Assunto e obrigatorio para registrar envio do checklist.';
  end if;

  if v_qtd_pendencias < 0 then
    raise exception 'Quantidade de pendencias invalida.';
  end if;

  insert into public.checklist_envios (
    cliente_id,
    competencias,
    destinatario,
    cc,
    assunto,
    qtd_pendencias,
    email_resend_id,
    enviado_por,
    enviado_por_nome,
    enviado_por_email
  )
  values (
    v_cliente_id,
    v_competencias,
    v_destinatario,
    v_cc,
    v_assunto,
    v_qtd_pendencias,
    v_email_resend_id,
    v_usuario.id,
    v_usuario.nome,
    v_usuario.email
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.registrar_checklist_envio_portal(jsonb) from public;
grant execute on function public.registrar_checklist_envio_portal(jsonb) to authenticated;
