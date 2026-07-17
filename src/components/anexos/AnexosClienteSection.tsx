import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import {
  getAnexoDataReferencia,
  listarAnexosCliente,
  sortAnexosPorRecencia,
} from '../../services/anexos.service';
import type { AnexoCliente, ClienteAnexoRef, TipoAnexo } from '../../types/anexo';
import { TIPO_ANEXO_LABELS, TIPOS_ANEXO_OPTIONS, TIPOS_ANEXO } from '../../types/anexo';
import { AnexoBadge } from './AnexoBadge';
import { UploadAnexoButton } from './UploadAnexoButton';

type Props = {
  cliente: ClienteAnexoRef;
  anexosIniciais?: AnexoCliente[];
  disabled?: boolean;
  onSuccess?: (tipoAnexo: TipoAnexo, anexo: AnexoCliente) => void;
  onError?: (message: string) => void;
};

const EMPTY_ANEXOS: AnexoCliente[] = [];
const ATTACHMENT_FIELD_BY_TYPE: Record<TipoAnexo, string> = {
  [TIPOS_ANEXO.CARTAO_CNPJ]: 'anexo_cartao_cnpj',
  [TIPOS_ANEXO.CARTAO_QSA]: 'anexo_cartao_qsa',
  [TIPOS_ANEXO.RECIBO_REINF]: 'anexo_recibo_reinf',
  [TIPOS_ANEXO.RECIBO_LUCROS]: 'anexo_recibo_lucros',
  [TIPOS_ANEXO.RECIBO_ECD]: 'anexo_recibo_ecd',
  [TIPOS_ANEXO.RECIBO_ECF]: 'anexo_recibo_ecf',
  [TIPOS_ANEXO.DOCUMENTACAO_MENSAL]: 'anexo_documentacao_mensal',
  [TIPOS_ANEXO.OUTROS]: 'anexo_outros',
};

function parseAttachmentValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && (parsed.name || parsed.nome_arquivo)) {
      return {
        id: String(parsed.id ?? ''),
        nome_arquivo: String(parsed.name ?? parsed.nome_arquivo ?? ''),
        caminho_arquivo: String(parsed.path ?? parsed.caminho_arquivo ?? parsed.url ?? parsed.href ?? ''),
        criado_em: String(parsed.criado_em ?? ''),
        atualizado_em: String(parsed.atualizado_em ?? parsed.attachedAt ?? ''),
      };
    }
  } catch {
    // Valores legados em texto simples ainda podem existir.
  }

  return {
    id: '',
    nome_arquivo: raw,
    caminho_arquivo: /^https?:\/\//i.test(raw) ? raw : '',
    criado_em: '',
    atualizado_em: '',
  };
}

function getFallbackAnexosFromClient(cliente: ClienteAnexoRef) {
  const source = cliente as ClienteAnexoRef & Record<string, unknown>;
  return TIPOS_ANEXO_OPTIONS.map((option) => {
    const tipo = option.value;
    const fieldKey = ATTACHMENT_FIELD_BY_TYPE[tipo];
    const parsed = parseAttachmentValue(source[fieldKey]);
    if (!parsed || !parsed.nome_arquivo) return null;

    return {
      id: parsed.id || `fallback:${String(cliente.id ?? cliente.cnpj ?? 'cliente')}:${tipo}`,
      cliente_id: String(cliente.id ?? ''),
      tipo_anexo: tipo,
      nome_arquivo: parsed.nome_arquivo,
      caminho_arquivo: parsed.caminho_arquivo,
      criado_em: parsed.criado_em || null,
      atualizado_em: parsed.atualizado_em || parsed.criado_em || null,
    } satisfies AnexoCliente;
  }).filter(Boolean) as AnexoCliente[];
}

