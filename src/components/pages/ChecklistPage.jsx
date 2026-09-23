import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  FileQuestion,
  History,
  Plus,
  ListChecks,
  Mail,
  RefreshCcw,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import ActionButton from '../ui/ActionButton';
import AlertBanner from '../ui/AlertBanner';
import DataTableShell from '../ui/DataTableShell';
import MetricTile from '../ui/MetricTile';
import StatusBadge from '../ui/StatusBadge';
import SurfacePanel from '../ui/SurfacePanel';
import ChecklistHistoryPanel from './ChecklistHistoryPanel';
import { classNames } from '../ui/classNames';
import { formatCnpj, formatNumber, normalizeText } from '../../lib/formatters';
import {
  isPastCompetence,
  previousCompetence,
  reminderGroupSignature,
  selectRetroactiveReminderGroups,
} from '../../lib/checklist-reminder-period';
import {
  CHECKLIST_STATUS,
  listarChecklistClienteItens,
  listarChecklistClienteItensPersonalizados,
  listarChecklistContatos,
  listarChecklistEnvios,
  listarChecklistItens,
  listarChecklistPendencias,
  listarChecklistResumo,
  listarChecklistStatus,
  listarChecklistStatusPersonalizados,
  enviarChecklistLembretes,
  excluirChecklistItem,
  excluirChecklistClienteItemPersonalizado,
  salvarChecklistClienteItens,
  salvarChecklistClienteItemPersonalizado,
  salvarChecklistContato,
  salvarChecklistItem,
  salvarChecklistStatus,
  salvarChecklistStatusPersonalizado,
} from '../../services/checklist.service';
import { gerarUrlPublicaAssinaturaResponsavel } from '../../services/assinaturas-responsaveis.service';

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

const SHORT_MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const STATUS_OPTIONS = [
  {
    value: CHECKLIST_STATUS.PENDENTE,
    label: 'Pendente',
    shortLabel: 'Pendente',
    tone: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200',
  },
  {
    value: CHECKLIST_STATUS.OK,
    label: 'Recebido',
    shortLabel: 'OK',
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200',
  },
  {
    value: CHECKLIST_STATUS.NA,
    label: 'Não aplicável',
    shortLabel: 'N/A',
    tone: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200',
  },
  {
    value: CHECKLIST_STATUS.ERP,
    label: 'ERP',
    shortLabel: 'ERP',
    tone: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200',
  },
];

const STATUS_BY_VALUE = Object.fromEntries(STATUS_OPTIONS.map((status) => [status.value, status]));
const STATUS_CYCLE = STATUS_OPTIONS.map((status) => status.value);

function getNextChecklistStatus(status) {
  const index = STATUS_CYCLE.indexOf(status);
  return index < 0 ? STATUS_CYCLE[0] : STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length];
}

const CATALOG_PREVIEW_LIMIT = 6;
const CLIENT_CATALOG_PREVIEW_LIMIT = 4;
const CLIENT_LIST_PAGE_SIZE = 5;

const CHECKLIST_QUICK_FILTERS = [
  { value: 'todos', label: 'Todos', description: 'Carteira filtrada' },
  { value: 'pendencias', label: 'Com pendências', description: 'Itens em aberto' },
  { value: 'concluidos', label: 'Concluídos', description: 'Sem pendências' },
  { value: 'sem_checklist', label: 'Sem checklist', description: 'Sem itens vinculados' },
  { value: 'sem_contato', label: 'Sem contato salvo', description: 'Sem e-mail de lembrete' },
];

const CATALOG_QUICK_FILTERS = [
  { value: 'todos', label: 'Todos', description: 'Carteira filtrada' },
  { value: 'com_checklist', label: 'Com checklist', description: 'Itens vinculados' },
  { value: 'sem_checklist', label: 'Sem checklist', description: 'Sem itens vinculados' },
];

const CHECKLIST_VIEW_OPTIONS = [
  {
    value: 'checklist',
    label: 'Acompanhamento dos documentos',
    icon: ListChecks,
  },
  {
    value: 'catalog',
    label: 'Cadastro de documentos',
    icon: ClipboardCheck,
  },
  {
    value: 'history',
    label: 'Histórico de envios',
    icon: History,
  },
];

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

function getClientResponsibleSignature(client, responsavelCatalogo = []) {
  const responsavelNome = getResponsavel(client);
  const hasResponsavelInformado = normalizeText(responsavelNome) !== normalizeText('Não informado');
  const responsavelAssinatura = hasResponsavelInformado
    ? responsavelCatalogo.find(
      (item) => normalizeText(item?.valor) === normalizeText(responsavelNome),
    ) ?? null
    : null;
  const assinaturaUrl = responsavelAssinatura?.assinatura_email_path
    ? gerarUrlPublicaAssinaturaResponsavel(responsavelAssinatura.assinatura_email_path)
    : '';

  return {
    nome: responsavelAssinatura?.valor || (hasResponsavelInformado ? responsavelNome : ''),
    url: assinaturaUrl,
  };
}

function buildStatusMap(statusRows = [], key = 'item_id') {
  return Object.fromEntries(statusRows.map((row) => [row[key], row]).filter(([itemId]) => Boolean(itemId)));
}

function summarizeClientDetail(detail) {
  const statuses = [
    ...(detail.itens ?? []).map((item) => detail.statusByItem?.[item.item_id || item.item?.id]?.status),
    ...(detail.itensPersonalizados ?? []).map((item) => detail.statusPersonalizadoByItem?.[item.id]?.status),
  ];
  const totalItens = statuses.length;
  const qtdOk = statuses.filter((status) => status === CHECKLIST_STATUS.OK).length;
  const qtdNaoAplicavel = statuses.filter((status) => status === CHECKLIST_STATUS.NA).length;
  const qtdErp = statuses.filter((status) => status === CHECKLIST_STATUS.ERP).length;
  const qtdConcluidos = qtdOk + qtdNaoAplicavel + qtdErp;

  return {
    total_itens: totalItens,
    qtd_ok: qtdOk,
    qtd_nao_aplicavel: qtdNaoAplicavel,
    qtd_erp: qtdErp,
    qtd_pendentes: totalItens - qtdConcluidos,
    percentual_concluido: totalItens ? Math.round((qtdConcluidos / totalItens) * 10000) / 100 : 0,
  };
}

function getCompletionTone(percentual) {
  if (percentual >= 100) return 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200';
  if (percentual >= 50) return 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200';
  return 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200';
}

function useChecklistFloatingDropdown(open, containerRef) {
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState(null);

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }

    function updatePosition() {
      if (typeof window === 'undefined') return;
      const trigger = containerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 6;
      const menuWidth = Math.max(rect.width, 220);
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
      );
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const spaceAbove = rect.top - viewportPadding;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const availableSpace = openUp ? spaceAbove : spaceBelow;
      const maxHeight = Math.min(256, Math.max(144, availableSpace - gap));
      const top = openUp
        ? Math.max(viewportPadding, rect.top - maxHeight - gap)
        : Math.min(rect.bottom + gap, window.innerHeight - viewportPadding - maxHeight);

      setMenuStyle({
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        width: `${menuWidth}px`,
        maxHeight: `${maxHeight}px`,
        zIndex: 9999,
      });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, containerRef]);

  return { menuRef, menuStyle };
}

function ChecklistDropdownSelect({
  label,
  value,
  options,
  onChange,
  includeBlank = true,
  emptyLabel = 'Todos',
  searchable = true,
  searchPlaceholder = 'Pesquisar opção',
}) {
  const [open, setOpen] = useState(false);
  const [optionSearch, setOptionSearch] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const { menuRef, menuStyle } = useChecklistFloatingDropdown(open, containerRef);
  const mappedOptions = options.map((option) => (
    typeof option === 'string' || typeof option === 'number'
      ? { value: option, label: String(option) }
      : option
  ));
  const normalizedOptions = [
    ...(includeBlank ? [{ value: '', label: emptyLabel }] : []),
    ...mappedOptions,
  ];
  const normalizedSearch = normalizeText(optionSearch);
  const filteredOptions = normalizedSearch
    ? mappedOptions.filter((option) => normalizeText(`${option.label} ${option.value}`).includes(normalizedSearch))
    : mappedOptions;
  const visibleOptions = normalizedSearch
    ? [
      ...(includeBlank ? [{ value: '', label: emptyLabel }] : []),
      ...filteredOptions,
    ]
    : normalizedOptions;
  const firstFilteredOption = normalizedSearch ? filteredOptions[0] : null;
  const selectedOption = normalizedOptions.find((option) => String(option.value) === String(value));
  const selectedLabel = selectedOption?.label ?? emptyLabel;
  const showSearch = searchable && mappedOptions.length > 0;

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, menuRef]);

  useEffect(() => {
    if (!open) {
      setOptionSearch('');
      return undefined;
    }

    if (!showSearch) return undefined;

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open, showSearch]);

  function handleSelect(nextValue) {
    onChange(nextValue);
    setOptionSearch('');
    setOpen(false);
  }

  const dropdownMenu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        role="listbox"
        style={menuStyle ?? { visibility: 'hidden' }}
        className="dropdown-menu-shell overflow-soft normal-case ring-1 ring-slate-900/5 dark:ring-white/5"
      >
        {showSearch ? (
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-500 focus-within:border-brand-blue focus-within:ring-4 focus-within:ring-brand-blue/10 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400">
              <Search size={14} className="shrink-0" aria-hidden="true" />
              <input
                ref={searchInputRef}
                value={optionSearch}
                onChange={(event) => setOptionSearch(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    setOpen(false);
                    return;
                  }

                  if (event.key === 'Enter' && firstFilteredOption) {
                    event.preventDefault();
                    event.stopPropagation();
                    handleSelect(firstFilteredOption.value);
                  }
                }}
                placeholder={searchPlaceholder}
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold normal-case text-slate-800 outline-none placeholder:text-slate-400 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
          </div>
        ) : null}

        {visibleOptions.map((option) => {
          const selected = String(option.value) === String(value);
          return (
            <button
              key={`${option.value}-${option.label}`}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={(event) => {
                event.stopPropagation();
                handleSelect(option.value);
              }}
              className={`dropdown-option ${selected ? 'dropdown-option-selected' : ''}`}
            >
              <span className="truncate">{option.label}</span>
              {selected ? <Check size={15} className="shrink-0" aria-hidden="true" /> : null}
            </button>
          );
        })}

        {normalizedSearch && visibleOptions.length === (includeBlank ? 1 : 0) ? (
          <div className="px-3 py-3 text-sm font-semibold text-slate-500 dark:text-gray-400">
            Nenhuma opção encontrada
          </div>
        ) : null}
      </div>,
      document.body,
    )
    : null;

  return (
    <div ref={containerRef} className="relative text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
      <span>{label}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="select-shell mt-2 flex items-center justify-between gap-2 text-left normal-case"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {dropdownMenu}
    </div>
  );
}

function getMonthLabel(mes) {
  return MONTH_OPTIONS.find((month) => month.value === Number(mes))?.label ?? String(mes).padStart(2, '0');
}

