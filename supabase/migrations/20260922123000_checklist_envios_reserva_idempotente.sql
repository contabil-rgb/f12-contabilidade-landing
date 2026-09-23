-- Portal de Gestao Contabil - Reserva idempotente de envio manual do checklist
-- Execute depois de 20260922110000_checklist_envios_historico.sql.

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
