import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { parseContabilidadeWorkbook } from '../src/lib/excel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const defaultInput = 'C:/Users/F12 CONTABILIDADE 13/Downloads/Base Contabilidade Oficial.xlsx';
const input = process.argv[2] || defaultInput;
const outputDir = path.join(projectRoot, 'local-data');
const output = path.join(outputDir, 'baseContabilidade.js');

if (!fs.existsSync(input)) {
  console.error(`Arquivo não encontrado: ${input}`);
  process.exit(1);
}

const workbook = XLSX.read(fs.readFileSync(input), {
  cellDates: true,
  cellText: true,
  cellNF: true,
});

const payload = parseContabilidadeWorkbook(workbook, path.basename(input));
const generatedAt = new Date().toISOString();
const content = `// Arquivo gerado por scripts/import-base-contabilidade.mjs.
// Fonte somente leitura: ${path.basename(input)}

export const clientesContabeis = ${JSON.stringify(payload.clientes, null, 2)};

export const listasBase = ${JSON.stringify(payload.listagens, null, 2)};

export const importMetadata = ${JSON.stringify({ ...payload.metadata, generatedAt }, null, 2)};
`;

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(output, content, 'utf8');
console.log(
  JSON.stringify(
    {
      output,
      clientes: payload.clientes.length,
      listagens: Object.keys(payload.listagens).length,
      sheets: payload.metadata.sheets,
    },
    null,
    2,
  ),
);
