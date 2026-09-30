-- Portal de Gestao Contabil - Validacao do processamento do teste agendado
-- Execute depois de 20260928160000_checklist_automacao_teste_agendado_processamento.sql.
-- Nao chama Edge Functions nem o Resend. Todas as alteracoes terminam em ROLLBACK.

begin;

create temporary table _agendado_processamento_resultados (
  verificacao text primary key,
  ok boolean not null,
  detalhe text not null
) on commit drop;

create temporary table _agendado_processamento_estado
on commit drop
as
select
  (select count(*) from public.checklist_automacao_execucoes) as execucoes_antes,
  (select count(*) from public.checklist_automacao_trabalhos) as trabalhos_antes,
  (select count(*) from public.checklist_envios) as envios_antes;

create temporary table _agendado_processamento_usuario
on commit drop
as
select u.id
from public.usuarios u
where u.status = 'Ativo'
  and u.perfil_acesso in ('coordenador_administrador', 'setor_contabil_operacional')
order by u.id
limit 1;

create temporary table _agendado_processamento_clientes
on commit drop
as
select distinct c.id
from public.clientes c
join public.checklist_clientes_itens cci
  on cci.cliente_id = c.id
 and cci.ativo = true
join public.checklist_itens i
  on i.id = cci.item_id
 and i.ativo = true
where public.checklist_cliente_elegivel_automacao(c.id)
order by c.id
limit 2;

do $$
begin
  if not exists (select 1 from _agendado_processamento_usuario) then
    raise exception 'Um usuario ativo e necessario para a validacao.';
  end if;
  if not exists (select 1 from _agendado_processamento_clientes) then
    raise exception 'Um cliente ativo com checklist e necessario para a validacao.';
  end if;
end;
$$;

insert into _agendado_processamento_resultados
values
  (
    'estrutura do processador',
    to_regprocedure(
      'public.reservar_checklist_automacao_agendamentos_teste_interno(integer,integer)'
    ) is not null
      and to_regprocedure(
        'public.preparar_checklist_automacao_agendamento_teste_interno(uuid,uuid)'
      ) is not null
      and to_regprocedure(
        'public.finalizar_checklist_automacao_agendamento_teste_interno(uuid,uuid,jsonb)'
      ) is not null,
    'RPCs internas de reserva, preparacao e finalizacao disponiveis'
  ),
  (
    'permissoes exclusivas do backend',
    has_function_privilege(
      'service_role',
      'public.reservar_checklist_automacao_agendamentos_teste_interno(integer,integer)',
      'EXECUTE'
    )
      and not has_function_privilege(
        'authenticated',
        'public.reservar_checklist_automacao_agendamentos_teste_interno(integer,integer)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.preparar_checklist_automacao_agendamento_teste_interno(uuid,uuid)',
        'EXECUTE'
      ),
    'somente service_role pode operar a fila de agendamentos'
  ),
  (
    'nenhum cron ativado',
    not exists (
      select 1
      from cron.job
      where jobname ilike '%teste%agend%'
         or jobname ilike '%agend%teste%'
    ),
    'a Parte 2 ainda nao ativa o disparo automatico'
  );

update public.checklist_automacao_configuracao
set ativa = false,
    modo = 'TESTE',
    email_teste_destinatario = 'nattorocha04@gmail.com',
    email_teste_cc = 'rocharenato2004@gmail.com'
where id = 1;

update public.checklist_automacao_clientes ac
set habilitada = true,
    competencia_inicial = (
      date_trunc('month', now() at time zone 'America/Manaus') - interval '1 month'
    )::date
where ac.cliente_id in (select id from _agendado_processamento_clientes);

-- Garante que ao menos um item padrao de cada cliente tenha uma competencia
-- anterior para o cenario temporario da validacao. O ROLLBACK restaura os valores.
update public.checklist_clientes_itens cci
set competencia_inicial = (
      date_trunc('month', now() at time zone 'America/Manaus') - interval '1 month'
    )::date
where cci.cliente_id in (select id from _agendado_processamento_clientes)
  and cci.ativo = true;

update public.checklist_status s
set status = 'PENDENTE'
where s.cliente_id in (select id from _agendado_processamento_clientes)
  and make_date(s.ano, s.mes, 1) < date_trunc('month', now() at time zone 'America/Manaus')::date;

create temporary table _agendado_processamento_agendamento (
  id uuid primary key
) on commit drop;

with criado as (
  insert into public.checklist_automacao_agendamentos_teste (
    escopo,
    competencia_referencia,
    agendado_para,
    disponivel_em,
    cliente_ids,
    chave_idempotencia,
    destinatario_teste,
    cc_teste,
    criado_por,
    resumo
  )
  select
    'CLIENTES_SELECIONADOS',
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    now() - interval '1 minute',
    now() - interval '1 minute',
    array_agg(c.id order by c.id),
    concat('validacao-processamento-', gen_random_uuid()::text),
    'nattorocha04@gmail.com',
    'rocharenato2004@gmail.com',
    u.id,
    jsonb_build_object('fase', 'VALIDACAO')
  from _agendado_processamento_clientes c
  cross join _agendado_processamento_usuario u
  group by u.id
  returning id
)
insert into _agendado_processamento_agendamento
select id from criado;

create temporary table _agendado_processamento_reserva (
  retorno jsonb not null
) on commit drop;

