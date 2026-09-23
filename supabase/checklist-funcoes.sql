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

create or replace function public.iniciar_checklist_envio_portal(p_envio jsonb)
returns public.checklist_envios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_cliente public.clientes;
  v_cliente_id uuid;
  v_competencias jsonb;
  v_itens_cobrados jsonb;
  v_destinatario text;
  v_cc text;
  v_assunto text;
  v_qtd_pendencias integer;
  v_chave_idempotencia text;
  v_row public.checklist_envios;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para iniciar envio do checklist.';
  end if;

  if p_envio is null or jsonb_typeof(p_envio) <> 'object' then
    raise exception 'Envio do checklist invalido.';
  end if;

  v_cliente_id := nullif(btrim(coalesce(p_envio->>'cliente_id', '')), '')::uuid;
  v_competencias := coalesce(p_envio->'competencias', '[]'::jsonb);
  v_itens_cobrados := coalesce(p_envio->'itens_cobrados', '[]'::jsonb);
  v_destinatario := nullif(btrim(coalesce(p_envio->>'destinatario', '')), '');
  v_cc := nullif(btrim(coalesce(p_envio->>'cc', '')), '');
  v_assunto := nullif(btrim(coalesce(p_envio->>'assunto', '')), '');
  v_qtd_pendencias := coalesce(nullif(btrim(coalesce(p_envio->>'qtd_pendencias', '')), '')::integer, 0);
  v_chave_idempotencia := coalesce(
    nullif(btrim(coalesce(p_envio->>'chave_idempotencia', '')), ''),
    gen_random_uuid()::text
  );

  if v_cliente_id is null then
    raise exception 'Cliente e obrigatorio para iniciar envio do checklist.';
  end if;

  select * into v_cliente from public.clientes c where c.id = v_cliente_id;
  if v_cliente.id is null then
    raise exception 'Cliente do envio do checklist nao encontrado.';
  end if;

  if jsonb_typeof(v_competencias) <> 'array' or jsonb_typeof(v_itens_cobrados) <> 'array' then
    raise exception 'Competencias e itens cobrados devem ser listas.';
  end if;

  if v_destinatario is null or position('@' in v_destinatario) = 0 then
    raise exception 'Destinatario do envio do checklist invalido.';
  end if;

  if v_assunto is null then
    raise exception 'Assunto do envio do checklist e obrigatorio.';
  end if;

  if v_qtd_pendencias < 0 then
    raise exception 'Quantidade de pendencias invalida.';
  end if;

  insert into public.checklist_envios (
    cliente_id,
    cliente_nome,
    cliente_cnpj,
    competencias,
    itens_cobrados,
    destinatario,
    cc,
    assunto,
    qtd_pendencias,
    origem,
    status,
    tentativa,
    chave_idempotencia,
    enviado_por,
    enviado_por_nome,
    enviado_por_email,
    iniciado_em,
    enviado_em,
    finalizado_em
  )
  values (
    v_cliente.id,
    coalesce(nullif(btrim(v_cliente.nome_identificacao), ''), nullif(btrim(v_cliente.razao_social), ''), 'Cliente sem identificacao'),
    nullif(btrim(v_cliente.cnpj), ''),
    v_competencias,
    v_itens_cobrados,
    v_destinatario,
    v_cc,
    v_assunto,
    v_qtd_pendencias,
    'MANUAL',
    'PROCESSANDO',
    1,
    v_chave_idempotencia,
    v_usuario.id,
    v_usuario.nome,
    v_usuario.email,
    now(),
    null,
    null
  )
  on conflict (chave_idempotencia) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row
    from public.checklist_envios e
    where e.chave_idempotencia = v_chave_idempotencia
      and e.enviado_por = v_usuario.id;

    if v_row.id is null then
      raise exception 'Chave de idempotencia ja utilizada em outro envio.';
    end if;
  end if;

  return v_row;
end;
$$;

revoke all on function public.iniciar_checklist_envio_portal(jsonb) from public;
grant execute on function public.iniciar_checklist_envio_portal(jsonb) to authenticated;

