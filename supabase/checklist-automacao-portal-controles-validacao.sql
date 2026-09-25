-- Portal de Gestao Contabil - Validacao dos controles seguros da automacao
-- Simula os dois perfis dentro de uma transacao e desfaz tudo com ROLLBACK.

begin;

create temporary table _portal_controles_resultados (
  verificacao text primary key,
  ok boolean not null,
  detalhe text not null
) on commit drop;

create temporary table _portal_controles_chamadas (
  etapa text primary key,
  retorno jsonb not null
) on commit drop;

create temporary table _portal_controles_estado
on commit drop
as
select
  (select count(*) from public.checklist_automacao_execucoes) as execucoes_antes,
  (select count(*) from public.checklist_automacao_auditoria) as auditorias_antes;

create temporary table _portal_controles_usuarios
on commit drop
as
select distinct on (u.perfil_acesso)
  u.id,
  u.auth_user_id,
  u.nome,
  u.email,
  u.perfil_acesso
from public.usuarios u
where u.status = 'Ativo'
  and u.auth_user_id is not null
  and u.perfil_acesso in (
    'coordenador_administrador',
    'setor_contabil_operacional'
  )
order by u.perfil_acesso, u.id;

create temporary table _portal_controles_clientes
on commit drop
as
select c.id
from public.clientes c
where coalesce(c.arquivado, false) = false
  and lower(coalesce(c.status, '')) <> 'inativo'
order by coalesce(nullif(c.nome_identificacao, ''), c.razao_social), c.id
limit 2;

do $$
begin
  if (select count(*) from _portal_controles_usuarios) <> 2 then
    raise exception 'Os dois perfis ativos sao necessarios para a validacao.';
  end if;
  if (select count(*) from _portal_controles_clientes) <> 2 then
    raise exception 'Dois clientes ativos sao necessarios para a validacao.';
  end if;
end;
$$;

grant select on _portal_controles_usuarios, _portal_controles_clientes to authenticated;
grant select, insert, update, delete on _portal_controles_chamadas to authenticated;
grant select, insert, update, delete on _portal_controles_resultados to authenticated;

insert into _portal_controles_resultados
values
  (
    'estrutura das RPCs',
    to_regprocedure('public.obter_checklist_automacao_painel_portal()') is not null
      and to_regprocedure(
        'public.atualizar_checklist_automacao_configuracao_portal(jsonb,text[])'
      ) is not null
      and to_regprocedure(
        'public.atualizar_checklist_automacao_cliente_portal(uuid,boolean,date,text)'
      ) is not null
      and to_regprocedure(
        'public.atualizar_checklist_automacao_clientes_lote_portal(uuid[],boolean,date,text)'
      ) is not null
      and to_regprocedure('public.salvar_checklist_automacao_feriado_portal(jsonb)') is not null
      and to_regprocedure(
        'public.excluir_checklist_automacao_feriado_portal(uuid,text)'
      ) is not null
      and to_regprocedure('public.simular_checklist_automacao_portal(date)') is not null,
    'sete funcoes controladas estao disponiveis para a tela do portal'
  ),
  (
    'gravacao direta bloqueada',
    not has_table_privilege(
      'authenticated',
      'public.checklist_automacao_configuracao',
      'INSERT,UPDATE,DELETE'
    )
      and not has_table_privilege(
        'authenticated',
        'public.checklist_automacao_clientes',
        'INSERT,UPDATE,DELETE'
      )
      and not has_table_privilege(
        'authenticated',
        'public.checklist_automacao_feriados',
        'INSERT,UPDATE,DELETE'
      ),
    'alteracoes passam somente pelas RPCs com validacao e auditoria'
  ),
  (
    'permissoes das RPCs',
    has_function_privilege(
      'authenticated',
      'public.obter_checklist_automacao_painel_portal()',
      'EXECUTE'
    )
      and has_function_privilege(
        'authenticated',
        'public.atualizar_checklist_automacao_configuracao_portal(jsonb,text[])',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.obter_checklist_automacao_painel_portal()',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.atualizar_checklist_automacao_configuracao_portal(jsonb,text[])',
        'EXECUTE'
      ),
    'authenticated pode executar; anon permanece sem acesso'
  );

select set_config(
  'request.jwt.claim.sub',
  (
    select auth_user_id::text
    from _portal_controles_usuarios
    where perfil_acesso = 'coordenador_administrador'
  ),
  true
);
set local role authenticated;

insert into _portal_controles_chamadas (etapa, retorno)
select 'painel_coordenador', public.obter_checklist_automacao_painel_portal();

insert into _portal_controles_chamadas (etapa, retorno)
select
  'cliente_coordenador',
  to_jsonb(public.atualizar_checklist_automacao_cliente_portal(
    id,
    true,
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    null
  ))
from _portal_controles_clientes
order by id
limit 1;

