import { Paperclip } from 'lucide-react';
import type { AnexoCliente } from '../../types/anexo';

type Props = {
  anexo?: AnexoCliente | null;
  nomeFallback?: string;
};

export function AnexoBadge({ anexo, nomeFallback }: Props) {
  const nome = anexo?.nome_arquivo || nomeFallback || '';
  const anexado = Boolean(nome);

  return (
    <span
      className={`inline-flex max-w-56 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black ${
        anexado
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-100 text-slate-500'
      }`}
      title={anexado ? nome : 'Sem anexo'}
    >
      <Paperclip size={13} aria-hidden="true" />
      <span className="truncate">{anexado ? `Anexado: ${nome}` : 'Sem anexo'}</span>
    </span>
  );
}