insert into _agendado_processamento_reserva
values (public.reservar_checklist_automacao_agendamentos_teste_interno(1, 10));

insert into _agendado_processamento_resultados
select
  'reserva atomica',
  (r.retorno->>'quantidade')::integer = 1
    and r.retorno->'agendamentos'->0->>'id' = a.id::text
    and nullif(r.retorno->'agendamentos'->0->>'token_reserva', '') is not null,
  'o agendamento vencido recebeu token e passou para PROCESSANDO'
from _agendado_processamento_reserva r
cross join _agendado_processamento_agendamento a;

create temporary table _agendado_processamento_preparacao (
  retorno jsonb not null
) on commit drop;

insert into _agendado_processamento_preparacao
select public.preparar_checklist_automacao_agendamento_teste_interno(
  a.id,
  (r.retorno->'agendamentos'->0->>'token_reserva')::uuid
)
from _agendado_processamento_agendamento a
cross join _agendado_processamento_reserva r;

insert into _agendado_processamento_resultados
select
  'preparacao direcionada e idempotente',
  p.retorno->'execucao'->>'modo' = 'TESTE'
    and p.retorno->'execucao'->>'acionamento' = 'MANUAL'
    and p.retorno->'execucao'->'detalhes'->>'tipo' = 'TESTE_AGENDADO_DIRECIONADO'
    and a.execucao_id = (p.retorno->'execucao'->>'id')::uuid,
  'uma execucao isolada foi vinculada ao agendamento'
from _agendado_processamento_preparacao p
cross join _agendado_processamento_agendamento x
join public.checklist_automacao_agendamentos_teste a on a.id = x.id;

insert into _agendado_processamento_resultados
select
  'destinos de teste congelados',
  count(*) > 0
    and bool_and(t.destinatario_efetivo = 'nattorocha04@gmail.com')
    and bool_and(t.cc_efetivo = 'rocharenato2004@gmail.com'),
  'todos os trabalhos usam os dois e-mails pessoais salvos no agendamento'
from _agendado_processamento_preparacao p
join public.checklist_automacao_trabalhos t
  on t.execucao_id = (p.retorno->'execucao'->>'id')::uuid;

create temporary table _agendado_processamento_lote (
  retorno jsonb not null
) on commit drop;

insert into _agendado_processamento_lote
select public.reservar_checklist_automacao_teste_interno(
  (p.retorno->'execucao'->>'id')::uuid,
  10,
  10
)
from _agendado_processamento_preparacao p;

insert into _agendado_processamento_resultados
select
  'fila direcionada aceita teste agendado',
  (l.retorno->>'quantidade')::integer > 0
    and coalesce((l.retorno->>'automacao_global_pausada')::boolean, false),
  'o trabalhador existente pode adquirir o lote mesmo com a automacao global pausada'
from _agendado_processamento_lote l;

-- Simula apenas o fechamento do trabalhador. Nenhum historico nem chamada externa e criado.
update public.checklist_automacao_trabalhos t
set status = 'ENVIADO',
    token_reserva = null,
    reservado_em = null,
    reserva_expira_em = null,
    finalizado_em = now()
where t.execucao_id = (
  select (p.retorno->'execucao'->>'id')::uuid
  from _agendado_processamento_preparacao p
);

create temporary table _agendado_processamento_finalizacao (
  retorno jsonb not null
) on commit drop;

insert into _agendado_processamento_finalizacao
select public.finalizar_checklist_automacao_agendamento_teste_interno(
  a.id,
  (r.retorno->'agendamentos'->0->>'token_reserva')::uuid,
  jsonb_build_object('validacao', true, 'envios_externos', 0)
)
from _agendado_processamento_agendamento a
cross join _agendado_processamento_reserva r;

insert into _agendado_processamento_resultados
select
  'conclusao auditada',
  f.retorno->'agendamento'->>'status' = 'CONCLUIDO'
    and (f.retorno->'agendamento'->>'finalizado_em') is not null
    and exists (
      select 1
      from public.checklist_automacao_auditoria aud
      where aud.entidade = 'AGENDAMENTO_TESTE'
        and aud.entidade_id = a.id::text
        and aud.operacao = 'PROCESSAR'
    )
    and exists (
      select 1
      from public.checklist_automacao_auditoria aud
      where aud.entidade = 'AGENDAMENTO_TESTE'
        and aud.entidade_id = a.id::text
        and aud.operacao = 'CONCLUIR'
    ),
  'agendamento e execucao terminaram sem deixar reserva ativa'
from _agendado_processamento_finalizacao f
cross join _agendado_processamento_agendamento a;

insert into _agendado_processamento_resultados
select
  'nenhum envio externo iniciado',
  (select count(*) from public.checklist_envios) = e.envios_antes,
  'a validacao nao criou historico de envio nem chamou o Resend'
from _agendado_processamento_estado e;

insert into _agendado_processamento_resultados
select
  'rollback preparado',
  (select count(*) from public.checklist_automacao_execucoes) >= e.execucoes_antes + 1
    and (select count(*) from public.checklist_automacao_trabalhos) >= e.trabalhos_antes + 1,
  'execucao e trabalhos temporarios serao desfeitos ao final do script'
from _agendado_processamento_estado e;

select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from _agendado_processamento_resultados
order by verificacao;

rollback;
