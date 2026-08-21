-- Portal de Gestao Contabil - Etapa 2 do historico de Distribuicao de Lucro
-- Execute no SQL Editor do Supabase para garantir que o historico salve
-- e carregue corretamente o modelo da tabela usado no e-mail.

alter table public.reinf_relatorios
  add column if not exists modelo_tabela text not null default 'valores_por_mes';

alter table public.reinf_relatorios
  add column if not exists modelo_tabela_label text not null default 'Tabela por meses';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reinf_relatorios_modelo_tabela_check'
      and conrelid = 'public.reinf_relatorios'::regclass
  ) then
    alter table public.reinf_relatorios
      add constraint reinf_relatorios_modelo_tabela_check
      check (modelo_tabela in ('valores_por_mes', 'totais_distribuidos'));
  end if;
end;
$$;

create or replace function public.salvar_reinf_relatorio_portal(
  p_relatorio jsonb
)
returns public.reinf_relatorios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_cliente public.clientes%rowtype;
  v_cliente_id uuid;
  v_modelo_tabela text;
  v_modelo_tabela_label text;
  v_periodicidade text;
  v_ano_referencia text;
  v_meses jsonb;
  v_assunto text;
  v_corpo text;
  v_socios jsonb;
  v_total_socios integer;
  v_relatorio public.reinf_relatorios;
begin
  select *
    into v_usuario
  from public.usuarios u
  where u.auth_user_id = auth.uid()
    and u.status = 'Ativo'
    and u.perfil_acesso in (
      'coordenador_administrador',
      'setor_contabil_operacional'
    )
  limit 1;

  if v_usuario.id is null then
    raise exception 'Usuario sem permissao para salvar relatorio REINF.';
  end if;

  if p_relatorio is null or jsonb_typeof(p_relatorio) <> 'object' then
    raise exception 'Relatorio REINF invalido.';
  end if;

  v_cliente_id := nullif(p_relatorio->>'cliente_id', '')::uuid;
  if v_cliente_id is null then
    raise exception 'Cliente do relatorio REINF e obrigatorio.';
  end if;

  select *
    into v_cliente
  from public.clientes c
  where c.id = v_cliente_id
  limit 1;

  if v_cliente.id is null then
    raise exception 'Cliente nao encontrado para salvar relatorio REINF.';
  end if;

  v_modelo_tabela := coalesce(nullif(btrim(p_relatorio->>'modelo_tabela'), ''), 'valores_por_mes');
  if v_modelo_tabela not in ('valores_por_mes', 'totais_distribuidos') then
    raise exception 'Modelo da tabela do relatorio REINF invalido.';
  end if;

  v_modelo_tabela_label := coalesce(
    nullif(btrim(p_relatorio->>'modelo_tabela_label'), ''),
    case
      when v_modelo_tabela = 'totais_distribuidos' then 'Tabela de totais'
      else 'Tabela por meses'
    end
  );

  v_periodicidade := coalesce(nullif(btrim(p_relatorio->>'periodicidade'), ''), 'Trimestral');
  if v_periodicidade not in ('Mensal', 'Trimestral') then
    raise exception 'Periodicidade do relatorio REINF invalida.';
  end if;

  v_ano_referencia := nullif(btrim(p_relatorio->>'ano_referencia'), '');
  v_meses := coalesce(p_relatorio->'meses', '[]'::jsonb);
  v_socios := coalesce(p_relatorio->'socios', '[]'::jsonb);
  v_assunto := nullif(btrim(p_relatorio->>'assunto'), '');
  v_corpo := nullif(btrim(p_relatorio->>'corpo_mensagem'), '');

  if jsonb_typeof(v_meses) <> 'array' then
    raise exception 'Meses do relatorio REINF devem ser uma lista.';
  end if;

  if jsonb_typeof(v_socios) <> 'array' then
    raise exception 'Socios do relatorio REINF devem ser uma lista.';
  end if;

  select count(*)
    into v_total_socios
  from jsonb_array_elements(v_socios);

  if v_total_socios < 1 then
    raise exception 'Inclua pelo menos um socio no relatorio REINF.';
  end if;

  if v_total_socios > 50 then
    raise exception 'Limite de 50 socios por relatorio REINF excedido.';
  end if;

  if v_assunto is null then
    raise exception 'Assunto do relatorio REINF e obrigatorio.';
  end if;

  if v_corpo is null then
    raise exception 'Mensagem do relatorio REINF e obrigatoria.';
  end if;

  insert into public.reinf_relatorios (
    cliente_id,
    cnpj,
    razao_social,
    nome_identificacao,
    responsavel,
    revisor,
    modelo_tabela,
    modelo_tabela_label,
    periodicidade,
    ano_referencia,
    meses,
    assunto,
    corpo_mensagem,
    socios,
    criado_por,
    criado_por_nome,
    criado_por_email
  )
  values (
    v_cliente.id,
    coalesce(nullif(v_cliente.cnpj, ''), nullif(p_relatorio->>'cnpj', ''), 'Nao informado'),
    coalesce(nullif(v_cliente.razao_social, ''), nullif(p_relatorio->>'razao_social', ''), 'Cliente sem razao social'),
    coalesce(nullif(v_cliente.nome_identificacao, ''), nullif(p_relatorio->>'nome_identificacao', '')),
    coalesce(nullif(v_cliente.responsavel, ''), nullif(p_relatorio->>'responsavel', '')),
    coalesce(nullif(v_cliente.revisor, ''), nullif(p_relatorio->>'revisor', '')),
    v_modelo_tabela,
    v_modelo_tabela_label,
    v_periodicidade,
    v_ano_referencia,
    v_meses,
    v_assunto,
    v_corpo,
    v_socios,
    v_usuario.id,
    v_usuario.nome,
    v_usuario.email
  )
  returning * into v_relatorio;

  return v_relatorio;
end;
$$;

revoke all on function public.salvar_reinf_relatorio_portal(jsonb) from public;
grant execute on function public.salvar_reinf_relatorio_portal(jsonb) to authenticated;