create or replace function public.finalizar_checklist_envio_portal(
  p_envio_id uuid,
  p_status text,
  p_resultado jsonb default '{}'::jsonb
)
returns public.checklist_envios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_status text;
  v_email_resend_id text;
  v_erro_codigo text;
  v_erro_mensagem text;
  v_row public.checklist_envios;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para finalizar envio do checklist.';
  end if;

  if p_envio_id is null then
    raise exception 'Envio do checklist e obrigatorio.';
  end if;

  v_status := upper(nullif(btrim(coalesce(p_status, '')), ''));
  if v_status not in ('ENVIADO', 'FALHOU', 'CANCELADO') then
    raise exception 'Status final do envio do checklist invalido.';
  end if;

  if p_resultado is null or jsonb_typeof(p_resultado) <> 'object' then
    raise exception 'Resultado do envio do checklist invalido.';
  end if;

  v_email_resend_id := nullif(btrim(coalesce(p_resultado->>'email_resend_id', '')), '');
  v_erro_codigo := nullif(btrim(coalesce(p_resultado->>'erro_codigo', '')), '');
  v_erro_mensagem := nullif(btrim(coalesce(p_resultado->>'erro_mensagem', '')), '');

  select * into v_row
  from public.checklist_envios e
  where e.id = p_envio_id
    and e.enviado_por = v_usuario.id
  for update;

  if v_row.id is null then
    raise exception 'Envio do checklist nao encontrado para o usuario atual.';
  end if;

  if v_row.status <> 'PROCESSANDO' then
    if v_row.status = v_status then
      return v_row;
    end if;
    raise exception 'Envio do checklist ja foi finalizado com status %.', v_row.status;
  end if;

  if v_status = 'ENVIADO' and v_email_resend_id is null then
    raise exception 'Identificador do Resend e obrigatorio para concluir o envio.';
  end if;

  if v_status = 'FALHOU' and v_erro_mensagem is null then
    raise exception 'Mensagem de erro e obrigatoria para registrar falha.';
  end if;

  update public.checklist_envios
  set status = v_status,
      email_resend_id = case when v_status = 'ENVIADO' then v_email_resend_id else email_resend_id end,
      erro_codigo = case when v_status = 'FALHOU' then v_erro_codigo else null end,
      erro_mensagem = case when v_status = 'FALHOU' then v_erro_mensagem else null end,
      enviado_em = case when v_status = 'ENVIADO' then now() else null end,
      finalizado_em = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.finalizar_checklist_envio_portal(uuid, text, jsonb) from public;
grant execute on function public.finalizar_checklist_envio_portal(uuid, text, jsonb) to authenticated;

create or replace function public.registrar_checklist_envio_portal(p_envio jsonb)
returns public.checklist_envios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_envio public.checklist_envios;
  v_resultado jsonb;
begin
  v_envio := public.iniciar_checklist_envio_portal(
    coalesce(p_envio, '{}'::jsonb) || jsonb_build_object(
      'chave_idempotencia', coalesce(
        nullif(btrim(coalesce(p_envio->>'chave_idempotencia', '')), ''),
        gen_random_uuid()::text
      )
    )
  );

  if v_envio.status <> 'PROCESSANDO' then
    return v_envio;
  end if;

  v_resultado := jsonb_build_object(
    'email_resend_id', nullif(btrim(coalesce(p_envio->>'email_resend_id', '')), '')
  );

  return public.finalizar_checklist_envio_portal(v_envio.id, 'ENVIADO', v_resultado);
end;
$$;

revoke all on function public.registrar_checklist_envio_portal(jsonb) from public;
grant execute on function public.registrar_checklist_envio_portal(jsonb) to authenticated;

