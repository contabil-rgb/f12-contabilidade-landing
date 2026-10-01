import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  Eye,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  atualizarChecklistAutomacaoCliente,
  atualizarChecklistAutomacaoClientesLote,
  atualizarChecklistAutomacaoConfiguracao,
  cancelarChecklistAutomacaoAgendamentoTeste,
  criarChecklistAutomacaoAgendamentoTeste,
  excluirChecklistAutomacaoFeriado,
  executarChecklistAutomacaoTeste,
  listarChecklistAutomacaoAgendamentosTeste,
  obterChecklistAutomacaoPainel,
  salvarChecklistAutomacaoFeriado,
  simularChecklistAutomacao,
  simularChecklistAutomacaoAgendamentoTeste,
  simularChecklistAutomacaoTeste,
} from '../../services/checklist-automacao.service';
import { formatCnpj, formatNumber, normalizeText } from '../../lib/formatters';
import ActionButton from '../ui/ActionButton';
import AlertBanner from '../ui/AlertBanner';
import DataTableShell from '../ui/DataTableShell';
import DropdownSelect from '../ui/DropdownSelect';
import MetricTile from '../ui/MetricTile';
import StatusBadge from '../ui/StatusBadge';
import SurfacePanel from '../ui/SurfacePanel';
import { classNames } from '../ui/classNames';

const MODE_OPTIONS = [
  { value: 'TESTE', label: 'Teste' },
  { value: 'REAL', label: 'Real' },
];

const CLIENT_FILTER_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'habilitados', label: 'Habilitados' },
  { value: 'pausados', label: 'Pausados' },
];

const HOLIDAY_SCOPE_OPTIONS = [
  { value: 'NACIONAL', label: 'Nacional' },
  { value: 'ESTADUAL', label: 'Estadual — Amazonas' },
  { value: 'MUNICIPAL', label: 'Municipal — Manaus' },
];

const SCHEDULE_SCOPE_OPTIONS = [
  { value: 'selecionados', label: 'Clientes selecionados' },
  { value: 'filtrados', label: 'Clientes elegíveis do filtro atual' },
  { value: 'todos', label: 'Todos os clientes elegíveis' },
];

const CLIENT_PAGE_SIZE = 25;
const SCHEDULE_LEAD_MINUTES = 2;

const EMPTY_HOLIDAY = {
  id: '',
  data: '',
  nome: '',
  abrangencia: 'NACIONAL',
  ativo: true,
  fonte: '',
};

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthToDate(value) {
  return value ? `${value}-01` : '';
}

function dateToMonth(value) {
  return value ? String(value).slice(0, 7) : '';
}

