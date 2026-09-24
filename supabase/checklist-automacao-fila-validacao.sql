-- Portal de Gestao Contabil - Validacao da fila da automacao
-- Execute depois de 20260924180000_checklist_automacao_fila.sql.
-- Todos os registros do teste sao desfeitos pelo ROLLBACK. Nao envia e-mails.

begin;

create temporary table _fila_validacao_resultados (
  verificacao text primary key,
  ok boolean not null,
  detalhe text not null
) on commit drop;

create temporary table _fila_validacao_estado
on commit drop
as
select
  (select count(*) from public.checklist_automacao_execucoes) as execucoes_antes,
  (select count(*) from public.checklist_automacao_trabalhos) as trabalhos_antes,
  (select count(*) from public.checklist_envios) as envios_antes;

insert into _fila_validacao_resultados
values
  (
    'estrutura da fila',
    to_regprocedure(
      'public.reservar_checklist_automacao_trabalhos_interno(integer,integer)'
    ) is not null
      and to_regprocedure(
        'public.iniciar_checklist_automacao_envio_interno(uuid,uuid)'
      ) is not null
      and to_regprocedure(
        'public.finalizar_checklist_automacao_trabalho_interno(uuid,uuid,text,jsonb)'
      ) is not null,
    'funcoes de reserva, inicio do historico e finalizacao disponiveis'
  ),
  (
    'colunas de processamento',
    (
      select count(*) = 15
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'checklist_automacao_trabalhos'
        and column_name in (
          'tentativa_atual',
          'tentativas_max',
          'intervalos_tentativas_minutos',
          'disponivel_em',
          'primeira_tentativa_em',
          'ultima_tentativa_em',
          'reservado_em',
          'reserva_expira_em',
          'token_reserva',
          'tentativa_envio_iniciada',
          'envio_iniciado_em',
          'envio_id',
          'erro_codigo',
          'erro_mensagem',
          'erro_transitorio'
        )
    ),
    'quinze campos de fila e tentativas encontrados'
  ),
  (
    'funcoes restritas ao backend',
    not has_function_privilege(
      'authenticated',
      'public.reservar_checklist_automacao_trabalhos_interno(integer,integer)',
      'EXECUTE'
    )
      and not has_function_privilege(
        'authenticated',
        'public.iniciar_checklist_automacao_envio_interno(uuid,uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.finalizar_checklist_automacao_trabalho_interno(uuid,uuid,text,jsonb)',
        'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        'public.reservar_checklist_automacao_trabalhos_interno(integer,integer)',
        'EXECUTE'
    ),
    'authenticated nao processa a fila; somente o backend executa as funcoes'
  ),
  (
    'fila interna protegida',
    not has_table_privilege(
      'authenticated',
      'public.checklist_automacao_trabalhos',
      'SELECT,INSERT,UPDATE,DELETE'
    ),
    'tokens e estados internos da fila nao ficam expostos ao portal'
  );

create temporary table _fila_validacao_retornos (
  etapa text primary key,
  retorno jsonb not null
) on commit drop;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'reserva_pausada',
  public.reservar_checklist_automacao_trabalhos_interno(1, 10);

insert into _fila_validacao_resultados
select
  'pausa global respeitada',
  coalesce((retorno->>'pausada')::boolean, false)
    and coalesce((retorno->>'quantidade')::integer, -1) = 0,
  'nenhum trabalho e reservado enquanto a automacao global esta pausada'
from _fila_validacao_retornos
where etapa = 'reserva_pausada';

create temporary table _fila_validacao_alvo
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
select candidatos.cliente_id, c.inicio as competencia_inicial
from candidatos
cross join competencia c
join public.clientes cliente on cliente.id = candidatos.cliente_id
where coalesce(cliente.arquivado, false) = false
  and lower(coalesce(cliente.status, '')) <> 'inativo'
order by candidatos.cliente_id
limit 1;

do $$
begin
  if not exists (select 1 from _fila_validacao_alvo) then
    raise exception 'Nao foi encontrado cliente com pendencia para validar a fila.';
  end if;
end;
$$;

update public.checklist_automacao_configuracao
set ativa = true,
    modo = 'TESTE'
where id = 1;

update public.checklist_automacao_clientes ac
set habilitada = (ac.cliente_id = alvo.cliente_id),
    competencia_inicial = case
      when ac.cliente_id = alvo.cliente_id then alvo.competencia_inicial
      else ac.competencia_inicial
    end
