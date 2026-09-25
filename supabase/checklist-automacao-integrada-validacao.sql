-- Portal de Gestao Contabil - Validacao integrada da automacao
-- Simula o ciclo mensal, lotes, repeticoes e novas tentativas sem chamar o Resend.
-- Todas as alteracoes sao desfeitas pelo ROLLBACK ao final.

begin;

create temporary table _integrada_resultados (
  verificacao text primary key,
  ok boolean not null,
  detalhe text not null
) on commit drop;

create temporary table _integrada_estado
on commit drop
as
select
  (select count(*) from public.checklist_automacao_execucoes) as execucoes_antes,
  (select count(*) from public.checklist_automacao_trabalhos) as trabalhos_antes,
  (select count(*) from public.checklist_envios) as envios_antes;

create temporary table _integrada_alvos
on commit drop
as
with competencia as (
  select (
    date_trunc('month', now() at time zone 'America/Manaus') - interval '1 month'
  )::date as inicio
), candidatos as (
  select cci.cliente_id
  from public.checklist_clientes_itens cci
  join public.checklist_itens i
    on i.id = cci.item_id
   and i.ativo = true
  cross join competencia c
  left join public.checklist_status s
    on s.cliente_id = cci.cliente_id
   and s.item_id = cci.item_id
   and s.ano = extract(year from c.inicio)::integer
   and s.mes = extract(month from c.inicio)::integer
  where cci.ativo = true
    and coalesce(s.status, 'PENDENTE') = 'PENDENTE'

  union

  select cip.cliente_id
  from public.checklist_clientes_itens_personalizados cip
  cross join competencia c
  left join public.checklist_status_personalizados sp
    on sp.cliente_id = cip.cliente_id
   and sp.item_personalizado_id = cip.id
   and sp.ano = extract(year from c.inicio)::integer
   and sp.mes = extract(month from c.inicio)::integer
  where cip.ativo = true
    and coalesce(sp.status, 'PENDENTE') = 'PENDENTE'
)
select
  candidatos.cliente_id,
  c.inicio as competencia_inicial
from candidatos
cross join competencia c
join public.clientes cliente on cliente.id = candidatos.cliente_id
where coalesce(cliente.arquivado, false) = false
  and lower(coalesce(cliente.status, '')) <> 'inativo'
order by candidatos.cliente_id
limit 3;

do $$
begin
  if (select count(*) from _integrada_alvos) < 3 then
    raise exception 'Sao necessarios tres clientes com pendencias para a validacao integrada.';
  end if;
end;
$$;

create temporary table _integrada_chaves
on commit drop
as
select
  concat('validacao-integrada:', gen_random_uuid()::text) as principal,
  concat('validacao-integrada-pausada:', gen_random_uuid()::text) as pausada;

create temporary table _integrada_retornos (
  etapa text primary key,
  retorno jsonb not null
) on commit drop;

update public.checklist_automacao_configuracao
set ativa = false,
    modo = 'TESTE',
    fuso_horario = 'America/Manaus',
    dia_util_ordem = 2,
    horario_local = time '08:00',
    tentativas_max = 3,
    intervalos_tentativas_minutos = array[0, 15, 45]
where id = 1;

update public.checklist_automacao_clientes ac
set habilitada = exists (
      select 1 from _integrada_alvos a where a.cliente_id = ac.cliente_id
    ),
    competencia_inicial = coalesce(
      (select a.competencia_inicial from _integrada_alvos a where a.cliente_id = ac.cliente_id),
      ac.competencia_inicial
    );

insert into _integrada_retornos (etapa, retorno)
select
  'reserva_pausada_inicial',
  public.reservar_checklist_automacao_trabalhos_interno(2, 10);

do $$
declare
  v_bloqueada boolean := false;
  v_chave text;
