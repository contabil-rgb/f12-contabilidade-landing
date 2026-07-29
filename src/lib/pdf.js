const DEFAULT_LAYOUT = {
  pageWidth: 595,
  pageHeight: 842,
  margin: 40,
  fontSize: 9,
  lineHeight: 12,
  headerY: 790,
  columns: [
    { key: 'Cliente', label: 'Cliente', x: 40, width: 130 },
    { key: 'CNPJ', label: 'CNPJ', x: 180, width: 86 },
    { key: 'Responsável', label: 'Responsável', x: 276, width: 90 },
    { key: 'Pendências/Observações', label: 'Pendências/Observações', x: 376, width: 178 },
  ],
};

const CLIENT_BASE_LAYOUT = {
  pageWidth: 842,
  pageHeight: 595,
  margin: 28,
  fontSize: 7,
  lineHeight: 9,
  headerY: 548,
  columns: [
    { key: 'CNPJ', label: 'CNPJ', x: 28, width: 78 },
    { key: 'Razão Social', label: 'Razão Social', x: 114, width: 138 },
    { key: 'Nome/Identificação', label: 'Nome/Identificação', x: 260, width: 104 },
    { key: 'Responsável', label: 'Responsável', x: 372, width: 60 },
    { key: 'Revisor', label: 'Revisor', x: 440, width: 56 },
    { key: 'Tipo de Cliente', label: 'Tipo', x: 504, width: 72 },
    { key: 'Regime Tributário', label: 'Regime', x: 584, width: 84 },
    { key: 'Atividade', label: 'Atividade', x: 676, width: 132 },
  ],
};

const REINF_REPORT_LAYOUT = {
  pageWidth: 842,
  pageHeight: 595,
  margin: 24,
  fontSize: 6.6,
  lineHeight: 8,
  headerY: 548,
  columns: [
    { key: 'Gerado em', label: 'Gerado em', x: 24, width: 58 },
    { key: 'Cliente', label: 'Cliente', x: 88, width: 116 },
    { key: 'CNPJ', label: 'CNPJ', x: 210, width: 68 },
    { key: 'Responsável', label: 'Responsável', x: 284, width: 54 },
    { key: 'Revisor', label: 'Revisor', x: 344, width: 46 },
    { key: 'Periodicidade', label: 'Período', x: 396, width: 48 },
    { key: 'Meses', label: 'Meses', x: 450, width: 74 },
    { key: 'Sócio', label: 'Sócio', x: 530, width: 92 },
    { key: 'CPF', label: 'CPF', x: 628, width: 62 },
    { key: 'Valores por mês', label: 'Valores por mês', x: 696, width: 122 },
  ],
};

const REINF_REPORT_MONTH_KEYS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

function isReinfReportRows(rows) {
  const firstRow = rows.find(Boolean) ?? {};
  return (
    Object.hasOwn(firstRow, 'Gerado em') &&
    Object.hasOwn(firstRow, 'Sócio') &&
    Object.hasOwn(firstRow, 'Valores por mês')
  );
}

function getReinfReportMonthKeys(rows) {
  return REINF_REPORT_MONTH_KEYS.filter((month) => rows.some((row) => Object.hasOwn(row ?? {}, month)));
}

function getLayoutForRows(rows) {
  const firstRow = rows.find(Boolean) ?? {};
  if (isReinfReportRows(rows)) {
    return REINF_REPORT_LAYOUT;
  }

  if (
    Object.hasOwn(firstRow, 'Razão Social') &&
    Object.hasOwn(firstRow, 'Nome/Identificação') &&
    Object.hasOwn(firstRow, 'Tipo de Cliente') &&
    Object.hasOwn(firstRow, 'Regime Tributário')
  ) {
    return CLIENT_BASE_LAYOUT;
  }

  return DEFAULT_LAYOUT;
}

function sanitizePdfText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\u0009\u000A\u000D\u0020-\u007E]/g, '?');
}

function escapePdfText(value) {
  return sanitizePdfText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\n/g, ' ');
}

function wrapText(value, maxChars) {
  const text = sanitizePdfText(value).trim();
  if (!text) return [''];

  const lines = [];
  text.split(/\s+/).forEach((word) => {
    const lastLine = lines[lines.length - 1] ?? '';
    const candidate = lastLine ? `${lastLine} ${word}` : word;
    if (candidate.length <= maxChars) {
      if (lines.length) lines[lines.length - 1] = candidate;
      else lines.push(candidate);
      return;
    }

    if (word.length > maxChars) {
      if (lastLine) lines.push('');
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      return;
    }

    lines.push(word);
  });

  return lines.length ? lines : [''];
}