create or replace function public.listar_checklist_envios_portal(p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_pagina integer;
  v_por_pagina integer;
  v_busca text;
  v_origem text;
  v_status text;
  v_responsavel_id uuid;
  v_ano integer;
  v_mes integer;
  v_data_inicio timestamp with time zone;
  v_data_fim timestamp with time zone;
  v_resultado jsonb;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para consultar historico do checklist.';
  end if;

  if p_filtros is null or jsonb_typeof(p_filtros) <> 'object' then
    raise exception 'Filtros do historico do checklist invalidos.';
  end if;

  v_pagina := greatest(coalesce(nullif(btrim(coalesce(p_filtros->>'pagina', '')), '')::integer, 1), 1);
  v_por_pagina := least(greatest(coalesce(nullif(btrim(coalesce(p_filtros->>'por_pagina', '')), '')::integer, 25), 1), 100);
  v_busca := lower(nullif(btrim(coalesce(p_filtros->>'busca', '')), ''));
  v_origem := upper(nullif(btrim(coalesce(p_filtros->>'origem', '')), ''));
  v_status := upper(nullif(btrim(coalesce(p_filtros->>'status', '')), ''));
  v_responsavel_id := nullif(btrim(coalesce(p_filtros->>'responsavel_id', '')), '')::uuid;
  v_ano := nullif(btrim(coalesce(p_filtros->>'ano', '')), '')::integer;
  v_mes := nullif(btrim(coalesce(p_filtros->>'mes', '')), '')::integer;
  v_data_inicio := nullif(btrim(coalesce(p_filtros->>'data_inicio', '')), '')::timestamp with time zone;
  v_data_fim := nullif(btrim(coalesce(p_filtros->>'data_fim', '')), '')::timestamp with time zone;

  if v_origem is not null and v_origem not in ('MANUAL', 'AUTOMATICO') then
    raise exception 'Origem do historico do checklist invalida.';
  end if;

  if v_status is not null and v_status not in ('PROCESSANDO', 'ENVIADO', 'FALHOU', 'CANCELADO') then
    raise exception 'Status do historico do checklist invalido.';
  end if;

  if v_mes is not null and (v_mes < 1 or v_mes > 12) then
    raise exception 'Mes do historico do checklist invalido.';
  end if;

  if v_ano is not null and (v_ano < 2000 or v_ano > 2100) then
    raise exception 'Ano do historico do checklist invalido.';
  end if;

  if v_data_inicio is not null and v_data_fim is not null and v_data_inicio >= v_data_fim then
    raise exception 'Periodo do historico do checklist invalido.';
  end if;

  with filtrados as (
    select
      e.*,
      coalesce(e.enviado_em, e.finalizado_em, e.iniciado_em, e.criado_em) as evento_em
    from public.checklist_envios e
    where (v_busca is null or
      lower(coalesce(e.cliente_nome, '')) like '%' || v_busca || '%' or
      lower(coalesce(e.cliente_cnpj, '')) like '%' || v_busca || '%' or
      lower(coalesce(e.destinatario, '')) like '%' || v_busca || '%')
      and (v_origem is null or e.origem = v_origem)
      and (v_status is null or e.status = v_status)
      and (v_responsavel_id is null or e.enviado_por = v_responsavel_id)
      and (v_data_inicio is null or coalesce(e.enviado_em, e.finalizado_em, e.iniciado_em, e.criado_em) >= v_data_inicio)
      and (v_data_fim is null or coalesce(e.enviado_em, e.finalizado_em, e.iniciado_em, e.criado_em) < v_data_fim)
      and (
        (v_ano is null and v_mes is null)
        or exists (
          select 1
          from jsonb_array_elements(e.competencias) competencia
          where (v_ano is null or nullif(competencia->>'ano', '')::integer = v_ano)
            and (v_mes is null or nullif(competencia->>'mes', '')::integer = v_mes)
        )
      )
  ),
  pagina as (
    select *
    from filtrados
    order by evento_em desc, id desc
    offset (v_pagina - 1) * v_por_pagina
    limit v_por_pagina
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.evento_em desc, p.id desc)
      from pagina p
    ), '[]'::jsonb),
    'total', (select count(*) from filtrados),
    'pagina', v_pagina,
    'por_pagina', v_por_pagina,
    'resumo', jsonb_build_object(
      'total', (select count(*) from filtrados),
      'enviados', (select count(*) from filtrados where status = 'ENVIADO'),
      'falhas', (select count(*) from filtrados where status = 'FALHOU'),
      'processando', (select count(*) from filtrados where status = 'PROCESSANDO'),
      'cancelados', (select count(*) from filtrados where status = 'CANCELADO'),
      'manuais', (select count(*) from filtrados where origem = 'MANUAL'),
      'automaticos', (select count(*) from filtrados where origem = 'AUTOMATICO')
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.listar_checklist_envios_portal(jsonb) from public;
grant execute on function public.listar_checklist_envios_portal(jsonb) to authenticated;

create or replace function public.reservar_checklist_envio_portal(p_envio jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_cliente public.clientes;
  v_cliente_id uuid;
  v_competencias jsonb;
  v_itens_cobrados jsonb;
  v_destinatario text;
  v_cc text;
  v_assunto text;
  v_qtd_pendencias integer;
  v_chave_idempotencia text;
  v_row public.checklist_envios;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para reservar envio do checklist.';
  end if;

  if p_envio is null or jsonb_typeof(p_envio) <> 'object' then
    raise exception 'Envio do checklist invalido.';
  end if;

  v_cliente_id := nullif(btrim(coalesce(p_envio->>'cliente_id', '')), '')::uuid;
  v_competencias := coalesce(p_envio->'competencias', '[]'::jsonb);
  v_itens_cobrados := coalesce(p_envio->'itens_cobrados', '[]'::jsonb);
  v_destinatario := nullif(btrim(coalesce(p_envio->>'destinatario', '')), '');
  v_cc := nullif(btrim(coalesce(p_envio->>'cc', '')), '');
  v_assunto := nullif(btrim(coalesce(p_envio->>'assunto', '')), '');
  v_qtd_pendencias := coalesce(nullif(btrim(coalesce(p_envio->>'qtd_pendencias', '')), '')::integer, 0);
  v_chave_idempotencia := nullif(btrim(coalesce(p_envio->>'chave_idempotencia', '')), '');

  if v_cliente_id is null then
    raise exception 'Cliente e obrigatorio para reservar envio do checklist.';
  end if;

  if v_chave_idempotencia is null then
    raise exception 'Chave de idempotencia e obrigatoria para reservar envio do checklist.';
  end if;

  select * into v_cliente from public.clientes c where c.id = v_cliente_id;
  if v_cliente.id is null then
    raise exception 'Cliente do envio do checklist nao encontrado.';
  end if;

  if jsonb_typeof(v_competencias) <> 'array' or jsonb_typeof(v_itens_cobrados) <> 'array' then
    raise exception 'Competencias e itens cobrados devem ser listas.';
  end if;

  if v_destinatario is null or position('@' in v_destinatario) = 0 then
    raise exception 'Destinatario do envio do checklist invalido.';
  end if;

  if v_assunto is null then
    raise exception 'Assunto do envio do checklist e obrigatorio.';
  end if;

  if v_qtd_pendencias < 1 then
    raise exception 'O envio deve possuir ao menos uma pendencia.';
  end if;

  insert into public.checklist_envios (
    cliente_id,
    cliente_nome,
    cliente_cnpj,
    competencias,
    itens_cobrados,
    destinatario,
    cc,
    assunto,
    qtd_pendencias,
    origem,
    status,
    tentativa,
    chave_idempotencia,
    enviado_por,
    enviado_por_nome,
    enviado_por_email,
    iniciado_em,
    enviado_em,
    finalizado_em
  )
  values (
    v_cliente.id,
    coalesce(nullif(btrim(v_cliente.nome_identificacao), ''), nullif(btrim(v_cliente.razao_social), ''), 'Cliente sem identificacao'),
    nullif(btrim(v_cliente.cnpj), ''),
    v_competencias,
    v_itens_cobrados,
    v_destinatario,
    v_cc,
    v_assunto,
    v_qtd_pendencias,
    'MANUAL',
    'PROCESSANDO',
    1,
    v_chave_idempotencia,
    v_usuario.id,
    v_usuario.nome,
    v_usuario.email,
    now(),
    null,
    null
  )
  on conflict (chave_idempotencia) do nothing
  returning * into v_row;

  if v_row.id is not null then
    return jsonb_build_object(
      'adquirido', true,
      'envio', to_jsonb(v_row)
    );
  end if;

  select * into v_row
  from public.checklist_envios e
  where e.chave_idempotencia = v_chave_idempotencia
    and e.enviado_por = v_usuario.id;

  if v_row.id is null then
    raise exception 'Chave de idempotencia ja utilizada em outro envio.';
  end if;

  return jsonb_build_object(
    'adquirido', false,
    'envio', to_jsonb(v_row)
  );
end;
$$;

revoke all on function public.reservar_checklist_envio_portal(jsonb) from public;
grant execute on function public.reservar_checklist_envio_portal(jsonb) to authenticated;
