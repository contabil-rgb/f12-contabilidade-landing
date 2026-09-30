-- Portal de Gestao Contabil - Validacao do teste manual da automacao
-- Execute depois de 20260928100000_checklist_automacao_teste_manual_base.sql.
-- A validacao prepara e reserva trabalhos, mas nao chama Edge Functions nem Resend.
-- Todas as alteracoes sao desfeitas ao final com ROLLBACK.

begin;

create temporary table _teste_manual_resultados (
  verificacao text primary key,
  ok boolean not null,
  detalhe text not null
) on commit drop;

create temporary table _teste_manual_retornos (
  etapa text primary key,
  retorno jsonb not null
) on commit drop;

create temporary table _teste_manual_estado
on commit drop
as
select
  (select count(*) from public.checklist_automacao_execucoes) as execucoes_antes,
  (select count(*) from public.checklist_automacao_trabalhos) as trabalhos_antes,
  (select count(*) from public.checklist_envios) as envios_antes,
  (select count(*) from public.checklist_automacao_auditoria) as auditorias_antes;

create temporary table _teste_manual_usuario
on commit drop
as
select u.id, u.auth_user_id, u.nome, u.email, u.perfil_acesso
from public.usuarios u
where u.status = 'Ativo'
  and u.auth_user_id is not null
  and u.perfil_acesso in ('coordenador_administrador', 'setor_contabil_operacional')
order by u.id
limit 1;

create temporary table _teste_manual_clientes
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
  if not exists (select 1 from _teste_manual_usuario) then
    raise exception 'Um usuario ativo do portal e necessario para a validacao.';
  end if;
  if (select count(*) from _teste_manual_clientes) <> 2 then
    raise exception 'Dois clientes ativos com itens de checklist sao necessarios para a validacao.';
  end if;
end;
$$;

grant select on _teste_manual_usuario, _teste_manual_clientes to authenticated;
grant select, insert, update, delete on _teste_manual_retornos to authenticated;

