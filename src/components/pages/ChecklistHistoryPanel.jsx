import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  History,
  RefreshCcw,
  Search,
  UserRound,
} from 'lucide-react';
import { formatCnpj, formatNumber } from '../../lib/formatters';
import { listarChecklistHistorico } from '../../services/checklist.service';
import { listarUsuariosPortal } from '../../services/usuarios.service';
import ActionButton from '../ui/ActionButton';
import AlertBanner from '../ui/AlertBanner';
import DataTableShell from '../ui/DataTableShell';
import MetricTile from '../ui/MetricTile';
import StatusBadge from '../ui/StatusBadge';
import SurfacePanel from '../ui/SurfacePanel';

const EMPTY_FILTERS = {
  busca: '',
  origem: '',
  status: '',
  responsavelId: '',
  ano: '',
  mes: '',
  dataInicio: '',
  dataFim: '',
};

const EMPTY_SUMMARY = {
  total: 0,
  enviados: 0,
  falhas: 0,
  processando: 0,
  cancelados: 0,
  manuais: 0,
  automaticos: 0,
};

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function addOneDay(date) {
  if (!date) return '';
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + 1);
  return value.toISOString();
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function eventDate(row) {
  return row.enviado_em || row.finalizado_em || row.iniciado_em || row.criado_em;
}

function statusPresentation(status) {
  return {
    ENVIADO: {
      label: 'Enviado',
      tone: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200',
    },
    FALHOU: {
      label: 'Falhou',
      tone: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200',
    },
    PROCESSANDO: {
      label: 'Processando',
      tone: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
    },
    CANCELADO: {
      label: 'Cancelado',
      tone: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200',
    },
  }[status] ?? {
    label: status || 'Não informado',
    tone: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200',
  };
}

function formatCompetences(competences = []) {
  const labels = competences
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const month = Number(item.mes);
      const year = Number(item.ano);
      if (!month || !year) return '';
      return `${String(month).padStart(2, '0')}/${year}`;
    })
    .filter(Boolean);
  if (!labels.length) return '—';
  if (labels.length <= 3) return labels.join(', ');
  return `${labels.slice(0, 2).join(', ')} e mais ${labels.length - 2}`;
}

function itemDescription(item, index) {
  if (!item || typeof item !== 'object') return `Item ${index + 1}`;
  return String(item.item_descricao ?? item.descricao ?? item.nome ?? `Item ${index + 1}`).trim();
}

function summarizeItems(items = []) {
  const groups = new Map();
  items.forEach((item, index) => {
    const description = itemDescription(item, index);
    groups.set(description, (groups.get(description) ?? 0) + 1);
  });
  return Array.from(groups, ([description, count]) => ({ description, count }));
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
      <span className="block">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input-shell mt-2 normal-case">
        {children}
      </select>
    </label>
  );
}

