-- Portal de Gestao Contabil - Validacao da base do teste agendado
-- Execute depois de 20260928143000_checklist_automacao_teste_agendado_base.sql.
-- Nao cria cron, execucao, trabalho, historico de envio ou chamada ao Resend.
-- Todas as alteracoes desta validacao sao desfeitas ao final com ROLLBACK.

begin;

create temporary table _agendamento_teste_resultados (
  verificacao text primary key,
  ok boolean not null,
  detalhe text not null
) on commit drop;

create temporary table _agendamento_teste_retornos (
  etapa text primary key,
  retorno jsonb not null
) on commit drop;

create temporary table _agendamento_teste_estado
on commit drop
as
select
  (select count(*) from public.checklist_automacao_agendamentos_teste) as agendamentos_antes,
  (select count(*) from public.checklist_automacao_execucoes) as execucoes_antes,
  (select count(*) from public.checklist_automacao_trabalhos) as trabalhos_antes,
  (select count(*) from public.checklist_envios) as envios_antes;

create temporary table _agendamento_teste_usuario
on commit drop
as
select u.id, u.auth_user_id, u.nome, u.email, u.perfil_acesso
from public.usuarios u
where u.status = 'Ativo'
  and u.auth_user_id is not null
  and u.perfil_acesso in ('coordenador_administrador', 'setor_contabil_operacional')
order by u.id
limit 1;

create temporary table _agendamento_teste_clientes
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
  if not exists (select 1 from _agendamento_teste_usuario) then
    raise exception 'Um usuario ativo do portal e necessario para a validacao.';
  end if;
  if (select count(*) from _agendamento_teste_clientes) <> 2 then
    raise exception 'Dois clientes ativos com checklist sao necessarios para a validacao.';
  end if;
end;
$$;

grant select on _agendamento_teste_usuario, _agendamento_teste_clientes to authenticated;
grant select, insert, update, delete on _agendamento_teste_retornos to authenticated;

create temporary table _agendamento_teste_chave
on commit drop
as
select concat('validacao-etapa8-', gen_random_uuid()::text) as chave;
grant select on _agendamento_teste_chave to authenticated;