from _fila_validacao_alvo alvo;

create temporary table _fila_validacao_chave
on commit drop
as
select concat('validacao-etapa4-fila:', gen_random_uuid()::text) as chave;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'preparacao',
  public.preparar_checklist_automacao_interno(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    'MANUAL',
    chave
  )
from _fila_validacao_chave;

insert into _fila_validacao_resultados
select
  'trabalho preparado para a fila',
  exists (
    select 1
    from public.checklist_automacao_trabalhos t
    join public.checklist_automacao_execucoes e on e.id = t.execucao_id
    join _fila_validacao_chave k on k.chave = e.chave_idempotencia
    where t.status = 'PREPARADO'
      and t.tentativa_atual = 0
      and t.tentativas_max = 3
      and t.intervalos_tentativas_minutos = array[0, 15, 45]
      and t.disponivel_em is not null
  ),
  'o trabalho recebeu os limites e intervalos configurados'
from _fila_validacao_chave;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'primeira_reserva',
  public.reservar_checklist_automacao_trabalhos_interno(1, 10);

create temporary table _fila_validacao_primeira_reserva
on commit drop
as
select
  (retorno->'trabalhos'->0->>'id')::uuid as trabalho_id,
  (retorno->'trabalhos'->0->>'token_reserva')::uuid as token_reserva
from _fila_validacao_retornos
where etapa = 'primeira_reserva';

insert into _fila_validacao_retornos (etapa, retorno)
select
  'reserva_concorrente',
  public.reservar_checklist_automacao_trabalhos_interno(1, 10);

insert into _fila_validacao_resultados
select
  'reserva atomica',
  coalesce((r1.retorno->>'quantidade')::integer, 0) = 1
    and coalesce((r2.retorno->>'quantidade')::integer, -1) = 0
    and exists (
      select 1
      from public.checklist_automacao_trabalhos t
      join _fila_validacao_primeira_reserva x on x.trabalho_id = t.id
      where t.status = 'PROCESSANDO'
        and t.tentativa_atual = 1
        and t.token_reserva = x.token_reserva
        and t.reserva_expira_em > t.reservado_em
    ),
  'a segunda reserva concorrente nao adquiriu o trabalho ja reservado'
from _fila_validacao_retornos r1
join _fila_validacao_retornos r2 on r2.etapa = 'reserva_concorrente'
where r1.etapa = 'primeira_reserva';

insert into _fila_validacao_retornos (etapa, retorno)
select
  'primeiro_inicio',
  public.iniciar_checklist_automacao_envio_interno(trabalho_id, token_reserva)
from _fila_validacao_primeira_reserva;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'inicio_duplicado',
  public.iniciar_checklist_automacao_envio_interno(trabalho_id, token_reserva)
from _fila_validacao_primeira_reserva;

insert into _fila_validacao_resultados
select
  'historico automatico idempotente',
  coalesce((r1.retorno->>'adquirido')::boolean, false)
    and not coalesce((r2.retorno->>'adquirido')::boolean, true)
    and (
      select count(*)
      from public.checklist_envios e
      join _fila_validacao_primeira_reserva x
        on x.trabalho_id = (
          select t.id
          from public.checklist_automacao_trabalhos t
          where t.envio_id = e.id
          limit 1
        )
      where e.origem = 'AUTOMATICO'
    ) = 1,
  'duas inicializacoes da mesma tentativa criaram um unico historico'
from _fila_validacao_retornos r1
join _fila_validacao_retornos r2 on r2.etapa = 'inicio_duplicado'
where r1.etapa = 'primeiro_inicio';

insert into _fila_validacao_retornos (etapa, retorno)
select
  'falha_transitoria',
  public.finalizar_checklist_automacao_trabalho_interno(
    trabalho_id,
    token_reserva,
    'FALHOU',
    jsonb_build_object(
      'erro_codigo', 'TESTE_TRANSITORIO',
      'erro_mensagem', 'Falha transitoria simulada.',
      'erro_transitorio', true
    )
  )
from _fila_validacao_primeira_reserva;

