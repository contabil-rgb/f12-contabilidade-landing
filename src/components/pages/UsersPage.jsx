import { useMemo, useState } from 'react';
import { Edit3, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import ActionButton from '../ui/ActionButton';
import DataTableShell from '../ui/DataTableShell';
import StatusBadge from '../ui/StatusBadge';
import SurfacePanel from '../ui/SurfacePanel';

export default function UsersPage({
  users,
  onEdit,
  onToggleStatus,
  profileLabelByKey = {},
  chipClass,
  formatDateTime,
  responsavelOptions = [],
  responsavelBusy = false,
  onCreateResponsavel,
  onToggleResponsavel,
  onDeleteResponsavel,
}) {
  const [novoResponsavel, setNovoResponsavel] = useState('');

  const responsaveisOrdenados = useMemo(
    () => [...responsavelOptions].sort((a, b) => String(a.valor ?? '').localeCompare(String(b.valor ?? ''), 'pt-BR')),
    [responsavelOptions],
  );
  const totalResponsaveisAtivos = responsaveisOrdenados.filter((item) => item.ativo !== false).length;

  async function handleCreateResponsavel(event) {
    event.preventDefault();
    if (!onCreateResponsavel) return;
    const created = await onCreateResponsavel(novoResponsavel);
    if (created !== false) {
      setNovoResponsavel('');
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      <SurfacePanel
        title="Usuários institucionais"
        description="Perfis sincronizados com o Supabase para gestão real do acesso ao portal."
        right={<span className="pill-shell">{users.length} usuário(s) sincronizado(s)</span>}
      />

      <SurfacePanel>
        <DataTableShell
          headers={['Nome', 'E-mail', 'Cargo', 'Setor', 'Perfil', 'Status', 'Último acesso', 'Ações']}
          minWidth="min-w-[980px] xl:min-w-[1200px]"
          hasRows={users.length > 0}
          emptyTitle="Nenhum usuário sincronizado."
          emptyDescription="Assim que houver perfis cadastrados e vinculados ao portal, eles aparecerão aqui."
        >
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="transition even:bg-slate-50/40 hover:bg-sky-50/60 dark:hover:bg-slate-800/80">
                <td className="border-b border-slate-100 px-4 py-4 font-black text-slate-950 dark:text-gray-100">{user.nome}</td>
                <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-700 dark:text-gray-200">{user.email}</td>
                <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-700 dark:text-gray-200">{user.cargo || 'Não informado'}</td>
                <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-700 dark:text-gray-200">{user.setor || 'Não informado'}</td>
                <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-700 dark:text-gray-200">{profileLabelByKey[user.perfil_acesso] ?? user.perfil_acesso}</td>
                <td className="border-b border-slate-100 px-4 py-4">
                  <StatusBadge toneClass={chipClass(user.status === 'Ativo' ? 'success' : 'muted')}>
                    {user.status}
                  </StatusBadge>
                </td>
                <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-600 dark:text-gray-300">{formatDateTime(user.ultimo_acesso)}</td>
                <td className="border-b border-slate-100 px-4 py-4">
                  <div className="flex gap-2">
                    <ActionButton type="button" variant="icon" size="icon" onClick={() => onEdit(user)} aria-label="Editar usuário">
                      <Edit3 size={16} aria-hidden="true" />
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="danger"
                      size="icon"
                      className="h-10 w-10 p-0"
                      onClick={() => onToggleStatus(user)}
                      aria-label={user.status === 'Ativo' ? 'Inativar usuário' : 'Reativar usuário'}
                    >
                      <RefreshCcw size={16} aria-hidden="true" />
                    </ActionButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTableShell>
      </SurfacePanel>

      <SurfacePanel
        title="Responsáveis da carteira"
        description="Cadastre, inative ou reative os nomes que aparecem no filtro de responsável do portal."
        right={<span className="pill-shell">{totalResponsaveisAtivos} ativo(s) de {responsavelOptions.length}</span>}
      >
        <form className="mb-4 flex flex-col gap-3 md:flex-row" onSubmit={handleCreateResponsavel}>
          <input
            type="text"
            value={novoResponsavel}
            onChange={(event) => setNovoResponsavel(event.target.value)}
            placeholder="Novo responsável"
            disabled={responsavelBusy}
            className="h-11 flex-1 scroll-mt-[35rem] rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100 lg:scroll-mt-28"
          />
          <ActionButton
            type="submit"
            variant="primary"
            disabled={responsavelBusy || !novoResponsavel.trim()}
            className="h-11 scroll-mt-[35rem] px-4 lg:scroll-mt-28"
          >
            <Plus size={16} aria-hidden="true" />
            {responsavelBusy ? 'Salvando...' : 'Cadastrar'}
          </ActionButton>
        </form>

        <DataTableShell
          headers={['Responsável', 'Status', 'Ações']}
          minWidth="min-w-[640px]"
          hasRows={responsaveisOrdenados.length > 0}
          emptyTitle="Nenhum responsável cadastrado."
          emptyDescription="Quando houver valores gerenciados, eles aparecerão nesta lista."
        >
          <tbody>
            {responsaveisOrdenados.map((item) => (
              <tr key={item.id ?? item.valor} className="transition even:bg-slate-50/40 hover:bg-sky-50/60 dark:hover:bg-slate-800/80">
                <td className="border-b border-slate-100 px-4 py-4 font-black text-slate-950 dark:text-gray-100">
                  {item.valor}
                </td>
                <td className="border-b border-slate-100 px-4 py-4">
                  <StatusBadge toneClass={chipClass(item.ativo ? 'success' : 'muted')}>
                    {item.ativo ? 'Ativo' : 'Inativo'}
                  </StatusBadge>
                </td>
                <td className="border-b border-slate-100 px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      type="button"
                      variant={item.ativo ? 'danger' : 'secondary'}
                      onClick={() => onToggleResponsavel?.(item)}
                      disabled={responsavelBusy}
                    >
                      <RefreshCcw size={16} aria-hidden="true" />
                      {item.ativo ? 'Inativar' : 'Reativar'}
                    </ActionButton>
                    {!item.ativo ? (
                      <ActionButton
                        type="button"
                        variant="danger"
                        onClick={() => onDeleteResponsavel?.(item)}
                        disabled={responsavelBusy}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        Excluir
                      </ActionButton>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTableShell>
      </SurfacePanel>
    </div>
  );
}