function formatDate(value, includeTime = false) {
  if (!value) return '—';
  const date = new Date(includeTime ? value : `${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pt-BR', includeTime
    ? { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Manaus' }
    : { dateStyle: 'short', timeZone: 'America/Manaus' }).format(date);
}

function fieldLabel(children) {
  return <span className="block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">{children}</span>;
}

function formatCompetence(value) {
  if (!value) return '—';
  if (typeof value === 'string') return dateToMonth(value).split('-').reverse().join('/');
  const month = String(value.mes ?? '').padStart(2, '0');
  return value.ano && month !== '00' ? `${month}/${value.ano}` : '—';
}

function createRequestKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `teste-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function manausDateTimeLocal(offsetMinutes = 0) {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Manaus',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function formatManausLocal(value) {
  if (!value) return '—';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return String(value);
  return `${match[3]}/${match[2]}/${match[1]}, ${match[4]}:${match[5]}`;
}

function scheduleStatus(status) {
  const states = {
    AGENDADO: ['Agendado', 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200'],
    PROCESSANDO: ['Processando', 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200'],
    CONCLUIDO: ['Concluído', 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'],
    CANCELADO: ['Cancelado', 'border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200'],
    FALHA: ['Falha', 'border-red-300 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200'],
  };
  return states[status] ?? [status || 'Desconhecido', states.CANCELADO[1]];
}

function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={classNames(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:ring-4 focus-visible:ring-blue-500/15',
        checked
          ? 'border-emerald-500 bg-emerald-500'
          : 'border-slate-300 bg-slate-200 dark:border-gray-600 dark:bg-gray-700',
        disabled && 'cursor-not-allowed opacity-55',
      )}
    >
      <span className={classNames('h-5 w-5 rounded-full bg-white shadow-sm transition', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

function ConfirmDialog({ dialog, busy, onCancel, onConfirm }) {
  if (!dialog || typeof document === 'undefined') return null;
  return createPortal(
    <div className="modal-backdrop z-[10000] flex items-center justify-center" role="presentation">
      <div className="modal-panel modal-panel-sm" role="dialog" aria-modal="true" aria-labelledby="automation-confirm-title">
        <div className="modal-header flex items-start justify-between gap-4">
          <div>
            <h3 id="automation-confirm-title" className="text-xl font-black text-slate-950 dark:text-white">{dialog.title}</h3>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600 dark:text-gray-300">{dialog.message}</p>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800" onClick={onCancel} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        {dialog.warning ? (
          <div className="modal-body">
            <AlertBanner tone="warning" title="Ação protegida">{dialog.warning}</AlertBanner>
          </div>
        ) : null}
        <div className="modal-footer flex justify-end gap-2">
          <ActionButton type="button" variant="subtle" onClick={onCancel} disabled={busy}>Cancelar</ActionButton>
          <ActionButton type="button" variant={dialog.danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? <RefreshCcw size={16} className="animate-spin" /> : dialog.danger ? <Trash2 size={16} /> : <CheckCircle2 size={16} />}
            {dialog.confirmLabel || 'Confirmar'}
          </ActionButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ManualTestDialog({ state, busy, onCancel, onConfirm }) {
  if (!state || typeof document === 'undefined') return null;
  const previewJobs = Array.isArray(state.preview?.trabalhos) ? state.preview.trabalhos : [];
  const previewSummary = state.preview?.resumo && typeof state.preview.resumo === 'object' ? state.preview.resumo : {};
  const processing = state.result?.processamento && typeof state.result.processamento === 'object' ? state.result.processamento : {};
  const processingResults = Array.isArray(processing.resultados) ? processing.resultados : [];
  const preparedWorks = Array.isArray(state.result?.preparacao?.trabalhos) ? state.result.preparacao.trabalhos : [];
  const preparedById = new Map(preparedWorks.map((work) => [String(work.id), work]));
  const completed = Boolean(state.result);

  return createPortal(
    <div className="modal-backdrop z-[10000] flex items-center justify-center" role="presentation">
      <div className="modal-panel modal-panel-xl" role="dialog" aria-modal="true" aria-labelledby="manual-test-title">
        <div className="modal-header flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="manual-test-title" className="text-xl font-black text-slate-950 dark:text-white">{completed ? 'Resultado do teste da automação' : 'Revisar teste da automação'}</h3>
              <StatusBadge toneClass="border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">Modo TESTE</StatusBadge>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-gray-300">Competência {formatCompetence(state.month)} · {formatNumber(state.clientIds.length)} cliente(s) selecionado(s)</p>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800" onClick={onCancel} disabled={busy} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="modal-body space-y-4">
          {completed ? (
            <>
              <AlertBanner tone={Number(processing.falhas ?? 0) > 0 ? 'warning' : 'success'} title={Number(processing.falhas ?? 0) > 0 ? 'Teste concluído com falhas' : 'Teste concluído'}>
                Foram enviados {formatNumber(processing.enviados ?? 0)} lembrete(s). {formatNumber(processing.falhas ?? 0)} envio(s) falharam. A execução ficou registrada no histórico.
              </AlertBanner>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Preparados', state.result?.preparacao?.resumo?.preparados ?? 0],
                  ['Enviados', processing.enviados ?? 0],
                  ['Falhas', processing.falhas ?? 0],
                ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-gray-700 dark:bg-gray-950/25"><p className="text-[11px] font-black uppercase text-slate-500 dark:text-gray-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{formatNumber(value)}</p></div>)}
              </div>
              <div className="space-y-2">
                {processingResults.map((result, index) => {
                  const work = preparedById.get(String(result.trabalho_id)) ?? preparedWorks[index] ?? {};
                  return <div key={String(result.trabalho_id ?? index)} className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-gray-700 dark:bg-gray-950/25"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-black text-slate-900 dark:text-white">{work.cliente_nome || `Cliente ${index + 1}`}</p><p className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-400">Tentativa {formatNumber(result.tentativa ?? 1)}{result.resend_id ? ` · Resend ${result.resend_id}` : ''}</p>{result.erro_mensagem ? <p className="mt-2 text-sm font-semibold text-red-600 dark:text-red-300">{result.erro_mensagem}</p> : null}</div><StatusBadge toneClass={result.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-red-300 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200'}>{result.ok ? 'Enviado' : 'Falhou'}</StatusBadge></div></div>;
                })}
                {!processingResults.length ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-medium text-slate-500 dark:border-gray-700 dark:text-gray-400">Nenhum e-mail precisou ser processado para esta seleção.</p> : null}
              </div>
            </>
          ) : (
            <>
              <AlertBanner tone="warning" title="Confirmação obrigatória">
                Ao confirmar, os e-mails abaixo serão enviados agora somente para os destinatários de teste configurados. Os contatos reais aparecem apenas para conferência.
              </AlertBanner>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Preparados', previewSummary.preparados ?? 0],
                  ['Pendências', previewSummary.total_pendencias ?? 0],
                  ['Sem pendências', previewSummary.sem_pendencias ?? 0],
                ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-gray-700 dark:bg-gray-950/25"><p className="text-[11px] font-black uppercase text-slate-500 dark:text-gray-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{formatNumber(value)}</p></div>)}
              </div>
              <div className="max-h-[48vh] space-y-3 overflow-y-auto pr-1">
                {previewJobs.map((job, index) => {
                  const competences = Array.isArray(job.competencias) ? job.competencias.map(formatCompetence).join(', ') : '—';
                  return <div key={`${job.cliente_id || index}-${job.resultado || ''}`} className="rounded-xl border border-slate-200 bg-white/60 p-4 dark:border-gray-700 dark:bg-gray-950/25"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-black text-slate-900 dark:text-white">{job.cliente_nome || 'Cliente'}</p><p className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-400">{formatNumber(job.qtd_pendencias ?? 0)} pendência(s) · Competências: {competences}</p></div><StatusBadge toneClass={job.resultado === 'PREPARADO' ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200'}>{job.resultado || 'ANALISADO'}</StatusBadge></div><div className="mt-3 grid gap-3 border-t border-slate-200 pt-3 text-xs dark:border-gray-700 md:grid-cols-2"><div><p className="font-black uppercase text-slate-500 dark:text-gray-400">Contato cadastrado</p><p className="mt-1 break-all font-semibold text-slate-700 dark:text-gray-200">{job.destinatario_original || 'Sem e-mail principal'}{job.cc_original ? ` · Cc: ${job.cc_original}` : ''}</p></div><div><p className="font-black uppercase text-blue-600 dark:text-blue-300">Destino efetivo do teste</p><p className="mt-1 break-all font-semibold text-slate-700 dark:text-gray-200">{job.destinatario_efetivo || '—'}{job.cc_efetivo ? ` · Cc: ${job.cc_efetivo}` : ''}</p></div></div>{job.motivo ? <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-200">{job.motivo}</p> : null}</div>;
                })}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer flex flex-wrap justify-end gap-2">
          <ActionButton type="button" variant="subtle" onClick={onCancel} disabled={busy}>{completed ? 'Fechar' : 'Cancelar'}</ActionButton>
          {!completed ? <ActionButton type="button" variant="primary" onClick={onConfirm} disabled={busy || Number(previewSummary.preparados ?? 0) < 1}>{busy ? <RefreshCcw size={16} className="animate-spin" /> : <Send size={16} />}Confirmar e enviar teste</ActionButton> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ScheduledTestDialog({ state, busy, onCancel, onConfirm }) {
  if (!state || typeof document === 'undefined') return null;
  const jobs = Array.isArray(state.preview?.trabalhos) ? state.preview.trabalhos : [];
  const summary = state.preview?.resumo && typeof state.preview.resumo === 'object' ? state.preview.resumo : {};

  return createPortal(
    <div className="modal-backdrop z-[10000] flex items-center justify-center" role="presentation">
      <div className="modal-panel modal-panel-xl" role="dialog" aria-modal="true" aria-labelledby="scheduled-test-title">
        <div className="modal-header flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="scheduled-test-title" className="text-xl font-black text-slate-950 dark:text-white">Revisar teste agendado</h3>
              <StatusBadge toneClass="border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200">Modo TESTE</StatusBadge>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-gray-300">
              Competência {formatCompetence(state.competence)} · {formatManausLocal(state.dateTime)} (Manaus)
            </p>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800" onClick={onCancel} disabled={busy} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="modal-body space-y-4">
          <AlertBanner tone="warning" title="Revise antes de confirmar">
            O agendamento será gravado com os destinatários de teste abaixo. Nenhum e-mail será enviado durante esta confirmação.
          </AlertBanner>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Preparados', summary.preparados ?? 0],
              ['Pendências', summary.total_pendencias ?? 0],
              ['Sem pendências', summary.sem_pendencias ?? 0],
            ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-gray-700 dark:bg-gray-950/25"><p className="text-[11px] font-black uppercase text-slate-500 dark:text-gray-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{formatNumber(value)}</p></div>)}
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-sm dark:border-blue-400/25 dark:bg-blue-400/10">
            <p className="font-black text-blue-800 dark:text-blue-200">Destinos congelados no agendamento</p>
            <p className="mt-1 break-all font-semibold text-slate-700 dark:text-gray-200">Para: {state.preview?.destinatario_teste || '—'} · Cc: {state.preview?.cc_teste || '—'}</p>
          </div>
          <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
            {jobs.map((job, index) => (
              <div key={`${job.cliente_id || index}-${job.resultado || ''}`} className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-gray-700 dark:bg-gray-950/25">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div><p className="font-black text-slate-900 dark:text-white">{job.cliente_nome || 'Cliente'}</p><p className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-400">{formatNumber(job.qtd_pendencias ?? 0)} pendência(s){job.responsavel ? ` · Responsável: ${job.responsavel}` : ''}</p></div>
                  <StatusBadge toneClass={job.resultado === 'PREPARADO' ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200'}>{job.resultado || 'ANALISADO'}</StatusBadge>
                </div>
                {job.motivo ? <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-200">{job.motivo}</p> : null}
              </div>
            ))}
            {!jobs.length ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-medium text-slate-500 dark:border-gray-700 dark:text-gray-400">Nenhum cliente elegível foi encontrado para este escopo.</p> : null}
          </div>
        </div>

        <div className="modal-footer flex flex-wrap justify-end gap-2">
          <ActionButton type="button" variant="subtle" onClick={onCancel} disabled={busy}>Cancelar</ActionButton>
          <ActionButton type="button" variant="primary" onClick={onConfirm} disabled={busy || Number(summary.preparados ?? 0) < 1}>{busy ? <RefreshCcw size={16} className="animate-spin" /> : <CalendarDays size={16} />}Confirmar agendamento</ActionButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ChecklistAutomationPanel() {
  const [panel, setPanel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [config, setConfig] = useState(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('todos');
  const [clientResponsible, setClientResponsible] = useState('');
  const [clientLimit, setClientLimit] = useState(CLIENT_PAGE_SIZE);
  const [selectedClients, setSelectedClients] = useState([]);
  const [clientAction, setClientAction] = useState(null);
  const [clientActionForm, setClientActionForm] = useState({ competencia: '', motivo: '' });
  const [holidayForm, setHolidayForm] = useState(EMPTY_HOLIDAY);
  const [simulationMonth, setSimulationMonth] = useState(currentMonth());
  const [simulation, setSimulation] = useState(null);
  const [manualTestMonth, setManualTestMonth] = useState(currentMonth());
  const [manualTest, setManualTest] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({ competence: currentMonth(), dateTime: manausDateTimeLocal(SCHEDULE_LEAD_MINUTES), scope: 'selecionados' });
  const [scheduleDateTimeAutomatic, setScheduleDateTimeAutomatic] = useState(true);
  const [scheduledTests, setScheduledTests] = useState([]);
  const [schedulePreview, setSchedulePreview] = useState(null);
  const [dialog, setDialog] = useState(null);

  async function loadPanel({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [data, schedules] = await Promise.all([
        obterChecklistAutomacaoPainel(),
        listarChecklistAutomacaoAgendamentosTeste(50),
      ]);
      setPanel(data);
      setScheduledTests(schedules);
      setConfig({ ...data.configuracao });
      setSelectedClients((current) => current.filter((id) => data.clientes.some((client) => client.cliente_id === id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os controles da automação.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadPanel();
  }, []);

  useEffect(() => {
    if (!notice || notice.tone === 'danger') return undefined;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!scheduleDateTimeAutomatic) return undefined;

    const syncWithManaus = () => {
      const currentManausDateTime = manausDateTimeLocal(SCHEDULE_LEAD_MINUTES);
      setScheduleForm((current) => current.dateTime === currentManausDateTime
        ? current
        : { ...current, dateTime: currentManausDateTime });
    };

    syncWithManaus();
    const timer = window.setInterval(syncWithManaus, 1000);
    return () => window.clearInterval(timer);
  }, [scheduleDateTimeAutomatic]);

  const filteredClients = useMemo(() => {
    const search = normalizeText(clientSearch);
    return (panel?.clientes ?? []).filter((client) => {
      if (client.arquivado || ['inativo', 'em distrato'].includes(normalizeText(client.status))) return false;
      if (clientFilter === 'habilitados' && !client.habilitada) return false;
      if (clientFilter === 'pausados' && client.habilitada) return false;
      if (clientResponsible && client.responsavel !== clientResponsible) return false;
      return !search || normalizeText(`${client.nome} ${client.cnpj} ${client.responsavel || ''}`).includes(search);
    });
  }, [clientFilter, clientResponsible, clientSearch, panel?.clientes]);

  const responsibleOptions = useMemo(() => Array.from(new Set(
    (panel?.clientes ?? []).map((client) => client.responsavel).filter(Boolean),
  )).sort((left, right) => left.localeCompare(right, 'pt-BR')).map((responsible) => ({ value: responsible, label: responsible })), [panel?.clientes]);

  const selectedClientRows = useMemo(() => (panel?.clientes ?? []).filter((client) => selectedClients.includes(client.cliente_id)), [panel?.clientes, selectedClients]);
  const filteredEligibleClients = useMemo(() => filteredClients.filter((client) => (
    client.habilitada
    && !client.arquivado
    && normalizeText(client.status) === 'ativo'
    && Boolean(client.competencia_inicial)
  )), [filteredClients]);
  const maxManualTestClients = Number(panel?.regras_fixas?.maximo_clientes_teste_manual) || 10;
  const manualTestBlock = useMemo(() => {
    if (!selectedClientRows.length) return 'Selecione de 1 a 10 clientes para preparar o teste.';
    if (selectedClientRows.length > maxManualTestClients) return `O teste manual aceita no máximo ${maxManualTestClients} clientes por execução.`;
    if (config?.modo !== 'TESTE') return 'Altere a configuração global para o modo TESTE antes de executar.';
    const invalid = selectedClientRows.find((client) => !client.habilitada || client.arquivado || normalizeText(client.status) !== 'ativo' || !client.competencia_inicial);
    if (invalid) return `${invalid.nome} precisa estar ativo, habilitado e com competência inicial definida.`;
    return '';
  }, [config?.modo, maxManualTestClients, selectedClientRows]);

  useEffect(() => {
    setClientLimit(CLIENT_PAGE_SIZE);
  }, [clientFilter, clientResponsible, clientSearch]);

  const configChanged = useMemo(() => {
    if (!config || !panel?.configuracao) return false;
    return [
      'ativa', 'modo', 'email_teste_destinatario', 'email_teste_cc',
      'email_resumo_destinatario', 'email_resumo_cc', 'notificar_alteracoes',
    ].some((key) => config[key] !== panel.configuracao[key]);
  }, [config, panel?.configuracao]);

  function showSuccess(title, message) {
    setNotice({ tone: 'success', title, message });
  }

  function showFailure(title, err) {
    setNotice({ tone: 'danger', title, message: err instanceof Error ? err.message : 'Não foi possível concluir a operação.' });
  }

  function requestSaveConfig() {
    if (!configChanged) return;
    const current = panel.configuracao;
    const confirmations = [];
    const sensitive = [];
    if (!current.ativa && config.ativa) {
      confirmations.push('ATIVAR AUTOMACAO');
      sensitive.push('ativar globalmente os envios automáticos');
    }
    if (current.modo !== 'REAL' && config.modo === 'REAL') {
      confirmations.push('ATIVAR MODO REAL');
      sensitive.push('alterar para o modo REAL');
    }
    if (current.email_teste_destinatario !== config.email_teste_destinatario || current.email_teste_cc !== config.email_teste_cc) {
      confirmations.push('ALTERAR DESTINATARIOS DE TESTE');
      sensitive.push('alterar os destinatários de teste');
    }
    if (current.email_resumo_destinatario !== config.email_resumo_destinatario || current.email_resumo_cc !== config.email_resumo_cc) {
      confirmations.push('ALTERAR DESTINATARIOS DO RESUMO');
      sensitive.push('alterar os destinatários do resumo de falhas');
    }

    const execute = async () => {
      setBusy(true);
      try {
        await atualizarChecklistAutomacaoConfiguracao({
          ativa: config.ativa,
          modo: config.modo,
          email_teste_destinatario: config.email_teste_destinatario.trim(),
          email_teste_cc: config.email_teste_cc.trim(),
          email_resumo_destinatario: config.email_resumo_destinatario.trim(),
          email_resumo_cc: config.email_resumo_cc.trim(),
          notificar_alteracoes: config.notificar_alteracoes,
        }, confirmations);
        await loadPanel({ silent: true });
        showSuccess('Configuração salva', 'As configurações globais foram atualizadas e registradas na auditoria.');
      } catch (err) {
        showFailure('Erro ao salvar configuração', err);
      } finally {
        setBusy(false);
        setDialog(null);
      }
    };

    if (sensitive.length) {
      setDialog({
        title: 'Confirmar alterações protegidas',
        message: `Você está prestes a ${sensitive.join(', ')}.`,
        warning: config.modo === 'REAL'
          ? 'No modo REAL, os lembretes poderão ser enviados aos contatos cadastrados dos clientes habilitados.'
          : config.ativa
            ? 'No modo TESTE, os lembretes serão direcionados somente aos endereços de teste configurados.'
            : 'Revise os novos endereços antes de confirmar.',
        confirmLabel: 'Salvar alterações',
        execute,
      });
    } else {
      execute();
    }
  }

  function openClientAction(clientIds, enable) {
    const configuredCompetences = Array.from(new Set(
      (panel?.clientes ?? [])
        .filter((client) => clientIds.includes(client.cliente_id))
        .map((client) => client.competencia_inicial ? dateToMonth(client.competencia_inicial) : '')
        .filter(Boolean),
    ));
    setClientAction({ clientIds, enable });
    setClientActionForm({
      competencia: enable && configuredCompetences.length === 1 ? configuredCompetences[0] : '',
      motivo: '',
    });
  }

  async function executeClientAction() {
    if (!clientAction) return;
    if (clientAction.enable && !clientActionForm.competencia) {
      setNotice({ tone: 'warning', title: 'Competência obrigatória', message: 'Informe a competência inicial dos clientes.' });
      return;
    }
    if (!clientAction.enable && !clientActionForm.motivo.trim()) {
      setNotice({ tone: 'warning', title: 'Motivo obrigatório', message: 'Informe o motivo da pausa.' });
      return;
    }
    setBusy(true);
    try {
      const values = {
        habilitada: clientAction.enable,
        competenciaInicial: clientAction.enable ? monthToDate(clientActionForm.competencia) : null,
        motivoPausa: clientAction.enable ? null : clientActionForm.motivo.trim(),
      };
      if (clientAction.clientIds.length === 1) {
        await atualizarChecklistAutomacaoCliente({ clienteId: clientAction.clientIds[0], ...values });
      } else {
        await atualizarChecklistAutomacaoClientesLote({ clienteIds: clientAction.clientIds, ...values });
      }
      await loadPanel({ silent: true });
      setSelectedClients([]);
      setClientAction(null);
      showSuccess(
        clientAction.enable ? 'Automação habilitada' : 'Automação pausada',
        `${formatNumber(clientAction.clientIds.length)} cliente(s) atualizado(s) com sucesso.`,
      );
    } catch (err) {
      showFailure('Erro ao alterar clientes', err);
    } finally {
      setBusy(false);
    }
  }

  async function saveHoliday(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await salvarChecklistAutomacaoFeriado({
        ...holidayForm,
        id: holidayForm.id || null,
      });
      await loadPanel({ silent: true });
      setHolidayForm(EMPTY_HOLIDAY);
      showSuccess('Feriado salvo', 'O calendário de dias úteis foi atualizado.');
    } catch (err) {
      showFailure('Erro ao salvar feriado', err);
    } finally {
      setBusy(false);
    }
  }

  function requestDeleteHoliday(holiday) {
    setDialog({
      title: 'Excluir feriado',
      message: `Confirma a exclusão de “${holiday.nome}”, em ${formatDate(holiday.data)}?`,
      warning: 'A exclusão pode alterar o cálculo do segundo dia útil das próximas execuções.',
      danger: true,
      confirmLabel: 'Excluir feriado',
      execute: async () => {
        setBusy(true);
        try {
          await excluirChecklistAutomacaoFeriado(holiday.id);
          await loadPanel({ silent: true });
          showSuccess('Feriado excluído', 'O calendário foi atualizado e a exclusão foi auditada.');
        } catch (err) {
          showFailure('Erro ao excluir feriado', err);
        } finally {
          setBusy(false);
          setDialog(null);
        }
      },
    });
  }

  async function runSimulation() {
    if (!simulationMonth) return;
    setBusy(true);
    try {
      const result = await simularChecklistAutomacao(monthToDate(simulationMonth));
      setSimulation(result);
      showSuccess('Simulação concluída', 'Nenhuma execução, trabalho ou e-mail foi criado.');
    } catch (err) {
      showFailure('Erro na simulação', err);
    } finally {
      setBusy(false);
    }
  }

  async function prepareManualTest() {
    if (manualTestBlock) {
      setNotice({ tone: 'warning', title: 'Teste indisponível', message: manualTestBlock });
      return;
    }
    if (!manualTestMonth) {
      setNotice({ tone: 'warning', title: 'Competência obrigatória', message: 'Informe a competência de referência do teste.' });
      return;
    }
    setBusy(true);
    try {
      const preview = await simularChecklistAutomacaoTeste(monthToDate(manualTestMonth), selectedClients);
      setManualTest({
        month: monthToDate(manualTestMonth),
        clientIds: [...selectedClients],
        requestKey: createRequestKey(),
        preview,
        result: null,
      });
      setNotice(null);
    } catch (err) {
      showFailure('Erro ao preparar o teste', err);
    } finally {
      setBusy(false);
    }
  }

  async function executeManualTest() {
    if (!manualTest || manualTest.result) return;
    setBusy(true);
    try {
      const result = await executarChecklistAutomacaoTeste({
        competenciaReferencia: manualTest.month,
        clienteIds: manualTest.clientIds,
        chaveRequisicao: manualTest.requestKey,
      });
      setManualTest((current) => ({ ...current, result }));
      await loadPanel({ silent: true });
      setSelectedClients([]);
      const processing = result?.processamento && typeof result.processamento === 'object' ? result.processamento : {};
      const failures = Number(processing.falhas ?? 0);
      setNotice({
        tone: failures ? 'warning' : 'success',
        title: failures ? 'Teste concluído com falhas' : 'Teste concluído',
        message: `${formatNumber(processing.enviados ?? 0)} lembrete(s) enviado(s) e ${formatNumber(failures)} falha(s).`,
      });
    } catch (err) {
      showFailure('Erro ao executar o teste', err);
    } finally {
      setBusy(false);
    }
  }

  function resolveScheduleScope() {
    if (scheduleForm.scope === 'todos') {
      return { backendScope: 'TODOS_ELEGIVEIS', clientIds: null, description: 'todos os clientes elegíveis' };
    }
    const rows = scheduleForm.scope === 'filtrados' ? filteredEligibleClients : selectedClientRows;
    const label = scheduleForm.scope === 'filtrados' ? 'do filtro atual' : 'selecionados';
    return {
      backendScope: 'CLIENTES_SELECIONADOS',
      clientIds: rows.map((client) => client.cliente_id),
      description: `${formatNumber(rows.length)} cliente(s) ${label}`,
    };
  }

  async function prepareScheduledTest() {
    if (configChanged) {
      setNotice({ tone: 'warning', title: 'Configuração ainda não salva', message: 'Salve ou descarte as alterações da configuração global antes de preparar o agendamento.' });
      return;
    }
    if (config?.modo !== 'TESTE') {
      setNotice({ tone: 'warning', title: 'Modo TESTE obrigatório', message: 'Altere e salve a configuração global no modo TESTE antes de agendar.' });
      return;
    }
    if (config?.ativa) {
      setNotice({ tone: 'warning', title: 'Pause a automação global', message: 'O agendamento de teste só pode ser criado enquanto a automação global estiver pausada.' });
      return;
    }
    if (!scheduleForm.competence || !scheduleForm.dateTime) {
      setNotice({ tone: 'warning', title: 'Preencha o agendamento', message: 'Informe a competência, a data e o horário de Manaus.' });
      return;
    }
    if (scheduleForm.dateTime <= manausDateTimeLocal()) {
      setSchedulePreview(null);
      setScheduleDateTimeAutomatic(true);
      setNotice({ tone: 'warning', title: 'Horário já vencido', message: 'O horário precisa estar no futuro. O campo foi sincronizado novamente com uma margem de 2 minutos.' });
      return;
    }

    const scope = resolveScheduleScope();
    if (scope.backendScope === 'CLIENTES_SELECIONADOS' && !scope.clientIds.length) {
      setNotice({ tone: 'warning', title: 'Nenhum cliente elegível', message: scheduleForm.scope === 'filtrados' ? 'O filtro atual não contém clientes ativos, habilitados e configurados.' : 'Selecione pelo menos um cliente elegível na tabela.' });
      return;
    }
    if (scope.clientIds?.length > 500) {
      setNotice({ tone: 'warning', title: 'Seleção muito grande', message: 'O agendamento aceita no máximo 500 clientes em uma seleção direcionada.' });
      return;
    }

    setBusy(true);
    try {
      const preview = await simularChecklistAutomacaoAgendamentoTeste({
        competenciaReferencia: monthToDate(scheduleForm.competence),
        escopo: scope.backendScope,
        clienteIds: scope.clientIds,
      });
      setSchedulePreview({
        competence: monthToDate(scheduleForm.competence),
        dateTime: scheduleForm.dateTime,
        scope: scope.backendScope,
        clientIds: scope.clientIds,
        description: scope.description,
        requestKey: createRequestKey(),
        preview,
      });
      setNotice(null);
    } catch (err) {
      showFailure('Erro ao preparar o agendamento', err);
    } finally {
      setBusy(false);
    }
  }

  async function confirmScheduledTest() {
    if (!schedulePreview) return;
    if (schedulePreview.dateTime <= manausDateTimeLocal()) {
      setSchedulePreview(null);
      setScheduleDateTimeAutomatic(true);
      setNotice({ tone: 'warning', title: 'Revisão expirada', message: 'O horário desta revisão já passou. O campo foi atualizado; revise novamente o agendamento.' });
      return;
    }
    setBusy(true);
    try {
      const result = await criarChecklistAutomacaoAgendamentoTeste({
        competenciaReferencia: schedulePreview.competence,
        dataHoraLocal: schedulePreview.dateTime.replace('T', ' '),
        escopo: schedulePreview.scope,
        clienteIds: schedulePreview.clientIds,
        chaveRequisicao: schedulePreview.requestKey,
      });
      await loadPanel({ silent: true });
      setSchedulePreview(null);
      setScheduleDateTimeAutomatic(true);
      showSuccess('Teste agendado', `O teste ficou programado para ${formatManausLocal(result?.data_hora_manaus || scheduleForm.dateTime)}, no horário de Manaus.`);
    } catch (err) {
      showFailure('Erro ao criar o agendamento', err);
    } finally {
      setBusy(false);
    }
  }

  function requestCancelScheduledTest(schedule) {
    setDialog({
      title: 'Cancelar teste agendado',
      message: `Confirma o cancelamento do teste programado para ${formatManausLocal(schedule.data_hora_manaus)}?`,
      warning: 'O cancelamento é definitivo e ficará registrado na auditoria. Ele só é permitido antes do início do processamento.',
      danger: true,
      confirmLabel: 'Cancelar agendamento',
      execute: async () => {
        setBusy(true);
        try {
          await cancelarChecklistAutomacaoAgendamentoTeste(schedule.id);
          await loadPanel({ silent: true });
          showSuccess('Agendamento cancelado', 'O teste agendado foi cancelado e não poderá mais ser processado.');
        } catch (err) {
          showFailure('Erro ao cancelar o agendamento', err);
        } finally {
          setBusy(false);
          setDialog(null);
        }
      },
    });
  }

  if (loading) {
    return (
      <SurfacePanel className="p-10">
        <div className="flex items-center justify-center gap-3 text-sm font-bold text-slate-600 dark:text-gray-300">
          <RefreshCcw size={20} className="animate-spin text-blue-600" />
          Carregando controles seguros da automação...
        </div>
      </SurfacePanel>
    );
  }

  if (error && !panel) {
    return (
      <AlertBanner tone="danger" title="Controles indisponíveis">
        <p>{error}</p>
        <ActionButton type="button" size="sm" variant="danger" className="mt-3" onClick={() => loadPanel()}>Tentar novamente</ActionButton>
      </AlertBanner>
    );
  }

  const summary = panel.resumo;
  const rules = panel.regras_fixas;
  const simulationSummary = simulation?.resumo && typeof simulation.resumo === 'object' ? simulation.resumo : null;
  const simulationJobs = Array.isArray(simulation?.trabalhos) ? simulation.trabalhos : [];

  return (
    <div className="space-y-5">
      {notice ? <AlertBanner tone={notice.tone} title={notice.title}>{notice.message}</AlertBanner> : null}

      <SurfacePanel
        title="Controle da automação"
        description="Administre a cobrança automática de documentos com as mesmas permissões para Coordenador e Setor Contábil."
        right={(
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge size="md" toneClass={config.ativa
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200'
              : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200'}>
              {config.ativa ? <PlayCircle size={14} className="mr-1" /> : <PauseCircle size={14} className="mr-1" />}
              {config.ativa ? 'Ativa' : 'Pausada'}
            </StatusBadge>
            <StatusBadge size="md" toneClass={config.modo === 'REAL'
              ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200'
              : 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200'}>
              Modo {config.modo}
            </StatusBadge>
            <ActionButton type="button" variant="secondary" onClick={() => loadPanel()} disabled={busy}>
              <RefreshCcw size={16} className={busy ? 'animate-spin' : ''} /> Atualizar
            </ActionButton>
          </div>
        )}
        bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile title="Clientes habilitados" value={formatNumber(summary.clientes_habilitados)} detail={`de ${formatNumber(summary.clientes_total)} cliente(s)`} icon={Users} tone="success" className="min-h-[126px]" />
          <MetricTile title="Trabalhos pendentes" value={formatNumber(summary.trabalhos_pendentes)} detail="Na fila de processamento" icon={Clock3} tone={summary.trabalhos_pendentes ? 'warning' : 'muted'} className="min-h-[126px]" />
          <MetricTile title="Execuções registradas" value={formatNumber(summary.execucoes_total)} detail="Histórico da automação" icon={Activity} tone="info" className="min-h-[126px]" />
          <MetricTile title="Próxima regra" value="2º dia útil" detail="Às 08:00, horário de Manaus" icon={CalendarDays} tone="violet" className="min-h-[126px]" />
        </div>
      </SurfacePanel>

      <SurfacePanel title="Configuração global" description="As alterações ficam registradas na auditoria. Ações de maior impacto exigem confirmação adicional." bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white/55 p-4 dark:border-gray-700 dark:bg-gray-950/25">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-gray-700">
              <div>
                <p className="font-black text-slate-900 dark:text-white">Automação global</p>
                <p className="mt-1 text-sm font-medium text-slate-500 dark:text-gray-300">Pausar impede novas preparações e reservas.</p>
              </div>
              <Toggle checked={config.ativa} onChange={(value) => setConfig((current) => ({ ...current, ativa: value }))} label="Ativar automação global" />
            </div>
            <div className="mt-4">
              <DropdownSelect label="Modo de envio" value={config.modo} options={MODE_OPTIONS} includeBlank={false} searchable={false} onChange={(value) => setConfig((current) => ({ ...current, modo: value }))} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-slate-800 dark:text-gray-100">Notificar alterações</p>
                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-400">Mantém avisos operacionais habilitados.</p>
              </div>
              <Toggle checked={config.notificar_alteracoes} onChange={(value) => setConfig((current) => ({ ...current, notificar_alteracoes: value }))} label="Notificar alterações" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>{fieldLabel('Destinatário de teste')}<input type="email" value={config.email_teste_destinatario} onChange={(event) => setConfig((current) => ({ ...current, email_teste_destinatario: event.target.value }))} className="input-shell mt-2 normal-case" /></label>
            <label>{fieldLabel('Cópia do teste')}<input type="email" value={config.email_teste_cc} onChange={(event) => setConfig((current) => ({ ...current, email_teste_cc: event.target.value }))} className="input-shell mt-2 normal-case" /></label>
            <label>{fieldLabel('Resumo das falhas')}<input type="email" value={config.email_resumo_destinatario} onChange={(event) => setConfig((current) => ({ ...current, email_resumo_destinatario: event.target.value }))} className="input-shell mt-2 normal-case" /></label>
            <label>{fieldLabel('Cópia do resumo')}<input type="email" value={config.email_resumo_cc} onChange={(event) => setConfig((current) => ({ ...current, email_resumo_cc: event.target.value }))} className="input-shell mt-2 normal-case" /></label>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Fuso horário', rules.fuso_horario],
            ['Execução mensal', `${rules.dia_util_ordem}º dia útil`],
            ['Horário', String(rules.horario_local).slice(0, 5)],
            ['Tentativas', rules.intervalos_tentativas_minutos.map((minute) => minute === 0 ? '08:00' : minute === 15 ? '08:15' : '08:45').join(', ')],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-gray-700 dark:bg-gray-900/50">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-gray-400">{label}</p>
              <p className="mt-1.5 font-black text-slate-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <ActionButton type="button" variant="subtle" disabled={!configChanged || busy} onClick={() => setConfig({ ...panel.configuracao })}>Descartar</ActionButton>
          <ActionButton type="button" variant="primary" disabled={!configChanged || busy} onClick={requestSaveConfig}><Save size={16} /> Salvar configuração</ActionButton>
        </div>
      </SurfacePanel>

      <SurfacePanel
        title="Clientes da automação"
        description="Habilite clientes individualmente ou em lote. A competência inicial define a partir de quando as pendências anteriores serão consideradas."
        right={selectedClients.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge size="md" toneClass="border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200">{selectedClients.length} selecionado(s)</StatusBadge>
            <ActionButton type="button" size="sm" variant="primary" onClick={prepareManualTest} disabled={busy}><Eye size={15} /> Executar teste agora</ActionButton>
            <ActionButton type="button" size="sm" variant="primary" onClick={() => openClientAction(selectedClients, true)}>Habilitar</ActionButton>
            <ActionButton type="button" size="sm" variant="secondary" onClick={() => openClientAction(selectedClients, false)}>Pausar</ActionButton>
          </div>
        ) : null}
        bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_220px_240px_190px]">
          <label className="relative">
            {fieldLabel('Cliente ou CNPJ')}
            <Search size={17} className="absolute bottom-3.5 left-3 text-slate-400" />
            <input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Pesquisar cliente" className="input-shell mt-2 pl-10 normal-case" />
          </label>
          <DropdownSelect label="Situação" value={clientFilter} options={CLIENT_FILTER_OPTIONS} includeBlank={false} searchable={false} onChange={setClientFilter} />
          <DropdownSelect label="Responsável" value={clientResponsible} options={responsibleOptions} emptyLabel="Todos" searchPlaceholder="Pesquisar responsável" onChange={setClientResponsible} />
          <label>{fieldLabel('Competência do teste')}<input type="month" max={currentMonth()} value={manualTestMonth} onChange={(event) => setManualTestMonth(event.target.value)} className="input-shell mt-2 normal-case" /></label>
        </div>
        {selectedClients.length ? <div className="mt-4"><AlertBanner tone={manualTestBlock ? 'warning' : 'info'} title={manualTestBlock ? 'Revise a seleção para o teste' : 'Seleção pronta para teste'}>{manualTestBlock || `A prévia será calculada para ${formatNumber(selectedClients.length)} cliente(s). O envio só começa depois da confirmação.`}</AlertBanner></div> : null}
        <div className="mt-4">
          <DataTableShell headers={['', 'Cliente', 'Responsável', 'Situação', 'Competência inicial', 'Última alteração', 'Ações']} minWidth="min-w-[1080px]" hasRows={filteredClients.length > 0} emptyTitle="Nenhum cliente encontrado.">
            <tbody>
              {filteredClients.slice(0, clientLimit).map((client) => {
                const checked = selectedClients.includes(client.cliente_id);
                return (
                  <tr key={client.cliente_id} className="table-row">
                    <td className="table-cell"><input type="checkbox" checked={checked} onChange={() => setSelectedClients((current) => checked ? current.filter((id) => id !== client.cliente_id) : [...current, client.cliente_id])} aria-label={`Selecionar ${client.nome}`} /></td>
                    <td className="table-cell"><p className="font-black text-slate-900 dark:text-white">{client.nome}</p><p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{formatCnpj(client.cnpj)}</p></td>
                    <td className="table-cell"><p className="font-bold text-slate-700 dark:text-gray-200">{client.responsavel || 'Sem responsável'}</p></td>
                    <td className="table-cell"><StatusBadge toneClass={client.habilitada ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200'}>{client.habilitada ? 'Habilitada' : 'Pausada'}</StatusBadge>{!client.habilitada && client.motivo_pausa ? <p className="mt-1.5 max-w-[28ch] text-xs text-slate-500 dark:text-gray-400">{client.motivo_pausa}</p> : null}</td>
                    <td className="table-cell">{client.competencia_inicial ? dateToMonth(client.competencia_inicial).split('-').reverse().join('/') : '—'}</td>
                    <td className="table-cell">{formatDate(client.atualizado_em, true)}</td>
                    <td className="table-cell"><ActionButton type="button" size="sm" variant={client.habilitada ? 'secondary' : 'primary'} onClick={() => openClientAction([client.cliente_id], !client.habilitada)}>{client.habilitada ? <PauseCircle size={15} /> : <PlayCircle size={15} />}{client.habilitada ? 'Pausar' : 'Habilitar'}</ActionButton></td>
                  </tr>
                );
              })}
            </tbody>
          </DataTableShell>
          {filteredClients.length > CLIENT_PAGE_SIZE ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-gray-400">Exibindo {formatNumber(Math.min(clientLimit, filteredClients.length))} de {formatNumber(filteredClients.length)} cliente(s).</p>
              <div className="flex flex-wrap justify-center gap-2">
                {filteredClients.length > clientLimit ? (
                  <ActionButton type="button" size="sm" variant="secondary" onClick={() => setClientLimit((current) => Math.min(current + CLIENT_PAGE_SIZE, filteredClients.length))}>Mostrar mais</ActionButton>
                ) : null}
                {clientLimit > CLIENT_PAGE_SIZE ? (
                  <ActionButton type="button" size="sm" variant="subtle" onClick={() => setClientLimit(CLIENT_PAGE_SIZE)}>Mostrar menos</ActionButton>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </SurfacePanel>

      <SurfacePanel
        title="Teste agendado da automação"
        description="Programe um disparo único em modo TESTE, usando o horário de Manaus e os destinatários pessoais configurados."
        right={<ActionButton type="button" size="sm" variant="secondary" onClick={() => loadPanel({ silent: true })} disabled={busy}><RefreshCcw size={15} className={busy ? 'animate-spin' : ''} /> Atualizar lista</ActionButton>}
        bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6"
      >
        <AlertBanner tone="info" title="Agendamento isolado e seguro">
          O processador verifica os horários vencidos uma vez por minuto e só funciona em modo TESTE, com a automação global pausada.
        </AlertBanner>

        <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white/55 p-4 md:grid-cols-2 xl:grid-cols-[190px_240px_1fr_auto] dark:border-gray-700 dark:bg-gray-950/25">
          <label>{fieldLabel('Competência')}<input type="month" max={currentMonth()} value={scheduleForm.competence} onChange={(event) => setScheduleForm((current) => ({ ...current, competence: event.target.value }))} className="input-shell mt-2 normal-case" /></label>
          <label>
            {fieldLabel('Data e hora — Manaus')}
            <input
              type="datetime-local"
              min={manausDateTimeLocal()}
              value={scheduleForm.dateTime}
              onChange={(event) => {
                setScheduleDateTimeAutomatic(false);
                setScheduleForm((current) => ({ ...current, dateTime: event.target.value }));
              }}
              className="input-shell mt-2 normal-case"
            />
            <span className="mt-1 flex min-h-5 items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-gray-400">
              {scheduleDateTimeAutomatic ? 'Horário de Manaus com margem automática de 2 minutos.' : 'Horário definido manualmente.'}
              {!scheduleDateTimeAutomatic ? (
                <button type="button" className="font-black text-blue-600 hover:underline dark:text-blue-300" onClick={() => setScheduleDateTimeAutomatic(true)}>
                  Sincronizar agora
                </button>
              ) : null}
            </span>
          </label>
          <DropdownSelect label="Clientes do teste" value={scheduleForm.scope} options={SCHEDULE_SCOPE_OPTIONS} includeBlank={false} searchable={false} onChange={(value) => setScheduleForm((current) => ({ ...current, scope: value }))} />
          <div className="flex items-end"><ActionButton type="button" variant="primary" className="w-full justify-center" onClick={prepareScheduledTest} disabled={busy}><Eye size={16} /> Revisar agendamento</ActionButton></div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/50">
            <p className="font-black text-slate-900 dark:text-white">Escopo atual</p>
            <p className="mt-1 font-medium text-slate-600 dark:text-gray-300">
              {scheduleForm.scope === 'selecionados'
                ? `${formatNumber(selectedClientRows.length)} cliente(s) marcado(s) na tabela.`
                : scheduleForm.scope === 'filtrados'
                  ? `${formatNumber(filteredEligibleClients.length)} cliente(s) elegível(is) nos filtros atuais${clientResponsible ? `, sob responsabilidade de ${clientResponsible}` : ''}.`
                  : 'Todos os clientes ativos, habilitados e com competência inicial serão avaliados.'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/50">
            <p className="font-black text-slate-900 dark:text-white">Destinos do teste</p>
            <p className="mt-1 break-all font-medium text-slate-600 dark:text-gray-300">Para: {panel.configuracao.email_teste_destinatario || 'Não configurado'} · Cc: {panel.configuracao.email_teste_cc || 'Não configurado'}</p>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-5 dark:border-gray-700">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-black text-slate-900 dark:text-white">Agendamentos recentes</h3><p className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-400">O cancelamento fica disponível somente enquanto o teste estiver aguardando.</p></div><StatusBadge>{formatNumber(scheduledTests.length)} registro(s)</StatusBadge></div>
          <div className="space-y-2">
            {scheduledTests.length ? scheduledTests.map((schedule) => {
              const [statusLabel, statusTone] = scheduleStatus(schedule.status);
              const selectedCount = Array.isArray(schedule.cliente_ids) ? schedule.cliente_ids.length : null;
              return (
                <div key={schedule.id} className="rounded-xl border border-slate-200 bg-white/60 p-4 dark:border-gray-700 dark:bg-gray-950/25">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-900 dark:text-white">{formatManausLocal(schedule.data_hora_manaus)} · Competência {formatCompetence(schedule.competencia_referencia)}</p><StatusBadge toneClass={statusTone}>{statusLabel}</StatusBadge></div>
                      <p className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-400">{schedule.escopo === 'TODOS_ELEGIVEIS' ? 'Todos os clientes elegíveis' : `${formatNumber(selectedCount ?? 0)} cliente(s) direcionado(s)`} · Criado por {schedule.criado_por_nome || schedule.criado_por_email || 'usuário do portal'}</p>
                      <p className="mt-1 break-all text-xs font-semibold text-slate-600 dark:text-gray-300">Destino: {schedule.destinatario_teste || '—'} · Cc: {schedule.cc_teste || '—'}</p>
                      {schedule.erro_mensagem ? <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-300">{schedule.erro_mensagem}</p> : null}
                    </div>
                    {schedule.status === 'AGENDADO' ? <ActionButton type="button" size="sm" variant="danger" onClick={() => requestCancelScheduledTest(schedule)} disabled={busy}><Trash2 size={15} /> Cancelar</ActionButton> : null}
                  </div>
                </div>
              );
            }) : <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-medium text-slate-500 dark:border-gray-700 dark:text-gray-400">Nenhum teste foi agendado.</p>}
          </div>
        </div>
      </SurfacePanel>

      <div className="grid gap-5 2xl:grid-cols-[1.08fr_0.92fr]">
        <SurfacePanel title="Calendário de feriados" description="Feriados nacionais, estaduais do Amazonas e municipais de Manaus usados no cálculo dos dias úteis." bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6">
          <form onSubmit={saveHoliday} className="grid gap-3 rounded-2xl border border-slate-200 bg-white/55 p-4 md:grid-cols-2 dark:border-gray-700 dark:bg-gray-950/25">
            <label>{fieldLabel('Data')}<input required type="date" value={holidayForm.data} onChange={(event) => setHolidayForm((current) => ({ ...current, data: event.target.value }))} className="input-shell mt-2 normal-case" /></label>
            <DropdownSelect label="Abrangência" value={holidayForm.abrangencia} options={HOLIDAY_SCOPE_OPTIONS} includeBlank={false} searchable={false} onChange={(value) => setHolidayForm((current) => ({ ...current, abrangencia: value }))} />
            <label>{fieldLabel('Nome do feriado')}<input required value={holidayForm.nome} onChange={(event) => setHolidayForm((current) => ({ ...current, nome: event.target.value }))} className="input-shell mt-2 normal-case" /></label>
            <label>{fieldLabel('Fonte')}<input required value={holidayForm.fonte} onChange={(event) => setHolidayForm((current) => ({ ...current, fonte: event.target.value }))} placeholder="Ex.: calendário oficial" className="input-shell mt-2 normal-case" /></label>
            <div className="flex items-center gap-3"><Toggle checked={holidayForm.ativo} onChange={(value) => setHolidayForm((current) => ({ ...current, ativo: value }))} label="Feriado ativo" /><span className="text-sm font-bold text-slate-700 dark:text-gray-200">Considerar no calendário</span></div>
            <div className="flex justify-end gap-2"><ActionButton type="button" size="sm" variant="subtle" onClick={() => setHolidayForm(EMPTY_HOLIDAY)}>Limpar</ActionButton><ActionButton type="submit" size="sm" variant="primary" disabled={busy}><Save size={15} />{holidayForm.id ? 'Atualizar' : 'Adicionar'}</ActionButton></div>
          </form>
          <div className="mt-4 max-h-[430px] space-y-2 overflow-y-auto pr-1">
            {panel.feriados.map((holiday) => (
              <div key={holiday.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/60 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-950/25">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-900 dark:text-white">{holiday.nome}</p><StatusBadge toneClass={holiday.ativo ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200'}>{holiday.ativo ? 'Ativo' : 'Inativo'}</StatusBadge></div><p className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-400">{formatDate(holiday.data)} · {holiday.abrangencia} · {holiday.fonte}</p></div>
                <div className="flex gap-2"><ActionButton type="button" size="icon" variant="icon" aria-label={`Editar ${holiday.nome}`} onClick={() => setHolidayForm({ id: holiday.id, data: holiday.data, nome: holiday.nome, abrangencia: holiday.abrangencia, ativo: holiday.ativo, fonte: holiday.fonte })}><Edit3 size={16} /></ActionButton><ActionButton type="button" size="icon" variant="danger" aria-label={`Excluir ${holiday.nome}`} onClick={() => requestDeleteHoliday(holiday)}><Trash2 size={16} /></ActionButton></div>
              </div>
            ))}
          </div>
        </SurfacePanel>

        <SurfacePanel title="Simular execução" description="Visualize quem seria cobrado e quantas pendências seriam incluídas. A simulação não grava dados e não envia e-mails." bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1">{fieldLabel('Competência de referência')}<input type="month" max={currentMonth()} value={simulationMonth} onChange={(event) => setSimulationMonth(event.target.value)} className="input-shell mt-2 normal-case" /></label>
            <ActionButton type="button" variant="primary" onClick={runSimulation} disabled={busy || !simulationMonth}><Bot size={17} /> Simular</ActionButton>
          </div>
          {simulationSummary ? (
            <div className="mt-5 space-y-4">
              <AlertBanner tone="success" title="Prévia sem envio">Resultado calculado no modo {String(simulation.modo ?? config.modo)} para {simulationMonth.split('-').reverse().join('/')}.</AlertBanner>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Preparados', simulationSummary.preparados],
                  ['Pendências', simulationSummary.total_pendencias],
                  ['Sem pendências', simulationSummary.sem_pendencias],
                  ['Sem contato', simulationSummary.sem_contato],
                ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-gray-700 dark:bg-gray-950/25"><p className="text-[11px] font-black uppercase text-slate-500 dark:text-gray-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{formatNumber(value ?? 0)}</p></div>)}
              </div>
              <div className="max-h-[250px] space-y-2 overflow-y-auto pr-1">
                {simulationJobs.map((job, index) => <div key={`${job.cliente_id || index}-${job.resultado || ''}`} className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-gray-700 dark:bg-gray-950/25"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900 dark:text-white">{job.cliente_nome || 'Cliente'}</p><p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{formatNumber(job.qtd_pendencias || 0)} pendência(s)</p></div><StatusBadge toneClass={job.resultado === 'PREPARADO' ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200'}>{job.resultado || 'ANALISADO'}</StatusBadge></div></div>)}
              </div>
            </div>
          ) : <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-gray-700"><ShieldCheck size={30} className="mx-auto text-blue-500" /><p className="mt-3 font-black text-slate-800 dark:text-gray-100">Simulação segura</p><p className="mt-1 text-sm font-medium text-slate-500 dark:text-gray-400">Escolha uma competência e execute a prévia.</p></div>}
        </SurfacePanel>
      </div>

      <div className="grid gap-5 2xl:grid-cols-2">
        <SurfacePanel title="Últimas execuções" bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="space-y-2">
            {panel.ultimas_execucoes.length ? panel.ultimas_execucoes.slice(0, 8).map((execution) => (
              <div key={execution.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/55 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-950/25"><div><p className="font-black text-slate-900 dark:text-white">{dateToMonth(execution.competencia_referencia).split('-').reverse().join('/')} · {execution.acionamento}</p><p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{formatDate(execution.criado_em, true)} · {formatNumber(execution.total_trabalhos)} trabalho(s)</p></div><StatusBadge toneClass={String(execution.status).includes('FALH') ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200' : 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200'}>{execution.status}</StatusBadge></div>
            )) : <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-medium text-slate-500 dark:border-gray-700 dark:text-gray-400">Nenhuma execução registrada.</p>}
          </div>
        </SurfacePanel>
        <SurfacePanel title="Auditoria recente" bodyClassName="px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="space-y-2">
            {panel.auditoria_recente.length ? panel.auditoria_recente.slice(0, 8).map((audit) => (
              <div key={audit.id} className="rounded-xl border border-slate-200 bg-white/55 p-3 dark:border-gray-700 dark:bg-gray-950/25"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900 dark:text-white">{String(audit.entidade).replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-slate-500 dark:text-gray-400">{audit.alterado_por_nome || audit.alterado_por_email || 'Sistema'} · {formatDate(audit.criado_em, true)}</p></div><StatusBadge toneClass="border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-200">{audit.operacao}</StatusBadge></div></div>
            )) : <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm font-medium text-slate-500 dark:border-gray-700 dark:text-gray-400">Nenhuma alteração auditada.</p>}
          </div>
        </SurfacePanel>
      </div>

      {clientAction && typeof document !== 'undefined' ? createPortal(
        <div className="modal-backdrop z-[10000] flex items-center justify-center">
          <div className="modal-panel modal-panel-sm" role="dialog" aria-modal="true" aria-labelledby="client-automation-title">
            <div className="modal-header"><h3 id="client-automation-title" className="text-xl font-black text-slate-950 dark:text-white">{clientAction.enable ? 'Habilitar automação' : 'Pausar automação'}</h3><p className="mt-2 text-sm font-medium text-slate-600 dark:text-gray-300">A alteração será aplicada a {formatNumber(clientAction.clientIds.length)} cliente(s).</p></div>
            <div className="modal-body">
              {clientAction.enable ? <label>{fieldLabel('Competência inicial')}<input type="month" required max={currentMonth()} value={clientActionForm.competencia} onChange={(event) => setClientActionForm((current) => ({ ...current, competencia: event.target.value }))} className="input-shell mt-2 normal-case" /><span className="mt-2 block text-xs font-medium leading-relaxed text-slate-500 dark:text-gray-400">Escolha o primeiro mês cujas pendências devem entrar na cobrança. Para considerar todo o histórico de 2026, use janeiro de 2026.</span></label> : <label>{fieldLabel('Motivo da pausa')}<textarea required rows={4} value={clientActionForm.motivo} onChange={(event) => setClientActionForm((current) => ({ ...current, motivo: event.target.value }))} placeholder="Descreva por que a automação será pausada" className="input-shell mt-2 h-auto py-3 normal-case" /></label>}
            </div>
            <div className="modal-footer flex justify-end gap-2"><ActionButton type="button" variant="subtle" onClick={() => setClientAction(null)} disabled={busy}>Cancelar</ActionButton><ActionButton type="button" variant="primary" onClick={executeClientAction} disabled={busy}>{busy ? <RefreshCcw size={16} className="animate-spin" /> : clientAction.enable ? <PlayCircle size={16} /> : <PauseCircle size={16} />}{clientAction.enable ? 'Habilitar' : 'Pausar'}</ActionButton></div>
          </div>
        </div>, document.body) : null}

      <ManualTestDialog state={manualTest} busy={busy} onCancel={() => !busy && setManualTest(null)} onConfirm={executeManualTest} />
      <ScheduledTestDialog state={schedulePreview} busy={busy} onCancel={() => !busy && setSchedulePreview(null)} onConfirm={confirmScheduledTest} />
      <ConfirmDialog dialog={dialog} busy={busy} onCancel={() => !busy && setDialog(null)} onConfirm={() => dialog?.execute?.()} />
    </div>
  );
}
