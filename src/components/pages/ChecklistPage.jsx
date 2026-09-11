import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ClipboardCheck,
  FileQuestion,
  RefreshCcw,
  Search,
} from 'lucide-react';
import ActionButton from '../ui/ActionButton';
import AlertBanner from '../ui/AlertBanner';
import DataTableShell from '../ui/DataTableShell';
import StatusBadge from '../ui/StatusBadge';
import SurfacePanel from '../ui/SurfacePanel';
import { classNames } from '../ui/classNames';
import { formatCnpj, formatNumber, normalizeText } from '../../lib/formatters';
import {
  CHECKLIST_STATUS,
  listarChecklistClienteItens,
  listarChecklistItens,
  listarChecklistResumo,
  listarChecklistStatus,
  salvarChecklistClienteItens,
  salvarChecklistStatus,
} from '../../services/checklist.service';

const MONTH_OPTIONS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

const STATUS_OPTIONS = [
  {
    value: CHECKLIST_STATUS.PENDENTE,
    label: 'Pendente',
    shortLabel: 'Pendente',
    tone: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
    button: 'border-amber-300/70 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/20',
  },
  {
    value: CHECKLIST_STATUS.OK,
    label: 'Recebido',
    shortLabel: 'OK',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200',
    button: 'border-emerald-300/70 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/20',
  },
  {
    value: CHECKLIST_STATUS.NA,
    label: 'Não aplicável',
    shortLabel: 'N/A',
    tone: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200',
    button: 'border-slate-300/70 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-700',
  },
  {
    value: CHECKLIST_STATUS.ERP,
    label: 'ERP',
    shortLabel: 'ERP',
    tone: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200',
    button: 'border-sky-300/70 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200 dark:hover:bg-sky-400/20',
  },
];

const STATUS_BY_VALUE = Object.fromEntries(STATUS_OPTIONS.map((status) => [status.value, status]));

function getCurrentCompetence() {
  const today = new Date();
  return {
    mes: today.getMonth() + 1,
    ano: today.getFullYear(),
  };
}

function toNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function getClientName(client) {
  return client?.nome_identificacao || client?.razao_social || 'Cliente sem identificação';
}

function getResponsavel(client) {
  return client?.responsavel || 'Não informado';
}

function buildStatusMap(statusRows = []) {
  return Object.fromEntries(statusRows.map((row) => [row.item_id, row]));
}

function getCompletionTone(percentual) {
  if (percentual >= 100) return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200';
  if (percentual >= 50) return 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200';
  return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200';
}

function ChecklistStatusButtons({ currentStatus, disabled, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {STATUS_OPTIONS.map((status) => {
        const active = currentStatus === status.value;
        return (
          <button
            key={status.value}
            type="button"
            disabled={disabled || active}
            onClick={() => onChange(status.value)}
            className={classNames(
              'rounded-lg border px-3 py-1.5 text-xs font-black transition disabled:cursor-not-allowed',
              active
                ? status.button
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-slate-950 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-blue-500/60 dark:hover:text-white',
              disabled && !active ? 'opacity-60' : '',
            )}
          >
            {status.shortLabel}
          </button>
        );
      })}
    </div>
  );
}

