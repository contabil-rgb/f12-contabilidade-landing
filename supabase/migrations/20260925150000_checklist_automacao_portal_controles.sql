begin;

create or replace function public.checklist_automacao_auditar_feriado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
  v_usuario_id uuid;
  v_feriado_id uuid;
begin
  v_usuario_id := case when tg_op = 'DELETE' then old.alterado_por else new.alterado_por end;
  v_feriado_id := case when tg_op = 'DELETE' then old.id else new.id end;

  if auth.uid() is not null then
    select u.id into v_usuario_id
    from public.usuarios u
    where u.auth_user_id = auth.uid();
  end if;
  select * into v_usuario from public.usuarios u where u.id = v_usuario_id;

  insert into public.checklist_automacao_auditoria (
    entidade,
    entidade_id,
    operacao,
    valor_anterior,
    valor_novo,
    alterado_por,
    alterado_por_nome,
    alterado_por_email
  )
  values (
    'FERIADO',
    v_feriado_id::text,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    v_usuario_id,
    v_usuario.nome,
    v_usuario.email
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.obter_checklist_automacao_painel_portal()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_resultado jsonb;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para consultar a automacao.';
  end if;

  select jsonb_build_object(
    'usuario', jsonb_build_object(
      'id', v_usuario.id,
      'nome', v_usuario.nome,
      'email', v_usuario.email,
      'perfil_acesso', v_usuario.perfil_acesso
    ),
    'configuracao', (
      select to_jsonb(c) - 'alterado_por'
      from public.checklist_automacao_configuracao c
      where c.id = 1
    ),
    'regras_fixas', jsonb_build_object(
      'fuso_horario', 'America/Manaus',
      'dia_util_ordem', 2,
      'horario_local', '08:00:00',
      'intervalos_tentativas_minutos', jsonb_build_array(0, 15, 45)
    ),
    'resumo', jsonb_build_object(
      'clientes_total', (select count(*) from public.checklist_automacao_clientes),
      'clientes_habilitados', (
        select count(*) from public.checklist_automacao_clientes where habilitada
      ),
      'execucoes_total', (select count(*) from public.checklist_automacao_execucoes),
      'trabalhos_pendentes', (
        select count(*)
        from public.checklist_automacao_trabalhos
        where status in ('PREPARADO', 'PROCESSANDO', 'AGUARDANDO_NOVA_TENTATIVA')
      )
    ),
    'clientes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'cliente_id', c.id,
          'nome', coalesce(nullif(c.nome_identificacao, ''), c.razao_social),
          'cnpj', c.cnpj,
          'status', c.status,
          'arquivado', coalesce(c.arquivado, false),
          'habilitada', ac.habilitada,
          'competencia_inicial', ac.competencia_inicial,
          'motivo_pausa', ac.motivo_pausa,
          'atualizado_em', ac.atualizado_em
        )
        order by coalesce(nullif(c.nome_identificacao, ''), c.razao_social), c.id
      )
      from public.checklist_automacao_clientes ac
      join public.clientes c on c.id = ac.cliente_id
    ), '[]'::jsonb),
    'feriados', coalesce((
      select jsonb_agg(to_jsonb(f) - 'alterado_por' order by f.data, f.nome)
      from public.checklist_automacao_feriados f
      where f.data >= date_trunc('year', now() at time zone 'America/Manaus')::date
        and f.data < (
          date_trunc('year', now() at time zone 'America/Manaus') + interval '2 years'
        )::date
    ), '[]'::jsonb),
    'ultimas_execucoes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em desc)
      from (
        select e.*
        from public.checklist_automacao_execucoes e
        order by e.criado_em desc
        limit 20
      ) x
    ), '[]'::jsonb),
    'auditoria_recente', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em desc)
      from (
        select a.*
        from public.checklist_automacao_auditoria a
        order by a.criado_em desc
        limit 50
      ) x
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

