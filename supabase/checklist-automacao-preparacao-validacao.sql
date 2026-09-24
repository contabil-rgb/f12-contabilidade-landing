-- Portal de Gestao Contabil - Validacao da preparacao da automacao
-- Execute depois de 20260924150000_checklist_automacao_preparacao.sql.
-- O teste habilita temporariamente um cliente, prepara duas vezes a mesma
-- execucao e desfaz tudo ao final com ROLLBACK. Nao envia e-mails.

begin;

create temporary table _checklist_validacao_resultados (
  verificacao text primary key,
  ok boolean not null,
  detalhe text not null
) on commit drop;

create temporary table _checklist_validacao_estado
on commit drop
as
select
  (select count(*) from public.checklist_automacao_execucoes) as execucoes_antes,
  (select count(*) from public.checklist_automacao_trabalhos) as trabalhos_antes,
  (select count(*) from public.checklist_envios) as envios_antes;

create temporary table _checklist_validacao_alvo
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
limit 1;

do $$
begin
  if not exists (select 1 from _checklist_validacao_alvo) then
    raise exception 'Nao foi encontrado cliente com pendencia para executar a validacao.';
  end if;
end;
$$;

insert into _checklist_validacao_resultados
values
  (
    'estrutura da preparacao',
    to_regclass('public.checklist_automacao_trabalhos') is not null
      and to_regprocedure('public.listar_checklist_automacao_candidatos_interno(date,text)') is not null
      and to_regprocedure('public.preparar_checklist_automacao_interno(date,text,text)') is not null,
    'tabela de trabalhos e duas funcoes internas disponiveis'
  ),
  (
    'competencia inicial dos itens',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'checklist_clientes_itens'
        and column_name = 'competencia_inicial'
    )
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'checklist_clientes_itens_personalizados'
          and column_name = 'competencia_inicial'
      ),
    'itens padrao e personalizados possuem inicio de vigencia'
  ),
  (
    'RLS dos trabalhos',
    exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'checklist_automacao_trabalhos'
        and c.relrowsecurity = true
    ),
    'RLS ativo na tabela de trabalhos'
  ),
  (
    'gravacao direta bloqueada',
    not has_table_privilege(
      'authenticated',
      'public.checklist_automacao_trabalhos',
      'INSERT,UPDATE,DELETE'
    ),
    'authenticated consulta, mas nao grava trabalhos diretamente'
  ),
  (
    'funcoes restritas ao backend',
    not has_function_privilege(
      'authenticated',
      'public.listar_checklist_automacao_candidatos_interno(date,text)',
      'EXECUTE'
    )
      and not has_function_privilege(
        'authenticated',
        'public.preparar_checklist_automacao_interno(date,text,text)',
        'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        'public.preparar_checklist_automacao_interno(date,text,text)',
        'EXECUTE'
      ),
    'somente o backend pode listar candidatos e preparar execucoes'
  );

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
from _checklist_validacao_alvo alvo;

create temporary table _checklist_validacao_chave
on commit drop
as
select concat('validacao-etapa3:', gen_random_uuid()::text) as chave;

create temporary table _checklist_validacao_retornos (
  etapa text primary key,
  retorno jsonb not null
) on commit drop;

insert into _checklist_validacao_retornos (etapa, retorno)
select
  'simulacao',
  public.preparar_checklist_automacao_interno(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    'SIMULACAO',
    null
  );

insert into _checklist_validacao_resultados
select
  'simulacao sem persistencia',
  coalesce((r.retorno->>'simulacao')::boolean, false)
    and not coalesce((r.retorno->>'persistido')::boolean, true)
    and (select count(*) from public.checklist_automacao_execucoes) = e.execucoes_antes
    and (select count(*) from public.checklist_automacao_trabalhos) = e.trabalhos_antes,
  'simulacao calcula os candidatos sem criar execucao ou trabalho'
from _checklist_validacao_retornos r
cross join _checklist_validacao_estado e
where r.etapa = 'simulacao';

insert into _checklist_validacao_retornos (etapa, retorno)
select
  'primeira_preparacao',
  public.preparar_checklist_automacao_interno(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    'MANUAL',
    chave
  )
from _checklist_validacao_chave;

insert into _checklist_validacao_retornos (etapa, retorno)
select
  'segunda_preparacao',
  public.preparar_checklist_automacao_interno(
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    'MANUAL',
    chave
  )
from _checklist_validacao_chave;

insert into _checklist_validacao_resultados
select
  'preparacao em modo de teste',
  exists (
    select 1
    from public.checklist_automacao_execucoes e
    join _checklist_validacao_chave k on k.chave = e.chave_idempotencia
    where e.modo = 'TESTE'
      and e.acionamento = 'MANUAL'
      and e.status = 'AGENDADA'
      and e.total_trabalhos >= 1
  )
    and exists (
      select 1
      from public.checklist_automacao_trabalhos t
      join public.checklist_automacao_execucoes e on e.id = t.execucao_id
      join _checklist_validacao_chave k on k.chave = e.chave_idempotencia
      where t.status = 'PREPARADO'
        and t.qtd_pendencias >= 1
        and t.destinatario_efetivo = 'nattorocha04@gmail.com'
        and t.cc_efetivo = 'rocharenato2004@gmail.com'
    ),
  'um trabalho foi preparado com pendencias e destinatarios de teste'
from _checklist_validacao_chave;

insert into _checklist_validacao_resultados
select
  'idempotencia da preparacao',
  (select count(*) from public.checklist_automacao_execucoes) = e.execucoes_antes + 1
    and (select count(*) from public.checklist_automacao_trabalhos) = e.trabalhos_antes + 1
    and coalesce((r1.retorno->>'duplicado')::boolean, true) = false
    and coalesce((r2.retorno->>'duplicado')::boolean, false) = true,
  'duas chamadas com a mesma chave criaram uma execucao e um trabalho'
from _checklist_validacao_estado e
join _checklist_validacao_retornos r1 on r1.etapa = 'primeira_preparacao'
join _checklist_validacao_retornos r2 on r2.etapa = 'segunda_preparacao';

insert into _checklist_validacao_resultados
select
  'nenhum e-mail enviado',
  (select count(*) from public.checklist_envios) = e.envios_antes,
  'a Etapa 3 prepara trabalhos, mas nao grava historico de envio nem dispara e-mail'
from _checklist_validacao_estado e;

select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from _checklist_validacao_resultados
order by verificacao;

rollback;
