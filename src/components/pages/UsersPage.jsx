import { Edit3, RefreshCcw } from 'lucide-react';
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
}) {
  return (
    <div className="space-y-5">
      <SurfacePanel
        title="Usuarios institucionais"
        description="Perfis sincronizados com o Supabase para gestao real do acesso ao portal."
        right={<span className="pill-shell">{users.length} usuario(s) sincronizado(s)</span>}
      />

      <SurfacePanel>
        <DataTableShell
          headers={['Nome', 'E-mail', 'Cargo', 'Setor', 'Perfil', 'Status', 'Ultimo acesso', 'Acoes']}
          minWidth="min-w-[1200px]"
          hasRows={users.length > 0}
          emptyTitle="Nenhum usuario sincronizado."
          emptyDescription="Assim que houver perfis cadastrados e vinculados ao portal, eles aparecerao aqui."
        >
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="transition even:bg-slate-50/40 hover:bg-sky-50/60 dark:hover:bg-slate-800/80">
                <td className="border-b border-slate-100 px-4 py-4 font-black text-slate-950 dark:text-gray-100">{user.nome}</td>
                <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-700 dark:text-gray-200">{user.email}</td>
                <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-700 dark:text-gray-200">{user.cargo || 'Nao informado'}</td>
                <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-700 dark:text-gray-200">{user.setor || 'Nao informado'}</td>
                <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-700 dark:text-gray-200">{profileLabelByKey[user.perfil_acesso] ?? user.perfil_acesso}</td>
                <td className="border-b border-slate-100 px-4 py-4">
                  <StatusBadge toneClass={chipClass(user.status === 'Ativo' ? 'success' : 'muted')}>
                    {user.status}
                  </StatusBadge>
                </td>
                <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-600 dark:text-gray-300">{formatDateTime(user.ultimo_acesso)}</td>
                <td className="border-b border-slate-100 px-4 py-4">
                  <div className="flex gap-2">
                    <ActionButton type="button" variant="icon" size="icon" onClick={() => onEdit(user)} aria-label="Editar usuario">
                      <Edit3 size={16} aria-hidden="true" />
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant="danger"
                      size="icon"
                      className="h-10 w-10 p-0"
                      onClick={() => onToggleStatus(user)}
                      aria-label={user.status === 'Ativo' ? 'Inativar usuario' : 'Reativar usuario'}
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
    </div>
  );
}