create or replace function public.atualizar_checklist_automacao_configuracao_portal(
  p_configuracao jsonb,
  p_confirmacoes text[] default '{}'::text[]
)
returns public.checklist_automacao_configuracao
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_atual public.checklist_automacao_configuracao;
  v_resultado public.checklist_automacao_configuracao;
  v_ativa boolean;
  v_modo text;
  v_email_teste_destinatario text;
  v_email_teste_cc text;
  v_email_resumo_destinatario text;
  v_email_resumo_cc text;
  v_notificar_alteracoes boolean;
  v_confirmacoes text[];
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para alterar a automacao.';
  end if;

  if p_configuracao is null or jsonb_typeof(p_configuracao) <> 'object' then
    raise exception 'Configuracao da automacao invalida.';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_configuracao) chave
    where chave not in (
      'ativa',
      'modo',
      'email_teste_destinatario',
      'email_teste_cc',
      'email_resumo_destinatario',
      'email_resumo_cc',
      'notificar_alteracoes'
    )
  ) then
    raise exception 'A configuracao contem campos que nao podem ser alterados pelo portal.';
  end if;

  select * into v_atual
  from public.checklist_automacao_configuracao c
  where c.id = 1
  for update;

  if v_atual.id is null then
    raise exception 'Configuracao global da automacao nao encontrada.';
  end if;

  select coalesce(array_agg(upper(btrim(valor))), '{}'::text[])
    into v_confirmacoes
  from unnest(coalesce(p_confirmacoes, '{}'::text[])) valor;

  v_ativa := case
    when p_configuracao ? 'ativa' then (p_configuracao->>'ativa')::boolean
    else v_atual.ativa
  end;
  v_modo := case
    when p_configuracao ? 'modo' then upper(nullif(btrim(p_configuracao->>'modo'), ''))
    else v_atual.modo
  end;
  v_email_teste_destinatario := case
    when p_configuracao ? 'email_teste_destinatario'
      then lower(nullif(btrim(p_configuracao->>'email_teste_destinatario'), ''))
    else v_atual.email_teste_destinatario
  end;
  v_email_teste_cc := case
    when p_configuracao ? 'email_teste_cc'
      then lower(nullif(btrim(p_configuracao->>'email_teste_cc'), ''))
    else v_atual.email_teste_cc
  end;
  v_email_resumo_destinatario := case
    when p_configuracao ? 'email_resumo_destinatario'
      then lower(nullif(btrim(p_configuracao->>'email_resumo_destinatario'), ''))
    else v_atual.email_resumo_destinatario
  end;
  v_email_resumo_cc := case
    when p_configuracao ? 'email_resumo_cc'
      then lower(nullif(btrim(p_configuracao->>'email_resumo_cc'), ''))
    else v_atual.email_resumo_cc
  end;
  v_notificar_alteracoes := case
    when p_configuracao ? 'notificar_alteracoes'
      then (p_configuracao->>'notificar_alteracoes')::boolean
    else v_atual.notificar_alteracoes
  end;

  if v_modo not in ('TESTE', 'REAL') then
    raise exception 'Modo da automacao invalido.';
  end if;

  if v_email_teste_destinatario !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or v_email_teste_cc !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or v_email_resumo_destinatario !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or v_email_resumo_cc !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Os enderecos de e-mail da automacao sao invalidos.';
  end if;

  if not v_atual.ativa and v_ativa
     and not ('ATIVAR AUTOMACAO' = any(v_confirmacoes)) then
    raise exception 'Confirme explicitamente a ativacao global da automacao.';
  end if;

  if not v_atual.ativa and v_ativa
     and not exists (
       select 1 from public.checklist_automacao_clientes ac where ac.habilitada
     ) then
    raise exception 'Habilite ao menos um cliente antes de ativar a automacao.';
  end if;

  if v_atual.modo <> 'REAL' and v_modo = 'REAL'
     and not ('ATIVAR MODO REAL' = any(v_confirmacoes)) then
    raise exception 'Confirme explicitamente a alteracao para o modo REAL.';
  end if;

  if (
      v_email_teste_destinatario is distinct from v_atual.email_teste_destinatario
      or v_email_teste_cc is distinct from v_atual.email_teste_cc
    ) and not ('ALTERAR DESTINATARIOS DE TESTE' = any(v_confirmacoes)) then
    raise exception 'Confirme explicitamente a alteracao dos destinatarios de teste.';
  end if;

  if (
      v_email_resumo_destinatario is distinct from v_atual.email_resumo_destinatario
      or v_email_resumo_cc is distinct from v_atual.email_resumo_cc
    ) and not ('ALTERAR DESTINATARIOS DO RESUMO' = any(v_confirmacoes)) then
    raise exception 'Confirme explicitamente a alteracao dos destinatarios do resumo.';
  end if;

  if v_ativa is distinct from v_atual.ativa
     or v_modo is distinct from v_atual.modo
     or v_email_teste_destinatario is distinct from v_atual.email_teste_destinatario
     or v_email_teste_cc is distinct from v_atual.email_teste_cc
     or v_email_resumo_destinatario is distinct from v_atual.email_resumo_destinatario
     or v_email_resumo_cc is distinct from v_atual.email_resumo_cc
     or v_notificar_alteracoes is distinct from v_atual.notificar_alteracoes then
    update public.checklist_automacao_configuracao
    set ativa = v_ativa,
        modo = v_modo,
        email_teste_destinatario = v_email_teste_destinatario,
        email_teste_cc = v_email_teste_cc,
        email_resumo_destinatario = v_email_resumo_destinatario,
        email_resumo_cc = v_email_resumo_cc,
        notificar_alteracoes = v_notificar_alteracoes,
        alterado_por = v_usuario.id
    where id = 1
    returning * into v_resultado;
  else
    v_resultado := v_atual;
  end if;

  return v_resultado;
