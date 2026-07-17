-- Portal de Gestao Contabil - Exclusao controlada do historico
-- Habilita DELETE apenas para usuarios ativos com perfil de Coordenador / Administrador.
-- Pode ser executado mais de uma vez sem erro.

grant delete on table public.historico_alteracoes to authenticated;

drop policy if exists "historico_delete_coordenador_active" on public.historico_alteracoes;
create policy "historico_delete_coordenador_active"
on public.historico_alteracoes
for delete
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso = 'coordenador_administrador'
  )
);
