import { useMemo, useRef, useState } from 'react';
import { Edit3, Eye, Plus, RefreshCcw, Trash2, Upload } from 'lucide-react';
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
  onUploadResponsavelSignature,
  onRemoveResponsavelSignature,
  getResponsavelSignatureUrl,
}) {
  const [novoResponsavel, setNovoResponsavel] = useState('');
  const [signatureTarget, setSignatureTarget] = useState(null);
  const [signatureBusyId, setSignatureBusyId] = useState('');
  const signatureInputRef = useRef(null);

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

  function openSignaturePicker(item) {
    setSignatureTarget(item);
    signatureInputRef.current?.click();
  }

  async function handleSignatureFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const target = signatureTarget;
    setSignatureTarget(null);
    if (!file || !target || !onUploadResponsavelSignature) return;

    setSignatureBusyId(target.id ?? target.valor ?? '');
    try {
      await onUploadResponsavelSignature(target, file);
    } finally {
      setSignatureBusyId('');
    }
  }

  async function handleRemoveSignature(item) {
    if (!item?.assinatura_email_path || !onRemoveResponsavelSignature) return;
    const confirmed = window.confirm(`Remover a assinatura de e-mail de ${item.valor}?`);
    if (!confirmed) return;

    setSignatureBusyId(item.id ?? item.valor ?? '');
    try {
      await onRemoveResponsavelSignature(item);
    } finally {
      setSignatureBusyId('');
    }
  }

  function openSignature(item) {
    const url = getResponsavelSignatureUrl?.(item?.assinatura_email_path);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <div className="min-w-0 space-y-5">
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
              <tr key={user.id} className="table-row">
                <td className="table-cell table-cell-strong">{user.nome}</td>
                <td className="table-cell">{user.email}</td>
                <td className="table-cell">{user.cargo || 'Não informado'}</td>
                <td className="table-cell">{user.setor || 'Não informado'}</td>
                <td className="table-cell">{profileLabelByKey[user.perfil_acesso] ?? user.perfil_acesso}</td>
                <td className="table-cell">
                  <StatusBadge toneClass={chipClass(user.status === 'Ativo' ? 'success' : 'muted')}>
                    {user.status}
                  </StatusBadge>
                </td>
                <td className="table-cell table-cell-muted">{formatDateTime(user.ultimo_acesso)}</td>
                <td className="table-cell">
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
            className="input-shell h-11 flex-1 scroll-mt-[35rem] px-4 lg:scroll-mt-28"
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
          headers={['Responsável', 'Status', 'Assinatura', 'Ações']}
          minWidth="min-w-[920px]"
          hasRows={responsaveisOrdenados.length > 0}
          emptyTitle="Nenhum responsável cadastrado."
          emptyDescription="Quando houver valores gerenciados, eles aparecerão nesta lista."
        >
          <tbody>
            {responsaveisOrdenados.map((item) => (
              <tr key={item.id ?? item.valor} className="table-row">
                <td className="table-cell table-cell-strong">
                  {item.valor}
                </td>
                <td className="table-cell">
                  <StatusBadge toneClass={chipClass(item.ativo ? 'success' : 'muted')}>
                    {item.ativo ? 'Ativo' : 'Inativo'}
                  </StatusBadge>
                </td>
                <td className="table-cell">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge toneClass={chipClass(item.assinatura_email_path ? 'success' : 'muted')}>
                      {item.assinatura_email_path ? 'Cadastrada' : 'Sem assinatura'}
                    </StatusBadge>
                    {item.assinatura_email_path ? (
                      <>
                        <ActionButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => openSignature(item)}
                          disabled={responsavelBusy || signatureBusyId === item.id}
                        >
                          <Eye size={15} aria-hidden="true" />
                          Visualizar
                        </ActionButton>
                        <ActionButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => openSignaturePicker(item)}
                          disabled={responsavelBusy || signatureBusyId === item.id || !item.id}
                        >
                          <Upload size={15} aria-hidden="true" />
                          Substituir
                        </ActionButton>
                        <ActionButton
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => handleRemoveSignature(item)}
                          disabled={responsavelBusy || signatureBusyId === item.id || !item.id}
                        >
                          <Trash2 size={15} aria-hidden="true" />
                          Remover
                        </ActionButton>
                      </>
                    ) : (
                      <ActionButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => openSignaturePicker(item)}
                        disabled={responsavelBusy || signatureBusyId === item.id || !item.id}
                      >
                        <Upload size={15} aria-hidden="true" />
                        {signatureBusyId === item.id ? 'Enviando...' : 'Anexar'}
                      </ActionButton>
                    )}
                  </div>
                </td>
                <td className="table-cell">
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
        <input
          ref={signatureInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleSignatureFileChange}
        />
      </SurfacePanel>
    </div>
  );
}
