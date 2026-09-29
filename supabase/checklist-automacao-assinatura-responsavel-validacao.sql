-- Validacao somente leitura da assinatura usada pela automacao.

with clientes_com_responsavel as (
  select
    c.id,
    coalesce(nullif(btrim(c.nome_identificacao), ''), c.razao_social) as cliente,
    c.responsavel,
    public.obter_checklist_automacao_assinatura_interno(c.id) as assinatura
  from public.clientes c
  where nullif(btrim(c.responsavel), '') is not null
)
select
  cliente,
  responsavel,
  assinatura->>'assinatura_email_path' as assinatura_email_path,
  case
    when assinatura->>'responsavel_nome' = responsavel
      and nullif(assinatura->>'assinatura_email_path', '') is not null
      then 'OK'
    when assinatura->>'responsavel_nome' = responsavel
      then 'SEM IMAGEM CADASTRADA'
    else 'ATENCAO'
  end as resultado
from clientes_com_responsavel
where lower(cliente) like '%alcantara%'
order by cliente;

select
  has_function_privilege(
    'service_role',
    'public.obter_checklist_automacao_assinatura_interno(uuid)',
    'EXECUTE'
  ) as service_role_pode_executar,
  not has_function_privilege(
    'authenticated',
    'public.obter_checklist_automacao_assinatura_interno(uuid)',
    'EXECUTE'
  ) as portal_nao_pode_executar;
