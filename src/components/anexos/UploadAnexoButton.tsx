import { useRef, useState } from 'react';
import { Download, Eye, Trash2, Upload } from 'lucide-react';
import {
  gerarUrlDownloadAnexo,
  gerarUrlVisualizacaoAnexo,
  removerAnexoCliente,
  substituirAnexoCliente,
  uploadAnexoCliente,
} from '../../services/anexos.service';
import type { AnexoCliente, ClienteAnexoRef, TipoAnexo } from '../../types/anexo';

type Props = {
  cliente: ClienteAnexoRef;
  tipoAnexo: TipoAnexo;
  anexo?: AnexoCliente | null;
  disabled?: boolean;
  writeDisabled?: boolean;
  writeDisabledReason?: string;
  labelAnexar?: string;
  labelSubstituir?: string;
  onSuccess?: (anexo: AnexoCliente) => void;
  onRemove?: (anexo: AnexoCliente | null) => void | Promise<void>;
  onError?: (message: string) => void;
};

export function UploadAnexoButton({
  cliente,
  tipoAnexo,
  anexo,
  disabled = false,
  writeDisabled = false,
  writeDisabledReason,
  labelAnexar = 'Anexar',
  labelSubstituir = 'Substituir',
  onSuccess,
  onRemove,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const hasAnexo = Boolean(anexo?.id || anexo?.caminho_arquivo);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (disabled || writeDisabled) return;

    try {
      setLoading(true);
      const result = hasAnexo
        ? await substituirAnexoCliente({ cliente, tipoAnexo, file, anexoExistente: anexo })
        : await uploadAnexoCliente({ cliente, tipoAnexo, file });
      onSuccess?.(result);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Erro ao anexar arquivo.');
    } finally {
      setLoading(false);
    }
  }

  async function visualizar() {
    if (!anexo) return;
    try {
      setLoading(true);
      const url = await gerarUrlVisualizacaoAnexo(anexo);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Não foi possível gerar link de visualização.');
    } finally {
      setLoading(false);
    }
  }

  async function baixar() {
    if (!anexo) return;
    try {
      setLoading(true);
      const url = await gerarUrlDownloadAnexo(anexo);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Não foi possível gerar link de download.');
    } finally {
      setLoading(false);
    }
  }

  async function remover() {
    if (!anexo || !hasAnexo) return;
    if (disabled || writeDisabled) return;

    const nomeArquivo = anexo.nome_arquivo || 'este anexo';
    if (!window.confirm(`Remover ${nomeArquivo}?`)) return;

    try {
      setLoading(true);
      const anexoRemovido = await removerAnexoCliente({ cliente, tipoAnexo, anexo });
      await onRemove?.(anexoRemovido ?? anexo ?? null);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Não foi possível remover o anexo.');
    } finally {
      setLoading(false);
    }
  }

  const neutralButtonClass =
    'inline-flex min-w-[5.85rem] items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black normal-case text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50';
  const dangerButtonClass =
    'inline-flex min-w-[5.85rem] items-center justify-center gap-1 rounded-lg border border-red-200 px-2.5 py-2 text-xs font-black normal-case text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10';
  const actionsGridStyle = hasAnexo
    ? {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(5.85rem, max-content))',
      gap: '0.5rem',
      width: 'max-content',
      maxWidth: '100%',
    }
    : undefined;
  const uploadDisabled = disabled || writeDisabled || loading;
  const uploadTitle = writeDisabled ? writeDisabledReason : undefined;

  return (
    <div
      className={hasAnexo ? 'anexo-actions-grid' : 'flex flex-wrap gap-2'}
      style={actionsGridStyle}
    >
      {hasAnexo ? (
        <>
          <button
            type="button"
            onClick={visualizar}
            disabled={disabled || loading}
            className={neutralButtonClass}
          >
            <Eye size={14} aria-hidden="true" />
            Visualizar
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploadDisabled}
            title={uploadTitle}
            className={neutralButtonClass}
          >
            <Upload size={14} aria-hidden="true" />
            {loading ? 'Enviando...' : labelSubstituir}
          </button>
          <button
            type="button"
            onClick={baixar}
            disabled={disabled || loading}
            className={neutralButtonClass}
          >
            <Download size={14} aria-hidden="true" />
            Baixar
          </button>
          <button
            type="button"
            onClick={remover}
            disabled={uploadDisabled}
            title={uploadTitle}
            className={dangerButtonClass}
          >
            <Trash2 size={14} aria-hidden="true" />
            Remover
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadDisabled}
          title={uploadTitle}
          className={neutralButtonClass}
        >
          <Upload size={14} aria-hidden="true" />
          {loading ? 'Enviando...' : labelAnexar}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={uploadDisabled}
        onChange={handleFileChange}
      />
    </div>
  );
}