function mergeAnexosByTipo(...sources: AnexoCliente[][]) {
  const merged = new Map<TipoAnexo, AnexoCliente>();

  sources.flat().forEach((anexo) => {
    if (!anexo?.tipo_anexo) return;
    const current = merged.get(anexo.tipo_anexo);
    if (!current) {
      merged.set(anexo.tipo_anexo, anexo);
      return;
    }

    const nextDate = new Date(getAnexoDataReferencia(anexo) || 0).getTime();
    const currentDate = new Date(getAnexoDataReferencia(current) || 0).getTime();

    if (nextDate >= currentDate) {
      merged.set(anexo.tipo_anexo, anexo);
    }
  });

  return sortAnexosPorRecencia(Array.from(merged.values()));
}

export function AnexosClienteSection({
  cliente,
  anexosIniciais,
  disabled = false,
  onSuccess,
  onError,
}: Props) {
  const anexosFallbackCliente = useMemo(
    () => getFallbackAnexosFromClient(cliente),
    [cliente],
  );
  const anexosSincronizados = useMemo(
    () => mergeAnexosByTipo(anexosIniciais ?? EMPTY_ANEXOS, anexosFallbackCliente),
    [anexosIniciais, anexosFallbackCliente],
  );
  const [anexos, setAnexos] = useState<AnexoCliente[]>(() => anexosSincronizados);
  const [loading, setLoading] = useState(false);
  const [localWarning, setLocalWarning] = useState('');

  useEffect(() => {
    if (anexosIniciais === undefined) return;
    setAnexos(anexosSincronizados);
  }, [anexosIniciais, anexosSincronizados]);

  useEffect(() => {
    let active = true;
    async function carregar() {
      try {
        setLoading(true);
        const data = await listarAnexosCliente(cliente);
        if (active) {
          setAnexos(mergeAnexosByTipo(data, anexosFallbackCliente));
          setLocalWarning('');
        }
      } catch (error) {
        if (active) {
          console.warn('[anexos] Falha ao atualizar lista de anexos do cliente:', error);
          setLocalWarning('Não foi possível atualizar os anexos agora. Mantivemos a última leitura disponível.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    carregar();
    return () => {
      active = false;
    };
  }, [cliente.id, cliente.cnpj, anexosFallbackCliente]);

  const anexosPorTipo = useMemo(() => {
    const map = new Map<TipoAnexo, AnexoCliente>();
    anexos.forEach((anexo) => {
      if (!map.has(anexo.tipo_anexo)) map.set(anexo.tipo_anexo, anexo);
    });
    return map;
  }, [anexos]);

  function handleSuccess(tipoAnexo: TipoAnexo, anexo: AnexoCliente) {
    setAnexos((current) =>
      mergeAnexosByTipo(
        [anexo],
        current.filter((item) => item.id !== anexo.id && item.tipo_anexo !== tipoAnexo),
      ),
    );
    onSuccess?.(tipoAnexo, anexo);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">Anexos</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Arquivos salvos no bucket privado documentos-clientes.
          </p>
        </div>
        <FileSpreadsheet className="text-brand-blue" size={20} aria-hidden="true" />
      </div>

      {loading ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-600">
          Carregando anexos...
        </div>
      ) : null}

      {localWarning ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
          {localWarning}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {TIPOS_ANEXO_OPTIONS.map((option) => {
          const tipo = option.value;
          const anexo = anexosPorTipo.get(tipo);
          return (
            <div key={tipo} className="rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">{TIPO_ANEXO_LABELS[tipo]}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {getAnexoDataReferencia(anexo)
                      ? `Enviado em ${new Date(getAnexoDataReferencia(anexo)).toLocaleString('pt-BR')}`
                      : 'Nenhum arquivo enviado'}
                  </p>
                </div>
                <AnexoBadge anexo={anexo} />
              </div>
              <div className="mt-3">
                <UploadAnexoButton
                  cliente={cliente}
                  tipoAnexo={tipo}
                  anexo={anexo}
                  disabled={disabled}
                  onSuccess={(novoAnexo) => handleSuccess(tipo, novoAnexo)}
                  onError={onError}
                  labelAnexar="Anexar"
                  labelSubstituir="Substituir"
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
