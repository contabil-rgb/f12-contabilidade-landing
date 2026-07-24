-- Portal de Gestao Contabil - Hardening de public.clientes
-- Etapas 4.2, 4.3 e 4.4: funcoes seguras para criar, atualizar e inativar cliente.
-- Pode ser executado mais de uma vez.

-- Esta etapa ainda nao remove as permissoes diretas de insert/update em clientes.
-- A reducao dessas permissoes ficara para uma etapa posterior, depois que
-- criacao, atualizacao e inativacao estiverem validadas via funcoes seguras.

alter table public.clientes
  add column if not exists pendencias_observacoes text;

create or replace function public.criar_cliente_portal(p_cliente jsonb)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
  v_regime text;
begin
  if not exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
  ) then
    raise exception 'Usuario sem permissao para criar clientes.';
  end if;

  if nullif(btrim(coalesce(p_cliente->>'cnpj', '')), '') is null then
    raise exception 'CNPJ do cliente e obrigatorio.';
  end if;

  if nullif(btrim(coalesce(p_cliente->>'razao_social', '')), '') is null then
    raise exception 'Razao social do cliente e obrigatoria.';
  end if;

  v_regime := nullif(btrim(coalesce(p_cliente->>'regime_tributario', '')), '');

  insert into public.clientes (
    cnpj,
    razao_social,
    nome_identificacao,
    tipo_cliente,
    regime_tributario,
    atividades,
    dificuldade,
    lucro,
    responsavel,
    revisor,
    primeira_competencia,
    tem_folha,
    ultima_importacao,
    ultima_competencia_entregue,
    situacao,
    competencia_em_dia,
    dias_atraso,
    distribuicao_lucros,
    envio_reinf,
    data_enviada_reinf,
    valor_lucro_acumulado,
    precisa_ata,
    ata_entregue,
    data_entrega_ata,
    ecd,
    ultima_ecd_entregue,
    data_entrega_ecd,
    data_envio_ecd,
    responsavel_ecd,
    ecf,
    ultima_ecf_entregue,
    data_entrega_ecf,
    data_envio_ecf,
    enviam_documentos,
    modo_entrega,
    curva_envio,
    ultima_competencia_enviada,
    data_envio_documentos,
    pendencias_observacoes,
    revisado_coordenador,
    lancamentos_padrao,
    motivo_atraso,
    pendencia_tecnica,
    cliente_notificado,
    data_notificacao_cliente,
    status_retorno_cliente,
    data_retorno_cliente,
    status,
    atualizado_em
  )
  values (
    nullif(btrim(coalesce(p_cliente->>'cnpj', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'razao_social', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'nome_identificacao', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'tipo_cliente', '')), ''),
    v_regime,
    nullif(btrim(coalesce(p_cliente->>'atividades', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'dificuldade', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'lucro', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'responsavel', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'revisor', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'primeira_competencia', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'tem_folha', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'ultima_importacao', '')), '')::date,
    nullif(btrim(coalesce(p_cliente->>'ultima_competencia_entregue', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'situacao', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'competencia_em_dia', '')), ''),
    coalesce(nullif(btrim(coalesce(p_cliente->>'dias_atraso', '')), '')::integer, 0),
    nullif(btrim(coalesce(p_cliente->>'distribuicao_lucros', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'envio_reinf', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'data_enviada_reinf', '')), '')::date,
    nullif(btrim(coalesce(p_cliente->>'valor_lucro_acumulado', '')), '')::numeric,
    nullif(btrim(coalesce(p_cliente->>'precisa_ata', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'ata_entregue', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'data_entrega_ata', '')), '')::date,
    nullif(btrim(coalesce(p_cliente->>'ecd', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'ultima_ecd_entregue', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'data_entrega_ecd', '')), '')::date,
    nullif(btrim(coalesce(p_cliente->>'data_envio_ecd', '')), '')::date,
    case
      when v_regime in ('Simples Nacional', 'Isento') then null
      else nullif(btrim(coalesce(p_cliente->>'responsavel_ecd', '')), '')
    end,
    nullif(btrim(coalesce(p_cliente->>'ecf', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'ultima_ecf_entregue', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'data_entrega_ecf', '')), '')::date,
    nullif(btrim(coalesce(p_cliente->>'data_envio_ecf', '')), '')::date,
    nullif(btrim(coalesce(p_cliente->>'enviam_documentos', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'modo_entrega', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'curva_envio', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'ultima_competencia_enviada', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'data_envio_documentos', '')), '')::date,
    nullif(btrim(coalesce(p_cliente->>'pendencias_observacoes', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'revisado_coordenador', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'lancamentos_padrao', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'motivo_atraso', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'pendencia_tecnica', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'cliente_notificado', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'data_notificacao_cliente', '')), '')::date,
    nullif(btrim(coalesce(p_cliente->>'status_retorno_cliente', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'data_retorno_cliente', '')), '')::date,
    coalesce(nullif(btrim(coalesce(p_cliente->>'status', '')), ''), 'Ativo'),
    now()
  )
  returning * into v_cliente;

  return v_cliente;
