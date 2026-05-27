function separarNomeExtensao(nomeArquivo: string) {
  const partes = nomeArquivo.split('.');
  if (partes.length <= 1) return { nome: nomeArquivo, extensao: '' };
  const extensao = partes.pop() ?? '';
  return { nome: partes.join('.'), extensao };
}

export function normalizarNomeArquivo(nomeArquivo: string) {
  const { nome, extensao } = separarNomeExtensao(nomeArquivo);
  const nomeNormalizado = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'arquivo';

  const extensaoNormalizada = extensao
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12);

  return extensaoNormalizada ? `${nomeNormalizado}.${extensaoNormalizada}` : nomeNormalizado;
}

export function timestampParaCaminho(date = new Date()) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace('T', '-')
    .replaceAll(':', '');
}
