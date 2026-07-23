-- Portal de Gestao Contabil - Hardening de public.clientes
-- Etapas 4.2 e 4.3: funcoes seguras para criar e inativar cliente.
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
