import {
  ChunkModelItem,
  ChunkModelResponse,
  ExclusionReason,
  ExclusionRecord,
  NormalizedExpenseCandidate,
  RawRow,
  RowClassification,
} from './types';

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
  'depósito',
  'salary',
  'nomina',
  'nómina',
  'abono',
  'credit',
  'credito',
  'crédito',
  'incoming transfer',
  'transferencia recibida',
];

const SUMMARY_KEYWORDS = [
  'total',
  'subtotal',
  'resumen',
  'sum of',
  'saldo final',
  'balance final',
  'totales',
];

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function containsKeyword(text: string, keywords: string[]): boolean {
  const normalizedText = normalizeText(text);
  return keywords.some((keyword) => normalizedText.includes(normalizeText(keyword)));
}

function toClassification(value: unknown): RowClassification {
  if (typeof value !== 'string') {
    return 'ignore';
  }

  switch (value) {
    case 'expense':
    case 'income':
    case 'balance':
    case 'summary':
    case 'ignore':
      return value;
    default:
      return 'ignore';
  }
}

function toConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function toExclusionReasonFromClassification(classification: RowClassification): ExclusionReason {
  switch (classification) {
    case 'income':
      return 'income';
    case 'balance':
      return 'balance';
    case 'summary':
      return 'summary';
    case 'ignore':
    default:
      return 'other_non_expense';
  }
}

function detectHardClassification(rowText: string): RowClassification | null {
  if (containsKeyword(rowText, BALANCE_KEYWORDS)) {
    return 'balance';
  }

  if (containsKeyword(rowText, INCOME_KEYWORDS)) {
    return 'income';
  }

  if (containsKeyword(rowText, SUMMARY_KEYWORDS)) {
    return 'summary';
  }

  return null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.abs(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  let normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const isNegativeByParentheses = normalized.startsWith('(') && normalized.endsWith(')');
  normalized = normalized.replace(/[^\d,.-]/g, '');

  if (!normalized) {
    return null;
  }

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma > lastDot) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const absolute = Math.abs(parsed);
  return isNegativeByParentheses ? absolute : absolute;
}

function normalizeDateCandidate(day: number, month: number, year: number): string | null {
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

function parseDateString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const ymdMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymdMatch) {
    return normalizeDateCandidate(Number(ymdMatch[3]), Number(ymdMatch[2]), Number(ymdMatch[1]));
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyMatch) {
    return normalizeDateCandidate(Number(dmyMatch[1]), Number(dmyMatch[2]), Number(dmyMatch[3]));
  }

  return null;
}

function extractDateFromRowText(text: string): string | null {
  const match = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) {
    return null;
  }

  return normalizeDateCandidate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function normalizeDate(dateCandidate: unknown, rowText: string): string {
  if (typeof dateCandidate === 'string') {
    const parsedDate = parseDateString(dateCandidate);
    if (parsedDate) {
      return parsedDate;
    }
  }

  const fromRowText = extractDateFromRowText(rowText);
  if (fromRowText) {
    return fromRowText;
  }

  return '01/01/1970';
}

function normalizeDescription(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  return fallback.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function normalizeCategory(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Otros';
  }

  return value.replace(/\s+/g, ' ').trim().slice(0, 60);
}

function normalizeType(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return 'gasto';
  }

  return value.replace(/\s+/g, ' ').trim().slice(0, 40);
}

function rowContentForHardRules(row: RawRow): string {
  if (row.sourceType === 'csv' && Array.isArray(row.cells)) {
    return row.cells.join(' | ');
  }

  return row.rawText;
}

interface ValidationInput {
  rows: RawRow[];
  modelResponse: ChunkModelResponse;
  confidenceThreshold: number;
  chunkIndex: number;
}

interface ValidationOutput {
  expenses: NormalizedExpenseCandidate[];
  exclusions: ExclusionRecord[];
  warnings: string[];
}