export default function ChecklistHistoryPanel({ yearOptions = [] }) {
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [responsibles, setResponsibles] = useState([]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listarChecklistHistorico({
        pagina: page,
        porPagina: perPage,
        busca: appliedFilters.busca.trim(),
        origem: appliedFilters.origem,
        status: appliedFilters.status,
        responsavelId: appliedFilters.responsavelId,
        ano: appliedFilters.ano ? Number(appliedFilters.ano) : undefined,
        mes: appliedFilters.mes ? Number(appliedFilters.mes) : undefined,
        dataInicio: appliedFilters.dataInicio ? new Date(`${appliedFilters.dataInicio}T00:00:00`).toISOString() : undefined,
        dataFim: addOneDay(appliedFilters.dataFim) || undefined,
      });
      setRows(result.rows);
      setSummary(result.resumo);
      setTotal(result.total);
      if (page > 1 && result.rows.length === 0 && result.total > 0) {
        setPage(Math.max(1, Math.ceil(result.total / perPage)));
      }
    } catch (caught) {
      setRows([]);
      setSummary(EMPTY_SUMMARY);
      setTotal(0);
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar o histórico de envios.');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, perPage]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    let active = true;
    listarUsuariosPortal()
      .then((users) => {
        if (!active) return;
        setResponsibles(users
          .filter((user) => user.id && user.nome)
          .map((user) => ({ id: user.id, nome: user.nome, email: user.email })));
      })
      .catch(() => {
        if (active) setResponsibles([]);
      });
    return () => { active = false; };
  }, []);

  const shownResponsibles = useMemo(() => {
    const values = new Map(responsibles.map((item) => [item.id, item]));
    rows.forEach((row) => {
      if (row.enviado_por && !values.has(row.enviado_por)) {
        values.set(row.enviado_por, {
          id: row.enviado_por,
          nome: row.enviado_por_nome || row.enviado_por_email || 'Usuário removido',
          email: row.enviado_por_email,
        });
      }
    });
    return Array.from(values.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [responsibles, rows]);

  function updateDraft(field, value) {
    setDraftFilters((current) => ({ ...current, [field]: value }));
  }

  function applyFilters(event) {
    event?.preventDefault();
    setPage(1);
    setExpandedId('');
    setAppliedFilters({ ...draftFilters });
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
    setExpandedId('');
  }

  function filterByStatus(status) {
    const next = { ...draftFilters, status };
    setDraftFilters(next);
    setAppliedFilters(next);
    setPage(1);
    setExpandedId('');
  }

  return (
    <div className="space-y-5">
      <SurfacePanel
        title="Histórico de envios"
        right={(
          <ActionButton type="button" variant="secondary" onClick={loadHistory} disabled={loading}>
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Atualizar
          </ActionButton>
        )}
        bodyClassName="px-4 pb-4 sm:px-5 sm:pb-5"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <MetricTile title="Total" value={formatNumber(summary.total)} icon={History} tone="muted" className="min-h-[118px]" />
          <MetricTile title="Enviados" value={formatNumber(summary.enviados)} icon={CheckCircle2} tone="success" onClick={() => filterByStatus('ENVIADO')} className="min-h-[118px]" />
          <MetricTile title="Falhas" value={formatNumber(summary.falhas)} icon={AlertCircle} tone={summary.falhas ? 'danger' : 'muted'} onClick={() => filterByStatus('FALHOU')} className="min-h-[118px]" />
          <MetricTile title="Processando" value={formatNumber(summary.processando)} icon={Clock3} tone={summary.processando ? 'warning' : 'muted'} onClick={() => filterByStatus('PROCESSANDO')} className="min-h-[118px]" />
          <MetricTile title="Manuais" value={formatNumber(summary.manuais)} icon={UserRound} tone="info" className="min-h-[118px]" />
          <MetricTile title="Automáticos" value={formatNumber(summary.automaticos)} icon={Bot} tone="info" className="min-h-[118px]" />
        </div>
      </SurfacePanel>

      <SurfacePanel
        title="Filtros do histórico"
        right={(
          <ActionButton type="button" variant="secondary" onClick={clearFilters}>
            <RefreshCcw size={16} aria-hidden="true" />
            Limpar filtros
          </ActionButton>
        )}
        bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6"
      >
        <form onSubmit={applyFilters} className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400 lg:col-span-2">
              <span className="block">Cliente, CNPJ ou destinatário</span>
              <div className="relative mt-2">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  value={draftFilters.busca}
                  onChange={(event) => updateDraft('busca', event.target.value)}
                  className="input-shell pl-10 normal-case"
                  placeholder="Pesquisar no histórico"
                />
              </div>
            </label>
            <SelectField label="Responsável pelo envio" value={draftFilters.responsavelId} onChange={(value) => updateDraft('responsavelId', value)}>
              <option value="">Todos</option>
              {shownResponsibles.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </SelectField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <SelectField label="Status" value={draftFilters.status} onChange={(value) => updateDraft('status', value)}>
              <option value="">Todos</option>
              <option value="ENVIADO">Enviado</option>
              <option value="FALHOU">Falhou</option>
              <option value="PROCESSANDO">Processando</option>
              <option value="CANCELADO">Cancelado</option>
            </SelectField>
            <SelectField label="Origem" value={draftFilters.origem} onChange={(value) => updateDraft('origem', value)}>
              <option value="">Todas</option>
              <option value="MANUAL">Manual</option>
              <option value="AUTOMATICO">Automática</option>
            </SelectField>
            <SelectField label="Ano" value={draftFilters.ano} onChange={(value) => updateDraft('ano', value)}>
              <option value="">Todos</option>
              {[...yearOptions].reverse().map((year) => <option key={year} value={year}>{year}</option>)}
            </SelectField>
            <SelectField label="Mês" value={draftFilters.mes} onChange={(value) => updateDraft('mes', value)}>
              <option value="">Todos</option>
              {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </SelectField>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
              <span className="block">Data inicial</span>
              <input type="date" value={draftFilters.dataInicio} onChange={(event) => updateDraft('dataInicio', event.target.value)} className="input-shell mt-2 normal-case" />
            </label>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
              <span className="block">Data final</span>
              <input type="date" value={draftFilters.dataFim} min={draftFilters.dataInicio || undefined} onChange={(event) => updateDraft('dataFim', event.target.value)} className="input-shell mt-2 normal-case" />
            </label>
            <div className="flex items-end">
              <ActionButton type="submit" variant="primary" className="w-full justify-center" disabled={loading}>
                <Search size={16} aria-hidden="true" />
                Aplicar filtros
              </ActionButton>
            </div>
          </div>
        </form>
      </SurfacePanel>

      {error ? <AlertBanner tone="danger" title="Erro ao carregar histórico">{error}</AlertBanner> : null}

      <SurfacePanel
        title="Registros de envio"
        right={(
          <div className="flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-gray-300">
            <span>{formatNumber(total)} registro(s)</span>
            <select
              value={perPage}
              onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}
              className="input-shell h-9 w-auto min-w-[96px] py-1 text-xs normal-case"
              aria-label="Registros por página"
            >
              <option value={10}>10 por página</option>
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
            </select>
          </div>
        )}
        bodyClassName="pb-5"
      >
        <DataTableShell
          headers={['Data', 'Cliente', 'Destinatário', 'Competência', 'Pendências', 'Status', 'Origem', 'Responsável', 'Detalhes']}
          minWidth="min-w-[1180px] xl:min-w-[1380px]"
          hasRows={rows.length > 0}
          emptyTitle={loading ? 'Carregando histórico...' : 'Nenhum envio encontrado.'}
          emptyDescription={loading ? '' : 'Ajuste os filtros ou aguarde o primeiro envio registrado.'}
        >
          <tbody>
            {rows.map((row) => {
              const presentation = statusPresentation(row.status);
              const expanded = expandedId === row.id;
              const summarizedItems = summarizeItems(row.itens_cobrados);
              return (
                <tr key={row.id} className="table-row">
                  <td className="table-cell table-cell-muted whitespace-nowrap">{formatDateTime(eventDate(row))}</td>
                  <td className="table-cell">
                    <p className="table-cell-strong">{row.cliente_nome || 'Cliente removido'}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{row.cliente_cnpj ? formatCnpj(row.cliente_cnpj) : 'CNPJ não informado'}</p>
                  </td>
                  <td className="table-cell">
                    <p>{row.destinatario || '—'}</p>
                    {row.cc ? <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Cc: {row.cc}</p> : null}
                  </td>
                  <td className="table-cell">{formatCompetences(row.competencias)}</td>
                  <td className="table-cell font-black">{formatNumber(row.qtd_pendencias)}</td>
                  <td className="table-cell"><StatusBadge toneClass={presentation.tone}>{presentation.label}</StatusBadge></td>
                  <td className="table-cell">{row.origem === 'AUTOMATICO' ? 'Automática' : 'Manual'}</td>
                  <td className="table-cell">
                    <p>{row.enviado_por_nome || 'Usuário removido'}</p>
                    {row.enviado_por_email ? <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{row.enviado_por_email}</p> : null}
                  </td>
                  <td className="table-cell">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? '' : row.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-500/50"
                      aria-expanded={expanded}
                    >
                      <Eye size={14} aria-hidden="true" />
                      {expanded ? 'Ocultar' : 'Ver'}
                      <ChevronDown size={14} className={expanded ? 'rotate-180' : ''} aria-hidden="true" />
                    </button>
                    {expanded ? (
                      <div className="mt-3 w-[340px] max-w-[72vw] rounded-xl border border-slate-200 bg-slate-50 p-4 text-left shadow-lg dark:border-gray-700 dark:bg-gray-950">
                        <dl className="space-y-3 text-xs">
                          <div><dt className="font-black uppercase text-slate-400">Assunto</dt><dd className="mt-1 font-semibold text-slate-700 dark:text-gray-200">{row.assunto || '—'}</dd></div>
                          <div>
                            <dt className="font-black uppercase text-slate-400">Itens cobrados</dt>
                            <dd className="mt-1 text-slate-700 dark:text-gray-200">
                              {summarizedItems.length ? (
                                <ul className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                                  {summarizedItems.map((item) => (
                                    <li key={item.description} className="flex items-start justify-between gap-3">
                                      <span>{item.description}</span>
                                      {item.count > 1 ? <span className="shrink-0 font-black text-slate-500 dark:text-gray-400">× {item.count}</span> : null}
                                    </li>
                                  ))}
                                </ul>
                              ) : 'Nenhum item registrado'}
                            </dd>
                          </div>
                          <div><dt className="font-black uppercase text-slate-400">Identificador do Resend</dt><dd className="mt-1 break-all font-mono text-slate-700 dark:text-gray-200">{row.email_resend_id || '—'}</dd></div>
                          {row.erro_mensagem ? <div><dt className="font-black uppercase text-rose-500">Erro {row.erro_codigo ? `· ${row.erro_codigo}` : ''}</dt><dd className="mt-1 font-semibold text-rose-700 dark:text-rose-200">{row.erro_mensagem}</dd></div> : null}
                          <div><dt className="font-black uppercase text-slate-400">Tentativa</dt><dd className="mt-1 text-slate-700 dark:text-gray-200">{formatNumber(row.tentativa)}</dd></div>
                        </dl>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTableShell>

        <div className="mt-4 flex flex-col gap-3 px-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-slate-500 dark:text-gray-300">
            Página {formatNumber(page)} de {formatNumber(totalPages)}
          </p>
          <div className="flex gap-2">
            <ActionButton type="button" size="sm" variant="subtle" disabled={loading || page <= 1} onClick={() => { setExpandedId(''); setPage((current) => Math.max(1, current - 1)); }}>
              <ChevronLeft size={16} aria-hidden="true" /> Anterior
            </ActionButton>
            <ActionButton type="button" size="sm" variant="subtle" disabled={loading || page >= totalPages} onClick={() => { setExpandedId(''); setPage((current) => Math.min(totalPages, current + 1)); }}>
              Próxima <ChevronRight size={16} aria-hidden="true" />
            </ActionButton>
          </div>
        </div>
      </SurfacePanel>
    </div>
  );
}