function addText(commands, text, x, y, size) {
  commands.push(`BT /F1 ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`);
}

function addWrappedText(commands, text, x, y, width, size, lineHeight = size + 3, maxLines = 99) {
  const maxChars = Math.max(8, Math.floor(width / (size * 0.54)));
  const lines = wrapText(text, maxChars).slice(0, maxLines);
  lines.forEach((line, index) => addText(commands, line, x, y - index * lineHeight, size));
  return y - lines.length * lineHeight;
}

function addCell(commands, text, x, y, width, height, size, options = {}) {
  if (options.fill) {
    commands.push(options.fill);
    commands.push(`${x} ${y - height} ${width} ${height} re f`);
  }
  commands.push('0.35 0.40 0.48 RG');
  commands.push(`${x} ${y - height} ${width} ${height} re S`);
  commands.push('0 0 0 rg');
  addWrappedText(commands, text, x + 5, y - 14, width - 10, size, size + 3, options.maxLines ?? 4);
}

function addHeader(commands, title, total, layout) {
  addText(commands, title, layout.margin, layout.headerY, 15);
  addText(commands, `Gerado em ${new Date().toLocaleDateString('pt-BR')} - ${total} registro(s)`, layout.margin, layout.headerY - 18, 9);

  const y = layout.headerY - 44;
  commands.push('0.90 0.93 0.97 rg');
  commands.push(`${layout.margin} ${y - 8} ${layout.pageWidth - layout.margin * 2} 22 re f`);
  commands.push('0.15 0.20 0.30 rg');
  layout.columns.forEach((column) => addText(commands, column.label, column.x, y, Math.min(8, layout.fontSize)));
  commands.push('0 0 0 rg');
}

function buildPages(rows, title, layout) {
  const pages = [];
  let commands = [];
  let y = layout.headerY - 68;

  const startPage = () => {
    commands = [];
    addHeader(commands, title, rows.length, layout);
    y = layout.headerY - 68;
  };

  const finishPage = () => {
    pages.push(commands.join('\n'));
  };

  startPage();

  if (!rows.length) {
    addText(commands, 'Nenhum registro encontrado para este relatório.', layout.margin, y, 10);
    finishPage();
    return pages;
  }

  rows.forEach((row) => {
    const cellLines = layout.columns.map((column) =>
      wrapText(row[column.key], Math.max(8, Math.floor(column.width / 5.2))).slice(0, 5),
    );
    const rowLines = Math.max(...cellLines.map((lines) => lines.length), 1);
    const rowHeight = rowLines * layout.lineHeight + 10;

    if (y - rowHeight < layout.margin) {
      finishPage();
      startPage();
    }

    commands.push('0.96 0.97 0.99 rg');
    commands.push(`${layout.margin} ${y - rowHeight + 5} ${layout.pageWidth - layout.margin * 2} ${rowHeight} re f`);
    commands.push('0 0 0 rg');

    layout.columns.forEach((column, columnIndex) => {
      cellLines[columnIndex].forEach((line, lineIndex) => {
        addText(commands, line, column.x, y - lineIndex * layout.lineHeight, layout.fontSize);
      });
    });

    y -= rowHeight + 4;
  });

  finishPage();
  return pages;
}