end;
$$;

revoke all on function public.criar_cliente_portal(jsonb) from public;
grant execute on function public.criar_cliente_portal(jsonb) to authenticated;

create or replace function public.atualizar_cliente_portal(p_cliente_id uuid, p_cliente jsonb)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual public.clientes;
  v_cliente public.clientes;
  v_regime text;
begin
  if not exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
  ) then
    raise exception 'Usuario sem permissao para atualizar clientes.';
  end if;

  select *
  into v_atual
  from public.clientes
  where id = p_cliente_id;

  if not found then
    raise exception 'Cliente nao encontrado.';
  end if;

  v_regime := case
    when p_cliente ? 'regime_tributario'
      then nullif(btrim(coalesce(p_cliente->>'regime_tributario', '')), '')
    else v_atual.regime_tributario
  end;

  update public.clientes
  set
    cnpj = case when p_cliente ? 'cnpj' then nullif(btrim(coalesce(p_cliente->>'cnpj', '')), '') else cnpj end,
    razao_social = case when p_cliente ? 'razao_social' then nullif(btrim(coalesce(p_cliente->>'razao_social', '')), '') else razao_social end,
    nome_identificacao = case when p_cliente ? 'nome_identificacao' then nullif(btrim(coalesce(p_cliente->>'nome_identificacao', '')), '') else nome_identificacao end,
    tipo_cliente = case when p_cliente ? 'tipo_cliente' then nullif(btrim(coalesce(p_cliente->>'tipo_cliente', '')), '') else tipo_cliente end,
    regime_tributario = case when p_cliente ? 'regime_tributario' then v_regime else regime_tributario end,
    atividades = case when p_cliente ? 'atividades' then nullif(btrim(coalesce(p_cliente->>'atividades', '')), '') else atividades end,
    dificuldade = case when p_cliente ? 'dificuldade' then nullif(btrim(coalesce(p_cliente->>'dificuldade', '')), '') else dificuldade end,
    lucro = case when p_cliente ? 'lucro' then nullif(btrim(coalesce(p_cliente->>'lucro', '')), '') else lucro end,
    responsavel = case when p_cliente ? 'responsavel' then nullif(btrim(coalesce(p_cliente->>'responsavel', '')), '') else responsavel end,
    revisor = case when p_cliente ? 'revisor' then nullif(btrim(coalesce(p_cliente->>'revisor', '')), '') else revisor end,
    primeira_competencia = case when p_cliente ? 'primeira_competencia' then nullif(btrim(coalesce(p_cliente->>'primeira_competencia', '')), '') else primeira_competencia end,
    tem_folha = case when p_cliente ? 'tem_folha' then nullif(btrim(coalesce(p_cliente->>'tem_folha', '')), '') else tem_folha end,
    ultima_importacao = case when p_cliente ? 'ultima_importacao' then nullif(btrim(coalesce(p_cliente->>'ultima_importacao', '')), '')::date else ultima_importacao end,
    ultima_competencia_entregue = case when p_cliente ? 'ultima_competencia_entregue' then nullif(btrim(coalesce(p_cliente->>'ultima_competencia_entregue', '')), '') else ultima_competencia_entregue end,
    situacao = case when p_cliente ? 'situacao' then nullif(btrim(coalesce(p_cliente->>'situacao', '')), '') else situacao end,
    competencia_em_dia = case when p_cliente ? 'competencia_em_dia' then nullif(btrim(coalesce(p_cliente->>'competencia_em_dia', '')), '') else competencia_em_dia end,
    dias_atraso = case when p_cliente ? 'dias_atraso' then coalesce(nullif(btrim(coalesce(p_cliente->>'dias_atraso', '')), '')::integer, 0) else dias_atraso end,
    distribuicao_lucros = case when p_cliente ? 'distribuicao_lucros' then nullif(btrim(coalesce(p_cliente->>'distribuicao_lucros', '')), '') else distribuicao_lucros end,
    envio_reinf = case when p_cliente ? 'envio_reinf' then nullif(btrim(coalesce(p_cliente->>'envio_reinf', '')), '') else envio_reinf end,
    data_enviada_reinf = case when p_cliente ? 'data_enviada_reinf' then nullif(btrim(coalesce(p_cliente->>'data_enviada_reinf', '')), '')::date else data_enviada_reinf end,
    valor_lucro_acumulado = case when p_cliente ? 'valor_lucro_acumulado' then nullif(btrim(coalesce(p_cliente->>'valor_lucro_acumulado', '')), '')::numeric else valor_lucro_acumulado end,
    precisa_ata = case when p_cliente ? 'precisa_ata' then nullif(btrim(coalesce(p_cliente->>'precisa_ata', '')), '') else precisa_ata end,
    ata_entregue = case when p_cliente ? 'ata_entregue' then nullif(btrim(coalesce(p_cliente->>'ata_entregue', '')), '') else ata_entregue end,
    data_entrega_ata = case when p_cliente ? 'data_entrega_ata' then nullif(btrim(coalesce(p_cliente->>'data_entrega_ata', '')), '')::date else data_entrega_ata end,
    ecd = case when p_cliente ? 'ecd' then nullif(btrim(coalesce(p_cliente->>'ecd', '')), '') else ecd end,
    ultima_ecd_entregue = case when p_cliente ? 'ultima_ecd_entregue' then nullif(btrim(coalesce(p_cliente->>'ultima_ecd_entregue', '')), '') else ultima_ecd_entregue end,
    data_entrega_ecd = case when p_cliente ? 'data_entrega_ecd' then nullif(btrim(coalesce(p_cliente->>'data_entrega_ecd', '')), '')::date else data_entrega_ecd end,
    data_envio_ecd = case when p_cliente ? 'data_envio_ecd' then nullif(btrim(coalesce(p_cliente->>'data_envio_ecd', '')), '')::date else data_envio_ecd end,
    responsavel_ecd = case
      when v_regime in ('Simples Nacional', 'Isento') then null
      when p_cliente ? 'responsavel_ecd' then nullif(btrim(coalesce(p_cliente->>'responsavel_ecd', '')), '')
      else responsavel_ecd
    end,
    ecf = case when p_cliente ? 'ecf' then nullif(btrim(coalesce(p_cliente->>'ecf', '')), '') else ecf end,
    ultima_ecf_entregue = case when p_cliente ? 'ultima_ecf_entregue' then nullif(btrim(coalesce(p_cliente->>'ultima_ecf_entregue', '')), '') else ultima_ecf_entregue end,
    data_entrega_ecf = case when p_cliente ? 'data_entrega_ecf' then nullif(btrim(coalesce(p_cliente->>'data_entrega_ecf', '')), '')::date else data_entrega_ecf end,
    data_envio_ecf = case when p_cliente ? 'data_envio_ecf' then nullif(btrim(coalesce(p_cliente->>'data_envio_ecf', '')), '')::date else data_envio_ecf end,
    enviam_documentos = case when p_cliente ? 'enviam_documentos' then nullif(btrim(coalesce(p_cliente->>'enviam_documentos', '')), '') else enviam_documentos end,
    modo_entrega = case when p_cliente ? 'modo_entrega' then nullif(btrim(coalesce(p_cliente->>'modo_entrega', '')), '') else modo_entrega end,
    curva_envio = case when p_cliente ? 'curva_envio' then nullif(btrim(coalesce(p_cliente->>'curva_envio', '')), '') else curva_envio end,
    ultima_competencia_enviada = case when p_cliente ? 'ultima_competencia_enviada' then nullif(btrim(coalesce(p_cliente->>'ultima_competencia_enviada', '')), '') else ultima_competencia_enviada end,
    data_envio_documentos = case when p_cliente ? 'data_envio_documentos' then nullif(btrim(coalesce(p_cliente->>'data_envio_documentos', '')), '')::date else data_envio_documentos end,
    pendencias_observacoes = case when p_cliente ? 'pendencias_observacoes' then nullif(btrim(coalesce(p_cliente->>'pendencias_observacoes', '')), '') else pendencias_observacoes end,
    revisado_coordenador = case when p_cliente ? 'revisado_coordenador' then nullif(btrim(coalesce(p_cliente->>'revisado_coordenador', '')), '') else revisado_coordenador end,
    lancamentos_padrao = case when p_cliente ? 'lancamentos_padrao' then nullif(btrim(coalesce(p_cliente->>'lancamentos_padrao', '')), '') else lancamentos_padrao end,
    motivo_atraso = case when p_cliente ? 'motivo_atraso' then nullif(btrim(coalesce(p_cliente->>'motivo_atraso', '')), '') else motivo_atraso end,
    pendencia_tecnica = case when p_cliente ? 'pendencia_tecnica' then nullif(btrim(coalesce(p_cliente->>'pendencia_tecnica', '')), '') else pendencia_tecnica end,
    cliente_notificado = case when p_cliente ? 'cliente_notificado' then nullif(btrim(coalesce(p_cliente->>'cliente_notificado', '')), '') else cliente_notificado end,
    data_notificacao_cliente = case when p_cliente ? 'data_notificacao_cliente' then nullif(btrim(coalesce(p_cliente->>'data_notificacao_cliente', '')), '')::date else data_notificacao_cliente end,
    status_retorno_cliente = case when p_cliente ? 'status_retorno_cliente' then nullif(btrim(coalesce(p_cliente->>'status_retorno_cliente', '')), '') else status_retorno_cliente end,
    data_retorno_cliente = case when p_cliente ? 'data_retorno_cliente' then nullif(btrim(coalesce(p_cliente->>'data_retorno_cliente', '')), '')::date else data_retorno_cliente end,
    status = case when p_cliente ? 'status' then coalesce(nullif(btrim(coalesce(p_cliente->>'status', '')), ''), status) else status end,
    atualizado_em = now()
  where id = p_cliente_id
  returning * into v_cliente;

  if nullif(btrim(coalesce(v_cliente.cnpj, '')), '') is null then
    raise exception 'CNPJ do cliente e obrigatorio.';
  end if;

  if nullif(btrim(coalesce(v_cliente.razao_social, '')), '') is null then
    raise exception 'Razao social do cliente e obrigatoria.';
  end if;

  return v_cliente;
end;
$$;

revoke all on function public.atualizar_cliente_portal(uuid, jsonb) from public;
grant execute on function public.atualizar_cliente_portal(uuid, jsonb) to authenticated;

create or replace function public.inativar_cliente_portal(p_cliente_id uuid)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente public.clientes;
begin
  if not exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
  ) then
    raise exception 'Usuario sem permissao para inativar clientes.';
  end if;

  update public.clientes
  set
    status = 'Inativo',
    atualizado_em = now()
  where id = p_cliente_id
  returning * into v_cliente;

  if not found then
    raise exception 'Cliente nao encontrado.';
  end if;

  return v_cliente;
end;
$$;

revoke all on function public.inativar_cliente_portal(uuid) from public;
grant execute on function public.inativar_cliente_portal(uuid) to authenticated;