end;
$$;

create or replace function public.atualizar_checklist_automacao_cliente_portal(
  p_cliente_id uuid,
  p_habilitada boolean,
  p_competencia_inicial date default null,
  p_motivo_pausa text default null
)
returns public.checklist_automacao_clientes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_cliente public.clientes;
  v_atual public.checklist_automacao_clientes;
  v_resultado public.checklist_automacao_clientes;
  v_competencia date;
  v_motivo text;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para alterar clientes da automacao.';
  end if;
  if p_cliente_id is null or p_habilitada is null then
    raise exception 'Cliente e estado da automacao sao obrigatorios.';
  end if;

  select * into v_cliente from public.clientes c where c.id = p_cliente_id;
  if v_cliente.id is null then
    raise exception 'Cliente nao encontrado.';
  end if;
  if p_habilitada
     and (coalesce(v_cliente.arquivado, false) or lower(coalesce(v_cliente.status, '')) = 'inativo') then
    raise exception 'Nao e possivel habilitar a automacao para um cliente inativo ou arquivado.';
  end if;

  v_competencia := date_trunc('month', p_competencia_inicial)::date;
  v_motivo := nullif(btrim(coalesce(p_motivo_pausa, '')), '');

  if p_habilitada and (
      p_competencia_inicial is null
      or p_competencia_inicial <> v_competencia
      or v_competencia > date_trunc('month', now() at time zone 'America/Manaus')::date
    ) then
    raise exception 'Informe uma competencia inicial mensal que nao esteja no futuro.';
  end if;
  if not p_habilitada and v_motivo is null then
    raise exception 'Informe o motivo da pausa do cliente.';
  end if;

  select * into v_atual
  from public.checklist_automacao_clientes ac
  where ac.cliente_id = p_cliente_id
  for update;

  if v_atual.cliente_id is null then
    insert into public.checklist_automacao_clientes (
      cliente_id,
      habilitada,
      competencia_inicial,
      motivo_pausa,
      alterado_por
    ) values (
      p_cliente_id,
      p_habilitada,
      case when p_habilitada then v_competencia else null end,
      case when p_habilitada then null else v_motivo end,
      v_usuario.id
    ) returning * into v_resultado;
  else
    update public.checklist_automacao_clientes
    set habilitada = p_habilitada,
        competencia_inicial = case
          when p_habilitada then v_competencia
          else competencia_inicial
        end,
        motivo_pausa = case when p_habilitada then null else v_motivo end,
        alterado_por = v_usuario.id
    where cliente_id = p_cliente_id
    returning * into v_resultado;
  end if;

  return v_resultado;
end;
$$;

