import { ChunkModelItem, ChunkModelResponse, RawRow } from './types';

const BALANCE_KEYWORDS = [
  'saldo',
  'balance',
  'available',
  'disponible',
  'account value',
  'valor de cuenta',
];

const INCOME_KEYWORDS = [
  'ingreso',
  'deposito',
  'deposit',
  'salary',
  'nomina',
  'abono',
  'credit',
  'credito',
  'incoming transfer',
  'transferencia recibida',
  'refund',
  'reembolso',
];

const SUMMARY_KEYWORDS = [
  'total',
  'subtotal',
  'resumen',
  'sum of',
  'totales',
  'movimientos del periodo',
];

const EXPENSE_HINT_KEYWORDS = [
  'compra',
  'payment',
  'pago',
  'debit',
  'card',
  'tarjeta',
  'restaurant',
  'restaurante',
  'supermercado',
  'grocery',
  'uber',
  'taxi',
  'fuel',
  'gasolina',
  'farmacia',
  'market',
  'retiro',
];

const CSV_DATE_HEADERS = ['date', 'fecha', 'posted_date', 'transaction_date'];
const CSV_DESCRIPTION_HEADERS = ['description', 'descripcion', 'concepto', 'detalle', 'merchant'];
const CSV_DEBIT_HEADERS = ['debit', 'debito', 'cargo', 'withdrawal', 'expense', 'gasto'];
const CSV_CREDIT_HEADERS = ['credit', 'credito', 'abono', 'deposit', 'income', 'ingreso'];
const CSV_AMOUNT_HEADERS = ['amount', 'importe', 'monto', 'valor', 'transaction_amount'];

const PDF_BALANCE_OR_SUMMARY_KEYWORDS = [
  'sdo.apertura',
  'sdo. cierre',
  'transporte',
  'saldo promedio',
  'total de reduccion iva',
  'no paga intereses',
  'a partir del',
  'cantidad de mov',
  'por caja',
  'manual de tarifas',
];

const PDF_INCOME_KEYWORDS = ['cred.directo', 'cre. cambios', 'traspaso de', 'rediva', 'reviva'];
const PDF_TRANSFER_OUT_KEYWORDS = ['traspaso a'];
const PDF_EXPENSE_KEYWORDS = ['compra', 'deb. cambios', 'debito', 'retiro'];

