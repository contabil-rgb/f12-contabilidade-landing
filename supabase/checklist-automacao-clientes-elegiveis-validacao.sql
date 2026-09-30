-- Validacao transacional da elegibilidade no Checklist Documentos.
-- Nao prepara trabalhos, nao chama Edge Functions e nao envia e-mails.

begin;

create temporary table _checklist_elegibilidade_resultados (
  verificacao text primary key,
  ok boolean not null,
  detalhe text not null
) on commit drop;

insert into _checklist_elegibilidade_resultados
values
  (
    'funcoes e gatilhos instalados',
    to_regprocedure('public.checklist_cliente_elegivel_automacao(uuid)') is not null
      and exists (
        select 1 from pg_trigger
        where tgname = 'trg_checklist_automacao_cliente_elegivel' and not tgisinternal
      )
      and exists (
        select 1 from pg_trigger
        where tgname = 'trg_checklist_automacao_pausar_cliente_inelegivel' and not tgisinternal
      ),
    'a regra central protege configuracoes atuais e futuras'
  ),
  (
    'nenhum cliente inelegivel habilitado',
    not exists (
      select 1
      from public.checklist_automacao_clientes ac
      where ac.habilitada
        and not public.checklist_cliente_elegivel_automacao(ac.cliente_id)
    ),
    'clientes em distrato, inativos ou arquivados permanecem fora dos disparos'
  ),
  (
    'candidatos excluem inelegiveis',
    not exists (
      select 1
      from public.listar_checklist_automacao_candidatos_interno(
        date_trunc('month', now() at time zone 'America/Manaus')::date,
        'TESTE'
      ) candidato
      where not public.checklist_cliente_elegivel_automacao(candidato.cliente_id)
    ),
    'a preparacao da automacao recebe somente clientes elegiveis'
  );

select set_config(
  'request.jwt.claim.sub',
  (
    select u.auth_user_id::text
    from public.usuarios u
    where u.status = 'Ativo'
      and u.auth_user_id is not null
      and u.perfil_acesso in ('coordenador_administrador', 'setor_contabil_operacional')
    order by case when u.perfil_acesso = 'coordenador_administrador' then 0 else 1 end, u.id
    limit 1
  ),
  true
);

create temporary table _checklist_elegibilidade_painel
on commit drop
as select public.obter_checklist_automacao_painel_portal() as dados;

insert into _checklist_elegibilidade_resultados
values (
  'painel exclui inelegiveis',
  not exists (
    select 1
    from _checklist_elegibilidade_painel p
    cross join lateral jsonb_array_elements(p.dados->'clientes') cliente
    where coalesce((cliente->>'arquivado')::boolean, false)
       or lower(btrim(coalesce(cliente->>'status', ''))) in ('inativo', 'em distrato')
  ),
  'a tabela Clientes da automacao nao devolve distratos, inativos ou arquivados'
);

do $$
declare
  v_cliente_id uuid;
  v_bloqueado boolean := false;
begin
  select ac.cliente_id
  into v_cliente_id
  from public.checklist_automacao_clientes ac
  where not public.checklist_cliente_elegivel_automacao(ac.cliente_id)
  order by ac.cliente_id
  limit 1;

  if v_cliente_id is null then
    raise exception 'A validacao requer ao menos um cliente inelegivel configurado.';
  end if;

  begin
    update public.checklist_automacao_clientes
    set habilitada = true
    where cliente_id = v_cliente_id;
  exception
    when others then
      v_bloqueado := position('distrato, inativo ou arquivado' in lower(sqlerrm)) > 0;
  end;

  insert into _checklist_elegibilidade_resultados
  values (
    'reativacao de inelegivel bloqueada',
    v_bloqueado,
    'o banco recusa habilitacao direta de cliente fora do escopo'
  );
end;
$$;

insert into _checklist_elegibilidade_resultados
select
  'contagem do escopo',
  true,
  format(
    '%s elegiveis; %s em distrato; %s arquivados',
    count(*) filter (where public.checklist_cliente_elegivel_automacao(id)),
    count(*) filter (
      where lower(btrim(coalesce(status, ''))) = 'em distrato'
        and not coalesce(arquivado, false)
    ),
    count(*) filter (where coalesce(arquivado, false))
  )
from public.clientes;

select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from _checklist_elegibilidade_resultados
order by verificacao;

rollback;