create or replace function public.atualizar_checklist_automacao_clientes_lote_portal(
  p_cliente_ids uuid[],
  p_habilitada boolean,
  p_competencia_inicial date default null,
  p_motivo_pausa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_cliente_id uuid;
  v_total integer;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para alterar clientes da automacao.';
  end if;
  if p_cliente_ids is null or cardinality(p_cliente_ids) < 1 then
    raise exception 'Selecione ao menos um cliente.';
  end if;
  if cardinality(p_cliente_ids) > 500 then
    raise exception 'O lote pode conter no maximo 500 clientes.';
  end if;
  if (select count(*) from unnest(p_cliente_ids) as ids(cliente_id)) <>
     (select count(distinct cliente_id) from unnest(p_cliente_ids) as ids(cliente_id)) then
    raise exception 'O lote contem clientes repetidos.';
  end if;

  foreach v_cliente_id in array p_cliente_ids loop
    perform public.atualizar_checklist_automacao_cliente_portal(
      v_cliente_id,
      p_habilitada,
      p_competencia_inicial,
      p_motivo_pausa
    );
  end loop;

  v_total := cardinality(p_cliente_ids);
  return jsonb_build_object(
    'ok', true,
    'quantidade', v_total,
    'habilitada', p_habilitada
  );
end;
$$;

create or replace function public.salvar_checklist_automacao_feriado_portal(
  p_feriado jsonb
)
returns public.checklist_automacao_feriados
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_id uuid;
  v_data date;
  v_nome text;
  v_abrangencia text;
  v_uf text;
  v_municipio text;
  v_ativo boolean;
  v_fonte text;
  v_resultado public.checklist_automacao_feriados;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para alterar feriados da automacao.';
  end if;
  if p_feriado is null or jsonb_typeof(p_feriado) <> 'object' then
    raise exception 'Feriado invalido.';
  end if;

  v_id := nullif(btrim(coalesce(p_feriado->>'id', '')), '')::uuid;
  v_data := nullif(btrim(coalesce(p_feriado->>'data', '')), '')::date;
  v_nome := nullif(btrim(coalesce(p_feriado->>'nome', '')), '');
  v_abrangencia := upper(nullif(btrim(coalesce(p_feriado->>'abrangencia', '')), ''));
  v_ativo := coalesce(nullif(btrim(coalesce(p_feriado->>'ativo', '')), '')::boolean, true);
  v_fonte := nullif(btrim(coalesce(p_feriado->>'fonte', '')), '');

  if v_data is null or v_nome is null or v_fonte is null then
    raise exception 'Data, nome e fonte do feriado sao obrigatorios.';
  end if;
  if v_abrangencia not in ('NACIONAL', 'ESTADUAL', 'MUNICIPAL') then
    raise exception 'Abrangencia do feriado invalida.';
  end if;

  v_uf := case when v_abrangencia = 'NACIONAL' then null else 'AM' end;
  v_municipio := case when v_abrangencia = 'MUNICIPAL' then 'Manaus' else null end;

  if v_id is null then
    insert into public.checklist_automacao_feriados (
      data, nome, abrangencia, uf, municipio, ativo, fonte, alterado_por
    ) values (
      v_data, v_nome, v_abrangencia, v_uf, v_municipio, v_ativo, v_fonte, v_usuario.id
    ) returning * into v_resultado;
  else
    update public.checklist_automacao_feriados
    set data = v_data,
        nome = v_nome,
        abrangencia = v_abrangencia,
        uf = v_uf,
        municipio = v_municipio,
        ativo = v_ativo,
        fonte = v_fonte,
        alterado_por = v_usuario.id
    where id = v_id
    returning * into v_resultado;

    if v_resultado.id is null then
      raise exception 'Feriado nao encontrado.';
    end if;
  end if;

  return v_resultado;
end;
$$;

create or replace function public.excluir_checklist_automacao_feriado_portal(
  p_feriado_id uuid,
  p_confirmacao text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_id uuid;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para excluir feriados da automacao.';
  end if;
  if upper(btrim(coalesce(p_confirmacao, ''))) <> 'EXCLUIR FERIADO' then
    raise exception 'Confirme explicitamente a exclusao do feriado.';
  end if;

  delete from public.checklist_automacao_feriados
  where id = p_feriado_id
  returning id into v_id;

  if v_id is null then
    raise exception 'Feriado nao encontrado.';
  end if;
  return v_id;
end;
$$;

create or replace function public.simular_checklist_automacao_portal(
  p_competencia_referencia date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_competencia date;
begin
  select * into v_usuario from public.get_portal_usuario_ativo();
  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para simular a automacao.';
  end if;
  v_competencia := coalesce(
    p_competencia_referencia,
    date_trunc('month', now() at time zone 'America/Manaus')::date
  );
  if v_competencia <> date_trunc('month', v_competencia)::date then
    raise exception 'A competencia deve ser o primeiro dia do mes.';
  end if;

  return public.preparar_checklist_automacao_interno(
    v_competencia,
    'SIMULACAO',
    null
  );
end;
$$;

revoke all on function public.obter_checklist_automacao_painel_portal()
  from public, anon, authenticated;
revoke all on function public.atualizar_checklist_automacao_configuracao_portal(jsonb, text[])
  from public, anon, authenticated;
revoke all on function public.atualizar_checklist_automacao_cliente_portal(uuid, boolean, date, text)
  from public, anon, authenticated;
revoke all on function public.atualizar_checklist_automacao_clientes_lote_portal(uuid[], boolean, date, text)
  from public, anon, authenticated;
revoke all on function public.salvar_checklist_automacao_feriado_portal(jsonb)
  from public, anon, authenticated;
revoke all on function public.excluir_checklist_automacao_feriado_portal(uuid, text)
  from public, anon, authenticated;
revoke all on function public.simular_checklist_automacao_portal(date)
  from public, anon, authenticated;

grant execute on function public.obter_checklist_automacao_painel_portal()
  to authenticated;
grant execute on function public.atualizar_checklist_automacao_configuracao_portal(jsonb, text[])
  to authenticated;
grant execute on function public.atualizar_checklist_automacao_cliente_portal(uuid, boolean, date, text)
  to authenticated;
grant execute on function public.atualizar_checklist_automacao_clientes_lote_portal(uuid[], boolean, date, text)
  to authenticated;
grant execute on function public.salvar_checklist_automacao_feriado_portal(jsonb)
  to authenticated;
grant execute on function public.excluir_checklist_automacao_feriado_portal(uuid, text)
  to authenticated;
grant execute on function public.simular_checklist_automacao_portal(date)
  to authenticated;

commit;
