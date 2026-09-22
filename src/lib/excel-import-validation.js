import { onlyDigits } from './formatters.js';

export const EXCEL_IMPORT_LIMITS = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxSheets: 10,
  maxRowsPerSheet: 5000,
  maxColumnsPerSheet: 100,
});

const ALLOWED_EXTENSIONS = new Set(['xlsx', 'xlsm', 'xls']);
const ZIP_SIGNATURES = new Set(['504b0304', '504b0506', '504b0708']);
const OLE_SIGNATURE = 'd0cf11e0a1b11ae1';

function fileExtension(fileName) {
  const match = String(fileName ?? '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
}

function bytesHex(bytes, length) {
  return Array.from(bytes.slice(0, length), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validateExcelFileMetadata(file) {
  const name = String(file?.name ?? '').trim();
  const extension = fileExtension(name);
  const size = Number(file?.size ?? 0);

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('Formato não permitido. Selecione um arquivo .xlsx, .xlsm ou .xls.');
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('A planilha está vazia.');
  }
  if (size > EXCEL_IMPORT_LIMITS.maxFileBytes) {
    throw new Error('A planilha excede o limite de 10 MB.');
  }
  return { extension, size };
}

export function validateExcelBuffer(arrayBuffer, fileName) {
  if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength === 0) {
    throw new Error('Não foi possível ler o conteúdo da planilha.');
  }
  if (arrayBuffer.byteLength > EXCEL_IMPORT_LIMITS.maxFileBytes) {
    throw new Error('A planilha excede o limite de 10 MB.');
  }

  const extension = fileExtension(fileName);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('Formato não permitido. Selecione um arquivo .xlsx, .xlsm ou .xls.');
  }

  const bytes = new Uint8Array(arrayBuffer);
  const firstFour = bytesHex(bytes, 4);
  const firstEight = bytesHex(bytes, 8);
  const validSignature = extension === 'xls'
    ? firstEight === OLE_SIGNATURE
    : ZIP_SIGNATURES.has(firstFour);

  if (!validSignature) {
    throw new Error('O conteúdo do arquivo não corresponde ao formato informado.');
  }
}

export function validateWorkbookDimensions(workbook, decodeRange) {
  const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  if (!sheetNames.length) throw new Error('A planilha não possui abas legíveis.');
  if (sheetNames.length > EXCEL_IMPORT_LIMITS.maxSheets) {
    throw new Error(`A planilha possui mais de ${EXCEL_IMPORT_LIMITS.maxSheets} abas.`);
  }

  sheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets?.[sheetName];
    const sheetReference = sheet?.['!fullref'] || sheet?.['!ref'];
    if (!sheetReference) return;
    let range;
    try {
      range = decodeRange(sheetReference);
    } catch {
      throw new Error(`A aba "${sheetName}" possui uma área de dados inválida.`);
    }
    const rows = range.e.r - range.s.r + 1;
    const columns = range.e.c - range.s.c + 1;
    if (rows > EXCEL_IMPORT_LIMITS.maxRowsPerSheet) {
      throw new Error(`A aba "${sheetName}" excede o limite de ${EXCEL_IMPORT_LIMITS.maxRowsPerSheet} linhas.`);
    }
    if (columns > EXCEL_IMPORT_LIMITS.maxColumnsPerSheet) {
      throw new Error(`A aba "${sheetName}" excede o limite de ${EXCEL_IMPORT_LIMITS.maxColumnsPerSheet} colunas.`);
    }
  });
}

export function isValidCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calculateDigit = (length) => {
    let factor = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * factor;
      factor -= 1;
      if (factor < 2) factor = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(digits[12])
    && calculateDigit(13) === Number(digits[13]);
}