function ClientChecklistDetails({
  client,
  detail,
  ano,
  mes,
  catalogItems,
  catalogLoading,
  catalogError,
  busyKey,
  savingConfigId,
  onReload,
  onSaveClientItems,
  onStatusChange,
}) {
  const linkedIdsKey = useMemo(
    () => (detail?.itens ?? []).map((vinculo) => vinculo.item_id || vinculo.item?.id).filter(Boolean).join('|'),
    [detail?.itens],
  );
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  useEffect(() => {
    setSelectedItemIds(linkedIdsKey ? linkedIdsKey.split('|') : []);
  }, [linkedIdsKey]);

  const selectedSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const selectedCount = selectedItemIds.length;
  const savingConfig = savingConfigId === client?.id;

  function toggleCatalogItem(itemId) {
    setSelectedItemIds((current) => (
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    ));
  }

  function selectAllCatalogItems() {
    setSelectedItemIds(catalogItems.map((item) => item.id));
  }

  function clearCatalogItems() {
    setSelectedItemIds([]);
  }

  if (!detail || detail.loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:border-gray-800 dark:bg-gray-900/55 dark:text-gray-300">
        Carregando checklist do cliente...
      </div>
    );
  }

  if (detail.error) {
    return (
      <AlertBanner tone="danger" title="Não foi possível carregar este checklist.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{detail.error}</span>
          <ActionButton type="button" size="sm" onClick={() => onReload(client.id)}>
            Tentar novamente
          </ActionButton>
        </div>
      </AlertBanner>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-4 dark:border-gray-800 dark:bg-gray-900/45">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900 dark:text-white">Itens aplicáveis ao cliente</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-gray-400">
              Selecione quais documentos entram no checklist deste cliente. A ordem segue o catálogo padrão configurado no Supabase.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge toneClass="border-slate-300 bg-white text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {formatNumber(selectedCount)} selecionado(s)
            </StatusBadge>
            <ActionButton type="button" size="sm" variant="subtle" onClick={selectAllCatalogItems} disabled={catalogLoading || !catalogItems.length || savingConfig}>
              Marcar todos
            </ActionButton>
            <ActionButton type="button" size="sm" variant="subtle" onClick={clearCatalogItems} disabled={catalogLoading || savingConfig}>
              Limpar
            </ActionButton>
            <ActionButton
              type="button"
              size="sm"
              variant="primary"
              onClick={() => onSaveClientItems(client, selectedItemIds)}
              disabled={catalogLoading || savingConfig}
            >
              {savingConfig ? 'Salvando...' : 'Salvar itens'}
            </ActionButton>
          </div>
        </div>

        {catalogError ? (
          <div className="mt-4">
            <AlertBanner tone="danger" title="Erro ao carregar catálogo">
              {catalogError}
            </AlertBanner>
          </div>
        ) : null}

        {catalogLoading ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-500 dark:border-gray-800 dark:bg-gray-950/30 dark:text-gray-300">
            Carregando catálogo de documentos...
          </div>
        ) : null}

        {!catalogLoading && !catalogError && catalogItems.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-500 dark:border-gray-700 dark:bg-gray-950/30 dark:text-gray-300">
            Nenhum item ativo foi encontrado no catálogo do checklist.
          </div>
        ) : null}

        {!catalogLoading && !catalogError && catalogItems.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {catalogItems.map((item) => {
              const checked = selectedSet.has(item.id);
              return (
                <label
                  key={item.id}
                  className={classNames(
                    'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition',
                    checked
                      ? 'border-blue-400/70 bg-blue-50 text-blue-900 dark:border-blue-400/40 dark:bg-blue-500/10 dark:text-blue-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-gray-800 dark:bg-gray-950/30 dark:text-gray-200 dark:hover:border-blue-500/50',
                    savingConfig ? 'pointer-events-none opacity-70' : '',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={savingConfig}
                    onChange={() => toggleCatalogItem(item.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="min-w-0 leading-5">{item.descricao}</span>
                </label>
              );
            })}
          </div>
        ) : null}
      </div>

      {!detail.itens?.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900/45 dark:text-gray-300">
          <div className="flex items-start gap-3">
            <FileQuestion size={20} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            <div>
              <p className="font-black text-slate-800 dark:text-gray-100">Nenhum item vinculado a este cliente.</p>
              <p className="mt-1 font-medium leading-6">
                Selecione os documentos acima e clique em salvar para montar o checklist deste cliente.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-gray-800 dark:bg-gray-900/45">
          <DataTableShell
            headers={['Item', 'Status atual', 'Alterar status']}
            minWidth="min-w-[760px]"
            hasRows={detail.itens.length > 0}
          >
            <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
              {detail.itens.map((vinculo) => {
                const item = vinculo.item;
                const itemId = vinculo.item_id || item?.id;
                const statusRow = detail.statusByItem?.[itemId];
                const currentStatus = statusRow?.status || CHECKLIST_STATUS.PENDENTE;
                const statusMeta = STATUS_BY_VALUE[currentStatus] || STATUS_BY_VALUE[CHECKLIST_STATUS.PENDENTE];
                const rowBusyKey = `${client.id}:${itemId}`;

                return (
                  <tr key={vinculo.id || itemId}>
                    <td className="table-cell-primary">
                      <div className="min-w-0">
                        <p className="font-black text-slate-900 dark:text-white">{item?.descricao || 'Item sem descrição'}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-gray-500">
                          Competência {String(mes).padStart(2, '0')}/{ano}
                        </p>
                      </div>
                    </td>
                    <td className="table-cell-primary">
                      <StatusBadge toneClass={statusMeta.tone}>{statusMeta.label}</StatusBadge>
                    </td>
                    <td className="table-cell-primary">
                      <ChecklistStatusButtons
                        currentStatus={currentStatus}
                        disabled={busyKey === rowBusyKey}
                        onChange={(nextStatus) => onStatusChange(client, vinculo, nextStatus)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTableShell>
        </div>
      )}
    </div>
  );
}

export default function ChecklistPage({ clients = [] }) {
  const initialCompetence = useMemo(() => getCurrentCompetence(), []);
  const [mes, setMes] = useState(initialCompetence.mes);
  const [ano, setAno] = useState(initialCompetence.ano);
  const [search, setSearch] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [resumos, setResumos] = useState([]);
  const [loadingResumo, setLoadingResumo] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [expandedClientId, setExpandedClientId] = useState('');
  const [detailsByClient, setDetailsByClient] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [savingConfigId, setSavingConfigId] = useState('');

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, index) => currentYear - 2 + index);
  }, []);

  const responsavelOptions = useMemo(() => {
    const groups = new Map();
    clients.forEach((client) => {
      const value = getResponsavel(client);
      const key = normalizeText(value);
      if (key && !groups.has(key)) groups.set(key, value);
    });
    return Array.from(groups.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [clients]);

  async function loadResumo({ silent = false } = {}) {
    if (!silent) setLoadingResumo(true);
    setError('');
    try {
      const rows = await listarChecklistResumo({ ano, mes });
      setResumos(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o resumo do checklist.');
    } finally {
      if (!silent) setLoadingResumo(false);
    }
  }

  async function loadCatalogItems() {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const items = await listarChecklistItens();
      setCatalogItems(items);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Não foi possível carregar o catálogo do checklist.');
    } finally {
      setCatalogLoading(false);
    }
  }

  useEffect(() => {
    loadCatalogItems();
  }, []);

  useEffect(() => {
    setExpandedClientId('');
    setDetailsByClient({});
    loadResumo();
  }, [ano, mes]);

  const rows = useMemo(() => {
    const resumoByClient = new Map(resumos.map((resumo) => [resumo.cliente_id, resumo]));
    return clients.map((client) => {
      const resumo = resumoByClient.get(client.id);
      const totalItens = toNumber(resumo?.total_itens);
      const percentual = totalItens > 0 ? toNumber(resumo?.percentual_concluido) : 0;
      return {
        client,
        resumo,
        cliente_id: client.id,
        nome: getClientName(client),
        cnpj: client.cnpj || resumo?.cnpj || '',
        responsavel: getResponsavel(client),
        total_itens: totalItens,
        qtd_ok: toNumber(resumo?.qtd_ok),
        qtd_nao_aplicavel: toNumber(resumo?.qtd_nao_aplicavel),
        qtd_erp: toNumber(resumo?.qtd_erp),
        qtd_pendentes: toNumber(resumo?.qtd_pendentes),
        percentual_concluido: percentual,
      };
    });
  }, [clients, resumos]);

  const filteredRows = useMemo(() => {
    const searchTerm = normalizeText(search);
    const responsavelTerm = normalizeText(responsavel);
    return rows
      .filter((row) => {
        const matchesSearch = !searchTerm
          || normalizeText(`${row.nome} ${row.client?.razao_social ?? ''} ${row.cnpj}`).includes(searchTerm);
        const matchesResponsavel = !responsavelTerm || normalizeText(row.responsavel) === responsavelTerm;
        return matchesSearch && matchesResponsavel;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [responsavel, rows, search]);

  const metrics = useMemo(() => {
    const comChecklist = rows.filter((row) => row.total_itens > 0).length;
    const comPendencias = rows.filter((row) => row.qtd_pendentes > 0).length;
    const concluidos = rows.filter((row) => row.total_itens > 0 && row.qtd_pendentes === 0).length;
    return { comChecklist, comPendencias, concluidos };
  }, [rows]);

  async function loadClientDetails(clienteId, { force = false } = {}) {
    if (!clienteId) return;
    if (!force && detailsByClient[clienteId]?.itens) return;

    setDetailsByClient((current) => ({
      ...current,
      [clienteId]: { ...(current[clienteId] ?? {}), loading: true, error: '' },
    }));

    try {
      const [itens, statusRows] = await Promise.all([
        listarChecklistClienteItens(clienteId),
        listarChecklistStatus({ clienteId, ano, mes }),
      ]);
      setDetailsByClient((current) => ({
        ...current,
        [clienteId]: {
          loading: false,
          error: '',
          itens,
          statusRows,
          statusByItem: buildStatusMap(statusRows),
        },
      }));
    } catch (err) {
      setDetailsByClient((current) => ({
        ...current,
        [clienteId]: {
          ...(current[clienteId] ?? {}),
          loading: false,
          error: err instanceof Error ? err.message : 'Não foi possível carregar o checklist do cliente.',
        },
      }));
    }
  }

  function toggleClient(clienteId) {
    const nextId = expandedClientId === clienteId ? '' : clienteId;
    setExpandedClientId(nextId);
    if (nextId) loadClientDetails(nextId);
  }

  async function handleStatusChange(client, vinculo, nextStatus) {
    const itemId = vinculo.item_id || vinculo.item?.id;
    if (!client?.id || !itemId) return;

    const rowBusyKey = `${client.id}:${itemId}`;
    setBusyKey(rowBusyKey);
    setToast(null);

    try {
      const saved = await salvarChecklistStatus({
        cliente_id: client.id,
        item_id: itemId,
        ano,
        mes,
        status: nextStatus,
      });

      setDetailsByClient((current) => {
        const detail = current[client.id] ?? {};
        return {
          ...current,
          [client.id]: {
            ...detail,
            statusRows: [
              ...(detail.statusRows ?? []).filter((row) => row.item_id !== itemId),
              saved,
            ],
            statusByItem: {
              ...(detail.statusByItem ?? {}),
              [itemId]: saved,
            },
          },
        };
      });

      await loadResumo({ silent: true });
      setToast({ tone: 'success', title: 'Status atualizado', message: `${getClientName(client)} foi atualizado para a competência selecionada.` });
    } catch (err) {
      setToast({ tone: 'danger', title: 'Erro ao salvar status', message: err instanceof Error ? err.message : 'Não foi possível salvar o status.' });
    } finally {
      setBusyKey('');
    }
  }

  async function handleSaveClientItems(client, selectedItemIds) {
    if (!client?.id) return;

    setSavingConfigId(client.id);
    setToast(null);

    const selectedIds = new Set(selectedItemIds);
    const payload = catalogItems
      .filter((item) => selectedIds.has(item.id))
      .map((item, index) => ({
        item_id: item.id,
        ordem: index + 1,
        ativo: true,
      }));

    try {
      await salvarChecklistClienteItens(client.id, payload);
      await Promise.all([
        loadClientDetails(client.id, { force: true }),
        loadResumo({ silent: true }),
      ]);
      setToast({
        tone: 'success',
        title: 'Itens do checklist salvos',
        message: `${getClientName(client)} agora está com ${formatNumber(payload.length)} item(ns) vinculado(s).`,
      });
    } catch (err) {
      setToast({
        tone: 'danger',
        title: 'Erro ao salvar itens do checklist',
        message: err instanceof Error ? err.message : 'Não foi possível salvar os itens deste cliente.',
      });
    } finally {
      setSavingConfigId('');
    }
  }

  return (
    <div className="space-y-5">
      <SurfacePanel
        title="Checklist de Documentos"
        description="Acompanhamento mensal dos documentos solicitados aos clientes. Nesta primeira versão, os status são atualizados manualmente por competência."
        right={(
          <ActionButton type="button" variant="secondary" onClick={() => loadResumo()} disabled={loadingResumo}>
            <RefreshCcw size={16} className={loadingResumo ? 'animate-spin' : ''} aria-hidden="true" />
            Atualizar
          </ActionButton>
        )}
        bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-900/55">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">Clientes com checklist</p>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{formatNumber(metrics.comChecklist)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-900/55">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">Com pendências</p>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{formatNumber(metrics.comPendencias)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-900/55">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">Concluídos</p>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{formatNumber(metrics.concluidos)}</p>
          </div>
        </div>
      </SurfacePanel>

      <SurfacePanel
        title="Filtros"
        description="Escolha a competência e filtre a carteira para revisar os documentos de cada cliente."
        bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6"
      >
        <div className="grid gap-3 lg:grid-cols-[1.35fr_0.7fr_0.7fr_1fr]">
          <label className="space-y-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
            Cliente, CNPJ ou razão social
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar cliente"
                className="field-input pl-10 normal-case"
              />
            </div>
          </label>

          <label className="space-y-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
            Mês
            <select value={mes} onChange={(event) => setMes(Number(event.target.value))} className="field-input normal-case">
              {MONTH_OPTIONS.map((month) => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
            Ano
            <select value={ano} onChange={(event) => setAno(Number(event.target.value))} className="field-input normal-case">
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
            Responsável
            <select value={responsavel} onChange={(event) => setResponsavel(event.target.value)} className="field-input normal-case">
              <option value="">Todos</option>
              {responsavelOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
      </SurfacePanel>

      {error ? (
        <AlertBanner tone="danger" title="Erro ao carregar checklist">
          {error}
        </AlertBanner>
      ) : null}

      {toast ? (
        <AlertBanner tone={toast.tone} title={toast.title}>
          {toast.message}
        </AlertBanner>
      ) : null}

      <SurfacePanel
        title="Clientes"
        description={`${formatNumber(filteredRows.length)} cliente(s) conforme os filtros aplicados.`}
        bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6"
      >
        <div className="space-y-3">
          {loadingResumo ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500 dark:border-gray-800 dark:bg-gray-900/55 dark:text-gray-300">
              Carregando resumo do checklist...
            </div>
          ) : null}

          {!loadingResumo && filteredRows.length === 0 ? (
            <div className="empty-state">
              <ClipboardCheck className="text-slate-300 dark:text-gray-600" size={40} aria-hidden="true" />
              <p className="text-base font-bold text-slate-800 dark:text-gray-100">Nenhum cliente encontrado.</p>
              <p className="max-w-md text-sm font-medium leading-6 text-slate-500 dark:text-gray-300">
                Ajuste os filtros para visualizar a carteira desta competência.
              </p>
            </div>
          ) : null}

          {filteredRows.map((row) => {
            const expanded = expandedClientId === row.cliente_id;
            const completionTone = getCompletionTone(row.percentual_concluido);

            return (
              <div key={row.cliente_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
                <button
                  type="button"
                  onClick={() => toggleClient(row.cliente_id)}
                  className="flex w-full flex-col gap-4 px-4 py-4 text-left transition hover:bg-slate-50 sm:px-5 lg:flex-row lg:items-center lg:justify-between dark:hover:bg-gray-800/55"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950 dark:text-white">{row.nome}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-gray-400">
                      {formatCnpj(row.cnpj)} · Responsável: {row.responsavel}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <StatusBadge toneClass={completionTone}>{formatNumber(row.percentual_concluido)}% concluído</StatusBadge>
                    <StatusBadge toneClass="border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      {formatNumber(row.total_itens)} item(ns)
                    </StatusBadge>
                    <StatusBadge toneClass="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                      {formatNumber(row.qtd_pendentes)} pendente(s)
                    </StatusBadge>
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      {expanded ? 'Ocultar' : 'Abrir'}
                      <ChevronDown size={14} className={classNames('transition', expanded && 'rotate-180')} aria-hidden="true" />
                    </span>
                  </div>
                </button>

                {expanded ? (
                  <div className="border-t border-slate-200 p-4 sm:p-5 dark:border-gray-800">
                    <ClientChecklistDetails
                      client={row.client}
                      detail={detailsByClient[row.cliente_id]}
                      ano={ano}
                      mes={mes}
                      catalogItems={catalogItems}
                      catalogLoading={catalogLoading}
                      catalogError={catalogError}
                      busyKey={busyKey}
                      savingConfigId={savingConfigId}
                      onReload={(clienteId) => loadClientDetails(clienteId, { force: true })}
                      onSaveClientItems={handleSaveClientItems}
                      onStatusChange={handleStatusChange}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SurfacePanel>
    </div>
  );
}