const PDF_MONTH_INDEX: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function containsKeyword(text: string, keywords: string[]): boolean {
  const normalized = normalizeText(text);
  return keywords.some((keyword) => normalized.includes(normalizeText(keyword)));
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getCsvCell(row: RawRow, headerAliases: string[]): string | undefined {
  if (!row.headers || !row.cells) {
    return undefined;
  }

  for (let index = 0; index < row.headers.length; index += 1) {
    const header = normalizeHeader(row.headers[index] || '');
    if (headerAliases.some((alias) => header.includes(normalizeHeader(alias)))) {
      const cell = row.cells[index];
      if (typeof cell === 'string' && cell.trim()) {
        return cell.trim();
      }
    }
  }

  return undefined;
}

function parseBankAmountToken(rawValue?: string): number | null {
  if (!rawValue || !rawValue.trim()) {
    return null;
  }

  let value = rawValue.trim();
  const trailingNegative = value.endsWith('-');
  const leadingNegative = value.startsWith('-');

  if (value.includes(' ')) {
    const segments = value.split(/\s+/).filter(Boolean);
    const decimalSegment = [...segments].reverse().find((segment) => /,\d{2}-?$/.test(segment));
    if (decimalSegment) {
      value = decimalSegment;
    } else {
      value = segments[segments.length - 1];
    }
  }

  value = value.replace(/[^0-9,.-]/g, '');
  if (!value || !/\d/.test(value)) {
    return null;
  }

  value = value.replace(/-$/g, '');

  if (value.includes(',') && value.includes('.')) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else if (value.includes(',')) {
    value = value.replace(/\./g, '').replace(',', '.');
  } else {
    value = value.replace(/,/g, '');
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const amount = Math.abs(parsed);
  if (trailingNegative || leadingNegative) {
    return -amount;
  }

  return parsed;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function extractAmountTokens(text: string): Array<{ token: string; value: number }> {
  const matches = text.match(/-?\d[\d. ]*,\d{2}-?/g) || [];
  const parsed: Array<{ token: string; value: number }> = [];

  for (const token of matches) {
    const value = parseBankAmountToken(token);
    if (value === null) {
      continue;
    }

    parsed.push({ token, value });
  }

  return parsed;
}

function normalizeDate(day: number, month: number, year: number): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  const normalizedYear = year < 100 ? 2000 + year : year;
  const date = new Date(Date.UTC(normalizedYear, month - 1, day));
  if (
    date.getUTCFullYear() !== normalizedYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${normalizedYear}`;
}

function parseDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const ymd = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    return normalizeDate(Number(ymd[3]), Number(ymd[2]), Number(ymd[1])) || undefined;
  }

  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    return normalizeDate(Number(dmy[1]), Number(dmy[2]), Number(dmy[3])) || undefined;
  }

  return undefined;
}

function extractDateFromText(text: string): string | undefined {
  const match = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) {
    return undefined;
  }

  return normalizeDate(Number(match[1]), Number(match[2]), Number(match[3])) || undefined;
}

function detectStatementYear(rows: RawRow[]): number {
  const yearCounts = new Map<number, number>();

  for (const row of rows) {
    const matches = row.rawText.match(/\b\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{4})\b/g) || [];
    for (const fullMatch of matches) {
      const yearMatch = fullMatch.match(/(\d{4})$/);
      if (!yearMatch) {
        continue;
      }
      const year = Number.parseInt(yearMatch[1], 10);
      if (!Number.isFinite(year)) {
        continue;
      }
      yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
    }
  }

  let selectedYear = new Date().getFullYear();
  let selectedCount = 0;
  yearCounts.forEach((count, year) => {
    if (count > selectedCount) {
      selectedYear = year;
      selectedCount = count;
    }
  });

  return selectedYear;
}

function parsePdfDatePrefix(rawText: string, statementYear: number): string | undefined {
  const match = rawText.match(/^(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i);
  if (!match) {
    return undefined;
  }

  const day = Number.parseInt(match[1], 10);
  const month = PDF_MONTH_INDEX[match[2].toUpperCase()];
  if (!month) {
    return undefined;
  }

  return normalizeDate(day, month, statementYear) || undefined;
}

function inferCategory(description: string): string {
  const text = normalizeText(description);

  if (
    /devoto|disco|supermercado|autoservice|mercadito|panaderia|kiosko|frog|tienda|market|mumus|nossa|super 12/.test(
      text,
    )
  ) {
    return 'Alimentación';
  }

  if (/resto|restaurant|rest la pasi|locos por pu|dean dennys|los pelados|mojito|erevan/.test(text)) {
    return 'Restaurantes';
  }

  if (/farmashop|farmacia|cofas/.test(text)) {
    return 'Salud';
  }

  if (/axion|uber|taxi|combust|transporte/.test(text)) {
    return 'Transporte';
  }

  if (/sodimac|divino|de marco/.test(text)) {
    return 'Hogar';
  }

  if (/veterinaria|laika|merpago\*vet/.test(text)) {
    return 'Mascotas';
  }

  if (/google cloud|vercel|railway|sistarbanc|bps\d+/.test(text)) {
    return 'Servicios y Cargos';
  }

  if (/deb\. cambios|debito redbrou|retiro redbrou|club aebu|comi\.\./.test(text)) {
    return 'Finanzas y Cargos';
  }

  if (/etoro|merpago/.test(text)) {
    return 'Compras Online';
  }

  return 'Otros';
}

function buildNonExpenseItem(
  rowId: string,
  classification: ChunkModelItem['classification'],
  confidence: number,
  exclusionReason: string,
): ChunkModelItem {
  return {
    row_id: rowId,
    classification,
    confidence,
    exclusion_reason: exclusionReason,
  };
}

function buildExpenseItem(
  row: RawRow,
  amount: number,
  confidence: number,
  description: string,
  date?: string,
): ChunkModelItem {
  return {
    row_id: row.rowId,
    classification: 'expense',
    confidence,
    transaction: {
      date,
      description: description.slice(0, 200),
      amount: Math.abs(amount),
      type: 'gasto',
      category: inferCategory(description),
    },
  };
}

function classifyCsvOrGenericRow(row: RawRow): ChunkModelItem {
  const rowText = Array.isArray(row.cells) ? row.cells.join(' | ') : row.rawText;

  if (containsKeyword(rowText, SUMMARY_KEYWORDS)) {
    return buildNonExpenseItem(row.rowId, 'summary', 0.99, 'summary keyword');
  }

  if (containsKeyword(rowText, BALANCE_KEYWORDS)) {
    return buildNonExpenseItem(row.rowId, 'balance', 0.99, 'balance keyword');
  }

  if (containsKeyword(rowText, INCOME_KEYWORDS)) {
    return buildNonExpenseItem(row.rowId, 'income', 0.98, 'income keyword');
  }

  const date = parseDate(getCsvCell(row, CSV_DATE_HEADERS)) || extractDateFromText(row.rawText);
  const description = (getCsvCell(row, CSV_DESCRIPTION_HEADERS) || row.rawText).replace(/\s+/g, ' ').trim();

  const debit = parseBankAmountToken(getCsvCell(row, CSV_DEBIT_HEADERS));
  if (debit !== null && Math.abs(debit) > 0) {
    return buildExpenseItem(row, Math.abs(debit), 0.99, description, date);
  }

  const credit = parseBankAmountToken(getCsvCell(row, CSV_CREDIT_HEADERS));
  if (credit !== null && Math.abs(credit) > 0) {
    return buildNonExpenseItem(row.rowId, 'income', 0.99, 'credit column');
  }

  const amount = parseBankAmountToken(getCsvCell(row, CSV_AMOUNT_HEADERS));
  if (amount !== null && Math.abs(amount) > 0) {
    if (amount < 0) {
      return buildExpenseItem(row, Math.abs(amount), 0.98, description, date);
    }

    if (containsKeyword(rowText, EXPENSE_HINT_KEYWORDS) && !containsKeyword(rowText, INCOME_KEYWORDS)) {
      return buildExpenseItem(row, Math.abs(amount), 0.82, description, date);
    }

    return buildNonExpenseItem(row.rowId, 'income', 0.92, 'positive amount');
  }

  return buildNonExpenseItem(row.rowId, 'ignore', 0.9, 'no parsable amount');
}

function parsePdfMovementLine(
  row: RawRow,
  statementYear: number,
): {
  isDateLine: boolean;
  date?: string;
  description?: string;
  balance?: number;
  amountCandidate?: number;
  rowText: string;
} {
  const rowText = row.rawText.replace(/\s+/g, ' ').trim();
  const date = parsePdfDatePrefix(rowText, statementYear);
  const isDateLine = Boolean(date);
  if (!isDateLine) {
    const trailingAmount = parseBankAmountToken(
      (rowText.match(/(-?\d[\d. ]*,\d{2}-?)\s*$/) || [])[1],
    );
    return {
      isDateLine: false,
      rowText,
      balance: trailingAmount === null ? undefined : trailingAmount,
    };
  }

  const afterDate = rowText.replace(/^\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+/i, '');
  const amountTokens = extractAmountTokens(afterDate);
  const balanceToken = amountTokens.length > 0 ? amountTokens[amountTokens.length - 1] : undefined;
  const balance = balanceToken?.value;

  let withoutBalance = afterDate;
  if (balanceToken) {
    const index = afterDate.lastIndexOf(balanceToken.token);
    if (index >= 0) {
      withoutBalance = afterDate.slice(0, index).trim();
    }
  }

  const movementTokens = extractAmountTokens(withoutBalance);
  const amountToken = movementTokens.length > 0 ? movementTokens[movementTokens.length - 1] : undefined;
  const amountCandidate = amountToken?.value;

  let description = withoutBalance;
  if (amountToken) {
    const index = withoutBalance.lastIndexOf(amountToken.token);
    if (index >= 0) {
      description = withoutBalance.slice(0, index).trim();
    }
  }
  description = description.replace(/\s+\d{1,3}$/, '').replace(/\s+/g, ' ').trim();

  return {
    isDateLine: true,
    date,
    description: description || rowText,
    balance: balance === null ? undefined : balance,
    amountCandidate,
    rowText,
  };
}

function classifyPdfDocumentRows(rows: RawRow[]): ChunkModelResponse {
  const statementYear = detectStatementYear(rows);
  let previousBalance: number | null = null;
  const items: ChunkModelItem[] = [];

  for (const row of rows) {
    const parsed = parsePdfMovementLine(row, statementYear);
    const normalizedRowText = normalizeText(parsed.rowText);

    if (!parsed.isDateLine) {
      if (containsKeyword(normalizedRowText, PDF_BALANCE_OR_SUMMARY_KEYWORDS)) {
        if (typeof parsed.balance === 'number') {
          previousBalance = parsed.balance;
        }
        items.push(buildNonExpenseItem(row.rowId, 'balance', 0.99, 'statement balance/summary row'));
      } else {
        items.push(buildNonExpenseItem(row.rowId, 'ignore', 0.95, 'non-transactional row'));
      }
      continue;
    }

    const description = parsed.description || parsed.rowText;
    const normalizedDescription = normalizeText(description);
    const currentBalance = typeof parsed.balance === 'number' ? parsed.balance : null;
    const delta = previousBalance !== null && currentBalance !== null ? round2(currentBalance - previousBalance) : null;
    const amountFromDelta = delta !== null ? Math.abs(delta) : null;
    const amountCandidate = typeof parsed.amountCandidate === 'number' ? Math.abs(parsed.amountCandidate) : null;
    let movementType: ChunkModelItem['classification'] = 'ignore';

    if (containsKeyword(normalizedDescription, PDF_INCOME_KEYWORDS)) {
      movementType = 'income';
    } else if (containsKeyword(normalizedDescription, PDF_TRANSFER_OUT_KEYWORDS)) {
      movementType = 'ignore';
    } else if (containsKeyword(normalizedDescription, PDF_EXPENSE_KEYWORDS)) {
      movementType = 'expense';
    } else if (delta !== null) {
      movementType = delta < 0 ? 'expense' : 'income';
    }

    if (movementType === 'expense') {
      let amount: number | null = null;
      let confidence = 0.86;

      if (delta !== null && delta < 0) {
        amount = amountFromDelta;
        confidence = 0.99;
      } else if (amountCandidate !== null) {
        amount = amountCandidate;
        confidence = 0.88;
      }

      if (amount !== null && amount > 0.009) {
        items.push(buildExpenseItem(row, amount, confidence, description, parsed.date));
      } else {
        items.push(buildNonExpenseItem(row.rowId, 'ignore', 0.9, 'expense row without parsable amount'));
      }
    } else if (movementType === 'income') {
      items.push(buildNonExpenseItem(row.rowId, 'income', 0.98, 'incoming movement'));
    } else {
      items.push(buildNonExpenseItem(row.rowId, 'ignore', 0.95, 'non-expense movement'));
    }

    if (currentBalance !== null) {
      previousBalance = currentBalance;
    }
  }

  return { items };
}

export function extractDocumentWithLocalRules(rows: RawRow[]): ChunkModelResponse {
  if (rows.length === 0) {
    return { items: [] };
  }

  if (rows[0].sourceType === 'pdf') {
    return classifyPdfDocumentRows(rows);
  }

  return {
    items: rows.map((row) => classifyCsvOrGenericRow(row)),
  };
}

export function extractChunkWithLocalRules(rows: RawRow[]): ChunkModelResponse {
  return extractDocumentWithLocalRules(rows);
}