export function validateAndFilterChunk({
  rows,
  modelResponse,
  confidenceThreshold,
  chunkIndex,
}: ValidationInput): ValidationOutput {
  const warnings: string[] = [];
  const expenses: NormalizedExpenseCandidate[] = [];
  const exclusions: ExclusionRecord[] = [];

  const rowById = new Map<string, RawRow>();
  for (const row of rows) {
    rowById.set(row.rowId, row);
  }

  const modelItemsByRowId = new Map<string, ChunkModelItem>();
  for (const modelItem of modelResponse.items) {
    const rowId = modelItem.row_id;
    if (!rowById.has(rowId)) {
      exclusions.push({
        rowId,
        reason: 'model_invalid_row_reference',
        detail: `Chunk ${chunkIndex}: model returned unknown row_id ${rowId}`,
      });
      warnings.push(`Chunk ${chunkIndex}: model returned unknown row_id ${rowId}`);
      continue;
    }

    if (modelItemsByRowId.has(rowId)) {
      warnings.push(`Chunk ${chunkIndex}: duplicate model item for row_id ${rowId}; first item kept`);
      continue;
    }

    modelItemsByRowId.set(rowId, modelItem);
  }

  for (const row of rows) {
    const modelItem = modelItemsByRowId.get(row.rowId);
    if (!modelItem) {
      exclusions.push({
        rowId: row.rowId,
        sourceRef: {
          rowId: row.rowId,
          sourceType: row.sourceType,
          rowIndex: row.rowIndex,
          page: row.page,
        },
        reason: 'model_omitted_row',
        detail: `Chunk ${chunkIndex}: model omitted row ${row.rowId}`,
      });
      warnings.push(`Chunk ${chunkIndex}: model omitted row ${row.rowId}`);
      continue;
    }

    const rowContent = rowContentForHardRules(row);
    let classification = toClassification(modelItem.classification);
    const confidence = toConfidence(modelItem.confidence);
    const hardClassification = detectHardClassification(rowContent);
    if (hardClassification && classification === 'expense') {
      classification = hardClassification;
      warnings.push(
        `Chunk ${chunkIndex}: row ${row.rowId} reclassified to ${hardClassification} by hard keyword rule`,
      );
    }

    if (confidence < confidenceThreshold) {
      const message = `Chunk ${chunkIndex}: low confidence exclusion for row ${row.rowId} (${confidence.toFixed(2)})`;
      console.warn(message);
      warnings.push(message);
      exclusions.push({
        rowId: row.rowId,
        sourceRef: {
          rowId: row.rowId,
          sourceType: row.sourceType,
          rowIndex: row.rowIndex,
          page: row.page,
        },
        reason: 'low_confidence',
        confidence,
        detail: modelItem.exclusion_reason || `confidence below ${confidenceThreshold}`,
      });
      continue;
    }

    if (classification !== 'expense') {
      exclusions.push({
        rowId: row.rowId,
        sourceRef: {
          rowId: row.rowId,
          sourceType: row.sourceType,
          rowIndex: row.rowIndex,
          page: row.page,
        },
        reason: toExclusionReasonFromClassification(classification),
        confidence,
        detail: modelItem.exclusion_reason,
      });
      continue;
    }

    const amount = parseAmount(modelItem.transaction?.amount);
    const description = normalizeDescription(modelItem.transaction?.description, rowContent);
    const descriptionHardClass = detectHardClassification(description);

    if (!description) {
      exclusions.push({
        rowId: row.rowId,
        sourceRef: {
          rowId: row.rowId,
          sourceType: row.sourceType,
          rowIndex: row.rowIndex,
          page: row.page,
        },
        reason: 'missing_required_fields',
        confidence,
        detail: 'description is required',
      });
      continue;
    }

    if (descriptionHardClass && descriptionHardClass !== 'expense') {
      exclusions.push({
        rowId: row.rowId,
        sourceRef: {
          rowId: row.rowId,
          sourceType: row.sourceType,
          rowIndex: row.rowIndex,
          page: row.page,
        },
        reason: toExclusionReasonFromClassification(descriptionHardClass),
        confidence,
        detail: 'description matched hard exclusion keywords',
      });
      continue;
    }

    if (!amount || amount <= 0) {
      exclusions.push({
        rowId: row.rowId,
        sourceRef: {
          rowId: row.rowId,
          sourceType: row.sourceType,
          rowIndex: row.rowIndex,
          page: row.page,
        },
        reason: 'invalid_amount',
        confidence,
        detail: `invalid amount value: ${String(modelItem.transaction?.amount)}`,
      });
      continue;
    }

    expenses.push({
      sourceRef: {
        rowId: row.rowId,
        sourceType: row.sourceType,
        rowIndex: row.rowIndex,
        page: row.page,
      },
      date: normalizeDate(modelItem.transaction?.date, row.rawText),
      description,
      amount,
      type: normalizeType(modelItem.transaction?.type),
      category: normalizeCategory(modelItem.transaction?.category),
      confidence,
    });
  }

  return { expenses, exclusions, warnings };
}