begin
  select pausada into v_chave from _integrada_chaves;
  begin
    perform public.preparar_checklist_automacao_interno(
      date_trunc('month', now() at time zone 'America/Manaus')::date,
      'MANUAL',
      v_chave
    );
  exception
    when others then
      v_bloqueada := position('pausada' in lower(sqlerrm)) > 0;
  end;

  insert into _integrada_resultados
  values (
    'pausa bloqueia preparacao',
    v_bloqueada,
    'a chamada mensal foi recusada enquanto a automacao estava pausada'
  );
end;
$$;

insert into _integrada_resultados
select
  'pausa bloqueia reserva',
  coalesce((r.retorno->>'pausada')::boolean, false)
    and coalesce((r.retorno->>'quantidade')::integer, -1) = 0
    and (select count(*) from public.checklist_automacao_execucoes) = e.execucoes_antes
    and (select count(*) from public.checklist_automacao_trabalhos) = e.trabalhos_antes
    and (select count(*) from public.checklist_envios) = e.envios_antes,
  'nenhuma execucao, trabalho ou historico foi criado durante a pausa'
from _integrada_retornos r
cross join _integrada_estado e
where r.etapa = 'reserva_pausada_inicial';

update public.checklist_automacao_configuracao
set ativa = true
where id = 1;

insert into _integrada_retornos (etapa, retorno)
select
  'preparacao_1',
  public.preparar_checklist_automacao_interno(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    'MANUAL',
    principal
  )
from _integrada_chaves;

insert into _integrada_retornos (etapa, retorno)
select
  'preparacao_2',
  public.preparar_checklist_automacao_interno(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    'MANUAL',
    principal
  )
from _integrada_chaves;

create temporary table _integrada_execucao
on commit drop
as
select (r.retorno->'execucao'->>'id')::uuid as execucao_id
from _integrada_retornos r
where r.etapa = 'preparacao_1';

insert into _integrada_resultados
select
  'execucao mensal as 08:00 de Manaus',
  e.segundo_dia_util = public.checklist_segundo_dia_util_manaus(
      extract(year from e.competencia_referencia)::integer,
      extract(month from e.competencia_referencia)::integer
    )
    and (e.agendada_para at time zone 'America/Manaus')::date = e.segundo_dia_util
    and (e.agendada_para at time zone 'America/Manaus')::time = time '08:00',
  'o ciclo mensal usa o segundo dia util e o horario local configurado'
from public.checklist_automacao_execucoes e
join _integrada_execucao x on x.execucao_id = e.id;

insert into _integrada_resultados
select
  'preparacao mensal idempotente',
  coalesce((r1.retorno->>'duplicado')::boolean, true) = false
    and coalesce((r2.retorno->>'duplicado')::boolean, false)
    and (select count(*) from public.checklist_automacao_execucoes) = s.execucoes_antes + 1
    and (select count(*) from public.checklist_automacao_trabalhos) = s.trabalhos_antes + 3,
  'duas chamadas com a mesma chave criaram uma execucao e tres trabalhos'
from _integrada_retornos r1
join _integrada_retornos r2 on r2.etapa = 'preparacao_2'
cross join _integrada_estado s
where r1.etapa = 'preparacao_1';

update public.checklist_automacao_configuracao
set ativa = false
where id = 1;

insert into _integrada_retornos (etapa, retorno)
select
  'reserva_pausada_com_fila',
  public.reservar_checklist_automacao_trabalhos_interno(2, 10);

insert into _integrada_resultados
select
  'pausa protege trabalhos preparados',
  coalesce((r.retorno->>'pausada')::boolean, false)
    and coalesce((r.retorno->>'quantidade')::integer, -1) = 0
    and (
      select count(*)
      from public.checklist_automacao_trabalhos t
      join _integrada_execucao x on x.execucao_id = t.execucao_id
      where t.status = 'PREPARADO'
        and t.tentativa_atual = 0
    ) = 3
    and not exists (
      select 1
      from public.checklist_envios h
      join public.checklist_automacao_trabalhos t on t.envio_id = h.id
      join _integrada_execucao x on x.execucao_id = t.execucao_id
    ),
  'a pausa manteve os tres trabalhos intactos e sem historico de envio'
