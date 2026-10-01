-- Portal de Gestao Contabil - protecao final de elegibilidade antes do envio
-- Impede que um trabalho ja reservado envie e-mail se o cliente se tornar
-- inativo, entrar em distrato ou for arquivado antes do inicio do envio.

begin;

create or replace function public.iniciar_checklist_automacao_envio_interno(
  p_trabalho_id uuid,
  p_token_reserva uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trabalho public.checklist_automacao_trabalhos;
  v_cliente public.clientes;
  v_envio public.checklist_envios;
begin
  if p_trabalho_id is null or p_token_reserva is null then
    raise exception 'Trabalho e token da reserva sao obrigatorios.';
  end if;

  select * into v_trabalho
  from public.checklist_automacao_trabalhos t
  where t.id = p_trabalho_id
  for update;

  if v_trabalho.id is null then
    raise exception 'Trabalho da automacao nao encontrado.';
  end if;

  if v_trabalho.status <> 'PROCESSANDO'
     or v_trabalho.token_reserva <> p_token_reserva
     or v_trabalho.reserva_expira_em <= now() then
    raise exception 'A reserva do trabalho nao esta ativa.';
  end if;

  if v_trabalho.tentativa_envio_iniciada = v_trabalho.tentativa_atual then
    select * into v_envio
    from public.checklist_envios e
    where e.id = v_trabalho.envio_id;

    return jsonb_build_object(
      'adquirido', false,
      'trabalho', to_jsonb(v_trabalho),
      'envio', case when v_envio.id is null then null else to_jsonb(v_envio) end
    );
  end if;

  select * into v_cliente
  from public.clientes c
  where c.id = v_trabalho.cliente_id
  for key share;

  if v_cliente.id is null
     or not public.checklist_cliente_elegivel_automacao(v_cliente.id) then
    update public.checklist_automacao_trabalhos t
    set status = 'CANCELADO',
        motivo = 'Cliente em distrato, inativo ou arquivado.',
        erro_codigo = 'CLIENTE_INELEGIVEL',
        erro_mensagem = 'Cliente em distrato, inativo ou arquivado.',
        erro_transitorio = false,
        token_reserva = null,
        reservado_em = null,
        reserva_expira_em = null,
        finalizado_em = now()
    where t.id = v_trabalho.id
    returning * into v_trabalho;

    perform public.checklist_automacao_recalcular_execucao_interno(v_trabalho.execucao_id);

    return jsonb_build_object(
      'adquirido', false,
      'cancelado', true,
      'motivo', 'CLIENTE_INELEGIVEL',
      'trabalho', to_jsonb(v_trabalho),
      'envio', null
    );
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
    execucao_id,
    enviado_por,
    enviado_por_nome,
    enviado_por_email,
    iniciado_em,
    finalizado_em,
    enviado_em,
    erro_codigo,
    erro_mensagem
  )
  values (
    v_trabalho.cliente_id,
    v_trabalho.cliente_nome,
    v_trabalho.cliente_cnpj,
    v_trabalho.competencias,
    v_trabalho.itens_cobrados,
    v_trabalho.destinatario_efetivo,
    v_trabalho.cc_efetivo,
    v_trabalho.assunto,
    v_trabalho.qtd_pendencias,
    'AUTOMATICO',
    'PROCESSANDO',
    v_trabalho.tentativa_atual,
    v_trabalho.chave_idempotencia,
    v_trabalho.execucao_id,
    null,
    'Automacao do checklist',
    null,
    now(),
    null,
    null,
    null,
    null
  )
  on conflict do nothing
  returning * into v_envio;

  if v_envio.id is null then
    select * into v_envio
    from public.checklist_envios e
    where e.chave_idempotencia = v_trabalho.chave_idempotencia
    limit 1
    for update;

    if v_envio.id is null then
      select * into v_envio
      from public.checklist_envios e
      where e.origem = 'AUTOMATICO'
        and e.execucao_id = v_trabalho.execucao_id
        and e.cliente_id = v_trabalho.cliente_id
      order by e.criado_em
      limit 1
      for update;
    end if;
  end if;

  if v_envio.id is null then
    raise exception 'Nao foi possivel criar o historico do envio automatico.';
  end if;

  if v_envio.origem <> 'AUTOMATICO'
     or v_envio.execucao_id <> v_trabalho.execucao_id
     or v_envio.cliente_id is distinct from v_trabalho.cliente_id then
    raise exception 'A chave idempotente pertence a outro envio.';
  end if;

  if v_envio.status = 'ENVIADO' then
    update public.checklist_automacao_trabalhos t
    set status = 'ENVIADO',
        envio_id = v_envio.id,
        email_resend_id = v_envio.email_resend_id,
        reservado_em = null,
        reserva_expira_em = null,
        finalizado_em = coalesce(v_envio.finalizado_em, v_envio.enviado_em, now())
    where t.id = v_trabalho.id
    returning * into v_trabalho;

    perform public.checklist_automacao_recalcular_execucao_interno(v_trabalho.execucao_id);

    return jsonb_build_object(
      'adquirido', false,
      'ja_enviado', true,
      'trabalho', to_jsonb(v_trabalho),
      'envio', to_jsonb(v_envio)
    );
  end if;

  update public.checklist_envios e
  set status = 'PROCESSANDO',
      tentativa = v_trabalho.tentativa_atual,
      erro_codigo = null,
      erro_mensagem = null,
      iniciado_em = now(),
      finalizado_em = null,
      enviado_em = null
  where e.id = v_envio.id
  returning * into v_envio;

  update public.checklist_automacao_trabalhos t
  set tentativa_envio_iniciada = t.tentativa_atual,
      envio_iniciado_em = now(),
      envio_id = v_envio.id
  where t.id = v_trabalho.id
  returning * into v_trabalho;

  return jsonb_build_object(
    'adquirido', true,
    'ja_enviado', false,
    'trabalho', to_jsonb(v_trabalho),
    'envio', to_jsonb(v_envio)
  );
end;
$$;

revoke all on function public.iniciar_checklist_automacao_envio_interno(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.iniciar_checklist_automacao_envio_interno(uuid, uuid)
  to service_role;

commit;
