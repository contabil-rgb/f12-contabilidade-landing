import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import {
  getAnexoDataReferencia,
  listarAnexosCliente,
  sortAnexosPorRecencia,
} from '../../services/anexos.service';
import type { AnexoCliente, ClienteAnexoRef, TipoAnexo } from '../../types/anexo';
import { TIPO_ANEXO_LABELS, TIPOS_ANEXO_OPTIONS } from '../../types/anexo';
import { AnexoBadge } from './AnexoBadge';
import { UploadAnexoButton } from './UploadAnexoButton';

type Props = {
  cliente: ClienteAnexoRef;
  anexosIniciais?: AnexoCliente[];
  disabled?: boolean;
  onSuccess?: (tipoAnexo: TipoAnexo, anexo: AnexoCliente) => void;
  onError?: (message: string) => void;
};

export function AnexosClienteSection({
  cliente,
  anexosIniciais = [],
  disabled = false,
  onSuccess,
  onError,
}: Props) {
  const [anexos, setAnexos] = useState<AnexoCliente[]>(() => sortAnexosPorRecencia(anexosIniciais));
  const [loading, setLoading] = useState(false);
  const [localWarning, setLocalWarning] = useState('');

  useEffect(() => {
    setAnexos(sortAnexosPorRecencia(anexosIniciais));
  }, [anexosIniciais]);

  useEffect(() => {
    let active = true;
    async function carregar() {
      try {
        setLoading(true);
        const data = await listarAnexosCliente(cliente);
        if (active) {
          setAnexos(sortAnexosPorRecencia(data));
          setLocalWarning('');
        }
      } catch (error) {
        if (active) {
          console.warn('[anexos] Falha ao atualizar lista de anexos do cliente:', error);
          setLocalWarning('Nao foi possivel atualizar os anexos agora. Mantivemos a ultima leitura disponivel.');
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

  const anexosPorTipo = useMemo(() => {
    const map = new Map<TipoAnexo, AnexoCliente>();
    anexos.forEach((anexo) => {
      if (!map.has(anexo.tipo_anexo)) map.set(anexo.tipo_anexo, anexo);
    });
    return map;
  }, [anexos]);

  function handleSuccess(tipoAnexo: TipoAnexo, anexo: AnexoCliente) {
    setAnexos((current) =>
      sortAnexosPorRecencia([
        anexo,
        ...current.filter((item) => item.id !== anexo.id && item.tipo_anexo !== tipoAnexo),
      ]),
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
