import { Edit3, RefreshCcw } from 'lucide-react';

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
      <section className="surface-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950">Usuarios institucionais</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Perfis sincronizados com o Supabase para gestao real do acesso ao portal.
            </p>
          </div>
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
            {users.length} usuario(s) sincronizado(s)
          </span>
        </div>
      </section>

      <section className="surface-card">
        <div className="overflow-auto overflow-soft">
          <table className="min-w-[1200px] text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Nome', 'E-mail', 'Cargo', 'Setor', 'Perfil', 'Status', 'Ultimo acesso', 'Acoes'].map((header) => (
                  <th key={header} className="border-b border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-normal text-slate-500">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="border-b border-slate-100 px-4 py-3 font-black text-slate-950">{user.nome}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{user.email}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{user.cargo || 'Nao informado'}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{user.setor || 'Nao informado'}</td>
                  <td className="border-b border-slate-100 px-4 py-3">{profileLabelByKey[user.perfil_acesso] ?? user.perfil_acesso}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-black " + chipClass(user.status === 'Ativo' ? 'success' : 'muted')}>
                      {user.status}
                    </span>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3">{formatDateTime(user.ultimo_acesso)}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => onEdit(user)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-brand-blue hover:text-brand-blue" aria-label="Editar usuario">
                        <Edit3 size={16} aria-hidden="true" />
                      </button>
                      <button type="button" onClick={() => onToggleStatus(user)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-red-200 hover:text-red-600" aria-label={user.status === 'Ativo' ? 'Inativar usuario' : 'Reativar usuario'}>
                        <RefreshCcw size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