from _integrada_retornos r
where r.etapa = 'reserva_pausada_com_fila';

update public.checklist_automacao_configuracao
set ativa = true
where id = 1;

insert into _integrada_retornos (etapa, retorno)
values
  ('lote_1', public.reservar_checklist_automacao_trabalhos_interno(2, 10)),
  ('lote_2', public.reservar_checklist_automacao_trabalhos_interno(2, 10)),
  ('lote_vazio', public.reservar_checklist_automacao_trabalhos_interno(2, 10));

create temporary table _integrada_reservas
on commit drop
as
select
  r.etapa,
  (item->>'id')::uuid as trabalho_id,
  (item->>'token_reserva')::uuid as token_reserva
from _integrada_retornos r
cross join lateral jsonb_array_elements(r.retorno->'trabalhos') item
where r.etapa in ('lote_1', 'lote_2');

create temporary table _integrada_alvo_tentativas
on commit drop
as
select trabalho_id, token_reserva
from _integrada_reservas
order by etapa, trabalho_id
limit 1;

insert into _integrada_resultados
select
  'processamento em lotes',
  coalesce((r1.retorno->>'quantidade')::integer, 0) = 2
    and coalesce((r2.retorno->>'quantidade')::integer, 0) = 1
    and coalesce((r3.retorno->>'quantidade')::integer, -1) = 0
    and (select count(*) from _integrada_reservas) = 3,
  'os tres trabalhos foram reservados em lotes de dois e um, sem quarta reserva'
from _integrada_retornos r1
join _integrada_retornos r2 on r2.etapa = 'lote_2'
join _integrada_retornos r3 on r3.etapa = 'lote_vazio'
where r1.etapa = 'lote_1';

insert into _integrada_retornos (etapa, retorno)
select
  'inicio_tentativa_1',
  public.iniciar_checklist_automacao_envio_interno(trabalho_id, token_reserva)
from _integrada_alvo_tentativas;

insert into _integrada_retornos (etapa, retorno)
select
  'inicio_tentativa_1_repetido',
  public.iniciar_checklist_automacao_envio_interno(trabalho_id, token_reserva)
from _integrada_alvo_tentativas;

insert into _integrada_retornos (etapa, retorno)
select
  'falha_tentativa_1',
  public.finalizar_checklist_automacao_trabalho_interno(
    trabalho_id,
    token_reserva,
    'FALHOU',
    jsonb_build_object(
      'erro_codigo', 'VALIDACAO_TRANSITORIA_1',
      'erro_mensagem', 'Falha transitoria simulada na primeira tentativa.',
      'erro_transitorio', true
    )
  )
from _integrada_alvo_tentativas;

insert into _integrada_retornos (etapa, retorno)
select
  'falha_tentativa_1_repetida',
  public.finalizar_checklist_automacao_trabalho_interno(
    trabalho_id,
    token_reserva,
    'FALHOU',
    jsonb_build_object(
      'erro_codigo', 'VALIDACAO_TRANSITORIA_1',
      'erro_mensagem', 'Falha transitoria simulada na primeira tentativa.',
      'erro_transitorio', true
    )
  )
from _integrada_alvo_tentativas;

insert into _integrada_resultados
select
  'idempotencia da primeira tentativa',
  coalesce((i1.retorno->>'adquirido')::boolean, false)
    and not coalesce((i2.retorno->>'adquirido')::boolean, true)
    and coalesce((f2.retorno->>'duplicado')::boolean, false)
    and (
      select count(*)
      from public.checklist_envios h
      join public.checklist_automacao_trabalhos t on t.envio_id = h.id
      join _integrada_alvo_tentativas a on a.trabalho_id = t.id
    ) = 1,
  'inicio e finalizacao repetidos mantiveram um unico historico para a tentativa'
