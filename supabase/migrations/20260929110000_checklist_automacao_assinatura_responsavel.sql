begin;

create or replace function public.obter_checklist_automacao_assinatura_interno(
  p_cliente_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'responsavel_nome', nullif(btrim(c.responsavel), ''),
    'assinatura_email_path', r.assinatura_email_path
  )
  from public.clientes c
  left join lateral (
    select l.assinatura_email_path
    from public.listagens l
    where l.categoria = 'responsavel'
      and coalesce(l.ativo, true)
      and lower(btrim(l.valor)) = lower(btrim(c.responsavel))
    order by l.ordem nulls last, l.id
    limit 1
  ) r on true
  where c.id = p_cliente_id;
$$;

revoke all on function public.obter_checklist_automacao_assinatura_interno(uuid)
  from public, anon, authenticated;
grant execute on function public.obter_checklist_automacao_assinatura_interno(uuid)
  to service_role;

comment on function public.obter_checklist_automacao_assinatura_interno(uuid) is
  'Retorna ao processador interno o responsavel do cliente e a assinatura cadastrada para o rodape do lembrete.';

commit;
