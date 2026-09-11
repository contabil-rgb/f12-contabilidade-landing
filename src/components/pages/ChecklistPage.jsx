import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  FileQuestion,
  ListChecks,
  Mail,
  RefreshCcw,
  Search,
  Send,
  Users,
} from 'lucide-react';
import ActionButton from '../ui/ActionButton';
import AlertBanner from '../ui/AlertBanner';
import DataTableShell from '../ui/DataTableShell';
import MetricTile from '../ui/MetricTile';
import StatusBadge from '../ui/StatusBadge';
import SurfacePanel from '../ui/SurfacePanel';
import { classNames } from '../ui/classNames';
import { formatCnpj, formatNumber, normalizeText } from '../../lib/formatters';
import {
  CHECKLIST_STATUS,
  listarChecklistClienteItens,
  listarChecklistContatos,
  listarChecklistEnvios,
  listarChecklistItens,
  listarChecklistPendencias,
  listarChecklistResumo,
  listarChecklistStatus,
  registrarChecklistEnvio,
  enviarChecklistLembretes,
  salvarChecklistClienteItens,
  salvarChecklistContato,
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

function formatDateTime(value) {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
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

function buildReminderText(client, ano, mes, pendencias) {
  const itens = pendencias.map((pendencia) => `- ${pendencia.item_descricao}`).join('\n');
  return [
    'Olá!',
    '',
    `Identificamos documentos pendentes no checklist da competência ${getMonthLabel(mes)}/${ano} da empresa ${getClientName(client)}.`,
    '',
    'Documentos pendentes:',
    itens,
    '',
    'Por favor, envie os documentos pendentes para darmos continuidade ao atendimento contábil.',
    '',
    'Atenciosamente,',
    'F12 Contabilidade',
  ].join('\n');
}

function buildReminderHtml(client, ano, mes, pendencias) {
  const itens = pendencias
    .map((pendencia) => `<li>${escapeHtml(pendencia.item_descricao)}</li>`)
    .join('');
  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <p>Olá!</p>
      <p>Identificamos documentos pendentes no checklist da competência <strong>${escapeHtml(getMonthLabel(mes))}/${escapeHtml(ano)}</strong> da empresa <strong>${escapeHtml(getClientName(client))}</strong>.</p>
      <p><strong>Documentos pendentes:</strong></p>
      <ul>${itens}</ul>
      <p>Por favor, envie os documentos pendentes para darmos continuidade ao atendimento contábil.</p>
      <p>Atenciosamente,<br/>F12 Contabilidade</p>
    </div>
  `;
}

function ChecklistContactReminder({
  client,
  ano,
  mes,
  contact,
  pendencias,
  envios,
  savingContactId,
  sendingReminderId,
  onSaveContact,
  onSendReminder,
}) {
  const [email, setEmail] = useState('');
  const [cc, setCc] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setEmail(contact?.email ?? '');
    setCc(contact?.cc ?? '');
    setLocalError('');
  }, [contact?.email, contact?.cc]);

  const saving = savingContactId === client?.id;
  const sending = sendingReminderId === client?.id;
  const hasEmail = String(email ?? '').trim().length > 0;
  const pendingCount = pendencias.length;

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
    onSendReminder(client, { email, cc });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-4 dark:border-gray-800 dark:bg-gray-900/45">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
            <Mail size={16} aria-hidden="true" />
            Contatos e lembretes
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-gray-400">
            Informe os destinatários do checklist e envie o lembrete dos itens pendentes da competência {getMonthLabel(mes)}/{ano}.
          </p>
        </div>
        <StatusBadge toneClass={pendingCount > 0
          ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200'
          : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'}
        >
          {formatNumber(pendingCount)} pendência(s)
        </StatusBadge>
      </div>

      <div className="mt-4 grid gap-3">
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

        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton type="button" size="sm" variant="secondary" onClick={handleSave} disabled={saving || sending}>
            {saving ? 'Salvando...' : 'Salvar contato'}
          </ActionButton>
          <ActionButton
            type="button"
            size="sm"
            variant="primary"
            onClick={handleSend}
            disabled={saving || sending || !hasEmail || pendingCount === 0}
          >
            <Send size={14} aria-hidden="true" />
            {sending ? 'Enviando...' : 'Enviar lembrete'}
          </ActionButton>
        </div>
      </div>

      {localError ? (
        <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {localError}
        </p>
      ) : null}

      {pendingCount === 0 ? (
        <p className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
          Não há pendências para esta competência.
        </p>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950/30">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">Pendências que serão enviadas</p>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-slate-700 dark:text-gray-200">
            {pendencias.slice(0, 8).map((pendencia) => (
              <li key={pendencia.item_id} className="flex gap-2">
                <span className="text-amber-500">•</span>
                <span>{pendencia.item_descricao}</span>
              </li>
            ))}
          </ul>
          {pendencias.length > 8 ? (
            <p className="mt-2 text-xs font-bold text-slate-500 dark:text-gray-400">
              + {formatNumber(pendencias.length - 8)} pendência(s)
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-950/30">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">Últimos envios</p>
        {envios.length ? (
          <div className="mt-2 space-y-2">
            {envios.slice(0, 3).map((envio) => (
              <div key={envio.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-gray-800 dark:text-gray-300">
                <p className="font-black text-slate-800 dark:text-gray-100">{formatDateTime(envio.enviado_em || envio.criado_em)}</p>
                <p className="mt-1">Para: {envio.destinatario}</p>
                <p className="mt-1">{formatNumber(envio.qtd_pendencias)} pendência(s) · {envio.enviado_por_nome || 'Usuário não informado'}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-gray-400">Nenhum lembrete registrado para esta competência.</p>
        )}
      </div>
    </div>
  );
}

function ClientChecklistDetails({
  client,
  detail,
  ano,
  mes,
  contact,
  catalogItems,
  catalogLoading,
  catalogError,
  busyKey,
  savingConfigId,
  savingContactId,
  sendingReminderId,
  onReload,
  onSaveClientItems,
  onSaveContact,
  onSendReminder,
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ChecklistContactReminder
          client={client}
          ano={ano}
          mes={mes}
          contact={contact}
          pendencias={detail.pendencias ?? []}
          envios={detail.envios ?? []}
          savingContactId={savingContactId}
          sendingReminderId={sendingReminderId}
          onSaveContact={onSaveContact}
          onSendReminder={onSendReminder}
        />

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
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
          <div className="mb-3 flex flex-col gap-1 px-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black text-slate-900 dark:text-white">Acompanhamento da competência</p>
              <p className="text-xs font-semibold text-slate-500 dark:text-gray-400">
                Atualize o status de cada item para {getMonthLabel(mes)}/{ano}.
              </p>
            </div>
          </div>
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
  const [contactsByClient, setContactsByClient] = useState({});
  const [contactsError, setContactsError] = useState('');
  const [savingContactId, setSavingContactId] = useState('');
  const [sendingReminderId, setSendingReminderId] = useState('');

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
    const semChecklist = rows.length - comChecklist;
    const totalPendencias = rows.reduce((total, row) => total + row.qtd_pendentes, 0);
    return { comChecklist, comPendencias, concluidos, semChecklist, totalPendencias };
  }, [rows]);

  async function loadClientDetails(clienteId, { force = false } = {}) {
    if (!clienteId) return;
    if (!force && detailsByClient[clienteId]?.itens) return;

    setDetailsByClient((current) => ({
      ...current,
      [clienteId]: { ...(current[clienteId] ?? {}), loading: true, error: '' },
    }));

    try {
      const [itens, statusRows, pendencias, envios] = await Promise.all([
        listarChecklistClienteItens(clienteId),
        listarChecklistStatus({ clienteId, ano, mes }),
        listarChecklistPendencias({ clienteId, ano, mes }),
        listarChecklistEnvios({ clienteId, ano, mes, limite: 20 }),
      ]);
      setDetailsByClient((current) => ({
        ...current,
        [clienteId]: {
          loading: false,
          error: '',
          itens,
          statusRows,
          pendencias,
          envios,
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

  function clearChecklistFilters() {
    const currentCompetence = getCurrentCompetence();
    setSearch('');
    setResponsavel('');
    setMes(currentCompetence.mes);
    setAno(currentCompetence.ano);
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

      await Promise.all([
        loadResumo({ silent: true }),
        loadClientDetails(client.id, { force: true }),
      ]);
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

    const detail = detailsByClient[client.id] ?? {};
    const pendencias = detail.pendencias ?? [];
    const destinatario = String(values.email ?? '').trim();
    const cc = String(values.cc ?? '').trim();
    const assunto = buildReminderSubject(client, ano, mes);
    const texto = buildReminderText(client, ano, mes, pendencias);
    const html = buildReminderHtml(client, ano, mes, pendencias);

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
        competencia: { ano, mes, descricao: `${getMonthLabel(mes)}/${ano}` },
        pendencias: pendencias.map((pendencia) => ({
          item_id: pendencia.item_id,
          descricao: pendencia.item_descricao,
        })),
      });

      const emailResendId = sent && typeof sent === 'object' ? String(sent.id ?? '') : '';
      await registrarChecklistEnvio({
        cliente_id: client.id,
        competencias: [{ ano, mes }],
        destinatario,
        cc,
        assunto,
        qtd_pendencias: pendencias.length,
        email_resend_id: emailResendId,
      });

      await loadClientDetails(client.id, { force: true });
      setToast({
        tone: 'success',
        title: 'Lembrete enviado',
        message: `Lembrete enviado para ${destinatario} com ${formatNumber(pendencias.length)} pendência(s).`,
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
      <SurfacePanel
        title="Central de checklist"
        description="Acompanhe documentos pendentes por competência, configure itens por cliente e envie lembretes pelo e-mail do setor contábil."
        right={(
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge toneClass="border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200" size="md">
              <CalendarDays size={14} className="mr-1" aria-hidden="true" />
              {getMonthLabel(mes)}/{ano}
            </StatusBadge>
            <ActionButton type="button" variant="secondary" onClick={() => loadResumo()} disabled={loadingResumo}>
              <RefreshCcw size={16} className={loadingResumo ? 'animate-spin' : ''} aria-hidden="true" />
              Atualizar
            </ActionButton>
          </div>
        )}
        bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            title="Clientes com checklist"
            value={formatNumber(metrics.comChecklist)}
            detail={`${formatNumber(metrics.semChecklist)} ainda sem itens vinculados`}
            icon={ListChecks}
            tone="info"
            className="min-h-[132px]"
          />
          <MetricTile
            title="Com pendências"
            value={formatNumber(metrics.comPendencias)}
            detail={`${formatNumber(metrics.totalPendencias)} documento(s) pendente(s)`}
            icon={AlertTriangle}
            tone={metrics.comPendencias ? 'warning' : 'success'}
            className="min-h-[132px]"
          />
          <MetricTile
            title="Concluídos"
            value={formatNumber(metrics.concluidos)}
            detail="Clientes sem pendências na competência"
            icon={FileCheck2}
            tone="success"
            className="min-h-[132px]"
          />
          <MetricTile
            title="Carteira filtrada"
            value={formatNumber(filteredRows.length)}
            detail={`de ${formatNumber(rows.length)} cliente(s) ativos`}
            icon={Users}
            tone="muted"
            className="min-h-[132px]"
          />
        </div>
      </SurfacePanel>

      <SurfacePanel
        title="Filtros do checklist"
        description="Escolha a competência e refine a carteira antes de revisar pendências ou enviar lembretes."
        right={(
          <ActionButton type="button" variant="secondary" onClick={clearChecklistFilters}>
            <RefreshCcw size={16} aria-hidden="true" />
            Limpar filtros
          </ActionButton>
        )}
        bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6"
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_170px_140px_minmax(220px,0.9fr)]">
          <label className="space-y-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">
            Cliente, CNPJ ou razão social
            <div className="relative">
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
            label="Mês"
            value={mes}
            options={MONTH_OPTIONS}
            onChange={(value) => setMes(Number(value))}
            includeBlank={false}
          />

          <ChecklistDropdownSelect
            label="Ano"
            value={ano}
            options={yearOptions.map((year) => ({ value: year, label: String(year) }))}
            onChange={(value) => setAno(Number(value))}
            includeBlank={false}
          />

          <ChecklistDropdownSelect
            label="Responsável"
            value={responsavel}
            options={responsavelOptions}
            onChange={setResponsavel}
            includeBlank
            emptyLabel="Todos"
          />
        </div>
      </SurfacePanel>

      {error ? (
        <AlertBanner tone="danger" title="Erro ao carregar checklist">
          {error}
        </AlertBanner>
      ) : null}

      {contactsError ? (
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
            const hasContact = Boolean(contactsByClient[row.cliente_id]?.email);
            const progressWidth = Math.max(0, Math.min(100, row.percentual_concluido));

            return (
              <div key={row.cliente_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm transition hover:border-blue-300/55 hover:shadow-md dark:border-gray-800 dark:bg-gray-900/70 dark:hover:border-blue-500/45">
                <button
                  type="button"
                  onClick={() => toggleClient(row.cliente_id)}
                  className="grid w-full gap-4 px-4 py-4 text-left transition hover:bg-slate-50/80 sm:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,420px)] lg:items-center dark:hover:bg-gray-800/55"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-slate-950 dark:text-white">{row.nome}</p>
                      <StatusBadge
                        toneClass={hasContact
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'
                          : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}
                      >
                        {hasContact ? 'Contato salvo' : 'Sem contato'}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-gray-400">
                      {formatCnpj(row.cnpj)} · Responsável: {row.responsavel}
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
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
                  <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5 dark:border-gray-800 dark:bg-gray-950/20">
                    <ClientChecklistDetails
                      client={row.client}
                      detail={detailsByClient[row.cliente_id]}
                      ano={ano}
                      mes={mes}
                      contact={contactsByClient[row.cliente_id]}
                      catalogItems={catalogItems}
                      catalogLoading={catalogLoading}
                      catalogError={catalogError}
                      busyKey={busyKey}
                      savingConfigId={savingConfigId}
                      savingContactId={savingContactId}
                      sendingReminderId={sendingReminderId}
                      onReload={(clienteId) => loadClientDetails(clienteId, { force: true })}
                      onSaveClientItems={handleSaveClientItems}
                      onSaveContact={handleSaveContact}
                      onSendReminder={handleSendReminder}
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
