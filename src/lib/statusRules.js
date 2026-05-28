import { isBlank, isNo, isYes, normalizeText } from './formatters.js';

function numberValue(value) {
  if (isBlank(value)) return 0;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function preferBoolean(persistedValue, fallbackValue) {
  return typeof persistedValue === 'boolean' ? persistedValue : fallbackValue;
}

export function analyzeClient(client) {
  const diasAtraso = numberValue(client.dias_atraso);
  const situacao = normalizeText(client.situacao);
  const obrigacoes = client?._db_obrigacoes ?? {};

  const emAtraso =
    isNo(client.competencia_em_dia) ||
    diasAtraso > 0 ||
    situacao.includes('atras') ||
    situacao.includes('critico');

  const situacaoCritica = situacao.includes('critico');
  const reinfPendente = preferBoolean(
    obrigacoes.reinf_pendente,
    isYes(client.distribuicao_lucros) && (!isYes(client.envio_reinf) || isBlank(client.envio_reinf)),
  );
  const reciboReinfPendente = preferBoolean(
    obrigacoes.recibo_reinf_pendente,
    isYes(client.envio_reinf) && isBlank(client.anexo_recibo_reinf),
  );
  const anexoLucrosPendente = false;
  const ataPendente = isYes(client.precisa_ata) && !isYes(client.ata_entregue);
  const ecdPendente = preferBoolean(obrigacoes.ecd_pendente, isYes(client.ecd) && isBlank(client.ultima_ecd_entregue));
  const ecdAguardandoEnvio = preferBoolean(
    obrigacoes.ecd_aguardando_envio,
    !isBlank(client.data_entrega_ecd) && isBlank(client.data_envio_ecd),
  );
  const ecdResponsavelPendente = preferBoolean(
    obrigacoes.ecd_responsavel_pendente,
    isYes(client.ecd) &&
      isBlank(client.responsavel_ecd) &&
      isBlank(client.responsavel),
  );
  const reciboEcdPendente = preferBoolean(
    obrigacoes.recibo_ecd_pendente,
    isYes(client.ecd) && isBlank(client.anexo_recibo_ecd),
  );
  const ecfPendente = preferBoolean(
    obrigacoes.ecf_pendente,
    isYes(client.ecf) && isBlank(client.ultima_ecf_entregue),
  );
  const reciboEcfPendente = preferBoolean(
    obrigacoes.recibo_ecf_pendente,
    isYes(client.ecf) && isBlank(client.anexo_recibo_ecf),
  );
  const pendenciaTecnica = isYes(client.pendencia_tecnica) || normalizeText(client.pendencia_tecnica).includes('pend');
  const documentosAtrasados = isNo(client.enviam_documentos) || normalizeText(client.motivo_atraso).includes('doc');

  const hasPendencia =
    emAtraso ||
    reinfPendente ||
    reciboReinfPendente ||
    ecdPendente ||
    ecdAguardandoEnvio ||
    ecdResponsavelPendente ||
    reciboEcdPendente ||
    ecfPendente ||
    reciboEcfPendente ||
    pendenciaTecnica ||
    documentosAtrasados;

  const comunicacaoPendente = preferBoolean(
    obrigacoes.comunicacao_pendente,
    hasPendencia && !isYes(client.cliente_notificado),
  );

  const alerts = [
    emAtraso && {
      key: 'atraso',
      label: diasAtraso > 0 ? `${diasAtraso} dia(s) de atraso` : 'Competencia em atraso',
      tone: 'danger',
    },
    situacaoCritica && { key: 'critico', label: 'Situacao critica', tone: 'danger' },
    reinfPendente && { key: 'reinf', label: 'REINF pendente', tone: 'warning' },
    reciboReinfPendente && { key: 'recibo_reinf', label: 'Recibo REINF pendente', tone: 'warning' },
    ecdPendente && { key: 'ecd', label: 'ECD pendente', tone: 'warning' },
    ecdAguardandoEnvio && { key: 'ecd_envio', label: 'Aguardando envio', tone: 'warning' },
    ecdResponsavelPendente && { key: 'ecd_responsavel', label: 'Responsavel nao definido', tone: 'warning' },
    reciboEcdPendente && { key: 'recibo_ecd', label: 'Recibo ECD pendente', tone: 'warning' },
    ecfPendente && { key: 'ecf', label: 'ECF pendente', tone: 'warning' },
    reciboEcfPendente && { key: 'recibo_ecf', label: 'Recibo ECF pendente', tone: 'warning' },
    pendenciaTecnica && { key: 'tecnica', label: 'Pendencia tecnica', tone: 'danger' },
    documentosAtrasados && { key: 'documentos', label: 'Documentacao atrasada', tone: 'warning' },
    comunicacaoPendente && { key: 'comunicacao', label: 'Comunicacao pendente', tone: 'info' },
  ].filter(Boolean);

  let risk = 'ok';
  if (situacaoCritica || pendenciaTecnica) risk = 'danger';
  else if (
    emAtraso ||
    reinfPendente ||
    reciboReinfPendente ||
    ecdPendente ||
    ecdAguardandoEnvio ||
    ecdResponsavelPendente ||
    reciboEcdPendente ||
    ecfPendente ||
    reciboEcfPendente ||
    documentosAtrasados
  ) {
    risk = 'warning';
  }

  return {
    alerts,
    hasPendencia,
    emAtraso,
    situacaoCritica,
    reinfPendente,
    reciboReinfPendente,
    anexoLucrosPendente,
    ataPendente,
    ecdPendente,
    ecdAguardandoEnvio,
    ecdResponsavelPendente,
    reciboEcdPendente,
    ecfPendente,
    reciboEcfPendente,
    pendenciaTecnica,
    documentosAtrasados,
    comunicacaoPendente,
    diasAtraso,
    risk,
  };
}

export function enrichClients(clients) {
  return clients.map((client) => ({
    ...client,
    _analysis: analyzeClient(client),
  }));
}

export function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const label = String(row[key] ?? '').trim() || 'Nao informado';
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
}

export function toBreakdown(rows, key) {
  return Object.entries(countBy(rows, key))
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt-BR'));
}