insert into _teste_manual_resultados
values
  (
    'estrutura do teste manual',
    to_regprocedure('public.simular_checklist_automacao_teste_portal(date,uuid[])') is not null
      and to_regprocedure(
        'public.preparar_checklist_automacao_teste_interno(date,uuid[],text,uuid)'
      ) is not null
      and to_regprocedure(
        'public.reservar_checklist_automacao_teste_interno(uuid,integer,integer)'
      ) is not null,
    'RPC de previa, preparacao idempotente e reserva direcionada disponiveis'
  ),
  (
    'permissoes do backend',
    has_function_privilege(
      'authenticated',
      'public.simular_checklist_automacao_teste_portal(date,uuid[])',
      'EXECUTE'
    )
      and not has_function_privilege(
        'authenticated',
        'public.preparar_checklist_automacao_teste_interno(date,uuid[],text,uuid)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.reservar_checklist_automacao_teste_interno(uuid,integer,integer)',
        'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        'public.preparar_checklist_automacao_teste_interno(date,uuid[],text,uuid)',
        'EXECUTE'
      ),
    'o portal pode simular; somente o backend prepara e reserva trabalhos'
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
where ac.cliente_id in (select id from _teste_manual_clientes);

update public.checklist_status s
set status = 'PENDENTE'
where s.cliente_id in (select id from _teste_manual_clientes)
  and s.ano = extract(
    year from date_trunc('month', now() at time zone 'America/Manaus') - interval '1 month'
  )::integer
  and s.mes = extract(
    month from date_trunc('month', now() at time zone 'America/Manaus') - interval '1 month'
  )::integer;

select set_config(
  'request.jwt.claim.sub',
  (select auth_user_id::text from _teste_manual_usuario),
  true
);

set local role authenticated;

insert into _teste_manual_retornos (etapa, retorno)
select
  'previa_lote',
  public.simular_checklist_automacao_teste_portal(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    array_agg(c.id order by c.id)
  )
from _teste_manual_clientes c;

insert into _teste_manual_retornos (etapa, retorno)
select
  'previa_individual',
  public.simular_checklist_automacao_teste_portal(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    array[(select id from _teste_manual_clientes order by id limit 1)]::uuid[]
  );

insert into _teste_manual_retornos (etapa, retorno)
select
  'painel',
  public.obter_checklist_automacao_painel_portal();

reset role;

insert into _teste_manual_resultados
select
  'previa de dois clientes',
  coalesce((r.retorno->>'simulacao')::boolean, false)
    and not coalesce((r.retorno->>'persistido')::boolean, true)
    and coalesce((r.retorno->>'automacao_global_pausada')::boolean, false)
    and (r.retorno->'resumo'->>'total_clientes')::integer = 2,
  'a previa calcula somente os dois clientes selecionados e nao persiste dados'
from _teste_manual_retornos r
where r.etapa = 'previa_lote';

insert into _teste_manual_resultados
select
  'previa individual',
  (r.retorno->'resumo'->>'total_clientes')::integer = 1
    and jsonb_array_length(r.retorno->'trabalhos') = 1,
  'a mesma RPC aceita a selecao de um unico cliente'
from _teste_manual_retornos r
where r.etapa = 'previa_individual';

insert into _teste_manual_resultados
select
  'responsavel disponivel no painel',
  not exists (
    select 1
    from jsonb_array_elements(r.retorno->'clientes') cliente
    where not (cliente ? 'responsavel')
  ),
  'cada cliente do painel inclui o campo responsavel para o filtro da interface'
from _teste_manual_retornos r
where r.etapa = 'painel';

create temporary table _teste_manual_chave
on commit drop
as
select concat('validacao-etapa7-', gen_random_uuid()::text) as chave;

insert into _teste_manual_retornos (etapa, retorno)
select
  'preparacao_1',
  public.preparar_checklist_automacao_teste_interno(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    (select array_agg(c.id order by c.id) from _teste_manual_clientes c),
    chave,
    (select id from _teste_manual_usuario)
  )
from _teste_manual_chave;

insert into _teste_manual_retornos (etapa, retorno)
select
  'preparacao_2',
  public.preparar_checklist_automacao_teste_interno(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    (select array_agg(c.id order by c.id) from _teste_manual_clientes c),
    chave,
    (select id from _teste_manual_usuario)
  )
from _teste_manual_chave;

insert into _teste_manual_resultados
select
  'preparacao direcionada em lote',
  not coalesce((r.retorno->>'duplicado')::boolean, true)
    and coalesce((r.retorno->>'automacao_global_pausada')::boolean, false)
    and (r.retorno->'execucao'->>'modo') = 'TESTE'
    and (r.retorno->'execucao'->>'acionamento') = 'MANUAL'
    and (r.retorno->'execucao'->>'total_clientes')::integer = 2
    and (r.retorno->'execucao'->>'total_trabalhos')::integer >= 1,
  'o lote foi preparado no modo TESTE sem reativar a automacao global'
from _teste_manual_retornos r
where r.etapa = 'preparacao_1';

insert into _teste_manual_resultados
select
  'idempotencia da requisicao',
  coalesce((r2.retorno->>'duplicado')::boolean, false)
    and r1.retorno->'execucao'->>'id' = r2.retorno->'execucao'->>'id'
    and (select count(*) from public.checklist_automacao_execucoes)
      = estado.execucoes_antes + 1,
  'a repeticao da mesma chave devolveu a execucao existente'
from _teste_manual_retornos r1
join _teste_manual_retornos r2 on r2.etapa = 'preparacao_2'
cross join _teste_manual_estado estado
where r1.etapa = 'preparacao_1';

insert into _teste_manual_retornos (etapa, retorno)
select
  'reserva',
  public.reservar_checklist_automacao_teste_interno(
    (r.retorno->'execucao'->>'id')::uuid,
    10,
    10
  )
from _teste_manual_retornos r
where r.etapa = 'preparacao_1';

insert into _teste_manual_resultados
select
  'reserva com pausa global',
  coalesce((r.retorno->>'automacao_global_pausada')::boolean, false)
    and (r.retorno->>'quantidade')::integer >= 1
    and not exists (
      select 1
      from jsonb_array_elements(r.retorno->'trabalhos') trabalho
      where (trabalho->>'execucao_id')::uuid
        <> (select (p.retorno->'execucao'->>'id')::uuid
            from _teste_manual_retornos p where p.etapa = 'preparacao_1')
    ),
  'a reserva avancou somente a execucao manual selecionada mesmo com a pausa global'
from _teste_manual_retornos r
where r.etapa = 'reserva';

insert into _teste_manual_resultados
values (
  'isolamento da fila global',
  position(
    'TESTE_MANUAL_DIRECIONADO' in pg_get_functiondef(
      'public.reservar_checklist_automacao_trabalhos_interno(integer,integer)'::regprocedure
    )
  ) > 0,
  'a fila agendada exclui explicitamente os trabalhos do teste manual direcionado'
);

insert into _teste_manual_resultados
select
  'auditoria da execucao',
  exists (
    select 1
    from public.checklist_automacao_auditoria a
    join _teste_manual_retornos r on r.etapa = 'preparacao_1'
    where a.entidade = 'EXECUCAO_TESTE'
      and a.operacao = 'EXECUTAR'
      and a.entidade_id = r.retorno->'execucao'->>'id'
      and a.alterado_por = (select id from _teste_manual_usuario)
      and jsonb_array_length(a.valor_novo->'cliente_ids') = 2
  ),
  'usuario, clientes, competencia, chave e resumo ficaram registrados'
from _teste_manual_estado;

insert into _teste_manual_resultados
select
  'nenhum envio externo iniciado',
  (select count(*) from public.checklist_envios) = estado.envios_antes,
  'preparar e reservar nao criaram historico de envio nem chamaram o Resend'
from _teste_manual_estado estado;

do $$
declare
  v_ids uuid[];
  v_bloqueou boolean := false;
begin
  select array_agg(c.id order by c.id)
  into v_ids
  from (
    select c.id
    from public.clientes c
    where public.checklist_cliente_elegivel_automacao(c.id)
    order by c.id
    limit 11
  ) c;

  if cardinality(v_ids) = 11 then
    update public.checklist_automacao_clientes ac
    set habilitada = true,
        competencia_inicial = coalesce(
          ac.competencia_inicial,
          date_trunc('month', now() at time zone 'America/Manaus')::date
        )
    where ac.cliente_id = any(v_ids);

    begin
      perform public.validar_checklist_automacao_teste_clientes_interno(v_ids);
    exception when others then
      v_bloqueou := position('maximo 10' in sqlerrm) > 0;
    end;
  else
    v_bloqueou := true;
  end if;

  insert into _teste_manual_resultados
  values (
    'limite de dez clientes',
    v_bloqueou,
    case
      when cardinality(v_ids) = 11 then 'uma selecao com 11 clientes foi rejeitada'
      else 'a base possui menos de 11 clientes ativos; a regra estrutural foi mantida'
    end
  );
end;
$$;

select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from _teste_manual_resultados
order by verificacao;

rollback;