do $$
declare
  v_bloqueada boolean := false;
begin
  begin
    perform public.atualizar_checklist_automacao_configuracao_portal(
      '{"ativa": true}'::jsonb,
      '{}'::text[]
    );
  exception
    when others then
      v_bloqueada := position('confirme' in lower(sqlerrm)) > 0;
  end;
  insert into _portal_controles_resultados
  values (
    'confirmacao para ativar',
    v_bloqueada,
    'a ativacao global sem confirmacao explicita foi recusada'
  );
end;
$$;

insert into _portal_controles_chamadas (etapa, retorno)
select
  'ativacao_coordenador',
  to_jsonb(public.atualizar_checklist_automacao_configuracao_portal(
    '{"ativa": true}'::jsonb,
    array['ATIVAR AUTOMACAO']
  ));

insert into _portal_controles_chamadas (etapa, retorno)
select
  'pausa_coordenador',
  to_jsonb(public.atualizar_checklist_automacao_configuracao_portal(
    '{"ativa": false}'::jsonb,
    '{}'::text[]
  ));

reset role;

select set_config(
  'request.jwt.claim.sub',
  (
    select auth_user_id::text
    from _portal_controles_usuarios
    where perfil_acesso = 'setor_contabil_operacional'
  ),
  true
);
set local role authenticated;

insert into _portal_controles_chamadas (etapa, retorno)
select 'painel_setor_contabil', public.obter_checklist_automacao_painel_portal();

insert into _portal_controles_chamadas (etapa, retorno)
select
  'lote_setor_contabil',
  public.atualizar_checklist_automacao_clientes_lote_portal(
    array_agg(id order by id),
    true,
    date_trunc('month', now() at time zone 'America/Manaus')::date,
    null
  )
from _portal_controles_clientes;

do $$
declare
  v_bloqueada boolean := false;
begin
  begin
    perform public.atualizar_checklist_automacao_configuracao_portal(
      '{"modo": "REAL"}'::jsonb,
      '{}'::text[]
    );
  exception
    when others then
      v_bloqueada := position('confirme' in lower(sqlerrm)) > 0;
  end;
  insert into _portal_controles_resultados
  values (
    'confirmacao para modo real',
    v_bloqueada,
    'a mudanca para REAL sem confirmacao explicita foi recusada'
  );
end;
$$;

insert into _portal_controles_chamadas (etapa, retorno)
select
  'modo_real_setor_contabil',
  to_jsonb(public.atualizar_checklist_automacao_configuracao_portal(
    '{"modo": "REAL"}'::jsonb,
    array['ATIVAR MODO REAL']
  ));

insert into _portal_controles_chamadas (etapa, retorno)
select
  'modo_teste_setor_contabil',
  to_jsonb(public.atualizar_checklist_automacao_configuracao_portal(
    '{"modo": "TESTE"}'::jsonb,
    '{}'::text[]
  ));

insert into _portal_controles_chamadas (etapa, retorno)
select
  'feriado_setor_contabil',
  to_jsonb(public.salvar_checklist_automacao_feriado_portal(
    jsonb_build_object(
      'data', '2099-12-30',
      'nome', 'Validacao segura do portal',
      'abrangencia', 'MUNICIPAL',
      'ativo', true,
      'fonte', 'Registro temporario da validacao automatizada'
    )
  ));

do $$
declare
  v_bloqueada boolean := false;
  v_id uuid;
begin
  select (retorno->>'id')::uuid into v_id
  from _portal_controles_chamadas
  where etapa = 'feriado_setor_contabil';
  begin
    perform public.excluir_checklist_automacao_feriado_portal(v_id, '');
  exception
    when others then
      v_bloqueada := position('confirme' in lower(sqlerrm)) > 0;
  end;
  insert into _portal_controles_resultados
  values (
    'confirmacao para excluir feriado',
    v_bloqueada,
    'a exclusao sem a frase de confirmacao foi recusada'
  );
end;
$$;

insert into _portal_controles_chamadas (etapa, retorno)
select
  'exclusao_feriado_setor_contabil',
  to_jsonb(public.excluir_checklist_automacao_feriado_portal(
    (retorno->>'id')::uuid,
    'EXCLUIR FERIADO'
  ))
from _portal_controles_chamadas
where etapa = 'feriado_setor_contabil';

insert into _portal_controles_chamadas (etapa, retorno)
select
  'simulacao_setor_contabil',
  public.simular_checklist_automacao_portal(
    date_trunc('month', now() at time zone 'America/Manaus')::date
  );

insert into _portal_controles_chamadas (etapa, retorno)
select
  'pausa_lote_setor_contabil',
  public.atualizar_checklist_automacao_clientes_lote_portal(
    array_agg(id order by id),
    false,
    null,
    'Pausa temporaria da validacao'
  )