insert into _agendamento_teste_resultados
values
  (
    'estrutura isolada',
    to_regclass('public.checklist_automacao_agendamentos_teste') is not null
      and to_regprocedure(
        'public.criar_checklist_automacao_agendamento_teste_portal(date,timestamp without time zone,text,uuid[],text)'
      ) is not null
      and to_regprocedure(
        'public.cancelar_checklist_automacao_agendamento_teste_portal(uuid,text)'
      ) is not null,
    'tabela e RPCs de agendamento e cancelamento disponiveis'
  ),
  (
    'RLS e gravacao protegida',
    (select c.relrowsecurity from pg_class c where c.oid = 'public.checklist_automacao_agendamentos_teste'::regclass)
      and has_table_privilege('authenticated', 'public.checklist_automacao_agendamentos_teste', 'SELECT')
      and not has_table_privilege('authenticated', 'public.checklist_automacao_agendamentos_teste', 'INSERT')
      and not has_table_privilege('authenticated', 'public.checklist_automacao_agendamentos_teste', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.checklist_automacao_agendamentos_teste', 'DELETE'),
    'authenticated consulta, mas nao grava diretamente na tabela'
  ),
  (
    'permissoes das RPCs',
    has_function_privilege(
      'authenticated',
      'public.simular_checklist_automacao_agendamento_teste_portal(date,text,uuid[])',
      'EXECUTE'
    )
      and has_function_privilege(
        'authenticated',
        'public.criar_checklist_automacao_agendamento_teste_portal(date,timestamp without time zone,text,uuid[],text)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.validar_checklist_automacao_agendamento_clientes_interno(text,uuid[])',
        'EXECUTE'
      ),
    'portal usa apenas RPCs publicas; validacao interna permanece no backend'
  ),
  (
    'nenhum cron novo',
    not exists (
      select 1
      from cron.job
      where jobname ilike '%teste%agend%'
         or jobname ilike '%agend%teste%'
    ),
    'a Parte 1 nao agenda processos no pg_cron'
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
where ac.cliente_id in (select id from _agendamento_teste_clientes);

update public.checklist_status s
set status = 'PENDENTE'
where s.cliente_id in (select id from _agendamento_teste_clientes)
  and s.ano = extract(
    year from date_trunc('month', now() at time zone 'America/Manaus') - interval '1 month'
  )::integer
  and s.mes = extract(
    month from date_trunc('month', now() at time zone 'America/Manaus') - interval '1 month'
  )::integer;

select set_config(
  'request.jwt.claim.sub',
  (select auth_user_id::text from _agendamento_teste_usuario),
  true
);

set local role authenticated;

insert into _agendamento_teste_retornos (etapa, retorno)
select
  'previa_selecionados',
  public.simular_checklist_automacao_agendamento_teste_portal(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    'CLIENTES_SELECIONADOS',
    array_agg(c.id order by c.id)
  )
from _agendamento_teste_clientes c;

insert into _agendamento_teste_retornos (etapa, retorno)
values (
  'previa_todos',
  public.simular_checklist_automacao_agendamento_teste_portal(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    'TODOS_ELEGIVEIS',
    null
  )
);

insert into _agendamento_teste_retornos (etapa, retorno)
select
  'criacao_1',
  public.criar_checklist_automacao_agendamento_teste_portal(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    (now() at time zone 'America/Manaus' + interval '1 day')::timestamp,
    'CLIENTES_SELECIONADOS',
    (select array_agg(c.id order by c.id) from _agendamento_teste_clientes c),
    chave
  )
from _agendamento_teste_chave;

insert into _agendamento_teste_retornos (etapa, retorno)
select
  'criacao_mesmos_dados',
  public.criar_checklist_automacao_agendamento_teste_portal(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    (now() at time zone 'America/Manaus' + interval '1 day')::timestamp,
    'CLIENTES_SELECIONADOS',
    (select array_agg(c.id order by c.id) from _agendamento_teste_clientes c),
    concat('mesmos-dados-', gen_random_uuid()::text)
  );

insert into _agendamento_teste_retornos (etapa, retorno)
select
  'criacao_2',
  public.criar_checklist_automacao_agendamento_teste_portal(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    (now() at time zone 'America/Manaus' + interval '1 day')::timestamp,
    'CLIENTES_SELECIONADOS',
    (select array_agg(c.id order by c.id) from _agendamento_teste_clientes c),
    chave
  )
from _agendamento_teste_chave;

insert into _agendamento_teste_retornos (etapa, retorno)
select
  'detalhe',
  public.obter_checklist_automacao_agendamento_teste_portal(
    (r.retorno->'agendamento'->>'id')::uuid
  )
from _agendamento_teste_retornos r
where r.etapa = 'criacao_1';

insert into _agendamento_teste_retornos (etapa, retorno)
values (
  'lista',
  public.listar_checklist_automacao_agendamentos_teste_portal(50)
);

insert into _agendamento_teste_retornos (etapa, retorno)
select
  'cancelamento',
  public.cancelar_checklist_automacao_agendamento_teste_portal(
    (r.retorno->'agendamento'->>'id')::uuid,
    'CANCELAR AGENDAMENTO'
  )
from _agendamento_teste_retornos r
where r.etapa = 'criacao_1';

reset role;

insert into _agendamento_teste_resultados
select
  'previa sem persistencia',
  coalesce((s.retorno->>'simulacao')::boolean, false)
    and not coalesce((s.retorno->>'persistido')::boolean, true)
    and s.retorno->>'escopo' = 'CLIENTES_SELECIONADOS'
    and jsonb_array_length(s.retorno->'trabalhos') = 2
    and coalesce((t.retorno->>'simulacao')::boolean, false)
    and t.retorno->>'escopo' = 'TODOS_ELEGIVEIS',
  'previas selecionada e global calculadas sem gravar agendamentos'
from _agendamento_teste_retornos s
join _agendamento_teste_retornos t on t.etapa = 'previa_todos'
where s.etapa = 'previa_selecionados';

insert into _agendamento_teste_resultados
select
  'criacao segura em modo TESTE',
  coalesce((r.retorno->>'persistido')::boolean, false)
    and not coalesce((r.retorno->>'duplicado')::boolean, true)
    and coalesce((r.retorno->>'automacao_global_pausada')::boolean, false)
    and r.retorno->'agendamento'->>'modo' = 'TESTE'
    and r.retorno->'agendamento'->>'status' = 'AGENDADO'
    and r.retorno->'agendamento'->>'destinatario_teste' = 'nattorocha04@gmail.com'
    and r.retorno->'agendamento'->>'cc_teste' = 'rocharenato2004@gmail.com',
  'agendamento persistido com pausa global e destinos pessoais congelados'
from _agendamento_teste_retornos r
where r.etapa = 'criacao_1';

insert into _agendamento_teste_resultados
select
  'idempotencia do agendamento',
  coalesce((r2.retorno->>'duplicado')::boolean, false)
    and coalesce((r3.retorno->>'duplicado')::boolean, false)
    and r1.retorno->'agendamento'->>'id' = r2.retorno->'agendamento'->>'id'
    and r1.retorno->'agendamento'->>'id' = r3.retorno->'agendamento'->>'id'
    and (select count(*) from public.checklist_automacao_agendamentos_teste)
      = estado.agendamentos_antes + 1,
  'a mesma chave ou os mesmos dados devolveram o agendamento existente'
from _agendamento_teste_retornos r1
join _agendamento_teste_retornos r2 on r2.etapa = 'criacao_2'
join _agendamento_teste_retornos r3 on r3.etapa = 'criacao_mesmos_dados'
cross join _agendamento_teste_estado estado
where r1.etapa = 'criacao_1';

insert into _agendamento_teste_resultados
select
  'consulta e horario de Manaus',
  d.retorno->>'id' = c.retorno->'agendamento'->>'id'
    and (d.retorno->>'data_hora_manaus')::timestamp
      = (now() at time zone 'America/Manaus' + interval '1 day')::timestamp,
  'detalhe e listagem apresentam o instante no fuso America/Manaus'
from _agendamento_teste_retornos d
join _agendamento_teste_retornos c on c.etapa = 'criacao_1'
where d.etapa = 'detalhe';

insert into _agendamento_teste_resultados
select
  'cancelamento auditado',
  r.retorno->'agendamento'->>'status' = 'CANCELADO'
    and (r.retorno->'agendamento'->>'cancelado_em') is not null
    and exists (
      select 1
      from public.checklist_automacao_auditoria a
      where a.entidade = 'AGENDAMENTO_TESTE'
        and a.entidade_id = r.retorno->'agendamento'->>'id'
        and a.operacao = 'AGENDAR'
    )
    and exists (
      select 1
      from public.checklist_automacao_auditoria a
      where a.entidade = 'AGENDAMENTO_TESTE'
        and a.entidade_id = r.retorno->'agendamento'->>'id'
        and a.operacao = 'CANCELAR'
    ),
  'criacao e cancelamento registraram usuario, valores e horario'
from _agendamento_teste_retornos r
where r.etapa = 'cancelamento';

insert into _agendamento_teste_resultados
select
  'nenhuma execucao ou envio criado',
  (select count(*) from public.checklist_automacao_execucoes) = estado.execucoes_antes
    and (select count(*) from public.checklist_automacao_trabalhos) = estado.trabalhos_antes
    and (select count(*) from public.checklist_envios) = estado.envios_antes,
  'a Parte 1 nao criou execucao, trabalho, historico nem chamada externa'
from _agendamento_teste_estado estado;

do $$
declare
  v_bloqueou_passado boolean := false;
  v_bloqueou_modo_real boolean := false;
begin
  begin
    perform public.criar_checklist_automacao_agendamento_teste_portal(
      date_trunc('month', now() at time zone 'America/Manaus')::date,
      (now() at time zone 'America/Manaus' - interval '1 minute')::timestamp,
      'TODOS_ELEGIVEIS',
      null,
      concat('passado-', gen_random_uuid()::text)
    );
  exception when others then
    v_bloqueou_passado := position('futuro' in sqlerrm) > 0;
  end;

  update public.checklist_automacao_configuracao set modo = 'REAL' where id = 1;
  begin
    perform public.criar_checklist_automacao_agendamento_teste_portal(
      date_trunc('month', now() at time zone 'America/Manaus')::date,
      (now() at time zone 'America/Manaus' + interval '2 days')::timestamp,
      'TODOS_ELEGIVEIS',
      null,
      concat('modo-real-', gen_random_uuid()::text)
    );
  exception when others then
    v_bloqueou_modo_real := position('modo TESTE' in sqlerrm) > 0;
  end;

  insert into _agendamento_teste_resultados
  values (
    'bloqueios de seguranca',
    v_bloqueou_passado and v_bloqueou_modo_real,
    'horario passado e modo REAL foram rejeitados'
  );
end;
$$;

select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from _agendamento_teste_resultados
order by verificacao;

rollback;
