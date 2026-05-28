import { supabase } from '../lib/supabase';

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const CATEGORY_ALIASES: Record<string, string> = {
  tipo_cliente: 'tipo_cliente',
  tipocliente: 'tipo_cliente',
  regime_tributario: 'regime_tributario',
  regimetributario: 'regime_tributario',
  atividades: 'atividades',
  atividade: 'atividades',
  responsavel: 'responsavel',
  revisor: 'revisor',
  competencia_em_dia: 'competencia_em_dia',
  competenciaemdia: 'competencia_em_dia',
  situacao: 'situacao',
  enviam_documentos: 'enviam_documentos',
  enviamdocumentos: 'enviam_documentos',
  modo_entrega: 'modo_entrega',
  modoentrega: 'modo_entrega',
  curva_envio: 'curva_envio',
  curvaenvio: 'curva_envio',
  revisado_coordenador: 'revisado_coordenador',
  revisadocoordenador: 'revisado_coordenador',
  lancamentos_padrao: 'lancamentos_padrao',
  lancamentospadrao: 'lancamentos_padrao',
  motivo_atraso: 'motivo_atraso',
  motivoatraso: 'motivo_atraso',
  cliente_notificado: 'cliente_notificado',
  clientenotificado: 'cliente_notificado',
  dificuldade: 'dificuldade',
  ecd: 'ecd',
  ecf: 'ecf',
  sim_nao: 'sim_nao',
  simnao: 'sim_nao',
};

function normalizeCategory(categoria: unknown) {
  const key = normalizeText(categoria).replace(/[\s-]/g, '_');
  return CATEGORY_ALIASES[key] ?? key;
}

function normalizeOptionValue(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = normalizeText(raw);
  if (normalized === 'sim') return 'Sim';
  if (normalized === 'nao') return 'Nao';
  return raw;
}

export async function listarTodasListagens() {
  const { data, error } = await supabase
    .from('listagens')
    .select('categoria, valor, ordem')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('valor', { ascending: true });

  if (error) {
    throw new Error(`Não foi possível carregar listagens do Supabase: ${error.message}`);
  }

  return data ?? [];
}

export async function listarListagensAgrupadas() {
  const rows = await listarTodasListagens();
  const grouped = rows.reduce<Record<string, string[]>>((acc, item) => {
    const categoria = normalizeCategory(item.categoria);
    const valor = normalizeOptionValue(item.valor);
    if (!valor) return acc;
    if (!acc[categoria]) acc[categoria] = [];
    if (!acc[categoria].includes(valor)) {
      acc[categoria].push(valor);
    }
    return acc;
  }, {});
  return grouped;
}