function isValidEmailList(value) {
  const emails = splitEmails(value);

  if (!emails.length) return true;
  return emails.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function splitEmails(value) {
  return String(value ?? '')
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildReminderSubject(client, ano, mes) {
  return `Checklist de documentos - ${getMonthLabel(mes)}/${ano} - ${getClientName(client)}`;
}

function buildReminderText(pendencias, assinaturaNome = '') {
  const itens = pendencias.map((pendencia, index) => `• ${index + 1}) ${pendencia.item_descricao}`).join('\n');
  return [
    'Olá! Tudo bem?',
    '',
    'Segue lembrete das documentações pendentes para fechamento contábil do período:',
    '',
    itens,
    '',
    'Qualquer dúvida, estamos à disposição.',
    '',
    'Por favor, confirme o recebimento deste e-mail.',
    '',
    'Atenciosamente,',
    '',
    assinaturaNome || 'F12 Contabilidade',
  ].join('\n');
}

function createReminderIdempotencyKey() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildReminderHtml(pendencias, assinaturaUrl = '', assinaturaNome = '') {
  const itens = pendencias
    .map((pendencia, index) => `<li>${index + 1}) ${escapeHtml(pendencia.item_descricao)}</li>`)
    .join('');
  const assinaturaHtml = assinaturaUrl
    ? `<div style="margin-top:18px;"><img src="${escapeHtml(assinaturaUrl)}" alt="${escapeHtml(assinaturaNome || 'Assinatura digital')}" style="max-width:520px;width:100%;height:auto;display:block;border:0;" /></div>`
    : `<p>${escapeHtml(assinaturaNome || 'F12 Contabilidade')}</p>`;

  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <p>Olá! Tudo bem?</p>
      <p>Segue lembrete das documentações pendentes para fechamento contábil do período:</p>
      <ul>${itens}</ul>
      <p><strong>Qualquer dúvida, estamos à disposição.</strong></p>
      <p><strong>Por favor, confirme o recebimento deste e-mail.</strong></p>
      <p>Atenciosamente,</p>
      ${assinaturaHtml}
    </div>
  `;
}

function buildAnnualReminderSubject(client, year, groups) {
  const firstMonth = getMonthLabel(groups[0].month);
  const lastMonth = getMonthLabel(groups[groups.length - 1].month);
  const period = groups.length === 1 ? `${firstMonth}/${year}` : `${firstMonth} até ${lastMonth}/${year}`;
  return `Lembrete Contábil - ${period} - ${getClientName(client)}`;
}

function buildAnnualReminderText(groups, year, assinaturaNome = '') {
  const sections = groups.map(({ month, pendingItems }) => [
    `${getMonthLabel(month)}/${year}:`,
    ...pendingItems.map((item, index) => `• ${index + 1}) ${item.descricao}`),
  ].join('\n')).join('\n\n');
  return [
    'Olá! Tudo bem?',
    '',
    'Segue lembrete das documentações pendentes para fechamento contábil do período:',
    '',
    sections,
    '',
    'Qualquer dúvida, estamos à disposição.',
    '',
    'Por favor, confirme o recebimento deste e-mail.',
    '',
    'Atenciosamente,',
    '',
    assinaturaNome || 'F12 Contabilidade',
  ].join('\n');
}

function buildAnnualReminderHtml(groups, year, assinaturaUrl = '', assinaturaNome = '') {
  const sections = groups.map(({ month, pendingItems }) => `
    <h3 style="margin:20px 0 6px;font-size:15px;">${escapeHtml(getMonthLabel(month))}/${year}</h3>
    <ul>${pendingItems.map((item, index) => `<li>${index + 1}) ${escapeHtml(item.descricao)}</li>`).join('')}</ul>
  `).join('');
  const assinaturaHtml = assinaturaUrl
    ? `<div style="margin-top:18px;"><img src="${escapeHtml(assinaturaUrl)}" alt="${escapeHtml(assinaturaNome || 'Assinatura digital')}" style="max-width:520px;width:100%;height:auto;display:block;border:0;" /></div>`
    : `<p>${escapeHtml(assinaturaNome || 'F12 Contabilidade')}</p>`;
  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <p>Olá! Tudo bem?</p>
      <p>Segue lembrete das documentações pendentes para fechamento contábil do período:</p>
      ${sections}
      <p><strong>Qualquer dúvida, estamos à disposição.</strong></p>
      <p><strong>Por favor, confirme o recebimento deste e-mail.</strong></p>
      <p>Atenciosamente,</p>
      ${assinaturaHtml}
    </div>
  `;
}

function ClientYearOverview({ client, items, year, monthFilter, yearOptions, currentCompetence, open, onToggle, onYearChange, onMonthFilterChange, onStatusChange, onSummaryChange }) {
  const clientId = client?.id;
  const [statusRows, setStatusRows] = useState([]);
  const [personalStatusRows, setPersonalStatusRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedOverview, setLoadedOverview] = useState(null);
  const [savingCellKey, setSavingCellKey] = useState('');
  const [showAnnualPreview, setShowAnnualPreview] = useState(false);
  const saveInFlightRef = useRef(false);
  const selectedClientRef = useRef(clientId);
  selectedClientRef.current = clientId;
  const selectedYearRef = useRef(year);
  selectedYearRef.current = year;

  useEffect(() => {
    setShowAnnualPreview(false);
  }, [clientId]);

  async function advanceStatus(item, month, currentStatus) {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    const selectedYear = year;
    const selectedClientId = clientId;
    const nextStatus = getNextChecklistStatus(currentStatus);
    const isPersonalizado = item.tipo === 'personalizado';
    const updateRows = (rows, row) => [
      ...rows.filter((current) => (isPersonalizado ? current.item_personalizado_id : current.item_id) !== item.id || current.mes !== month),
      ...(row ? [row] : []),
    ];
    const previousRow = (isPersonalizado ? personalStatusRows : statusRows).find((row) =>
      (isPersonalizado ? row.item_personalizado_id : row.item_id) === item.id && row.mes === month
    );
    const setRows = isPersonalizado ? setPersonalStatusRows : setStatusRows;
    setSavingCellKey(`${item.key}:${month}`);
    setRows((rows) => updateRows(rows, {
      ...(previousRow ?? {}),
      [isPersonalizado ? 'item_personalizado_id' : 'item_id']: item.id,
      ano: selectedYear,
      mes: month,
      status: nextStatus,
    }));
    try {
      const saved = await onStatusChange(client, item.vinculo, nextStatus, { ano: selectedYear, mes: month });
      if (selectedYearRef.current === selectedYear && selectedClientRef.current === selectedClientId) {
        setRows((rows) => updateRows(rows, saved || previousRow));
      }
    } catch (error) {
      if (selectedYearRef.current === selectedYear && selectedClientRef.current === selectedClientId) {
        setRows((rows) => updateRows(rows, previousRow));
      }
      console.error('[checklist-status]', error);
    } finally {
      saveInFlightRef.current = false;
      setSavingCellKey('');
    }
  }

  useEffect(() => {
    if (!open || !clientId) return undefined;

    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      listarChecklistStatus({ clienteId: clientId, ano: year }),
      listarChecklistStatusPersonalizados({ clienteId: clientId, ano: year }),
    ]).then(([standard, personal]) => {
      if (!active) return;
      setStatusRows(standard);
      setPersonalStatusRows(personal);
      setLoadedOverview({ clientId, year });
    }).catch((err) => {
      if (active) setError(err instanceof Error ? err.message : 'Não foi possível carregar a visão anual.');
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [clientId, open, reloadKey, year]);

  const statusByItemAndMonth = useMemo(() => {
    const rows = [
      ...statusRows.map((row) => [`catalogo:${row.item_id}:${row.mes}`, row.status]),
      ...personalStatusRows.map((row) => [`personalizado:${row.item_personalizado_id}:${row.mes}`, row.status]),
    ];
    return new Map(rows);
  }, [personalStatusRows, statusRows]);

  const currentMonthIndex = currentCompetence.ano * 12 + currentCompetence.mes;
  const recordedMonths = new Set([...statusRows, ...personalStatusRows].map((row) => row.mes));
  function isVisibleMonth(month) {
    const monthIndex = year * 12 + month;
    return recordedMonths.has(month) || (monthIndex <= currentMonthIndex && monthIndex >= currentMonthIndex - 12);
  }
  function getYearStatus(item, month) {
    const monthIndex = year * 12 + month;
    const recordedStatus = statusByItemAndMonth.get(`${item.tipo}:${item.id}:${month}`);
    if (recordedStatus) return recordedStatus;
    return monthIndex <= currentMonthIndex && monthIndex >= currentMonthIndex - 12 ? CHECKLIST_STATUS.PENDENTE : null;
  }
  const pendingByMonth = Object.fromEntries(MONTH_OPTIONS.map(({ value }) => [
    value,
    items.filter((item) => getYearStatus(item, value) === CHECKLIST_STATUS.PENDENTE).length,
  ]));
  const annualPendingGroups = useMemo(() => MONTH_OPTIONS.map(({ value, label }) => ({
    month: value,
    label,
    pendingItems: items.filter((item) => getYearStatus(item, value) === CHECKLIST_STATUS.PENDENTE),
  })).filter((group) => group.pendingItems.length > 0), [currentMonthIndex, items, statusByItemAndMonth, year]);
  const retroactivePendingGroups = selectRetroactiveReminderGroups(annualPendingGroups, year, 'todos', currentCompetence);
  const retroactivePendingCount = retroactivePendingGroups.reduce((total, group) => total + group.pendingItems.length, 0);
  const lastReminderCompetence = previousCompetence(currentCompetence);
  const visibleMonths = monthFilter === 'todos'
    ? MONTH_OPTIONS
    : MONTH_OPTIONS.filter(({ value }) => value === Number(monthFilter));
  const visiblePending = visibleMonths.reduce((sum, { value }) => sum + pendingByMonth[value], 0);
  const pendingPeriod = monthFilter === 'todos' ? String(year) : `${getMonthLabel(Number(monthFilter))}/${year}`;
  const assessedStatuses = visibleMonths.flatMap(({ value }) => items
    .map((item) => getYearStatus(item, value))
    .filter(Boolean));
  const assessedCount = assessedStatuses.length;
  const completedCount = assessedStatuses.filter((status) => status !== CHECKLIST_STATUS.PENDENTE).length;
  const completionPercent = assessedCount ? Math.round((completedCount / assessedCount) * 10000) / 100 : null;
  const summaryReady = loadedOverview?.clientId === clientId && loadedOverview?.year === year && !loading && !error;

  useEffect(() => {
    if (!clientId) return;
    onSummaryChange(clientId, {
      year,
      monthFilter,
      periodLabel: monthFilter === 'todos' ? String(year) : `${SHORT_MONTH_LABELS[Number(monthFilter) - 1]}/${year}`,
      total_itens: items.length,
      total_avaliacoes: summaryReady ? assessedCount : 0,
      qtd_pendentes: summaryReady ? visiblePending : 0,
      pendingGroups: summaryReady ? annualPendingGroups : [],
      percentual_concluido: summaryReady ? completionPercent : null,
      loading: !summaryReady && !error,
      error: Boolean(error),
    });
  }, [annualPendingGroups, assessedCount, clientId, completionPercent, error, items.length, monthFilter, onSummaryChange, summaryReady, visiblePending, year]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-200">
            <CalendarDays size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-black text-slate-900 dark:text-white">Acompanhamento dos documentos</p>
          </div>
        </div>
        <ActionButton type="button" size="sm" variant="subtle" onClick={onToggle} aria-expanded={open}>
          {open ? 'Ocultar acompanhamento' : 'Mostrar acompanhamento'}
          <ChevronDown size={16} className={classNames('transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </ActionButton>
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-[180px_140px]">
              <ChecklistDropdownSelect
                label="Mostrar"
                value={monthFilter}
                options={[{ value: 'todos', label: 'Todos os meses' }, ...MONTH_OPTIONS]}
                onChange={onMonthFilterChange}
                includeBlank={false}
                searchable={false}
              />
              <ChecklistDropdownSelect
                label="Ano"
                value={year}
                options={yearOptions.map((option) => ({ value: option, label: String(option) }))}
                onChange={(value) => onYearChange(Number(value))}
                includeBlank={false}
              />
            </div>
            {summaryReady ? (
              <StatusBadge toneClass="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                {assessedCount ? `${formatNumber(visiblePending)} pendência(s) em ${pendingPeriod}` : `Sem status em ${pendingPeriod}`}
              </StatusBadge>
            ) : null}
          </div>

          {!summaryReady && !error ? <p className="text-sm font-semibold text-slate-500 dark:text-gray-400">Carregando status do ano...</p> : null}
          {error ? (
            <AlertBanner tone="danger" title="Não foi possível carregar a visão anual">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{error}</span>
                <ActionButton type="button" size="sm" onClick={() => setReloadKey((current) => current + 1)}>Tentar novamente</ActionButton>
              </div>
            </AlertBanner>
          ) : null}

          {summaryReady ? (
            <>
              <DataTableShell
                headers={['Documento', ...visibleMonths.map(({ value }) => SHORT_MONTH_LABELS[value - 1])]}
                minWidth={monthFilter === 'todos' ? 'min-w-[1440px]' : 'min-w-[400px]'}
                tableClassName={classNames('checklist-year-table', monthFilter !== 'todos' && 'checklist-year-table-single')}
                hasRows={items.length > 0}
              >
                <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                  {items.map((item) => (
                    <tr key={item.key}>
                      <td className="table-cell table-cell-compact">
                        <p className="truncate font-bold text-slate-900 dark:text-white" title={item.descricao}>{item.descricao}</p>
                        {item.tipo === 'personalizado' ? <span className="text-[10px] font-bold text-blue-700 dark:text-blue-200">Específico deste cliente</span> : null}
                      </td>
                      {visibleMonths.map(({ value }) => {
                        const status = getYearStatus(item, value);
                        const statusMeta = status ? STATUS_BY_VALUE[status] : null;
                        const nextStatus = getNextChecklistStatus(status);
                        const nextStatusLabel = STATUS_BY_VALUE[nextStatus].label;
                        const cellSaving = savingCellKey === `${item.key}:${value}`;
                        return (
                          <td key={value} className="table-cell table-cell-compact text-center">
                            <button
                                type="button"
                                aria-label={`${item.descricao} em ${getMonthLabel(value)}/${year}. Status: ${statusMeta?.label ?? 'sem registro'}. Clique para ${nextStatusLabel}.`}
                                aria-busy={cellSaving}
                                disabled={Boolean(savingCellKey)}
                                onClick={() => advanceStatus(item, value, status)}
                                className={classNames(
                                  'inline-flex min-w-[56px] justify-center rounded-md border px-1.5 py-1 text-[11px] font-black transition hover:ring-2 hover:ring-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60',
                                  statusMeta?.tone ?? 'border-slate-200 text-slate-400 dark:border-gray-700 dark:text-gray-500',
                                )}
                              >
                                {statusMeta?.shortLabel ?? '—'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {items.length ? (
                    <tr className="bg-slate-50/80 dark:bg-gray-900/55">
                      <th scope="row" className="table-cell table-cell-compact text-left text-xs font-black text-slate-700 dark:text-gray-200">Pendências por mês</th>
                      {visibleMonths.map(({ value }) => (
                        <td key={value} className="table-cell table-cell-compact text-center text-xs font-black text-amber-700 dark:text-amber-200">
                          {isVisibleMonth(value) ? formatNumber(pendingByMonth[value]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </tbody>
              </DataTableShell>
              {monthFilter === 'todos' && items.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <ActionButton type="button" size="sm" variant="subtle" onClick={() => setShowAnnualPreview((current) => !current)} aria-expanded={showAnnualPreview}>
                      {showAnnualPreview ? 'Ocultar prévia das pendências' : 'Visualizar prévia das pendências'}
                      <ChevronDown size={16} className={classNames('transition-transform', showAnnualPreview && 'rotate-180')} aria-hidden="true" />
                    </ActionButton>
                  </div>
                  {showAnnualPreview ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-gray-700 dark:bg-gray-950/35">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white">Prévia das pendências do ano</p>
                        </div>
                        <StatusBadge toneClass="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
                          {formatNumber(retroactivePendingCount)} pendência(s) · {formatNumber(retroactivePendingGroups.length)} mês(es)
                        </StatusBadge>
                      </div>
                      {retroactivePendingGroups.length > 0 ? (
                        <div className="mt-4 grid gap-2 lg:grid-cols-2">
                          {retroactivePendingGroups.map(({ month, label, pendingItems }) => (
                            <details key={month} className="rounded-xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900/70">
                              <summary className="cursor-pointer px-3 py-2.5 text-sm font-bold text-slate-800 dark:text-gray-100">
                                {label}/{year} · {formatNumber(pendingItems.length)} pendência(s)
                              </summary>
                              <ul className="space-y-2 border-t border-slate-200 px-3 py-3 text-xs font-semibold text-slate-700 dark:border-gray-700 dark:text-gray-200">
                                {pendingItems.map((item) => (
                                  <li key={item.key} className="flex gap-2">
                                    <span className="text-amber-600 dark:text-amber-300" aria-hidden="true">•</span>
                                    <span>
                                      {item.descricao}
                                      {item.tipo === 'personalizado' ? <span className="ml-1 text-blue-700 dark:text-blue-200">· Específico deste cliente</span> : null}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-gray-400">Nenhuma pendência em competências anteriores ao mês atual neste ano.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function getNextCatalogOrder(items = []) {
  const maxOrder = items.reduce((max, item) => Math.max(max, toNumber(item?.ordem)), 0);
  return maxOrder + 10;
}


function ChecklistBatchApplyModal({
  open,
  filteredCount,
  targetCount,
  catalogCount,
  items = [],
  applying,
  catalogLoading,
  onApply,
  onClose,
}) {
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  useEffect(() => {
    if (open) {
      setSelectedItemIds(items.map((item) => item.id).filter(Boolean));
    }
  }, [open, items]);

  const selectedSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const selectedItems = useMemo(() => items.filter((item) => selectedSet.has(item.id)), [items, selectedSet]);
  const disabled = applying || catalogLoading || targetCount === 0 || selectedItems.length === 0;

  function toggleItem(itemId) {
    setSelectedItemIds((current) => (
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    ));
  }

  function selectAllItems() {
    setSelectedItemIds(items.map((item) => item.id).filter(Boolean));
  }

  function clearSelectedItems() {
    setSelectedItemIds([]);
  }

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !applying) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-apply-title"
        className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-950"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="batch-apply-title" className="text-lg font-black text-slate-900 dark:text-white">Aplicação em lote</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500 dark:text-gray-400">
              Use os itens ativos do catálogo como checklist padrão para clientes que ainda não possuem itens vinculados.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:border-gray-700 dark:hover:bg-gray-900 dark:hover:text-white"
            aria-label="Fechar aplicação em lote"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/45">
          <div className="flex flex-wrap gap-2">
            <StatusBadge toneClass="border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200" size="md">
              {formatNumber(targetCount)} sem checklist
            </StatusBadge>
            <StatusBadge toneClass="border-slate-300 bg-white text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" size="md">
              {formatNumber(filteredCount)} cliente(s) filtrado(s)
            </StatusBadge>
            <StatusBadge toneClass="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200" size="md">
              {formatNumber(selectedItems.length)} de {formatNumber(catalogCount)} item(ns) selecionado(s)
            </StatusBadge>
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-gray-300">
            {targetCount > 0
              ? `Serão considerados apenas os ${formatNumber(targetCount)} cliente(s) filtrado(s) que estão sem checklist. Clientes já configurados não serão alterados.`
              : 'Nenhum cliente filtrado está sem checklist no momento. Se quiser aplicar o padrão para outro grupo, ajuste os filtros antes de abrir esta ação.'}
          </p>
        </div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/45">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black text-slate-900 dark:text-white">Itens que serão aplicados</p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-gray-400">
                Selecione quais documentos do catálogo entram na aplicação em lote.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <StatusBadge toneClass="border-slate-300 bg-white text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                {formatNumber(selectedItems.length)} de {formatNumber(catalogCount)} selecionado(s)
              </StatusBadge>
              <ActionButton type="button" size="sm" variant="subtle" onClick={selectAllItems} disabled={applying || !items.length || selectedItems.length === items.length}>
                Marcar todos
              </ActionButton>
              <ActionButton type="button" size="sm" variant="subtle" onClick={clearSelectedItems} disabled={applying || selectedItems.length === 0}>
                Limpar seleção
              </ActionButton>
            </div>
          </div>

          {selectedItems.length === 0 ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/75 p-3 text-sm font-semibold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
              Selecione pelo menos um item do catálogo para liberar a aplicação em lote.
            </div>
          ) : null}

          <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {items.map((item) => {
              const checked = selectedSet.has(item.id);
              return (
                <label
                  key={item.id}
                  className={classNames(
                    'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition',
                    checked
                      ? 'border-blue-400/70 bg-blue-50 text-blue-900 dark:border-blue-400/40 dark:bg-blue-500/10 dark:text-blue-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-gray-800 dark:bg-gray-950/30 dark:text-gray-200 dark:hover:border-blue-500/50',
                    applying ? 'pointer-events-none opacity-70' : '',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={applying}
                    onChange={() => toggleItem(item.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="min-w-0 truncate leading-5" title={item.descricao}>{item.descricao}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm font-semibold leading-6 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          Revise os filtros antes de aplicar. A ação usa somente os clientes filtrados na tela e não duplica itens em clientes já configurados.
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ActionButton type="button" variant="subtle" onClick={onClose} disabled={applying}>
            Cancelar
          </ActionButton>
          <ActionButton type="button" variant="primary" onClick={() => onApply(selectedItems)} disabled={disabled}>
            {applying ? (
              <RefreshCcw size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <ClipboardCheck size={16} aria-hidden="true" />
            )}
            {applying ? 'Aplicando...' : 'Aplicar checklist padrão'}
          </ActionButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}


function ChecklistCatalogManager({
  items,
  loading,
  error,
  form,
  busyId,
  onFormChange,
  onSubmit,
  onEdit,
  onCancel,
  onDelete,
  onRefresh,
  onOpenBatchApply,
}) {
  const [showAllCatalogItems, setShowAllCatalogItems] = useState(false);
  const editing = Boolean(form.id);
  const saving = busyId === 'new' || (editing && busyId === form.id);
  const hasHiddenCatalogItems = items.length > CATALOG_PREVIEW_LIMIT;
  const visibleCatalogItems = showAllCatalogItems ? items : items.slice(0, CATALOG_PREVIEW_LIMIT);
  const hiddenCatalogItemsCount = Math.max(items.length - CATALOG_PREVIEW_LIMIT, 0);

  useEffect(() => {
    if (!hasHiddenCatalogItems && showAllCatalogItems) {
      setShowAllCatalogItems(false);
    }
  }, [hasHiddenCatalogItems, showAllCatalogItems]);

  return (
    <SurfacePanel
      title="Catálogo de documentos"
      right={(
        <div className="flex flex-wrap gap-2">
          <ActionButton type="button" variant="secondary" onClick={onOpenBatchApply}>
            <ClipboardCheck size={16} aria-hidden="true" />
            Aplicação em lote
          </ActionButton>
          <ActionButton type="button" variant="secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            Atualizar catálogo
          </ActionButton>
        </div>
      )}
      bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6"
    >
      <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/45">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_auto] lg:items-end">
          <label className="space-y-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
            {editing ? 'Editar documento' : 'Novo documento'}
            <input
              type="text"
              value={form.descricao}
              onChange={(event) => onFormChange({ ...form, descricao: event.target.value })}
              placeholder="Ex.: Comprovante de aluguel"
              className="input-shell normal-case"
              disabled={saving}
            />
          </label>

          <label className="space-y-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
            Ordem
            <input
              type="number"
              value={form.ordem}
              onChange={(event) => onFormChange({ ...form, ordem: event.target.value })}
              placeholder="10"
              className="input-shell normal-case"
              disabled={saving}
            />
          </label>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {editing ? (
              <ActionButton type="button" size="sm" variant="subtle" onClick={onCancel} disabled={saving}>
                Cancelar
              </ActionButton>
            ) : null}
            <ActionButton type="submit" size="sm" variant="primary" disabled={saving}>
              {saving ? 'Salvando...' : editing ? 'Salvar edição' : 'Adicionar item'}
            </ActionButton>
          </div>
        </div>
      </form>

      {error ? (
        <div className="mt-4">
          <AlertBanner tone="danger" title="Erro ao carregar catálogo">
            {error}
          </AlertBanner>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black text-slate-900 dark:text-white">Itens ativos do catálogo</p>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-gray-400">
              {formatNumber(items.length)} documento(s) ativo(s), ordenados por prioridade.
              {hasHiddenCatalogItems
                ? ` Mostrando ${formatNumber(visibleCatalogItems.length)} de ${formatNumber(items.length)}.`
                : ''}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500 dark:border-gray-800 dark:bg-gray-950/30 dark:text-gray-300">
            Carregando catálogo de documentos...
          </div>
        ) : null}

        {!loading && !items.length ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-500 dark:border-gray-700 dark:bg-gray-950/30 dark:text-gray-300">
            Nenhum item ativo foi encontrado. Cadastre o primeiro documento para montar os checklists.
          </div>
        ) : null}

        {!loading && items.length ? (
          <>
            <div className="mt-4 grid gap-2 xl:grid-cols-2">
              {visibleCatalogItems.map((item) => {
              const itemBusy = busyId === item.id;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-950/30"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                      {formatNumber(item.ordem)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900 dark:text-white" title={item.descricao}>{item.descricao}</p>
                      <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">Ativo</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    <ActionButton type="button" size="sm" variant="subtle" onClick={() => onEdit(item)} disabled={Boolean(busyId)}>
                      Editar
                    </ActionButton>
                    <ActionButton type="button" size="sm" variant="danger" onClick={() => onDelete(item)} disabled={Boolean(busyId)}>
                      {itemBusy ? 'Inativando...' : 'Inativar'}
                    </ActionButton>
                  </div>
                </div>
              );
              })}
            </div>

            {hasHiddenCatalogItems ? (
              <div className="mt-4 flex justify-end">
                <ActionButton
                  type="button"
                  size="sm"
                  variant="subtle"
                  onClick={() => setShowAllCatalogItems((current) => !current)}
                >
                  {showAllCatalogItems ? 'Mostrar menos' : `Mostrar mais (${formatNumber(hiddenCatalogItemsCount)})`}
                  <ChevronDown
                    size={16}
                    className={classNames('transition-transform', showAllCatalogItems ? 'rotate-180' : '')}
                    aria-hidden="true"
                  />
                </ActionButton>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </SurfacePanel>
  );
}

function ChecklistContactReminder({
  client,
  ano,
  mes,
  annualMode,
  overviewYear,
  reminderGroups,
  reminderPreviewReady,
  reminderPeriodEligible,
  lastReminderCompetence,
  signatureName,
  contact,
  savingContactId,
  sendingReminderId,
  statusSaving,
  onSaveContact,
  onSendReminder,
}) {
  const [email, setEmail] = useState('');
  const [cc, setCc] = useState('');
  const [localError, setLocalError] = useState('');
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  useEffect(() => {
    setEmail(contact?.email ?? '');
    setCc(contact?.cc ?? '');
    setLocalError('');
  }, [contact?.email, contact?.cc]);

  const saving = savingContactId === client?.id;
  const sending = sendingReminderId === client?.id;
  const hasEmail = String(email ?? '').trim().length > 0;
  const pendingCount = reminderGroups.reduce((total, group) => total + group.pendingItems.length, 0);
  const lastReminderLabel = `${getMonthLabel(lastReminderCompetence.mes)}/${lastReminderCompetence.ano}`;
  const singleMonthItems = reminderGroups[0]?.pendingItems ?? [];
  const subject = pendingCount > 0
    ? (annualMode ? buildAnnualReminderSubject(client, overviewYear, reminderGroups) : buildReminderSubject(client, ano, mes))
    : '';
  const previewText = annualMode
    ? buildAnnualReminderText(reminderGroups, overviewYear, signatureName)
    : buildReminderText(singleMonthItems.map((item) => ({ item_descricao: item.descricao })), signatureName);

  useEffect(() => {
    setShowEmailPreview(false);
    setIdempotencyKey('');
  }, [ano, mes, annualMode, overviewYear, reminderGroups]);

  function validateContact() {
    if (email && !isValidEmailList(email)) {
      setLocalError('Informe um e-mail principal válido.');
      return false;
    }
    if (cc && !isValidEmailList(cc)) {
      setLocalError('Informe e-mails em cópia válidos, separados por vírgula ou ponto e vírgula.');
      return false;
    }
    setLocalError('');
    return true;
  }

  function handleSave() {
    if (!validateContact()) return;
    onSaveContact(client, { email, cc });
  }

  function handleSend() {
    if (!validateContact()) return;
    if (!hasEmail) {
      setLocalError('Informe e salve o e-mail principal antes de enviar o lembrete.');
      return;
    }
    if (!reminderPreviewReady || !reminderPeriodEligible || statusSaving || pendingCount === 0) return;
    setIdempotencyKey(createReminderIdempotencyKey());
    setShowEmailPreview(true);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-200">
            <Mail size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-slate-900 dark:text-white">Contatos e lembrete manual</p>
              <StatusBadge toneClass="border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">
                {annualMode ? `Ano ${overviewYear} · todos os meses` : `${getMonthLabel(mes)}/${ano}`}
              </StatusBadge>
            </div>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-gray-400">
              {annualMode
                ? `O envio reunirá as pendências de ${formatNumber(reminderGroups.length)} mês(es) de ${overviewYear}, respeitando o limite de ${lastReminderLabel}.`
                : reminderPeriodEligible
                  ? `O envio cobrará os itens pendentes de ${getMonthLabel(mes)}/${ano}, selecionado na tabela acima.`
                  : `A cobrança é retroativa. Selecione um mês até ${lastReminderLabel}.`}
            </p>
          </div>
        </div>
        <StatusBadge toneClass={pendingCount > 0
          ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200'
          : reminderPeriodEligible
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'
            : 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200'}
        >
          {!reminderPreviewReady ? 'Carregando pendências...' : !reminderPeriodEligible ? 'Fora do período de cobrança' : `${formatNumber(pendingCount)} pendência(s)${annualMode ? ' no ano' : ' neste mês'}`}
        </StatusBadge>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <label className="space-y-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
          E-mail principal
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="cliente@empresa.com.br"
            className="input-shell normal-case"
          />
        </label>

        <label className="space-y-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
          Cópia
          <input
            type="text"
            value={cc}
            onChange={(event) => setCc(event.target.value)}
            placeholder="email1@empresa.com.br; email2@empresa.com.br"
            className="input-shell normal-case"
          />
        </label>

        <div className="flex flex-wrap justify-end gap-2 lg:col-span-2">
          <ActionButton type="button" size="sm" variant="secondary" onClick={handleSave} disabled={saving || sending}>
            {saving ? 'Salvando...' : 'Salvar contato'}
          </ActionButton>
          <ActionButton
            type="button"
            size="sm"
            variant="primary"
            onClick={handleSend}
            disabled={saving || sending || statusSaving || !hasEmail || !reminderPreviewReady || !reminderPeriodEligible || pendingCount === 0}
          >
            <Send size={14} aria-hidden="true" />
            {sending ? 'Enviando...' : 'Revisar e enviar'}
          </ActionButton>
        </div>
      </div>

      {localError ? (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {localError}
        </p>
      ) : null}

      {!reminderPreviewReady ? (
        <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-gray-400">Carregando a prévia da tabela antes do envio...</p>
      ) : !reminderPeriodEligible ? (
        <p className="mt-3 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">
          Não é possível enviar lembretes de competências posteriores a {lastReminderLabel}.
        </p>
      ) : pendingCount === 0 ? (
        <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
          Não há pendências para o período selecionado.
        </p>
      ) : null}

      {showEmailPreview && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="checklist-email-preview-title" className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <h3 id="checklist-email-preview-title" className="text-lg font-black text-slate-900 dark:text-white">Revisar lembrete antes do envio</h3>
            <p className="mt-3 text-xs font-bold text-slate-500 dark:text-gray-400">Para: {email}{cc ? ` · Cópia: ${cc}` : ''}</p>
            <p className="mt-2 text-sm font-bold text-slate-800 dark:text-gray-100">Assunto: {subject}</p>
            <pre className="mt-4 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-800 dark:border-gray-700 dark:bg-gray-950/50 dark:text-gray-100">{previewText}</pre>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <ActionButton type="button" variant="subtle" onClick={() => setShowEmailPreview(false)}>Cancelar</ActionButton>
              <ActionButton type="button" variant="primary" disabled={sending || !idempotencyKey} onClick={() => { setShowEmailPreview(false); onSendReminder(client, { email, cc, chaveIdempotencia: idempotencyKey, previewedGroupSignature: reminderGroupSignature(reminderGroups) }); }}>
                <Send size={14} aria-hidden="true" /> Confirmar e enviar
              </ActionButton>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

    </div>
  );
}

function ClientChecklistDetails({
  mode = 'checklist',
  client,
  detail,
  ano,
  mes,
  currentCompetence,
  responsavelCatalogo,
  yearOptions = [],
  contact,
  catalogItems,
  catalogLoading,
  catalogError,
  savingConfigId,
  savingContactId,
  sendingReminderId,
  statusSaving,
  personalItemBusyKey,
  onReload,
  onSaveClientItems,
  onSavePersonalItem,
  onDeletePersonalItem,
  onSaveContact,
  onSendReminder,
  onStatusChange,
  onOverviewSummaryChange,
  overviewSelection,
  overviewSummary,
  onOverviewSelectionChange,
}) {
  const linkedIdsKey = useMemo(
    () => (detail?.itens ?? []).map((vinculo) => vinculo.item_id || vinculo.item?.id).filter(Boolean).join('|'),
    [detail?.itens],
  );
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [showAllClientItems, setShowAllClientItems] = useState(false);
  const [showYearOverview, setShowYearOverview] = useState(true);
  const overviewYear = overviewSelection?.year ?? ano;
  const overviewMonth = overviewSelection?.monthFilter ?? 'todos';
  const annualMode = overviewMonth === 'todos';
  const reminderPeriodEligible = isPastCompetence(overviewYear, annualMode ? 1 : Number(overviewMonth), currentCompetence);
  const lastReminderCompetence = previousCompetence(currentCompetence);
  const reminderPreviewReady = overviewSummary?.year === overviewYear
    && overviewSummary?.monthFilter === overviewMonth
    && !overviewSummary?.loading && !overviewSummary?.error;
  const reminderGroups = useMemo(() => reminderPreviewReady
    ? selectRetroactiveReminderGroups(overviewSummary.pendingGroups ?? [], overviewYear, overviewMonth, currentCompetence)
    : [], [currentCompetence, overviewMonth, overviewSummary?.pendingGroups, overviewYear, reminderPreviewReady]);
  const [showPersonalItemModal, setShowPersonalItemModal] = useState(false);
  const [personalItemDescription, setPersonalItemDescription] = useState('');

  useEffect(() => {
    setSelectedItemIds(linkedIdsKey ? linkedIdsKey.split('|') : []);
  }, [linkedIdsKey]);

  const configuredItems = useMemo(() => {
    const standardItems = (detail?.itens ?? []).map((vinculo) => {
      const item = vinculo.item;
      const itemId = vinculo.item_id || item?.id;
      return {
        key: `catalogo:${itemId}`,
        id: itemId,
        tipo: 'catalogo',
        descricao: item?.descricao || 'Item sem descrição',
        ordem: toNumber(vinculo.ordem),
        criado_em: vinculo.criado_em,
        vinculo,
      };
    }).filter((item) => Boolean(item.id));

    const personalItems = (detail?.itensPersonalizados ?? []).map((item) => ({
      key: `personalizado:${item.id}`,
      id: item.id,
      item_personalizado_id: item.id,
      tipo: 'personalizado',
      descricao: item.descricao || 'Item sem descrição',
      ordem: toNumber(item.ordem),
      criado_em: item.criado_em,
      vinculo: {
        ...item,
        item_tipo: 'personalizado',
        item_personalizado_id: item.id,
      },
    }));

    return [...standardItems, ...personalItems].sort((a, b) => (
      a.ordem - b.ordem || String(a.descricao).localeCompare(String(b.descricao), 'pt-BR')
    ));
  }, [detail?.itens, detail?.itensPersonalizados]);

  const selectedSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const selectedCount = selectedItemIds.length;
  const hasHiddenClientItems = catalogItems.length > CLIENT_CATALOG_PREVIEW_LIMIT;
  const visibleClientCatalogItems = showAllClientItems ? catalogItems : catalogItems.slice(0, CLIENT_CATALOG_PREVIEW_LIMIT);
  const hiddenClientItemsCount = Math.max(catalogItems.length - CLIENT_CATALOG_PREVIEW_LIMIT, 0);
  const personalClientItems = detail?.itensPersonalizados ?? [];
  const hasVisibleClientItems = catalogItems.length > 0 || personalClientItems.length > 0;
  const savingConfig = savingConfigId === client?.id;
  const isCatalogMode = mode === 'catalog';
  const showCatalogConfiguration = isCatalogMode;
  const showOperationalControls = !isCatalogMode;

  useEffect(() => {
    if (!hasHiddenClientItems && showAllClientItems) {
      setShowAllClientItems(false);
    }
  }, [hasHiddenClientItems, showAllClientItems]);

  useEffect(() => {
    setShowAllClientItems(false);
    setShowYearOverview(true);
    setShowPersonalItemModal(false);
    setPersonalItemDescription('');
  }, [client?.id]);

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

  async function handlePersonalItemSubmit(event) {
    event.preventDefault();
    const descricao = personalItemDescription.trim();
    if (!descricao) return;

    const saved = await onSavePersonalItem(client, {
      descricao,
      ordem: (detail?.itensPersonalizados?.length ?? 0) + 1,
    });

    if (saved) {
      setPersonalItemDescription('');
      setShowPersonalItemModal(false);
    }
  }

  const personalItemModal = showPersonalItemModal && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !personalItemBusyKey) {
            setShowPersonalItemModal(false);
          }
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="personal-client-document-title"
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-gray-950"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p id="personal-client-document-title" className="text-base font-black text-slate-900 dark:text-white">Documento específico do cliente</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-gray-400">
                Cadastre um documento exclusivo deste cliente. Ele não entra no cadastro padrão de documentos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPersonalItemModal(false)}
              disabled={Boolean(personalItemBusyKey)}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:border-gray-700 dark:hover:bg-gray-900 dark:hover:text-white"
              aria-label="Fechar"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <form className="mt-4 space-y-4" onSubmit={handlePersonalItemSubmit}>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">Nome do documento</span>
              <input
                type="text"
                value={personalItemDescription}
                onChange={(event) => setPersonalItemDescription(event.target.value)}
                placeholder="Ex.: Relatório específico solicitado para este cliente"
                className="input-shell mt-2 w-full"
                disabled={Boolean(personalItemBusyKey)}
                autoFocus
              />
            </label>

            <div className="flex justify-end gap-2">
              <ActionButton
                type="button"
                size="sm"
                variant="subtle"
                onClick={() => setShowPersonalItemModal(false)}
                disabled={Boolean(personalItemBusyKey)}
              >
                Cancelar
              </ActionButton>
              <ActionButton
                type="submit"
                size="sm"
                variant="primary"
                disabled={!personalItemDescription.trim() || Boolean(personalItemBusyKey)}
              >
                {personalItemBusyKey === `new:${client?.id}` ? 'Salvando...' : 'Adicionar'}
              </ActionButton>
            </div>
          </form>
        </div>
      </div>,
      document.body,
    )
    : null;

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
      {showOperationalControls && configuredItems.length > 0 ? (
        <ClientYearOverview
          client={client}
          items={configuredItems}
          year={overviewYear}
          monthFilter={overviewMonth}
          yearOptions={yearOptions}
          currentCompetence={currentCompetence}
          open={showYearOverview}
          onToggle={() => setShowYearOverview((current) => !current)}
          onYearChange={(year) => onOverviewSelectionChange(client.id, { year, monthFilter: overviewMonth })}
          onMonthFilterChange={(monthFilter) => onOverviewSelectionChange(client.id, { year: overviewYear, monthFilter })}
          onStatusChange={onStatusChange}
          onSummaryChange={onOverviewSummaryChange}
        />
      ) : null}

      <div className={classNames('grid gap-4', showOperationalControls && showCatalogConfiguration ? 'xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]' : '')}>
        {showOperationalControls ? (
          <ChecklistContactReminder
            client={client}
            ano={ano}
            mes={mes}
            annualMode={annualMode}
            overviewYear={overviewYear}
            reminderGroups={reminderGroups}
            reminderPreviewReady={reminderPreviewReady}
            reminderPeriodEligible={reminderPeriodEligible}
            lastReminderCompetence={lastReminderCompetence}
            signatureName={getClientResponsibleSignature(client, responsavelCatalogo).nome}
            contact={contact}
            savingContactId={savingContactId}
            sendingReminderId={sendingReminderId}
            statusSaving={statusSaving}
            onSaveContact={onSaveContact}
            onSendReminder={onSendReminder}
          />
        ) : null}

        {showCatalogConfiguration ? (
        <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200">
                <ListChecks size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 dark:text-white">Itens aplicáveis ao cliente</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-gray-400">
                  Selecione quais documentos entram no checklist deste cliente. A ordem segue o catálogo padrão configurado no Supabase.
                </p>
              </div>
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
                variant="subtle"
                onClick={() => setShowPersonalItemModal(true)}
                disabled={catalogLoading || Boolean(personalItemBusyKey)}
                aria-label="Adicionar documento específico do cliente"
                title="Adicionar documento específico"
                className="!px-3"
              >
                <Plus size={16} aria-hidden="true" />
              </ActionButton>
              <ActionButton
                type="button"
                size="sm"
                variant="primary"
                onClick={() => onSaveClientItems(client, selectedItemIds)}
                disabled={catalogLoading || savingConfig || selectedCount === 0}
              >
                {savingConfig ? 'Salvando...' : selectedCount === 0 ? 'Selecione itens' : 'Salvar itens'}
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

          {!catalogLoading && !catalogError && hasVisibleClientItems ? (
            <>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {visibleClientCatalogItems.map((item) => {
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
                    <span className="min-w-0 truncate leading-5" title={item.descricao}>{item.descricao}</span>
                  </label>
                );
                })}

                {personalClientItems.map((item) => {
                  const busy = personalItemBusyKey === item.id;
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl border border-blue-400/50 bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-950 dark:border-blue-400/35 dark:bg-blue-500/10 dark:text-blue-100"
                    >
                      <input
                        type="checkbox"
                        checked
                        readOnly
                        disabled
                        className="mt-0.5 h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 disabled:opacity-80"
                        aria-label="Documento específico aplicado ao cliente"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate leading-5" title={item.descricao}>{item.descricao}</p>
                        <span className="mt-1 inline-flex rounded-full border border-blue-300/70 bg-white/75 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-700 dark:border-blue-300/30 dark:bg-blue-950/40 dark:text-blue-200">
                          Específico deste cliente
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeletePersonalItem(client, item)}
                        disabled={Boolean(personalItemBusyKey)}
                        className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200 dark:hover:border-red-300/40"
                        title={busy ? 'Removendo...' : 'Remover documento específico'}
                        aria-label={busy ? 'Removendo documento específico' : 'Remover documento específico'}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {hasHiddenClientItems ? (
                <div className="mt-4 flex justify-end">
                  <ActionButton
                    type="button"
                    size="sm"
                    variant="subtle"
                    onClick={() => setShowAllClientItems((current) => !current)}
                  >
                    {showAllClientItems ? 'Mostrar menos' : `Mostrar mais (${formatNumber(hiddenClientItemsCount)})`}
                    <ChevronDown
                      size={16}
                      className={classNames('transition-transform', showAllClientItems ? 'rotate-180' : '')}
                      aria-hidden="true"
                    />
                  </ActionButton>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        ) : null}

      </div>

      {personalItemModal}

      {!configuredItems.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900/45 dark:text-gray-300">
          <div className="flex items-start gap-3">
            <FileQuestion size={20} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            <div>
              <p className="font-black text-slate-800 dark:text-gray-100">Nenhum item vinculado a este cliente.</p>
              <p className="mt-1 font-medium leading-6">
                {isCatalogMode
                  ? 'Selecione os documentos acima e clique em salvar para montar o checklist deste cliente.'
                  : 'Configure os documentos aplicáveis na página Cadastro de documentos para acompanhar pendências deste cliente.'}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ChecklistPage({ clients = [], responsavelCatalogo = [] }) {
  const initialCompetence = useMemo(() => getCurrentCompetence(), []);
  const [currentReminderCompetence, setCurrentReminderCompetence] = useState(initialCompetence);
  const [mes, setMes] = useState(initialCompetence.mes);
  const [ano, setAno] = useState(initialCompetence.ano);
  const [search, setSearch] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [quickFilter, setQuickFilter] = useState('todos');
  const [resumos, setResumos] = useState([]);
  const [loadingResumo, setLoadingResumo] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [expandedClientId, setExpandedClientId] = useState('');
  const [clientCompetences, setClientCompetences] = useState({});
  const [visibleClientLimit, setVisibleClientLimit] = useState(CLIENT_LIST_PAGE_SIZE);
  const [detailsByClient, setDetailsByClient] = useState({});
  const [overviewSummariesByClient, setOverviewSummariesByClient] = useState({});
  const [overviewSelectionsByClient, setOverviewSelectionsByClient] = useState({});
  const resumoRequestId = useRef(0);
  const detailRequestIds = useRef({});
  const statusSavePendingClients = useRef(new Set());
  const [statusSavingClientId, setStatusSavingClientId] = useState('');
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogForm, setCatalogForm] = useState({ id: '', descricao: '', ordem: '' });
  const [catalogBusyId, setCatalogBusyId] = useState('');
  const [savingConfigId, setSavingConfigId] = useState('');
  const [contactsByClient, setContactsByClient] = useState({});
  const [contactsError, setContactsError] = useState('');
  const [savingContactId, setSavingContactId] = useState('');
  const [sendingReminderId, setSendingReminderId] = useState('');
  const [applyingDefaultChecklist, setApplyingDefaultChecklist] = useState(false);
  const [showBatchApplyModal, setShowBatchApplyModal] = useState(false);
  const [personalItemBusyKey, setPersonalItemBusyKey] = useState('');
  const [viewMode, setViewMode] = useState('checklist');
  const isCatalogMode = viewMode === 'catalog';
  const isHistoryMode = viewMode === 'history';
  const quickFilterOptions = isCatalogMode ? CATALOG_QUICK_FILTERS : CHECKLIST_QUICK_FILTERS;

  useEffect(() => {
    function refreshCurrentCompetence() {
      const current = getCurrentCompetence();
      setCurrentReminderCompetence((previous) => (
        previous.ano === current.ano && previous.mes === current.mes ? previous : current
      ));
    }
    const intervalId = window.setInterval(refreshCurrentCompetence, 60_000);
    window.addEventListener('focus', refreshCurrentCompetence);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshCurrentCompetence);
    };
  }, []);

  const handleOverviewSummaryChange = useCallback((clientId, summary) => {
    setOverviewSummariesByClient((current) => {
      const previous = current[clientId];
      if (previous && Object.keys(summary).every((key) => previous[key] === summary[key])) return current;
      return { ...current, [clientId]: summary };
    });
  }, []);

  useEffect(() => {
    setQuickFilter('todos');
    setExpandedClientId('');
    setOverviewSummariesByClient({});
    setOverviewSelectionsByClient({});
  }, [viewMode]);

  useEffect(() => {
    setVisibleClientLimit(CLIENT_LIST_PAGE_SIZE);
    setExpandedClientId('');
  }, [ano, mes, quickFilter, responsavel, search, viewMode]);

  useEffect(() => {
    setClientCompetences({});
  }, [ano, mes]);

  useEffect(() => {
    if (!toast || toast.tone === 'danger') return undefined;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 6000);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

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
    const requestId = ++resumoRequestId.current;
    if (!silent) setLoadingResumo(true);
    setError('');
    try {
      const rows = await listarChecklistResumo({ ano, mes });
      if (resumoRequestId.current === requestId) setResumos(rows);
    } catch (err) {
      if (resumoRequestId.current === requestId) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar o resumo do checklist.');
      }
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
      setCatalogForm((current) => (
        current.id
          ? current
          : { ...current, ordem: current.ordem || String(getNextCatalogOrder(items)) }
      ));
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'Não foi possível carregar o catálogo do checklist.');
    } finally {
      setCatalogLoading(false);
    }
  }

  function resetCatalogForm(items = catalogItems) {
    setCatalogForm({ id: '', descricao: '', ordem: String(getNextCatalogOrder(items)) });
  }

  async function refreshChecklistAfterCatalogChange(nextItems = catalogItems) {
    await loadResumo({ silent: true });
    if (expandedClientId) {
      await loadClientDetails(expandedClientId, { force: true });
    }
    resetCatalogForm(nextItems);
  }

  async function handleSaveCatalogItem(event) {
    event.preventDefault();
    const descricao = String(catalogForm.descricao ?? '').trim();
    const ordem = Number(catalogForm.ordem || 0);

    if (!descricao) {
      setToast({ tone: 'danger', title: 'Descrição obrigatória', message: 'Informe a descrição do item do checklist.' });
      return;
    }

    if (!Number.isFinite(ordem)) {
      setToast({ tone: 'danger', title: 'Ordem inválida', message: 'Informe uma ordem numérica para o item.' });
      return;
    }

    const busyId = catalogForm.id || 'new';
    setCatalogBusyId(busyId);
    setToast(null);
    try {
      const saved = await salvarChecklistItem({
        id: catalogForm.id || undefined,
        descricao,
        ordem,
        ativo: true,
      });
      const items = await listarChecklistItens();
      setCatalogItems(items);
      await refreshChecklistAfterCatalogChange(items);
      setToast({
        tone: 'success',
        title: catalogForm.id ? 'Item atualizado' : 'Item criado',
        message: saved.descricao,
      });
    } catch (err) {
      setToast({
        tone: 'danger',
        title: 'Erro ao salvar item',
        message: err instanceof Error ? err.message : 'Não foi possível salvar o item do checklist.',
      });
    } finally {
      setCatalogBusyId('');
    }
  }

  function handleEditCatalogItem(item) {
    setCatalogForm({ id: item.id, descricao: item.descricao, ordem: String(item.ordem ?? '') });
  }

  async function handleDeleteCatalogItem(item) {
    if (!item?.id) return;
    const confirmed = window.confirm(`Inativar o item "${item.descricao}" do catálogo do checklist?`);
    if (!confirmed) return;

    setCatalogBusyId(item.id);
    setToast(null);
    try {
      const deleted = await excluirChecklistItem(item.id);
      const items = await listarChecklistItens();
      setCatalogItems(items);
      await refreshChecklistAfterCatalogChange(items);
      setToast({ title: 'Item inativado', message: deleted.descricao });
    } catch (err) {
      setToast({
        tone: 'danger',
        title: 'Erro ao inativar item',
        message: err instanceof Error ? err.message : 'Não foi possível inativar o item do checklist.',
      });
    } finally {
      setCatalogBusyId('');
    }
  }

  async function loadContacts() {
    setContactsError('');
    try {
      const rows = await listarChecklistContatos();
      setContactsByClient(Object.fromEntries(rows.map((row) => [row.cliente_id, row])));
    } catch (err) {
      setContactsError(err instanceof Error ? err.message : 'Não foi possível carregar contatos do checklist.');
    }
  }

  useEffect(() => {
    loadCatalogItems();
    loadContacts();
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

  const baseFilteredRows = useMemo(() => {
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

  const quickFilterCounts = useMemo(() => {
    const hasContact = (row) => Boolean(contactsByClient[row.cliente_id]?.email);
    return {
      todos: baseFilteredRows.length,
      com_checklist: baseFilteredRows.filter((row) => row.total_itens > 0).length,
      pendencias: baseFilteredRows.filter((row) => row.qtd_pendentes > 0).length,
      concluidos: baseFilteredRows.filter((row) => row.total_itens > 0 && row.qtd_pendentes === 0).length,
      sem_checklist: baseFilteredRows.filter((row) => row.total_itens === 0).length,
      sem_contato: baseFilteredRows.filter((row) => !hasContact(row)).length,
    };
  }, [baseFilteredRows, contactsByClient]);

  const filteredRows = useMemo(() => {
    const hasContact = (row) => Boolean(contactsByClient[row.cliente_id]?.email);
    if (quickFilter === 'com_checklist') return baseFilteredRows.filter((row) => row.total_itens > 0);
    if (quickFilter === 'pendencias') return baseFilteredRows.filter((row) => row.qtd_pendentes > 0);
    if (quickFilter === 'concluidos') return baseFilteredRows.filter((row) => row.total_itens > 0 && row.qtd_pendentes === 0);
    if (quickFilter === 'sem_checklist') return baseFilteredRows.filter((row) => row.total_itens === 0);
    if (quickFilter === 'sem_contato') return baseFilteredRows.filter((row) => !hasContact(row));
    return baseFilteredRows;
  }, [baseFilteredRows, contactsByClient, quickFilter]);

  const activeQuickFilterLabel = quickFilterOptions.find((option) => option.value === quickFilter)?.label ?? 'Todos';

  const visibleRows = useMemo(() => filteredRows.slice(0, visibleClientLimit).map((row) => {
    const competence = clientCompetences[row.cliente_id] ?? { ano, mes };
    const detail = detailsByClient[row.cliente_id];
    const usesOverview = !isCatalogMode && row.total_itens > 0
      && (expandedClientId === row.cliente_id || Boolean(overviewSummariesByClient[row.cliente_id]));
    const overview = usesOverview ? overviewSummariesByClient[row.cliente_id] : null;
    if (usesOverview) {
      const summaryPending = !overview || overview.loading || overview.error;
      return {
        ...row,
        ...(overview && !summaryPending ? overview : {}),
        summaryPending,
        summaryError: Boolean(overview?.error),
        summaryEmpty: Boolean(overview && !summaryPending && overview.total_avaliacoes === 0),
        summaryPeriod: overview?.periodLabel ?? String(ano),
        summaryPeriodType: overview?.monthFilter ?? 'todos',
      };
    }
    const matchesCompetence = detail?.ano === competence.ano && detail?.mes === competence.mes;
    const detailReady = matchesCompetence && !detail.loading && !detail.error
      && Array.isArray(detail.itens) && Array.isArray(detail.itensPersonalizados);
    const differentCompetence = competence.ano !== ano || competence.mes !== mes;

    return {
      ...row,
      ...(detailReady ? summarizeClientDetail(detail) : {}),
      summaryPending: (matchesCompetence && detail?.loading) || (differentCompetence && !detailReady),
      summaryError: differentCompetence && Boolean(detail?.error),
      summaryEmpty: false,
      summaryPeriod: `${SHORT_MONTH_LABELS[competence.mes - 1]}/${competence.ano}`,
      summaryPeriodType: 'mes',
    };
  }), [ano, clientCompetences, detailsByClient, expandedClientId, filteredRows, isCatalogMode, mes, overviewSummariesByClient, visibleClientLimit]);
  const hiddenRowsCount = Math.max(filteredRows.length - visibleRows.length, 0);
  const nextRowsCount = Math.min(CLIENT_LIST_PAGE_SIZE, hiddenRowsCount);
  const hasExpandedClientHidden = expandedClientId
    ? !filteredRows.slice(0, CLIENT_LIST_PAGE_SIZE).some((row) => row.cliente_id === expandedClientId)
    : false;


  const batchDefaultTargets = useMemo(
    () => filteredRows.filter((row) => toNumber(row.total_itens) === 0),
    [filteredRows],
  );

  const metrics = useMemo(() => {
    const comChecklist = rows.filter((row) => row.total_itens > 0).length;
    const comPendencias = rows.filter((row) => row.qtd_pendentes > 0).length;
    const concluidos = rows.filter((row) => row.total_itens > 0 && row.qtd_pendentes === 0).length;
    const semChecklist = rows.length - comChecklist;
    const semContato = rows.filter((row) => !contactsByClient[row.cliente_id]?.email).length;
    const totalPendencias = rows.reduce((total, row) => total + row.qtd_pendentes, 0);
    return { comChecklist, comPendencias, concluidos, semChecklist, semContato, totalPendencias };
  }, [contactsByClient, rows]);

  function getClientCompetence(clienteId) {
    const overviewSelection = overviewSelectionsByClient[clienteId];
    if (overviewSelection?.monthFilter && overviewSelection.monthFilter !== 'todos') {
      return { ano: toNumber(overviewSelection.year, ano), mes: toNumber(overviewSelection.monthFilter, mes) };
    }
    return clientCompetences[clienteId] ?? { ano, mes };
  }

  async function loadClientDetails(clienteId, { force = false, competence } = {}) {
    if (!clienteId) return;
    const selectedCompetence = competence ?? getClientCompetence(clienteId);
    const selectedAno = toNumber(selectedCompetence.ano, ano);
    const selectedMes = toNumber(selectedCompetence.mes, mes);
    const cachedDetail = detailsByClient[clienteId];
    if (!force && !cachedDetail?.loading && cachedDetail?.itens && cachedDetail.ano === selectedAno && cachedDetail.mes === selectedMes) return;
    const requestId = (detailRequestIds.current[clienteId] ?? 0) + 1;
    detailRequestIds.current[clienteId] = requestId;

    setDetailsByClient((current) => ({
      ...current,
      [clienteId]: { ...(current[clienteId] ?? {}), loading: true, error: '', ano: selectedAno, mes: selectedMes },
    }));

    try {
      const [itens, itensPersonalizados, statusRows, statusPersonalizados, pendencias, envios] = await Promise.all([
        listarChecklistClienteItens(clienteId),
        listarChecklistClienteItensPersonalizados(clienteId),
        listarChecklistStatus({ clienteId, ano: selectedAno, mes: selectedMes }),
        listarChecklistStatusPersonalizados({ clienteId, ano: selectedAno, mes: selectedMes }),
        listarChecklistPendencias({ clienteId, ano: selectedAno, mes: selectedMes }),
        listarChecklistEnvios({ clienteId, ano: selectedAno, mes: selectedMes, limite: 20 }),
      ]);
      if (detailRequestIds.current[clienteId] !== requestId) return;
      setDetailsByClient((current) => ({
        ...current,
        [clienteId]: {
          loading: false,
          error: '',
          ano: selectedAno,
          mes: selectedMes,
          itens,
          itensPersonalizados,
          statusRows,
          statusPersonalizados,
          pendencias,
          envios,
          statusByItem: buildStatusMap(statusRows),
          statusPersonalizadoByItem: buildStatusMap(statusPersonalizados, 'item_personalizado_id'),
        },
      }));
    } catch (err) {
      if (detailRequestIds.current[clienteId] !== requestId) return;
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
    if (nextId) {
      const initialCompetenceForClient = getClientCompetence(nextId);
      setClientCompetences((current) => ({
        ...current,
        [nextId]: current[nextId] ?? { ano, mes },
      }));
      loadClientDetails(nextId, { competence: initialCompetenceForClient });
    }
  }

  function handleOverviewSelectionChange(clientId, selection) {
    if (!clientId) return;
    const nextSelection = {
      year: toNumber(selection.year, ano),
      monthFilter: selection.monthFilter,
    };
    const nextCompetence = nextSelection.monthFilter === 'todos'
      ? (clientCompetences[clientId] ?? { ano, mes })
      : { ano: nextSelection.year, mes: toNumber(nextSelection.monthFilter, mes) };
    setOverviewSelectionsByClient((current) => ({ ...current, [clientId]: nextSelection }));
    const currentDetail = detailsByClient[clientId];
    if (currentDetail?.ano !== nextCompetence.ano || currentDetail?.mes !== nextCompetence.mes) {
      loadClientDetails(clientId, { force: true, competence: nextCompetence });
    }
  }

  function clearChecklistFilters() {
    setSearch('');
    setResponsavel('');
    setQuickFilter('todos');
  }

  async function handleStatusChange(client, vinculo, nextStatus, requestedCompetence) {
    const isPersonalizado = vinculo.item_tipo === 'personalizado';
    const itemId = isPersonalizado
      ? (vinculo.item_personalizado_id || vinculo.id)
      : (vinculo.item_id || vinculo.item?.id);
    if (!client?.id || !itemId) return;

    const selectedCompetence = getClientCompetence(client.id);
    const competence = requestedCompetence ?? selectedCompetence;
    const statusAno = toNumber(competence.ano, ano);
    const statusMes = toNumber(competence.mes, mes);
    const isSelectedCompetence = statusAno === toNumber(selectedCompetence.ano, ano)
      && statusMes === toNumber(selectedCompetence.mes, mes);
    statusSavePendingClients.current.add(client.id);
    setStatusSavingClientId(client.id);
    setToast(null);

    try {
      const saved = isPersonalizado
        ? await salvarChecklistStatusPersonalizado({
          cliente_id: client.id,
          item_personalizado_id: itemId,
          ano: statusAno,
          mes: statusMes,
          status: nextStatus,
        })
        : await salvarChecklistStatus({
          cliente_id: client.id,
          item_id: itemId,
          ano: statusAno,
          mes: statusMes,
          status: nextStatus,
        });

      if (isSelectedCompetence) setDetailsByClient((current) => {
        const detail = current[client.id] ?? {};
        if (detail.ano !== statusAno || detail.mes !== statusMes) return current;
        if (isPersonalizado) {
          return {
            ...current,
            [client.id]: {
              ...detail,
              statusPersonalizados: [
                ...(detail.statusPersonalizados ?? []).filter((row) => row.item_personalizado_id !== itemId),
                saved,
              ],
              statusPersonalizadoByItem: {
                ...(detail.statusPersonalizadoByItem ?? {}),
                [itemId]: saved,
              },
            },
          };
        }

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

      void loadResumo({ silent: true });
      return saved;
    } catch (err) {
      setToast({ tone: 'danger', title: 'Erro ao salvar status', message: err instanceof Error ? err.message : 'Não foi possível salvar o status.' });
      return null;
    } finally {
      statusSavePendingClients.current.delete(client.id);
      setStatusSavingClientId('');
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

  async function handleSavePersonalItem(client, values) {
    if (!client?.id) return null;

    const descricao = String(values?.descricao ?? '').trim();
    if (!descricao) {
      setToast({ tone: 'danger', title: 'Descrição obrigatória', message: 'Informe a descrição do documento específico.' });
      return null;
    }

    setPersonalItemBusyKey(`new:${client.id}`);
    setToast(null);

    try {
      const detail = detailsByClient[client.id] ?? {};
      const saved = await salvarChecklistClienteItemPersonalizado({
        cliente_id: client.id,
        descricao,
        ordem: values?.ordem ?? ((detail.itensPersonalizados?.length ?? 0) + 1),
        ativo: true,
      });

      await Promise.all([
        loadClientDetails(client.id, { force: true }),
        loadResumo({ silent: true }),
      ]);

      setToast({
        tone: 'success',
        title: 'Documento específico salvo',
        message: `${saved.descricao} foi adicionado somente para ${getClientName(client)}.`,
      });
      return saved;
    } catch (err) {
      setToast({
        tone: 'danger',
        title: 'Erro ao salvar documento específico',
        message: err instanceof Error ? err.message : 'Não foi possível salvar o documento específico deste cliente.',
      });
      return null;
    } finally {
      setPersonalItemBusyKey('');
    }
  }

  async function handleDeletePersonalItem(client, item) {
    if (!client?.id || !item?.id) return;
    const confirmed = window.confirm(`Remover o documento específico "${item.descricao}" deste cliente?`);
    if (!confirmed) return;

    setPersonalItemBusyKey(item.id);
    setToast(null);

    try {
      await excluirChecklistClienteItemPersonalizado(item.id);
      await Promise.all([
        loadClientDetails(client.id, { force: true }),
        loadResumo({ silent: true }),
      ]);

      setToast({
        tone: 'success',
        title: 'Documento específico removido',
        message: `${item.descricao} foi removido do checklist de ${getClientName(client)}.`,
      });
    } catch (err) {
      setToast({
        tone: 'danger',
        title: 'Erro ao remover documento específico',
        message: err instanceof Error ? err.message : 'Não foi possível remover o documento específico deste cliente.',
      });
    } finally {
      setPersonalItemBusyKey('');
    }
  }

  async function handleApplyDefaultChecklistToFiltered(selectedCatalogItems = catalogItems) {
    const itemsToApply = (selectedCatalogItems ?? []).filter((item) => item?.id);
    if (applyingDefaultChecklist || catalogLoading || !itemsToApply.length || !batchDefaultTargets.length) return;

    const confirmed = window.confirm(
      `Aplicar ${formatNumber(itemsToApply.length)} item(ns) selecionado(s) para ${formatNumber(batchDefaultTargets.length)} cliente(s) filtrado(s) que ainda estão sem checklist? Clientes já configurados não serão alterados.`,
    );
    if (!confirmed) return;

    const payload = itemsToApply.map((item, index) => ({
      item_id: item.id,
      ordem: toNumber(item.ordem, index + 1),
      ativo: true,
    }));

    setApplyingDefaultChecklist(true);
    setToast(null);

    const failures = [];
    try {
      for (const row of batchDefaultTargets) {
        try {
          await salvarChecklistClienteItens(row.cliente_id, payload);
        } catch (err) {
          failures.push({
            nome: row.nome,
            message: err instanceof Error ? err.message : 'Erro desconhecido.',
          });
        }
      }

      await loadResumo({ silent: true });
      if (expandedClientId) {
        await loadClientDetails(expandedClientId, { force: true });
      }

      const successCount = batchDefaultTargets.length - failures.length;
      setShowBatchApplyModal(false);
      if (failures.length) {
        setToast({
          tone: successCount > 0 ? 'warning' : 'danger',
          title: successCount > 0 ? 'Aplicação parcial' : 'Checklist não aplicado',
          message: `${formatNumber(successCount)} cliente(s) atualizado(s). ${formatNumber(failures.length)} cliente(s) não puderam ser atualizados. Primeiro erro: ${failures[0]?.nome}: ${failures[0]?.message}`,
        });
      } else {
        setToast({
          tone: 'success',
          title: 'Checklist padrão aplicado',
          message: `${formatNumber(successCount)} cliente(s) receberam ${formatNumber(payload.length)} item(ns) padrão do catálogo.`,
        });
      }
    } finally {
      setApplyingDefaultChecklist(false);
    }
  }

  async function handleSaveContact(client, values) {
    if (!client?.id) return;

    setSavingContactId(client.id);
    setToast(null);

    try {
      const saved = await salvarChecklistContato({
        cliente_id: client.id,
        email: String(values.email ?? '').trim(),
        cc: String(values.cc ?? '').trim(),
      });
      setContactsByClient((current) => ({
        ...current,
        [client.id]: saved,
      }));
      setToast({
        tone: 'success',
        title: 'Contato salvo',
        message: `Contato do checklist de ${getClientName(client)} atualizado.`,
      });
    } catch (err) {
      setToast({
        tone: 'danger',
        title: 'Erro ao salvar contato',
        message: err instanceof Error ? err.message : 'Não foi possível salvar o contato do checklist.',
      });
    } finally {
      setSavingContactId('');
    }
  }

  async function handleSendReminder(client, values) {
    if (!client?.id) return;
    if (statusSavePendingClients.current.has(client.id)) {
      setToast({ tone: 'danger', title: 'Status ainda sendo salvo', message: 'Aguarde a confirmação do status antes de revisar o lembrete.' });
      return;
    }

    const summary = overviewSummariesByClient[client.id];
    const selection = overviewSelectionsByClient[client.id] ?? { year: summary?.year ?? ano, monthFilter: 'todos' };
    const reminderAno = toNumber(selection.year, ano);
    const annualMode = selection.monthFilter === 'todos';
    const reminderMes = annualMode ? null : toNumber(selection.monthFilter, mes);
    if (!summary || summary.loading || summary.error || summary.year !== reminderAno || summary.monthFilter !== selection.monthFilter) {
      setToast({ tone: 'danger', title: 'Prévia ainda não carregada', message: 'Aguarde as pendências da tabela antes de enviar o lembrete.' });
      return;
    }
    const currentCompetence = getCurrentCompetence();
    const reminderGroups = selectRetroactiveReminderGroups(summary.pendingGroups ?? [], reminderAno, selection.monthFilter, currentCompetence);
    const lastReminderCompetence = previousCompetence(currentCompetence);
    if (!reminderGroups.length) {
      setToast({
        tone: 'danger',
        title: 'Nenhuma pendência retroativa',
        message: `O lembrete só pode cobrar pendências até ${getMonthLabel(lastReminderCompetence.mes)}/${lastReminderCompetence.ano}.`,
      });
      return;
    }
    if (values.previewedGroupSignature !== reminderGroupSignature(reminderGroups)) {
      setToast({ tone: 'danger', title: 'Prévia desatualizada', message: 'As competências do lembrete mudaram. Revise o e-mail novamente antes de enviar.' });
      return;
    }
    const pendencias = reminderGroups.flatMap((group) => group.pendingItems.map((item) => ({
      item_id: item.id,
      item_tipo: item.tipo,
      descricao: item.descricao,
      ano: reminderAno,
      mes: group.month,
    })));
    const destinatario = String(values.email ?? '').trim();
    const cc = String(values.cc ?? '').trim();
    const assinatura = getClientResponsibleSignature(client, responsavelCatalogo);
    const assunto = annualMode
      ? (reminderGroups.length ? buildAnnualReminderSubject(client, reminderAno, reminderGroups) : '')
      : buildReminderSubject(client, reminderAno, reminderMes);
    const singleMonthPendencias = reminderGroups[0]?.pendingItems.map((item) => ({ item_descricao: item.descricao })) ?? [];
    const texto = annualMode
      ? buildAnnualReminderText(reminderGroups, reminderAno, assinatura.nome)
      : buildReminderText(singleMonthPendencias, assinatura.nome);
    const html = annualMode
      ? buildAnnualReminderHtml(reminderGroups, reminderAno, assinatura.url, assinatura.nome)
      : buildReminderHtml(singleMonthPendencias, assinatura.url, assinatura.nome);

    if (!destinatario || !pendencias.length) return;

    setSendingReminderId(client.id);
    setToast(null);

    try {
      const savedContact = await salvarChecklistContato({
        cliente_id: client.id,
        email: destinatario,
        cc,
      });
      setContactsByClient((current) => ({
        ...current,
        [client.id]: savedContact,
      }));

      const sent = await enviarChecklistLembretes({
        chave_idempotencia: String(values.chaveIdempotencia ?? '').trim(),
        destinatario,
        cc,
        assunto,
        texto,
        html,
        cliente: {
          id: client.id,
          cnpj: client.cnpj ?? '',
          razao_social: client.razao_social ?? '',
          nome_identificacao: getClientName(client),
        },
        competencia: { ano: reminderAno, mes: reminderMes, descricao: annualMode ? `Pendências de ${reminderAno}` : `${getMonthLabel(reminderMes)}/${reminderAno}` },
        competencias: reminderGroups.map((group) => ({ ano: reminderAno, mes: group.month })),
        pendencias,
      });

      await loadClientDetails(client.id, { force: true });
      const duplicate = Boolean(sent && typeof sent === 'object' && sent.duplicado === true);
      setToast({
        tone: 'success',
        title: duplicate ? 'Lembrete já processado' : 'Lembrete enviado',
        message: duplicate
          ? 'Esta mesma solicitação já havia sido concluída. Nenhum e-mail adicional foi enviado.'
          : `Lembrete enviado para ${destinatario} com ${formatNumber(pendencias.length)} pendência(s) de ${formatNumber(reminderGroups.length)} mês(es) de ${reminderAno}.`,
      });
    } catch (err) {
      setToast({
        tone: 'danger',
        title: 'Erro ao enviar lembrete',
        message: err instanceof Error ? err.message : 'Não foi possível enviar o lembrete.',
      });
    } finally {
      setSendingReminderId('');
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        {CHECKLIST_VIEW_OPTIONS.map((option) => {
          const active = viewMode === option.value;
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setViewMode(option.value)}
              className={classNames(
                'group rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft',
                active
                  ? 'border-blue-400 bg-blue-600 text-white shadow-blue-950/20 dark:border-blue-400 dark:bg-blue-500/90'
                  : 'border-slate-200 bg-white/85 text-slate-800 hover:border-blue-300 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-100 dark:hover:border-blue-500/50',
              )}
            >
              <div className="flex items-center gap-3">
                <span className={classNames(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition',
                  active
                    ? 'border-white/25 bg-white/15 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 group-hover:border-blue-300 group-hover:text-blue-600 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-300 dark:group-hover:border-blue-500/50 dark:group-hover:text-blue-200',
                )}>
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className={classNames('block text-[11px] font-black uppercase tracking-wide', active ? 'text-blue-100' : 'text-slate-500 dark:text-gray-400')}>
                    Página
                  </span>
                  <span className="mt-1 block text-base font-black leading-tight">
                    {option.label}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {isHistoryMode ? (
        <ChecklistHistoryPanel yearOptions={yearOptions} />
      ) : (
        <>
      <SurfacePanel
        title={isCatalogMode ? 'Central do catálogo' : 'Central de checklist'}
        right={(
          <div className="flex flex-wrap items-center gap-2">
            {!isCatalogMode ? (
              <StatusBadge toneClass="border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200" size="md">
                <CalendarDays size={14} className="mr-1" aria-hidden="true" />
                {getMonthLabel(mes)}/{ano}
              </StatusBadge>
            ) : null}
            <ActionButton type="button" variant="secondary" onClick={() => loadResumo()} disabled={loadingResumo}>
              <RefreshCcw size={16} className={loadingResumo ? 'animate-spin' : ''} aria-hidden="true" />
              Atualizar
            </ActionButton>
          </div>
        )}
        bodyClassName="px-4 pb-4 sm:px-5 sm:pb-5"
      >
        <div className={classNames('grid gap-3 md:grid-cols-2', isCatalogMode ? 'xl:grid-cols-4' : 'xl:grid-cols-5')}>
          <MetricTile
            title="Clientes com checklist"
            value={formatNumber(metrics.comChecklist)}
            detail={`${formatNumber(metrics.semChecklist)} ainda sem itens vinculados`}
            icon={ListChecks}
            tone="info"
            className="min-h-[118px]"
          />
          {!isCatalogMode ? (
            <>
          <MetricTile
            title="Com pendências"
            value={formatNumber(metrics.comPendencias)}
            detail={`${formatNumber(metrics.totalPendencias)} documento(s) pendente(s) · clicar para filtrar`}
            icon={AlertTriangle}
            tone={metrics.comPendencias ? 'warning' : 'success'}
            onClick={() => setQuickFilter('pendencias')}
            className="min-h-[118px]"
          />
          <MetricTile
            title="Concluídos"
            value={formatNumber(metrics.concluidos)}
            detail="Clientes sem pendências · clicar para filtrar"
            icon={FileCheck2}
            tone="success"
            onClick={() => setQuickFilter('concluidos')}
            className="min-h-[118px]"
          />
          <MetricTile
            title="Sem contato"
            value={formatNumber(metrics.semContato)}
            detail="Clientes sem e-mail salvo · clicar para filtrar"
            icon={Mail}
            tone={metrics.semContato ? 'warning' : 'success'}
            onClick={() => setQuickFilter('sem_contato')}
            className="min-h-[118px]"
          />
            </>
          ) : (
            <>
              <MetricTile
                title="Itens ativos"
                value={formatNumber(catalogItems.length)}
                detail="Documentos disponíveis no catálogo"
                icon={ClipboardCheck}
                tone="success"
                className="min-h-[118px]"
              />
              <MetricTile
                title="Sem checklist"
                value={formatNumber(metrics.semChecklist)}
                detail="Clientes sem itens vinculados · clicar para filtrar"
                icon={FileQuestion}
                tone={metrics.semChecklist ? 'warning' : 'success'}
                onClick={() => setQuickFilter('sem_checklist')}
                className="min-h-[118px]"
              />
            </>
          )}
          <MetricTile
            title="Carteira filtrada"
            value={formatNumber(filteredRows.length)}
            detail={`de ${formatNumber(rows.length)} cliente(s) ativos`}
            icon={Users}
            tone="muted"
            className="min-h-[118px]"
          />
        </div>
      </SurfacePanel>

      <SurfacePanel
        title={isCatalogMode ? 'Filtros do catálogo' : 'Filtros do checklist'}
        right={(
          <ActionButton type="button" variant="secondary" onClick={clearChecklistFilters}>
            <RefreshCcw size={16} aria-hidden="true" />
            Limpar filtros
          </ActionButton>
        )}
        bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6"
      >
        <div className={classNames('grid gap-3', isCatalogMode ? 'lg:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.9fr)]' : 'lg:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.9fr)]')}>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
            <span className="block">Cliente, CNPJ ou razão social</span>
            <div className="relative mt-2">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar cliente"
                className="input-shell pl-10 normal-case"
              />
            </div>
          </label>

          <ChecklistDropdownSelect
            label="Responsável"
            value={responsavel}
            options={responsavelOptions}
            onChange={setResponsavel}
            includeBlank
            emptyLabel="Todos"
          />

        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/45">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">Acompanhamento rápido</p>
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-gray-400">
              {formatNumber(filteredRows.length)} de {formatNumber(baseFilteredRows.length)} cliente(s)
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickFilterOptions.map((option) => {
              const active = quickFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setQuickFilter(option.value)}
                  className={classNames(
                    'rounded-xl border px-3 py-2 text-left text-xs font-black transition hover:-translate-y-0.5',
                    active
                      ? 'border-blue-400 bg-blue-600 text-white shadow-lg shadow-blue-950/15 dark:border-blue-400 dark:bg-blue-500'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 dark:border-gray-800 dark:bg-gray-950/35 dark:text-gray-200 dark:hover:border-blue-500/50',
                  )}
                >
                  <span className="block">{option.label}</span>
                  <span className={classNames('mt-1 block text-[11px] font-bold', active ? 'text-blue-100' : 'text-slate-500 dark:text-gray-400')}>
                    {formatNumber(quickFilterCounts[option.value] ?? 0)} · {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </SurfacePanel>

      {isCatalogMode ? (
        <ChecklistCatalogManager
          items={catalogItems}
          loading={catalogLoading}
          error={catalogError}
          form={catalogForm}
          busyId={catalogBusyId}
          onFormChange={setCatalogForm}
          onSubmit={handleSaveCatalogItem}
          onEdit={handleEditCatalogItem}
          onCancel={() => resetCatalogForm()}
          onDelete={handleDeleteCatalogItem}
          onRefresh={loadCatalogItems}
          onOpenBatchApply={() => setShowBatchApplyModal(true)}
        />
      ) : null}

      <ChecklistBatchApplyModal
        open={isCatalogMode && showBatchApplyModal}
        filteredCount={filteredRows.length}
        targetCount={batchDefaultTargets.length}
        catalogCount={catalogItems.length}
        items={catalogItems}
        applying={applyingDefaultChecklist}
        catalogLoading={catalogLoading}
        onApply={handleApplyDefaultChecklistToFiltered}
        onClose={() => setShowBatchApplyModal(false)}
      />

      {error ? (
        <AlertBanner tone="danger" title="Erro ao carregar checklist">
          {error}
        </AlertBanner>
      ) : null}

      {!isCatalogMode && contactsError ? (
        <AlertBanner tone="danger" title="Erro ao carregar contatos">
          {contactsError}
        </AlertBanner>
      ) : null}

      {toast ? (
        <AlertBanner tone={toast.tone} title={toast.title}>
          {toast.message}
        </AlertBanner>
      ) : null}

      <SurfacePanel
        title={isCatalogMode ? 'Clientes e vínculos' : 'Clientes'}
        description={isCatalogMode
          ? `${formatNumber(filteredRows.length)} cliente(s) em "${activeQuickFilterLabel}" para configurar documentos.`
          : `${formatNumber(filteredRows.length)} cliente(s) em "${activeQuickFilterLabel}" conforme os filtros aplicados.`}
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
                Não há clientes para o acompanhamento rápido "{activeQuickFilterLabel}" com os filtros atuais. Ajuste a busca, o responsável ou volte para "Todos".
              </p>
              {quickFilter !== 'todos' ? (
                <ActionButton type="button" size="sm" variant="secondary" onClick={() => setQuickFilter('todos')}>
                  Ver todos os clientes filtrados
                </ActionButton>
              ) : null}
            </div>
          ) : null}

          {visibleRows.map((row) => {
            const expanded = expandedClientId === row.cliente_id;
            const hasMeasuredProgress = !row.summaryPending && !row.summaryEmpty;
            const completionTone = !hasMeasuredProgress
              ? 'border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'
              : getCompletionTone(row.percentual_concluido);
            const hasContact = Boolean(contactsByClient[row.cliente_id]?.email);
            const progressWidth = hasMeasuredProgress ? Math.max(0, Math.min(100, row.percentual_concluido)) : 0;
            const rowCompetence = getClientCompetence(row.cliente_id);

            return (
              <div
                key={row.cliente_id}
                className={classNames(
                  'overflow-hidden rounded-2xl border bg-white/95 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300/55 hover:shadow-lg dark:bg-gray-900/75 dark:hover:border-blue-500/45',
                  expanded ? 'border-blue-300/70 dark:border-blue-500/45' : 'border-slate-200 dark:border-gray-800',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleClient(row.cliente_id)}
                  className="grid w-full gap-4 px-4 py-4 text-left transition hover:bg-slate-50/80 sm:px-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)_auto] xl:items-center dark:hover:bg-gray-800/55"
                >
                  <div className="flex min-w-0 gap-3">
                    <span className={classNames(
                      'mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-black',
                      hasMeasuredProgress && row.percentual_concluido >= 100
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'
                        : row.qtd_pendentes > 0
                          ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200'
                          : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200',
                    )}
                    >
                      {hasMeasuredProgress && row.percentual_concluido >= 100 ? <Check size={18} aria-hidden="true" /> : <FileQuestion size={18} aria-hidden="true" />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-black text-slate-950 dark:text-white">{row.nome}</p>
                        {!isCatalogMode ? (
                          <StatusBadge
                            toneClass={hasContact
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'
                              : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}
                          >
                            {hasContact ? 'Contato salvo' : 'Sem contato'}
                          </StatusBadge>
                        ) : null}
                        {!isCatalogMode ? (
                          <StatusBadge toneClass="border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">
                            {row.summaryPeriodType === 'todos' ? `Ano ${row.summaryPeriod}` : row.summaryPeriod}
                          </StatusBadge>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500 dark:text-gray-400">
                        <span>{formatCnpj(row.cnpj)}</span>
                        <span>Responsável: <strong className="text-slate-700 dark:text-gray-200">{row.responsavel}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className={classNames('grid gap-3', isCatalogMode ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
                    {!isCatalogMode ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-gray-800 dark:bg-gray-950/30">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 dark:text-gray-500">Progresso</p>
                        <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{row.summaryPending ? (row.summaryError ? 'Indisponível' : 'Carregando...') : row.summaryEmpty ? 'Sem status' : `${formatNumber(row.percentual_concluido)}%`}</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-gray-800">
                          <div
                            className={classNames(
                              'h-full rounded-full transition-all',
                              row.percentual_concluido >= 100
                                ? 'bg-emerald-500'
                                : row.percentual_concluido > 0
                                  ? 'bg-sky-500'
                                  : 'bg-amber-400',
                            )}
                            style={{ width: `${progressWidth}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-gray-800 dark:bg-gray-950/30">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 dark:text-gray-500">Itens</p>
                      <p className="mt-1 text-sm font-black text-slate-900 dark:text-white">{formatNumber(row.total_itens)}</p>
                      <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-gray-400">documento(s){row.summaryPeriodType === 'todos' && !row.summaryPending ? ` · ${formatNumber(row.total_avaliacoes)} controles mensais` : ''}</p>
                    </div>
                    {isCatalogMode ? (
                      <div className={classNames(
                        'rounded-xl border px-3 py-2',
                        row.total_itens > 0
                          ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-400/10'
                          : 'border-amber-200 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-400/10',
                      )}>
                        <p className={classNames(
                          'text-[10px] font-black uppercase tracking-wide',
                          row.total_itens > 0 ? 'text-emerald-700 dark:text-emerald-200' : 'text-amber-700 dark:text-amber-200',
                        )}>Configuração</p>
                        <p className={classNames(
                          'mt-1 text-sm font-black',
                          row.total_itens > 0 ? 'text-emerald-800 dark:text-emerald-100' : 'text-amber-800 dark:text-amber-100',
                        )}>{row.total_itens > 0 ? 'Configurado' : 'Pendente'}</p>
                        <p className={classNames(
                          'mt-1 text-[11px] font-bold',
                          row.total_itens > 0 ? 'text-emerald-700/80 dark:text-emerald-200/80' : 'text-amber-700/80 dark:text-amber-200/80',
                        )}>{row.total_itens > 0 ? 'com itens vinculados' : 'sem checklist'}</p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-400/20 dark:bg-amber-400/10">
                        <p className="text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-200">Pendências</p>
                        <p className="mt-1 text-sm font-black text-amber-800 dark:text-amber-100">{row.summaryPending ? (row.summaryError ? '—' : '...') : formatNumber(row.qtd_pendentes)}</p>
                        <p className="mt-1 text-[11px] font-bold text-amber-700/80 dark:text-amber-200/80">{row.summaryEmpty ? 'sem status no período' : `em aberto em ${row.summaryPeriod}`}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <StatusBadge toneClass={isCatalogMode ? (row.total_itens > 0 ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200') : completionTone}>{isCatalogMode ? (row.total_itens > 0 ? 'Configurado' : 'Sem checklist') : row.summaryPending ? (row.summaryError ? 'Indisponível' : 'Carregando...') : row.summaryEmpty ? 'Sem status' : `${formatNumber(row.percentual_concluido)}% concluído`}</StatusBadge>
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      {expanded ? 'Ocultar' : 'Abrir'}
                      <ChevronDown size={14} className={classNames('transition', expanded && 'rotate-180')} aria-hidden="true" />
                    </span>
                  </div>
                </button>

                {expanded ? (
                  <div className="border-t border-slate-200 bg-gradient-to-b from-slate-50/90 to-white p-4 sm:p-5 dark:border-gray-800 dark:from-gray-950/35 dark:to-gray-950/15">
                    <ClientChecklistDetails
                      mode={isCatalogMode ? 'catalog' : 'checklist'}
                      client={row.client}
                      detail={detailsByClient[row.cliente_id]}
                      ano={toNumber(rowCompetence.ano, ano)}
                      mes={toNumber(rowCompetence.mes, mes)}
                      currentCompetence={currentReminderCompetence}
                      responsavelCatalogo={responsavelCatalogo}
                      yearOptions={yearOptions}
                      contact={contactsByClient[row.cliente_id]}
                      catalogItems={catalogItems}
                      catalogLoading={catalogLoading}
                      catalogError={catalogError}
                      savingConfigId={savingConfigId}
                      savingContactId={savingContactId}
                      sendingReminderId={sendingReminderId}
                      statusSaving={statusSavingClientId === row.cliente_id}
                      personalItemBusyKey={personalItemBusyKey}
                      onReload={(clienteId) => loadClientDetails(clienteId, { force: true })}
                      onSaveClientItems={handleSaveClientItems}
                      onSavePersonalItem={handleSavePersonalItem}
                      onDeletePersonalItem={handleDeletePersonalItem}
                      onSaveContact={handleSaveContact}
                      onSendReminder={handleSendReminder}
                      onStatusChange={handleStatusChange}
                      onOverviewSummaryChange={handleOverviewSummaryChange}
                      overviewSelection={overviewSelectionsByClient[row.cliente_id]}
                      overviewSummary={overviewSummariesByClient[row.cliente_id]}
                      onOverviewSelectionChange={handleOverviewSelectionChange}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}

          {!loadingResumo && filteredRows.length > CLIENT_LIST_PAGE_SIZE ? (
            <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/45 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-600 dark:text-gray-300">
                Mostrando {formatNumber(visibleRows.length)} de {formatNumber(filteredRows.length)} cliente(s).
              </p>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {hiddenRowsCount > 0 ? (
                  <ActionButton
                    type="button"
                    size="sm"
                    variant="subtle"
                    onClick={() => setVisibleClientLimit((current) => Math.min(current + CLIENT_LIST_PAGE_SIZE, filteredRows.length))}
                  >
                    Mostrar mais ({formatNumber(nextRowsCount)})
                    <ChevronDown size={16} aria-hidden="true" />
                  </ActionButton>
                ) : null}
                {visibleClientLimit > CLIENT_LIST_PAGE_SIZE ? (
                  <ActionButton
                    type="button"
                    size="sm"
                    variant="subtle"
                    onClick={() => {
                      setVisibleClientLimit(CLIENT_LIST_PAGE_SIZE);
                      if (hasExpandedClientHidden) setExpandedClientId('');
                    }}
                  >
                    Mostrar menos
                    <ChevronDown size={16} className="rotate-180" aria-hidden="true" />
                  </ActionButton>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </SurfacePanel>
        </>
      )}
    </div>
  );
}