from _portal_controles_clientes;

reset role;

insert into _portal_controles_resultados
select
  'acesso do coordenador',
  p.retorno->'usuario'->>'perfil_acesso' = 'coordenador_administrador'
    and coalesce((a.retorno->>'ativa')::boolean, false)
    and not coalesce((d.retorno->>'ativa')::boolean, true),
  'coordenador consultou, habilitou cliente, ativou e pausou a automacao'
from _portal_controles_chamadas p
join _portal_controles_chamadas a on a.etapa = 'ativacao_coordenador'
join _portal_controles_chamadas d on d.etapa = 'pausa_coordenador'
where p.etapa = 'painel_coordenador';

insert into _portal_controles_resultados
select
  'acesso do setor contabil',
  p.retorno->'usuario'->>'perfil_acesso' = 'setor_contabil_operacional'
    and coalesce((l.retorno->>'quantidade')::integer, 0) = 2
    and r.retorno->>'modo' = 'REAL'
    and t.retorno->>'modo' = 'TESTE',
  'setor contabil consultou, alterou clientes em lote e controlou o modo'
from _portal_controles_chamadas p
join _portal_controles_chamadas l on l.etapa = 'lote_setor_contabil'
join _portal_controles_chamadas r on r.etapa = 'modo_real_setor_contabil'
join _portal_controles_chamadas t on t.etapa = 'modo_teste_setor_contabil'
where p.etapa = 'painel_setor_contabil';

insert into _portal_controles_resultados
select
  'simulacao sem persistencia',
  coalesce((c.retorno->>'simulacao')::boolean, false)
    and not coalesce((c.retorno->>'persistido')::boolean, true)
    and (select count(*) from public.checklist_automacao_execucoes) = e.execucoes_antes,
  'o setor contabil simulou candidatos sem criar uma execucao mensal'
from _portal_controles_chamadas c
cross join _portal_controles_estado e
where c.etapa = 'simulacao_setor_contabil';

insert into _portal_controles_resultados
select
  'gestao de feriados auditada',
  x.retorno = f.retorno->'id'
    and exists (
      select 1
      from public.checklist_automacao_auditoria a
      join _portal_controles_usuarios u on u.id = a.alterado_por
      where a.entidade = 'FERIADO'
        and a.entidade_id = f.retorno->>'id'
        and a.operacao = 'INSERT'
        and u.perfil_acesso = 'setor_contabil_operacional'
    )
    and exists (
      select 1
      from public.checklist_automacao_auditoria a
      join _portal_controles_usuarios u on u.id = a.alterado_por
      where a.entidade = 'FERIADO'
        and a.entidade_id = f.retorno->>'id'
        and a.operacao = 'DELETE'
        and u.perfil_acesso = 'setor_contabil_operacional'
    ),
  'inclusao e exclusao registraram corretamente o usuario do setor contabil'
from _portal_controles_chamadas f
join _portal_controles_chamadas x on x.etapa = 'exclusao_feriado_setor_contabil'
where f.etapa = 'feriado_setor_contabil';

insert into _portal_controles_resultados
select
  'auditoria dos dois perfis',
  exists (
    select 1
    from public.checklist_automacao_auditoria a
    join _portal_controles_usuarios u on u.id = a.alterado_por
    where u.perfil_acesso = 'coordenador_administrador'
      and a.criado_em >= transaction_timestamp()
  )
    and exists (
      select 1
      from public.checklist_automacao_auditoria a
      join _portal_controles_usuarios u on u.id = a.alterado_por
      where u.perfil_acesso = 'setor_contabil_operacional'
        and a.criado_em >= transaction_timestamp()
    ),
  'alteracoes do coordenador e do setor contabil possuem autoria identificada'
from _portal_controles_estado;

insert into _portal_controles_resultados
select
  'regras operacionais protegidas',
  c.fuso_horario = 'America/Manaus'
    and c.dia_util_ordem = 2
    and c.horario_local = time '08:00'
    and c.tentativas_max = 3
    and c.intervalos_tentativas_minutos = array[0, 15, 45]
    and c.ativa = false
    and c.modo = 'TESTE',
  'fuso, segundo dia util, 08:00, tentativas e estado seguro permaneceram intactos'
from public.checklist_automacao_configuracao c
where c.id = 1;

insert into _portal_controles_resultados
select
  'rollback preparado',
  (select count(*) from public.checklist_automacao_execucoes) = e.execucoes_antes
    and (select count(*) from public.checklist_automacao_auditoria) > e.auditorias_antes,
  'nenhuma execucao foi criada e todas as configuracoes e auditorias de teste serao desfeitas'
from _portal_controles_estado e;

select
  verificacao,
  case when ok then 'OK' else 'ATENCAO' end as resultado,
  detalhe
from _portal_controles_resultados
order by verificacao;

rollback;