from _integrada_retornos i1
join _integrada_retornos i2 on i2.etapa = 'inicio_tentativa_1_repetido'
join _integrada_retornos f2 on f2.etapa = 'falha_tentativa_1_repetida'
where i1.etapa = 'inicio_tentativa_1';

insert into _integrada_resultados
select
  'nova tentativa as 08:15',
  coalesce((r.retorno->>'nova_tentativa')::boolean, false)
    and coalesce((r.retorno->>'proxima_tentativa')::integer, 0) = 2
    and abs(extract(epoch from (
      t.disponivel_em - (t.primeira_tentativa_em + interval '15 minutes')
    ))) < 2,
  'a segunda tentativa foi programada quinze minutos apos a primeira'
from _integrada_retornos r
cross join _integrada_alvo_tentativas a
join public.checklist_automacao_trabalhos t on t.id = a.trabalho_id
where r.etapa = 'falha_tentativa_1';

update public.checklist_automacao_trabalhos t
set disponivel_em = now()
from _integrada_alvo_tentativas a
where t.id = a.trabalho_id;

insert into _integrada_retornos (etapa, retorno)
select
  'reserva_tentativa_2',
  public.reservar_checklist_automacao_trabalhos_interno(1, 10);

create temporary table _integrada_reserva_tentativa_2
on commit drop
as
select
  (retorno->'trabalhos'->0->>'id')::uuid as trabalho_id,
  (retorno->'trabalhos'->0->>'token_reserva')::uuid as token_reserva
from _integrada_retornos
where etapa = 'reserva_tentativa_2';

insert into _integrada_retornos (etapa, retorno)
select
  'inicio_tentativa_2',
  public.iniciar_checklist_automacao_envio_interno(trabalho_id, token_reserva)
from _integrada_reserva_tentativa_2;

insert into _integrada_retornos (etapa, retorno)
select
  'falha_tentativa_2',
  public.finalizar_checklist_automacao_trabalho_interno(
    trabalho_id,
    token_reserva,
    'FALHOU',
    jsonb_build_object(
      'erro_codigo', 'VALIDACAO_TRANSITORIA_2',
      'erro_mensagem', 'Falha transitoria simulada na segunda tentativa.',
      'erro_transitorio', true
    )
  )
from _integrada_reserva_tentativa_2;

insert into _integrada_resultados
select
  'ultima tentativa as 08:45',
  coalesce((r.retorno->>'nova_tentativa')::boolean, false)
    and coalesce((r.retorno->>'proxima_tentativa')::integer, 0) = 3
    and abs(extract(epoch from (
      t.disponivel_em - (t.primeira_tentativa_em + interval '45 minutes')
    ))) < 2,
  'a terceira tentativa foi programada quarenta e cinco minutos apos a primeira'
from _integrada_retornos r
cross join _integrada_reserva_tentativa_2 a
join public.checklist_automacao_trabalhos t on t.id = a.trabalho_id
where r.etapa = 'falha_tentativa_2';

update public.checklist_automacao_trabalhos t
set disponivel_em = now()
from _integrada_reserva_tentativa_2 a
where t.id = a.trabalho_id;

insert into _integrada_retornos (etapa, retorno)
select
  'reserva_tentativa_3',
  public.reservar_checklist_automacao_trabalhos_interno(1, 10);

create temporary table _integrada_reserva_tentativa_3
on commit drop
as
select
  (retorno->'trabalhos'->0->>'id')::uuid as trabalho_id,
  (retorno->'trabalhos'->0->>'token_reserva')::uuid as token_reserva
from _integrada_retornos
where etapa = 'reserva_tentativa_3';

insert into _integrada_retornos (etapa, retorno)
select
  'inicio_tentativa_3',
  public.iniciar_checklist_automacao_envio_interno(trabalho_id, token_reserva)
from _integrada_reserva_tentativa_3;

insert into _integrada_retornos (etapa, retorno)
select
  'sucesso_tentativa_3',
  public.finalizar_checklist_automacao_trabalho_interno(
    trabalho_id,
    token_reserva,
    'ENVIADO',
    jsonb_build_object('email_resend_id', 'validacao-integrada-tentativa-3')
  )
