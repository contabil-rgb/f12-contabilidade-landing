-- Portal de Gestao Contabil - Gestao do catalogo de responsaveis
-- Execute depois de auth-rls.sql. Pode ser executado mais de uma vez com seguranca.

grant select, insert, update on table public.listagens to authenticated;

insert into public.listagens (categoria, valor, ordem)
select
  'responsavel',
  src.valor,
  row_number() over (order by src.valor)::integer
from (
  select distinct btrim(responsavel) as valor
  from public.clientes
  where coalesce(btrim(responsavel), '') <> ''
) as src
on conflict (categoria, valor) do nothing;

drop policy if exists "listagens_insert_responsavel_coordenador" on public.listagens;
create policy "listagens_insert_responsavel_coordenador"
on public.listagens
for insert
to authenticated
with check (
  public.is_portal_coordenador()
  and categoria = 'responsavel'
);

drop policy if exists "listagens_update_responsavel_coordenador" on public.listagens;
create policy "listagens_update_responsavel_coordenador"
on public.listagens
for update
to authenticated
using (
  public.is_portal_coordenador()
  and categoria = 'responsavel'
)
with check (
  public.is_portal_coordenador()
  and categoria = 'responsavel'
);
