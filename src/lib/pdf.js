const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;
const FONT_SIZE = 9;
const LINE_HEIGHT = 12;
const HEADER_Y = 790;

const COLUMNS = [
  { key: 'Cliente', label: 'Cliente', x: 40, width: 130 },
  { key: 'CNPJ', label: 'CNPJ', x: 180, width: 86 },
  { key: 'Responsável', label: 'Responsavel', x: 276, width: 90 },
  { key: 'Pendências/Observações', label: 'Pendencias/Observacoes', x: 376, width: 178 },
];

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

function addText(commands, text, x, y, size = FONT_SIZE) {
  commands.push(`BT /F1 ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`);
}

function addHeader(commands, title, total) {
  addText(commands, title, MARGIN, HEADER_Y, 15);
  addText(commands, `Gerado em ${new Date().toLocaleDateString('pt-BR')} - ${total} registro(s)`, MARGIN, HEADER_Y - 18, 9);

  const y = HEADER_Y - 44;
  commands.push('0.90 0.93 0.97 rg');
  commands.push(`${MARGIN} ${y - 8} ${PAGE_WIDTH - MARGIN * 2} 22 re f`);
  commands.push('0.15 0.20 0.30 rg');
  COLUMNS.forEach((column) => addText(commands, column.label, column.x, y, 8));
  commands.push('0 0 0 rg');
}

function buildPages(rows, title) {
  const pages = [];
  let commands = [];
  let y = HEADER_Y - 68;

  const startPage = () => {
    commands = [];
    addHeader(commands, title, rows.length);
    y = HEADER_Y - 68;
  };

  const finishPage = () => {
    pages.push(commands.join('\n'));
  };

  startPage();

  if (!rows.length) {
    addText(commands, 'Nenhum registro encontrado para este relatorio.', MARGIN, y, 10);
    finishPage();
    return pages;
  }

  rows.forEach((row) => {
    const cellLines = COLUMNS.map((column) =>
      wrapText(row[column.key], Math.max(8, Math.floor(column.width / 5.2))).slice(0, 5),
    );
    const rowLines = Math.max(...cellLines.map((lines) => lines.length), 1);
    const rowHeight = rowLines * LINE_HEIGHT + 10;

    if (y - rowHeight < MARGIN) {
      finishPage();
      startPage();
    }

    commands.push('0.96 0.97 0.99 rg');
    commands.push(`${MARGIN} ${y - rowHeight + 5} ${PAGE_WIDTH - MARGIN * 2} ${rowHeight} re f`);
    commands.push('0 0 0 rg');

    COLUMNS.forEach((column, columnIndex) => {
      cellLines[columnIndex].forEach((line, lineIndex) => {
        addText(commands, line, column.x, y - lineIndex * LINE_HEIGHT, FONT_SIZE);
      });
    });

    y -= rowHeight + 4;
  });

  finishPage();
  return pages;
}

function buildPdf(pages) {
  const fontObjectNumber = 3 + pages.length * 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];

  pages.forEach((content, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
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

export function exportRowsToPdf(rows, filename = 'relatorio.pdf', title = 'Relatorio') {
  const safeRows = Array.isArray(rows) ? rows : [];
  const pages = buildPages(safeRows, title);
  downloadBlob(buildPdf(pages), filename);
}
