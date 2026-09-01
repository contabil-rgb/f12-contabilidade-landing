import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Eye, FileText, Upload } from 'lucide-react';
import {
  gerarUrlContratoSocial,
  listarContratosSociaisCliente,
  sortContratosSociaisPorVersao,
  uploadContratoSocialCliente,
} from '../../services/contratos-sociais.service';
import type { ClienteAnexoRef } from '../../types/anexo';
import type { ContratoSocialCliente } from '../../types/contrato-social';

type Props = {
  cliente: ClienteAnexoRef;
  disabled?: boolean;
  compact?: boolean;
  onSuccess?: (contrato: ContratoSocialCliente) => void | Promise<void>;
  onError?: (message: string) => void;
};

function formatContratoDate(value?: string | null) {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não informada';
  return date.toLocaleString('pt-BR');
}

function contratoLabel(contrato: ContratoSocialCliente) {
  return `Versão ${contrato.versao || '-'} - ${contrato.nome_arquivo || 'Contrato social'}`;
}

function ContratoSocialActions({
  contrato,
  disabled,
  onError,
}: {
  contrato: ContratoSocialCliente;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const neutralButtonClass =
    'inline-flex min-w-[5.85rem] items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black normal-case text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:border-blue-400 dark:hover:text-blue-200';

  async function openContrato() {
    try {
      setLoading(true);
      const url = await gerarUrlContratoSocial(contrato.caminho_arquivo);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Não foi possível abrir o contrato social.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={openContrato}
        disabled={disabled || loading}
        className={neutralButtonClass}
      >
        <Eye size={14} aria-hidden="true" />
        Visualizar
      </button>
      <button
        type="button"
        onClick={openContrato}
        disabled={disabled || loading}
        className={neutralButtonClass}
      >
        <Download size={14} aria-hidden="true" />
        Baixar
      </button>
    </div>
  );
}

export function ContratosSociaisClienteSection({
  cliente,
  disabled = false,
  compact = false,
  onSuccess,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [contratos, setContratos] = useState<ContratoSocialCliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [openingContratoId, setOpeningContratoId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [localWarning, setLocalWarning] = useState('');
  const canUpload = Boolean(String(cliente?.id ?? cliente?.cnpj ?? '').trim()) && !disabled;
  const contratosOrdenados = useMemo(() => sortContratosSociaisPorVersao(contratos), [contratos]);
  const contratoAtual = contratosOrdenados[0] ?? null;
  const historicoAnterior = contratosOrdenados.slice(1);
  const hasContrato = Boolean(contratoAtual?.id || contratoAtual?.caminho_arquivo);
  const neutralButtonClass =
    'inline-flex min-w-[5.85rem] items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black normal-case text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:border-blue-400 dark:hover:text-blue-200';

  useEffect(() => {
    let active = true;

    async function carregar() {
      try {
        setLoading(true);
        const data = await listarContratosSociaisCliente(cliente);
        if (active) {
          setContratos(data);
          setLocalWarning('');
          setHistoryOpen(false);
        }
      } catch (error) {
        if (active) {
          console.warn('[contratos-sociais] Falha ao carregar contratos sociais:', error);
          setLocalWarning('Não foi possível carregar os contratos sociais agora.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    carregar();
    return () => {
      active = false;
    };
  }, [cliente.id, cliente.cnpj]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!canUpload) return;

    try {
      setUploading(true);
      const novoContrato = await uploadContratoSocialCliente({ cliente, file });
      setContratos((current) => sortContratosSociaisPorVersao([novoContrato, ...current]));
      setHistoryOpen(false);
      await onSuccess?.(novoContrato);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Erro ao anexar contrato social.');
    } finally {
      setUploading(false);
    }
  }

  async function openContrato(contrato: ContratoSocialCliente) {
    try {
      setOpeningContratoId(contrato.id);
      const url = await gerarUrlContratoSocial(contrato.caminho_arquivo);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Não foi possível abrir o contrato social.');
    } finally {
      setOpeningContratoId(null);
    }
  }

  const sectionClass = compact
    ? 'modal-section'
    : 'rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900';

  return (
    <section className={sectionClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={compact ? 'text-base font-black text-slate-950 dark:text-gray-100' : 'text-lg font-black text-slate-950 dark:text-gray-100'}>
            Contrato Social
          </h2>
          {!compact ? (
            <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-gray-300">
              Versões salvas no bucket privado documentos-clientes.
            </p>
          ) : null}
        </div>
        <FileText className="text-brand-blue" size={20} aria-hidden="true" />
      </div>

      {loading ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          Carregando contrato social...
        </div>
      ) : null}

      {localWarning ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          {localWarning}
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-slate-200 p-3 dark:border-gray-700">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-slate-500 dark:text-gray-400">Contrato mais recente</p>
            <span
              className={`mt-2 inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${
                hasContrato
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/20 dark:text-gray-100'
                  : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'
              }`}
              title={hasContrato ? contratoAtual?.nome_arquivo : 'Sem contrato social'}
            >
              <FileText size={13} aria-hidden="true" />
              <span className="truncate">
                {hasContrato ? `V${contratoAtual?.versao || '-'}: ${contratoAtual?.nome_arquivo}` : 'Sem contrato'}
              </span>
            </span>
            {contratoAtual ? (
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-gray-400">
                Enviado em {formatContratoDate(contratoAtual.criado_em)}
              </p>
            ) : null}
          </div>
          {!hasContrato ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!canUpload || uploading}
              title={canUpload ? undefined : 'Atualize ou restaure o cliente antes de anexar contrato social.'}
              className={neutralButtonClass}
            >
              <Upload size={14} aria-hidden="true" />
              {uploading ? 'Enviando...' : 'Anexar'}
            </button>
          ) : null}
        </div>

        {contratoAtual ? (
          <div className="anexo-actions-grid mt-3 grid w-fit grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openContrato(contratoAtual)}
              disabled={openingContratoId === contratoAtual.id}
              className={neutralButtonClass}
            >
              <Eye size={14} aria-hidden="true" />
              Visualizar
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!canUpload || uploading}
              title={canUpload ? undefined : 'Atualize ou restaure o cliente antes de anexar contrato social.'}
              className={neutralButtonClass}
            >
              <Upload size={14} aria-hidden="true" />
              {uploading ? 'Enviando...' : 'Upload'}
            </button>
            <button
              type="button"
              onClick={() => openContrato(contratoAtual)}
              disabled={openingContratoId === contratoAtual.id}
              className={neutralButtonClass}
            >
              <Download size={14} aria-hidden="true" />
              Baixar
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setHistoryOpen((current) => !current)}
          disabled={!historicoAnterior.length}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-black text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:border-blue-400 dark:hover:text-blue-200"
        >
          <span>Histórico de versões anteriores ({historicoAnterior.length})</span>
          <ChevronDown size={16} className={`transition ${historyOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {historyOpen && historicoAnterior.length ? (
          <div className="mt-2 space-y-2">
            {historicoAnterior.map((contrato) => (
              <div
                key={contrato.id}
                className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-gray-700 dark:bg-gray-800 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-900 dark:text-gray-100">
                    {contratoLabel(contrato)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-gray-300">
                    {formatContratoDate(contrato.criado_em)}
                  </p>
                </div>
                <ContratoSocialActions contrato={contrato} onError={onError} />
              </div>
            ))}
          </div>
        ) : null}

        {!historyOpen && historicoAnterior.length ? (
          <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-gray-400">
            {historicoAnterior.length} versão(ões) anterior(es) disponível(is).
          </p>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={!canUpload || uploading}
        onChange={handleFileChange}
      />
    </section>
  );
}

type TableCellProps = {
  cliente: ClienteAnexoRef;
  contrato?: ContratoSocialCliente | null;
  disabled?: boolean;
  onSuccess?: (contrato: ContratoSocialCliente) => void | Promise<void>;
  onError?: (message: string) => void;
};

export function ContratoSocialTableCell({
  cliente,
  contrato,
  disabled = false,
  onSuccess,
  onError,
}: TableCellProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [contratoAtual, setContratoAtual] = useState<ContratoSocialCliente | null>(contrato ?? null);
  const [loading, setLoading] = useState(false);
  const canUpload = Boolean(String(cliente?.id ?? cliente?.cnpj ?? '').trim()) && !disabled;
  const hasContrato = Boolean(contratoAtual?.id || contratoAtual?.caminho_arquivo);
  const neutralButtonClass =
    'inline-flex min-w-[5.85rem] items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-black normal-case text-slate-700 transition hover:border-brand-blue hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:border-blue-400 dark:hover:text-blue-200';

  useEffect(() => {
    setContratoAtual(contrato ?? null);
  }, [contrato?.id, contrato?.versao, contrato?.caminho_arquivo]);

  async function openContrato() {
    if (!contratoAtual) return;
    try {
      setLoading(true);
      const url = await gerarUrlContratoSocial(contratoAtual.caminho_arquivo);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Não foi possível abrir o contrato social.');
    } finally {
      setLoading(false);
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!canUpload) return;

    try {
      setLoading(true);
      const novoContrato = await uploadContratoSocialCliente({ cliente, file });
      setContratoAtual(novoContrato);
      await onSuccess?.(novoContrato);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Erro ao anexar contrato social.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="base-client-attachment-cell" onClick={(event) => event.stopPropagation()}>
      <span
        className={`inline-flex max-w-56 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${
          hasContrato
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/35 dark:bg-emerald-500/20 dark:text-gray-100'
            : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'
        }`}
        title={hasContrato ? contratoAtual?.nome_arquivo : 'Sem contrato social'}
      >
        <FileText size={13} aria-hidden="true" />
        <span className="truncate">
          {hasContrato ? `V${contratoAtual?.versao || '-'}: ${contratoAtual?.nome_arquivo}` : 'Sem contrato'}
        </span>
      </span>

      <div className={hasContrato ? 'anexo-actions-grid grid w-fit grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
        {hasContrato ? (
          <>
            <button
              type="button"
              onClick={openContrato}
              disabled={loading}
              className={neutralButtonClass}
            >
              <Eye size={14} aria-hidden="true" />
              Visualizar
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!canUpload || loading}
              title={canUpload ? undefined : 'Atualize ou restaure o cliente antes de anexar contrato social.'}
              className={neutralButtonClass}
            >
              <Upload size={14} aria-hidden="true" />
              {loading ? 'Enviando...' : 'Upload'}
            </button>
            <button
              type="button"
              onClick={openContrato}
              disabled={loading}
              className={neutralButtonClass}
            >
              <Download size={14} aria-hidden="true" />
              Baixar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!canUpload || loading}
            title={canUpload ? undefined : 'Atualize ou restaure o cliente antes de anexar contrato social.'}
            className={neutralButtonClass}
          >
            <Upload size={14} aria-hidden="true" />
            {loading ? 'Enviando...' : 'Anexar'}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={!canUpload || loading}
        onChange={handleFileChange}
      />
    </div>
  );
}