insert into _fila_validacao_resultados
select
  'nova tentativa programada',
  coalesce((r.retorno->>'nova_tentativa')::boolean, false)
    and coalesce((r.retorno->>'proxima_tentativa')::integer, 0) = 2
    and exists (
      select 1
      from public.checklist_automacao_trabalhos t
      join _fila_validacao_primeira_reserva x on x.trabalho_id = t.id
      where t.status = 'AGUARDANDO_NOVA_TENTATIVA'
        and t.tentativa_atual = 1
        and abs(
          extract(
            epoch from (
              t.disponivel_em - (t.primeira_tentativa_em + interval '15 minutes')
            )
          )
        ) < 2
    ),
  'falha transitoria reagendada para quinze minutos apos a primeira tentativa'
from _fila_validacao_retornos r
where r.etapa = 'falha_transitoria';

update public.checklist_automacao_trabalhos t
set disponivel_em = now()
from _fila_validacao_primeira_reserva x
where t.id = x.trabalho_id;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'segunda_reserva',
  public.reservar_checklist_automacao_trabalhos_interno(1, 10);

create temporary table _fila_validacao_segunda_reserva
on commit drop
as
select
  (retorno->'trabalhos'->0->>'id')::uuid as trabalho_id,
  (retorno->'trabalhos'->0->>'token_reserva')::uuid as token_reserva
from _fila_validacao_retornos
where etapa = 'segunda_reserva';

insert into _fila_validacao_retornos (etapa, retorno)
select
  'segundo_inicio',
  public.iniciar_checklist_automacao_envio_interno(trabalho_id, token_reserva)
from _fila_validacao_segunda_reserva;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'segunda_falha_transitoria',
  public.finalizar_checklist_automacao_trabalho_interno(
    trabalho_id,
    token_reserva,
    'FALHOU',
    jsonb_build_object(
      'erro_codigo', 'TESTE_TRANSITORIO_2',
      'erro_mensagem', 'Segunda falha transitoria simulada.',
      'erro_transitorio', true
    )
  )
from _fila_validacao_segunda_reserva;

insert into _fila_validacao_resultados
select
  'terceira tentativa programada',
  coalesce((r.retorno->>'nova_tentativa')::boolean, false)
    and coalesce((r.retorno->>'proxima_tentativa')::integer, 0) = 3
    and exists (
      select 1
      from public.checklist_automacao_trabalhos t
      join _fila_validacao_segunda_reserva x on x.trabalho_id = t.id
      where t.status = 'AGUARDANDO_NOVA_TENTATIVA'
        and t.tentativa_atual = 2
        and abs(
          extract(
            epoch from (
              t.disponivel_em - (t.primeira_tentativa_em + interval '45 minutes')
            )
          )
        ) < 2
    ),
  'segunda falha transitoria reagendada para quarenta e cinco minutos apos a primeira tentativa'
from _fila_validacao_retornos r
where r.etapa = 'segunda_falha_transitoria';

update public.checklist_automacao_trabalhos t
set disponivel_em = now()
from _fila_validacao_segunda_reserva x
where t.id = x.trabalho_id;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'terceira_reserva',
  public.reservar_checklist_automacao_trabalhos_interno(1, 10);

create temporary table _fila_validacao_terceira_reserva
on commit drop
as
select
  (retorno->'trabalhos'->0->>'id')::uuid as trabalho_id,
  (retorno->'trabalhos'->0->>'token_reserva')::uuid as token_reserva
from _fila_validacao_retornos
where etapa = 'terceira_reserva';

insert into _fila_validacao_retornos (etapa, retorno)
select
  'terceiro_inicio',
  public.iniciar_checklist_automacao_envio_interno(trabalho_id, token_reserva)
from _fila_validacao_terceira_reserva;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'limite_de_tentativas',
  public.finalizar_checklist_automacao_trabalho_interno(
    trabalho_id,
    token_reserva,
    'FALHOU',
    jsonb_build_object(
      'erro_codigo', 'TESTE_TRANSITORIO_3',
      'erro_mensagem', 'Terceira falha transitoria simulada.',
      'erro_transitorio', true
    )
  )
from _fila_validacao_terceira_reserva;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'finalizacao_duplicada',
  public.finalizar_checklist_automacao_trabalho_interno(
    trabalho_id,
    token_reserva,
    'FALHOU',
    jsonb_build_object(
      'erro_codigo', 'TESTE_DEFINITIVO',
      'erro_mensagem', 'Falha definitiva simulada.',
      'erro_transitorio', false
    )
  )
from _fila_validacao_terceira_reserva;

