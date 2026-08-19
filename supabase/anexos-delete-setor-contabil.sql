-- Permite remover registros de anexos para usuarios ativos dos dois perfis do portal.
-- Execute no SQL Editor do Supabase caso a remocao de anexos retorne erro de RLS.

grant select, delete on table public.anexos to authenticated;

drop policy if exists "anexos_delete_authenticated_active" on public.anexos;
drop policy if exists "anexos_delete_coordenador_active" on public.anexos;

create policy "anexos_delete_authenticated_active"
on public.anexos
for delete
to authenticated
using (
  exists (
    select 1
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and u.status = 'Ativo'
      and u.perfil_acesso in (
        'coordenador_administrador',
        'setor_contabil_operacional'
      )
  )
);
