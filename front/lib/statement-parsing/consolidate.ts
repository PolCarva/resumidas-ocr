import {
  CategoryDataOutput,
  DailyDataOutput,
  ExclusionRecord,
  NormalizedExpenseCandidate,
  StatementParseResult,
  SourceType,
  TransactionOutput,
} from './types';

const CATEGORY_COLORS: Record<string, string> = {
  Alimentación: '#3b82f6',
  Restaurantes: '#8b5cf6',
  Mascotas: '#f59e0b',
  'Servicios Digitales': '#10b981',
  Transferencias: '#ec4899',
  Impuestos: '#6366f1',
  Vivienda: '#0ea5e9',
  Transporte: '#14b8a6',
  Viajes: '#f43f5e',
  Tecnología: '#6b7280',
  Ropa: '#d946ef',
  Salud: '#ef4444',
  Trabajo: '#84cc16',
  Educación: '#eab308',
  Regalos: '#fb7185',
  Otros: '#64748b',
};

function normalizeForFingerprint(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toTransactionFingerprint(expense: NormalizedExpenseCandidate): string {
  const normalizedAmount = Number(expense.amount).toFixed(2);
  const sourceRef = expense.sourceRef.page
    ? `${expense.sourceRef.sourceType}:${expense.sourceRef.page}:${expense.sourceRef.rowIndex}`
    : `${expense.sourceRef.sourceType}:${expense.sourceRef.rowIndex}`;
  const currency = expense.currency || 'UNKNOWN';
  const accountNumber = expense.accountNumber || '';

  return [
    normalizeForFingerprint(expense.date),
    normalizeForFingerprint(expense.description),
    normalizedAmount,
    currency,
    normalizeForFingerprint(accountNumber),
    sourceRef,
  ].join('|');
}

function parseDayAndMonth(date: string): { day: number; month: number } {
  const match = date.match(/^(\d{2})\/(\d{2})\/\d{4}$/);
  if (!match) {
    return { day: 0, month: 0 };
  }

  return {
    day: Number(match[1]),
    month: Number(match[2]),
  };
}

function sortCandidatesDeterministically(
  left: NormalizedExpenseCandidate,
  right: NormalizedExpenseCandidate,
): number {
  const leftPage = left.sourceRef.page ?? 0;
  const rightPage = right.sourceRef.page ?? 0;
  if (leftPage !== rightPage) {
    return leftPage - rightPage;
  }

  if (left.sourceRef.rowIndex !== right.sourceRef.rowIndex) {
    return left.sourceRef.rowIndex - right.sourceRef.rowIndex;
  }

  return left.sourceRef.rowId.localeCompare(right.sourceRef.rowId);
}

function buildCategoryData(transactions: TransactionOutput[]): CategoryDataOutput[] {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    const currentTotal = totals.get(transaction.category) || 0;
    totals.set(transaction.category, currentTotal + Math.abs(transaction.amount));
  }

  return Array.from(totals.entries())
    .map(([name, value]) => ({
      name,
      value: Number(value.toFixed(2)),
      color: CATEGORY_COLORS[name] || '#64748b',
    }))
    .sort((a, b) => {
      if (b.value !== a.value) {
        return b.value - a.value;
      }
      return a.name.localeCompare(b.name);
    });
}

function buildDailyData(transactions: TransactionOutput[]): DailyDataOutput[] {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    const day = transaction.date.slice(0, 5);
    const currentTotal = totals.get(day) || 0;
    totals.set(day, currentTotal + Math.abs(transaction.amount));
  }

  return Array.from(totals.entries())
    .map(([day, amount]) => ({
      day,
      amount: Number(amount.toFixed(2)),
    }))
    .sort((a, b) => {
      const left = parseDayAndMonth(`${a.day}/2000`);
      const right = parseDayAndMonth(`${b.day}/2000`);
      if (left.month !== right.month) {
        return left.month - right.month;
      }
      return left.day - right.day;
    });
}

interface ConsolidateInput {
  expenses: NormalizedExpenseCandidate[];
  exclusions: ExclusionRecord[];
  warnings: string[];
  totalRows: number;
  chunksProcessed: number;
  sourceType: SourceType;
}

export function consolidateStatementResult({
  expenses,
  exclusions,
  warnings,
  totalRows,
  chunksProcessed,
  sourceType,
}: ConsolidateInput): StatementParseResult {
  const sortedExpenses = [...expenses].sort(sortCandidatesDeterministically);
  const seenFingerprints = new Set<string>();
  const dedupedTransactions: TransactionOutput[] = [];
  const dedupeExclusions: ExclusionRecord[] = [];

  for (const expense of sortedExpenses) {
    const fingerprint = toTransactionFingerprint(expense);
    if (seenFingerprints.has(fingerprint)) {
      dedupeExclusions.push({
        rowId: expense.sourceRef.rowId,
        sourceRef: expense.sourceRef,
        reason: 'duplicate',
        confidence: expense.confidence,
        detail: 'duplicate fingerprint during consolidation',
      });
      continue;
    }

    seenFingerprints.add(fingerprint);
    dedupedTransactions.push({
      id: dedupedTransactions.length + 1,
      date: expense.date,
      description: expense.description,
      amount: Number(expense.amount.toFixed(2)),
      type: expense.type || 'gasto',
      category: expense.category || 'Otros',
      page: expense.sourceRef.page,
      currency: expense.currency,
      accountNumber: expense.accountNumber,
    });
  }

  const finalExclusions = exclusions.concat(dedupeExclusions);
  const uniqueWarnings = Array.from(new Set(warnings));
  const rowsExcluded = Math.max(0, totalRows - dedupedTransactions.length);

  return {
    transactions: dedupedTransactions,
    categoryData: buildCategoryData(dedupedTransactions),
    dailyData: buildDailyData(dedupedTransactions),
    movementsByCurrency: [],
    meta: {
      chunks_processed: chunksProcessed,
      total_expenses_detected: dedupedTransactions.length,
      warnings: uniqueWarnings,
      rows_processed: totalRows,
      rows_excluded: rowsExcluded,
      source_type: sourceType,
      exclusions_count: finalExclusions.length,
    },
  };
}