insert into _fila_validacao_resultados
select
  'limite e conclusao da fila',
  coalesce((f.retorno->>'nova_tentativa')::boolean, true) = false
    and coalesce((d.retorno->>'duplicado')::boolean, false)
    and exists (
      select 1
      from public.checklist_automacao_trabalhos t
      join _fila_validacao_terceira_reserva x on x.trabalho_id = t.id
      join public.checklist_automacao_execucoes e on e.id = t.execucao_id
      join public.checklist_envios h on h.id = t.envio_id
      where t.status = 'FALHOU'
        and t.tentativa_atual = 3
        and t.finalizado_em is not null
        and e.status = 'CONCLUIDA_COM_FALHAS'
        and e.total_falhas = 1
        and h.status = 'FALHOU'
        and h.tentativa = 3
    ),
  'a terceira falha encerrou o trabalho e a repeticao da finalizacao foi idempotente'
from _fila_validacao_retornos f
join _fila_validacao_retornos d on d.etapa = 'finalizacao_duplicada'
where f.etapa = 'limite_de_tentativas';

create temporary table _fila_validacao_chave_sucesso
on commit drop
as
select concat('validacao-etapa4-sucesso:', gen_random_uuid()::text) as chave;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'preparacao_sucesso',
  public.preparar_checklist_automacao_interno(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    'MANUAL',
    chave
  )
from _fila_validacao_chave_sucesso;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'reserva_sucesso',
  public.reservar_checklist_automacao_trabalhos_interno(1, 10);

create temporary table _fila_validacao_reserva_sucesso
on commit drop
as
select
  (retorno->'trabalhos'->0->>'id')::uuid as trabalho_id,
  (retorno->'trabalhos'->0->>'token_reserva')::uuid as token_reserva
from _fila_validacao_retornos
where etapa = 'reserva_sucesso';

insert into _fila_validacao_retornos (etapa, retorno)
select
  'inicio_sucesso',
  public.iniciar_checklist_automacao_envio_interno(trabalho_id, token_reserva)
from _fila_validacao_reserva_sucesso;

insert into _fila_validacao_retornos (etapa, retorno)
select
  'conclusao_sucesso',
  public.finalizar_checklist_automacao_trabalho_interno(
    trabalho_id,
    token_reserva,
    'ENVIADO',
    jsonb_build_object('email_resend_id', 'validacao-sem-envio-externo')
  )
from _fila_validacao_reserva_sucesso;

insert into _fila_validacao_resultados
select
  'conclusao de sucesso simulada',
  coalesce((r.retorno->>'nova_tentativa')::boolean, true) = false
    and exists (
      select 1
      from public.checklist_automacao_trabalhos t
      join _fila_validacao_reserva_sucesso x on x.trabalho_id = t.id
      join public.checklist_automacao_execucoes e on e.id = t.execucao_id
      join public.checklist_envios h on h.id = t.envio_id
      where t.status = 'ENVIADO'
        and t.tentativa_atual = 1
        and t.email_resend_id = 'validacao-sem-envio-externo'
        and e.status = 'CONCLUIDA'
        and e.total_enviados = 1
        and h.status = 'ENVIADO'
        and h.email_resend_id = 'validacao-sem-envio-externo'
    ),
  'o banco concluiu trabalho, historico e execucao com identificador ficticio'
from _fila_validacao_retornos r
where r.etapa = 'conclusao_sucesso';

insert into _fila_validacao_resultados
select
  'nenhuma chamada externa',
  not exists (
    select 1
    from public.checklist_envios e
    join _fila_validacao_terceira_reserva x
      on e.id = (
        select t.envio_id
        from public.checklist_automacao_trabalhos t
        where t.id = x.trabalho_id
      )
    where e.status = 'ENVIADO'
       or e.email_resend_id is not null
  ),
  'a rota de falha nao recebeu identificador e nenhuma funcao SQL chama o Resend'
from _fila_validacao_estado;

insert into _fila_validacao_resultados
select
  'rollback preparado',
  (select count(*) from public.checklist_automacao_execucoes) = e.execucoes_antes + 2
    and (select count(*) from public.checklist_automacao_trabalhos) = e.trabalhos_antes + 2
    and (select count(*) from public.checklist_envios) = e.envios_antes + 2,
  'os ciclos temporarios de falha e sucesso serao desfeitos ao final do script'
from _fila_validacao_estado e;

select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from _fila_validacao_resultados
order by verificacao;

rollback;
