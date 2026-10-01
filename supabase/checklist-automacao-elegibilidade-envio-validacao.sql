-- Validacao transacional da protecao final de elegibilidade.
-- Nao chama Edge Functions, nao acessa o Resend e desfaz todas as alteracoes.

begin;

create temporary table _checklist_elegibilidade_envio_resultados (
  verificacao text primary key,
  ok boolean not null,
  detalhe text not null
) on commit drop;

do $$
declare
  v_cliente public.clientes;
  v_execucao_id uuid;
  v_trabalho_id uuid;
  v_token uuid := gen_random_uuid();
  v_envios_antes bigint;
  v_envios_depois bigint;
  v_resultado jsonb;
  v_trabalho public.checklist_automacao_trabalhos;
begin
  select c.* into v_cliente
  from public.clientes c
  join public.checklist_automacao_clientes ac on ac.cliente_id = c.id
  where ac.habilitada
    and public.checklist_cliente_elegivel_automacao(c.id)
  order by c.id
  limit 1;

  if v_cliente.id is null then
    raise exception 'A validacao requer ao menos um cliente habilitado e elegivel.';
  end if;

  insert into public.checklist_automacao_execucoes (
    competencia_referencia,
    segundo_dia_util,
    agendada_para,
    modo,
    acionamento,
    status,
    chave_idempotencia,
    total_clientes,
    total_trabalhos,
    iniciado_em
  ) values (
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    (now() at time zone 'America/Manaus')::date,
    now(),
    'TESTE',
    'SIMULACAO',
    'PROCESSANDO',
    'validacao:elegibilidade-final:' || gen_random_uuid()::text,
    1,
    1,
    now()
  ) returning id into v_execucao_id;

  insert into public.checklist_automacao_trabalhos (
    execucao_id,
    cliente_id,
    cliente_nome,
    cliente_cnpj,
    modo,
    status,
    competencias,
    itens_cobrados,
    qtd_pendencias,
    destinatario_original,
    destinatario_efetivo,
    assunto,
    chave_idempotencia
  ) values (
    v_execucao_id,
    v_cliente.id,
    v_cliente.razao_social,
    v_cliente.cnpj,
    'TESTE',
    'PREPARADO',
    '[]'::jsonb,
    '[]'::jsonb,
    1,
    'validacao@example.com',
    'validacao@example.com',
    '[TESTE] Validacao da elegibilidade final',
    'validacao:elegibilidade-final:trabalho:' || gen_random_uuid()::text
  ) returning id into v_trabalho_id;

  update public.checklist_automacao_trabalhos
  set status = 'PROCESSANDO',
      tentativa_atual = 1,
      token_reserva = v_token,
      reservado_em = now(),
      reserva_expira_em = now() + interval '10 minutes'
  where id = v_trabalho_id;

  update public.clientes
  set status = 'Em distrato'
  where id = v_cliente.id;

  select count(*) into v_envios_antes
  from public.checklist_envios
  where execucao_id = v_execucao_id;

  v_resultado := public.iniciar_checklist_automacao_envio_interno(
    v_trabalho_id,
    v_token
  );

  select * into v_trabalho
  from public.checklist_automacao_trabalhos
  where id = v_trabalho_id;

  select count(*) into v_envios_depois
  from public.checklist_envios
  where execucao_id = v_execucao_id;

  if coalesce((v_resultado->>'cancelado')::boolean, false) is not true then
    raise exception 'O trabalho inelegivel nao foi sinalizado como cancelado.';
  end if;

  if v_resultado->>'motivo' <> 'CLIENTE_INELEGIVEL' then
    raise exception 'O motivo do cancelamento nao foi registrado corretamente.';
  end if;

  if v_trabalho.status <> 'CANCELADO'
     or v_trabalho.erro_codigo <> 'CLIENTE_INELEGIVEL'
     or v_trabalho.token_reserva is not null
     or v_trabalho.reservado_em is not null
     or v_trabalho.reserva_expira_em is not null then
    raise exception 'O trabalho nao foi finalizado com o estado seguro esperado.';
  end if;

  if v_envios_depois <> v_envios_antes then
    raise exception 'Um historico de envio foi criado para o cliente inelegivel.';
  end if;

  insert into _checklist_elegibilidade_envio_resultados
  values (
    'cliente inelegivel bloqueado antes do envio',
    true,
    'trabalho cancelado, reserva liberada e nenhum historico de envio criado'
  );
end;
$$;

select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from _checklist_elegibilidade_envio_resultados
order by verificacao;

rollback;