function buildReinfReportPages(rows, title) {
  const layout = {
    pageWidth: 842,
    pageHeight: 595,
    margin: 28,
    fontSize: 8,
    lineHeight: 10,
    headerY: 552,
  };
  const pages = [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const firstRow = safeRows[0] ?? {};
  const months = getReinfReportMonthKeys(safeRows);
  const availableWidth = layout.pageWidth - layout.margin * 2;
  const socioWidth = months.length > 6 ? 150 : 210;
  const cpfWidth = months.length > 6 ? 78 : 92;
  const totalWidth = 74;
  const monthWidth = months.length
    ? (availableWidth - socioWidth - cpfWidth - totalWidth) / months.length
    : availableWidth - socioWidth - cpfWidth - totalWidth;
  const columns = [
    { key: 'Sócio', label: 'SÓCIO', width: socioWidth },
    { key: 'CPF', label: 'CPF', width: cpfWidth },
    ...(months.length
      ? months.map((month) => ({ key: month, label: month, width: monthWidth }))
      : [{ key: 'Valores por mês', label: 'VALORES POR MES', width: monthWidth }]),
    { key: 'Total', label: 'TOTAL', width: totalWidth },
  ];

  let commands = [];
  let y = layout.headerY;

  const addReportHeader = (compact = false) => {
    commands = [];
    y = layout.headerY;
    addWrappedText(commands, title, layout.margin, y, availableWidth, compact ? 12 : 15, compact ? 15 : 18, 2);
    y -= compact ? 34 : 48;
    addText(commands, `PDF gerado em ${new Date().toLocaleDateString('pt-BR')}`, layout.margin, y, 8);
    y -= 22;
  };

  const addSummary = () => {
    const cliente = firstRow.Cliente || 'Cliente não informado';
    const cnpj = firstRow.CNPJ || 'CNPJ não informado';
    const periodo = `${firstRow.Periodicidade || 'Sem periodicidade'} - ${firstRow.Meses || 'Meses não informados'} ${firstRow.Ano || ''}`.trim();
    const responsavel = firstRow['Responsável'] || 'Não informado';

    addWrappedText(commands, `Cliente: ${cliente}`, layout.margin, y, 360, 9, 12, 2);
    addWrappedText(commands, `CNPJ: ${cnpj}`, 420, y, 170, 9, 12, 2);
    addWrappedText(commands, `Gerado em: ${firstRow['Gerado em'] || 'Não informado'}`, 610, y, 190, 9, 12, 2);
    y -= 34;
    addWrappedText(commands, `Responsável: ${responsavel}`, layout.margin, y, 260, 8, 11, 2);
    addWrappedText(commands, `Revisor: ${firstRow.Revisor || 'Não informado'}`, 320, y, 180, 8, 11, 2);
    addWrappedText(commands, `Período: ${periodo}`, 520, y, 290, 8, 11, 2);
    y -= 38;
    addWrappedText(
      commands,
      `Seguem os valores referentes à distribuição de lucro dos sócios da ${cliente} (${cnpj}) no período ${firstRow.Meses || 'não informado'} ${firstRow.Ano || ''}.`,
      layout.margin,
      y,
      availableWidth,
      9,
      12,
      3,
    );
    y -= 52;
  };

  const addTableHeader = () => {
    let x = layout.margin;
    columns.forEach((column) => {
      addCell(commands, column.label, x, y, column.width, 24, 7.2, {
        fill: '0.90 0.93 0.97 rg',
        maxLines: 1,
      });
      x += column.width;
    });
    y -= 24;
  };

  const addClosing = () => {
    if (y < 92) {
      pages.push(commands.join('\n'));
      addReportHeader(true);
    }

    y -= 14;
    addText(commands, 'Qualquer dúvida, estamos à disposição.', layout.margin, y, 9);
    y -= 28;
    addText(commands, 'Por favor, confirme o recebimento deste e-mail.', layout.margin, y, 9);
    y -= 28;
    addText(commands, 'Atenciosamente,', layout.margin, y, 9);
  };

  addReportHeader();

  if (!safeRows.length) {
    addText(commands, 'Nenhum registro encontrado para este relatório.', layout.margin, y, 10);
    pages.push(commands.join('\n'));
    return { pages, layout };
  }

  addSummary();
  addTableHeader();

  safeRows.forEach((row) => {
    const lineCounts = columns.map((column) =>
      wrapText(row[column.key], Math.max(8, Math.floor((column.width - 10) / 4.2))).slice(0, 4).length,
    );
    const rowHeight = Math.max(26, Math.max(...lineCounts, 1) * 11 + 10);

    if (y - rowHeight < layout.margin + 72) {
      pages.push(commands.join('\n'));
      addReportHeader(true);
      addTableHeader();
    }

    let x = layout.margin;
    columns.forEach((column) => {
      addCell(commands, row[column.key] ?? '', x, y, column.width, rowHeight, layout.fontSize);
      x += column.width;
    });
    y -= rowHeight;
  });

  addClosing();
  pages.push(commands.join('\n'));
  return { pages, layout };
}

function buildPdf(pages, layout) {
  const fontObjectNumber = 3 + pages.length * 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];

  pages.forEach((content, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${layout.pageWidth} ${layout.pageHeight}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Uint8Array.from(pdf, (character) => character.charCodeAt(0) & 0xff);
}

function downloadBlob(content, filename) {
  const blob = new Blob([content], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportRowsToPdf(rows, filename = 'relatorio.pdf', title = 'Relatório') {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (isReinfReportRows(safeRows)) {
    const { pages, layout } = buildReinfReportPages(safeRows, title);
    downloadBlob(buildPdf(pages, layout), filename);
    return;
  }

  const layout = getLayoutForRows(safeRows);
  const pages = buildPages(safeRows, title, layout);
  downloadBlob(buildPdf(pages, layout), filename);
}
