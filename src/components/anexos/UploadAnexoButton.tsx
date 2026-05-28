import { useRef, useState } from 'react';
import { Download, Eye, Upload } from 'lucide-react';
import {
  gerarUrlDownloadAnexo,
  gerarUrlVisualizacaoAnexo,
  substituirAnexoCliente,
  uploadAnexoCliente,
} from '../../services/anexos.service';
import type { AnexoCliente, ClienteAnexoRef, TipoAnexo } from '../../types/anexo';

type Props = {
  cliente: ClienteAnexoRef;
  tipoAnexo: TipoAnexo;
  anexo?: AnexoCliente | null;
  disabled?: boolean;
  labelAnexar?: string;
  labelSubstituir?: string;
  onSuccess?: (anexo: AnexoCliente) => void;
  onError?: (message: string) => void;
};

export function UploadAnexoButton({
  cliente,
  tipoAnexo,
  anexo,
  disabled = false,
  labelAnexar = 'Anexar',
  labelSubstituir = 'Substituir',
  onSuccess,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const hasAnexo = Boolean(anexo?.id || anexo?.caminho_arquivo);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

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

  return (
    <div className="flex flex-wrap gap-2">
      {hasAnexo ? (
        <>
          <button
            type="button"
            onClick={visualizar}
            disabled={disabled || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black normal-case text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye size={14} aria-hidden="true" />
            Visualizar
          </button>
          <button
            type="button"
            onClick={baixar}
            disabled={disabled || loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black normal-case text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={14} aria-hidden="true" />
            Baixar
          </button>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || loading}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black normal-case text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Upload size={14} aria-hidden="true" />
        {loading ? 'Enviando...' : hasAnexo ? labelSubstituir : labelAnexar}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled || loading}
        onChange={handleFileChange}
      />
    </div>
  );
}