from _integrada_reserva_tentativa_3;

insert into _integrada_retornos (etapa, retorno)
select
  'sucesso_tentativa_3_repetido',
  public.finalizar_checklist_automacao_trabalho_interno(
    trabalho_id,
    token_reserva,
    'ENVIADO',
    jsonb_build_object('email_resend_id', 'validacao-integrada-tentativa-3')
  )
from _integrada_reserva_tentativa_3;

do $$
declare
  v_reserva record;
begin
  for v_reserva in
    select r.trabalho_id, r.token_reserva
    from _integrada_reservas r
    where not exists (
      select 1
      from _integrada_alvo_tentativas a
      where a.trabalho_id = r.trabalho_id
    )
  loop
    perform public.iniciar_checklist_automacao_envio_interno(
      v_reserva.trabalho_id,
      v_reserva.token_reserva
    );
    perform public.finalizar_checklist_automacao_trabalho_interno(
      v_reserva.trabalho_id,
      v_reserva.token_reserva,
      'ENVIADO',
      jsonb_build_object(
        'email_resend_id',
        concat('validacao-integrada-', v_reserva.trabalho_id::text)
      )
    );
  end loop;
end;
$$;

insert into _integrada_resultados
select
  'idempotencia da conclusao',
  coalesce((r.retorno->>'duplicado')::boolean, false)
    and (
      select count(*)
      from public.checklist_envios h
      join public.checklist_automacao_trabalhos t on t.envio_id = h.id
      join _integrada_reserva_tentativa_3 a on a.trabalho_id = t.id
      where h.tentativa = 3
    ) = 1,
  'a repeticao da conclusao nao criou outro historico nem outro envio logico'
from _integrada_retornos r
where r.etapa = 'sucesso_tentativa_3_repetido';

insert into _integrada_resultados
select
  'ciclo integrado concluido',
  e.status = 'CONCLUIDA'
    and e.total_trabalhos = 3
    and e.total_enviados = 3
    and e.total_falhas = 0
    and (
      select count(*)
      from public.checklist_automacao_trabalhos t
      where t.execucao_id = e.id
        and t.status = 'ENVIADO'
    ) = 3
    and (
      select count(*)
      from public.checklist_envios h
      join public.checklist_automacao_trabalhos t on t.envio_id = h.id
      where t.execucao_id = e.id
    ) = 3
    and exists (
      select 1
      from public.checklist_envios h
      join public.checklist_automacao_trabalhos t on t.envio_id = h.id
      join _integrada_alvo_tentativas a on a.trabalho_id = t.id
      where h.tentativa = 3
        and h.status = 'ENVIADO'
    ),
  'tres clientes foram concluidos; as repeticoes atualizaram o historico idempotente de cada cliente'
from public.checklist_automacao_execucoes e
join _integrada_execucao x on x.execucao_id = e.id;

insert into _integrada_resultados
select
  'nenhuma chamada externa',
  not exists (
    select 1
    from public.checklist_envios h
    join public.checklist_automacao_trabalhos t on t.envio_id = h.id
    join _integrada_execucao x on x.execucao_id = t.execucao_id
    where h.email_resend_id is not null
      and h.email_resend_id not like 'validacao-integrada-%'
  ),
  'somente identificadores ficticios foram gravados; o script nao invoca Edge Function ou Resend'
from _integrada_execucao;

insert into _integrada_resultados
select
  'rollback preparado',
  (select count(*) from public.checklist_automacao_execucoes) = s.execucoes_antes + 1
    and (select count(*) from public.checklist_automacao_trabalhos) = s.trabalhos_antes + 3
    and (select count(*) from public.checklist_envios) = s.envios_antes + 3,
  'uma execucao, tres trabalhos e tres historicos idempotentes serao desfeitos'
from _integrada_estado s;

select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from _integrada_resultados
order by verificacao;

rollback;
