import { consolidateStatementResult } from './consolidate';
import {
  CurrencyCode,
  CurrencyMovementItem,
  CurrencyMovementsOutput,
  NormalizedExpenseCandidate,
  RawRow,
  StatementParseResult,
} from './types';

const NOISE_ROW_PATTERNS = [/^tel:/i, /^n[º°o]?\s*de\s*cliente/i, /^n[º°o]?\s*de\s*cuenta/i];
const INCOME_KEYWORDS = ['credito', 'crédito', 'abono', 'ingreso', 'deposito', 'depósito', 'salary'];
const EXPENSE_KEYWORDS = ['debito', 'débito', 'gasto', 'pago', 'compra', 'retiro', 'cargo'];
const BALANCE_KEYWORDS = ['saldo', 'saldos', 'balance'];

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

type MutableMovementBuckets = Record<CurrencyCode, CurrencyMovementsOutput>;

interface ColumnScope {
  currency: CurrencyCode;
  rawCurrency: string;
  accountNumber?: string;
}

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

function parseBankAmountToken(rawValue?: string): number | null {
  if (!rawValue || !rawValue.trim()) {
    return null;
  }

  let value = rawValue.trim();
  const trailingNegative = value.endsWith('-');
  const leadingNegative = value.startsWith('-');

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

function parseDateFromText(text: string, statementYear: number): string | null {
  const dmyMatch = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmyMatch) {
    return normalizeDate(Number(dmyMatch[1]), Number(dmyMatch[2]), Number(dmyMatch[3]));
  }

  const monthPrefixMatch = text.match(/\b(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i);
  if (!monthPrefixMatch) {
    return null;
  }

  const month = PDF_MONTH_INDEX[monthPrefixMatch[2].toUpperCase()];
  if (!month) {
    return null;
  }

  return normalizeDate(Number(monthPrefixMatch[1]), month, statementYear);
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

function normalizeCurrency(rawCurrency?: string): CurrencyCode {
  if (!rawCurrency) {
    return 'UNKNOWN';
  }

  const normalized = rawCurrency.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (normalized === 'URGP' || normalized === 'UYU') {
    return 'UYU';
  }

  if (normalized === 'USD' || normalized === 'USDOLLAR' || normalized === 'USDOLAR') {
    return 'USD';
  }

  return 'UNKNOWN';
}

function extractScopeFromRow(rowText: string): Partial<ColumnScope> {
  const currencyMatch = rowText.match(/\b(URGP|UYU|US\.?D|USD)\b/i);
  const digitTokens = rowText.match(/\b\d{5,}\b/g) || [];

  let accountNumber: string | undefined;
  const explicitAccountMatch = rowText.match(/(?:n[º°o]?\s*de\s*cuenta|cuenta)\s*[:#]?\s*(\d{5,})/i);
  if (explicitAccountMatch) {
    accountNumber = explicitAccountMatch[1];
  } else if (digitTokens.length > 0) {
    accountNumber = digitTokens[digitTokens.length - 1];
  }

  if (!currencyMatch && !accountNumber) {
    return {};
  }

  const rawCurrency = currencyMatch?.[1]?.toUpperCase().replace(/\s+/g, '') || undefined;
  return {
    currency: normalizeCurrency(rawCurrency),
    rawCurrency: rawCurrency || 'UNKNOWN',
    accountNumber,
  };
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

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toRowSourceRef(row: RawRow) {
  return {
    rowId: row.rowId,
    sourceType: row.sourceType,
    rowIndex: row.rowIndex,
    page: row.page,
  };
}

function upsertBucket(buckets: MutableMovementBuckets, scope: ColumnScope): CurrencyMovementsOutput {
  const existing = buckets[scope.currency];
  if (existing) {
    if (scope.rawCurrency && !existing.rawCurrencies.includes(scope.rawCurrency)) {
      existing.rawCurrencies.push(scope.rawCurrency);
    }
    if (scope.accountNumber && !existing.accountNumbers.includes(scope.accountNumber)) {
      existing.accountNumbers.push(scope.accountNumber);
    }
    return existing;
  }

  const created: CurrencyMovementsOutput = {
    currency: scope.currency,
    rawCurrencies: scope.rawCurrency ? [scope.rawCurrency] : [],
    accountNumbers: scope.accountNumber ? [scope.accountNumber] : [],
    debits: [],
    credits: [],
    balances: [],
  };
  buckets[scope.currency] = created;
  return created;
}

function sortMovementItems(items: CurrencyMovementItem[]): CurrencyMovementItem[] {
  return [...items].sort((left, right) => {
    const leftPage = left.sourceRef.page || 0;
    const rightPage = right.sourceRef.page || 0;
    if (leftPage !== rightPage) {
      return leftPage - rightPage;
    }
    if (left.sourceRef.rowIndex !== right.sourceRef.rowIndex) {
      return left.sourceRef.rowIndex - right.sourceRef.rowIndex;
    }
    return left.sourceRef.rowId.localeCompare(right.sourceRef.rowId);
  });
}

function cleanupDescription(rawText: string): string {
  return rawText
    .replace(/^\s*\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*/i, '')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, '')
    .replace(/-?\d[\d. ]*,\d{2}-?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isProbablyMetadataRow(normalizedText: string): boolean {
  return (
    normalizedText.includes('moneda') ||
    normalizedText.includes('n de cuenta') ||
    normalizedText.includes('n de cliente') ||
    normalizedText.includes('nro de cuenta') ||
    normalizedText.includes('n de cuenta')
  );
}

function getMovementSignFromDelta(delta: number | null): 'debit' | 'credit' | null {
  if (delta === null) {
    return null;
  }

  if (delta < 0) {
    return 'debit';
  }

  if (delta > 0) {
    return 'credit';
  }

  return null;
}

export function isColumnarCurrencyStatement(rows: RawRow[]): boolean {
  if (rows.length === 0 || rows[0].sourceType !== 'pdf') {
    return false;
  }

  let hasColumnsHeader = false;
  let hasCurrencyHint = false;

  for (const row of rows) {
    const normalized = normalizeText(row.rawText);
    if (
      normalized.includes('debitos') &&
      normalized.includes('creditos') &&
      (normalized.includes('saldos') || normalized.includes('saldo'))
    ) {
      hasColumnsHeader = true;
    }

    if (normalized.includes('moneda') || /\b(URGP|UYU|US\.?D|USD)\b/i.test(row.rawText)) {
      hasCurrencyHint = true;
    }
  }

  return hasColumnsHeader && hasCurrencyHint;
}

export function parseColumnarCurrencyStatement(rows: RawRow[]): StatementParseResult {
  const statementYear = detectStatementYear(rows);
  const warnings: string[] = [];
  const buckets: MutableMovementBuckets = {
    UYU: {
      currency: 'UYU',
      rawCurrencies: [],
      accountNumbers: [],
      debits: [],
      credits: [],
      balances: [],
    },
    USD: {
      currency: 'USD',
      rawCurrencies: [],
      accountNumbers: [],
      debits: [],
      credits: [],
      balances: [],
    },
    UNKNOWN: {
      currency: 'UNKNOWN',
      rawCurrencies: [],
      accountNumbers: [],
      debits: [],
      credits: [],
      balances: [],
    },
  };
  const expenses: NormalizedExpenseCandidate[] = [];
  const previousBalanceByScope = new Map<string, number>();

  let activeScope: ColumnScope = {
    currency: 'UNKNOWN',
    rawCurrency: 'UNKNOWN',
  };
  let lastKnownDate = `01/01/${statementYear}`;

  for (const row of rows) {
    const rowText = row.rawText.replace(/\s+/g, ' ').trim();
    if (!rowText) {
      continue;
    }

    if (NOISE_ROW_PATTERNS.some((pattern) => pattern.test(rowText))) {
      continue;
    }

    const normalizedRowText = normalizeText(rowText);
    if (!normalizedRowText) {
      continue;
    }

    const extractedScope = extractScopeFromRow(rowText);
    if (extractedScope.currency || extractedScope.accountNumber) {
      activeScope = {
        currency: extractedScope.currency || activeScope.currency,
        rawCurrency: extractedScope.rawCurrency || activeScope.rawCurrency,
        accountNumber: extractedScope.accountNumber || activeScope.accountNumber,
      };

      upsertBucket(buckets, activeScope);

      if (isProbablyMetadataRow(normalizedRowText) || extractAmountTokens(rowText).length === 0) {
        continue;
      }
    }

    const amountTokens = extractAmountTokens(rowText);
    if (amountTokens.length === 0) {
      continue;
    }

    const parsedDate = parseDateFromText(rowText, statementYear);
    if (parsedDate) {
      lastKnownDate = parsedDate;
    }
    const movementDate = parsedDate || lastKnownDate;
    const description = cleanupDescription(rowText) || 'Movimiento';

    const currentBucket = upsertBucket(buckets, activeScope);
    const scopeKey = `${activeScope.currency}:${activeScope.accountNumber || 'no-account'}`;
    const previousBalance = previousBalanceByScope.get(scopeKey) ?? null;

    const addMovement = (type: 'debit' | 'credit' | 'balance', amount: number) => {
      const item: CurrencyMovementItem = {
        date: movementDate,
        description,
        amount,
        type,
        currency: activeScope.currency,
        accountNumber: activeScope.accountNumber,
        sourceRef: toRowSourceRef(row),
      };

      if (type === 'debit') {
        currentBucket.debits.push(item);
        expenses.push({
          sourceRef: item.sourceRef,
          date: item.date,
          description: item.description,
          amount: Math.abs(item.amount),
          type: 'gasto',
          category: inferCategory(item.description),
          confidence: 0.99,
          currency: item.currency,
          accountNumber: item.accountNumber,
        });
        return;
      }

      if (type === 'credit') {
        currentBucket.credits.push(item);
        return;
      }

      currentBucket.balances.push(item);
    };

    if (amountTokens.length >= 3 && /^[\d.,\s-]+$/.test(rowText)) {
      const debitAmount = Math.abs(amountTokens[0].value);
      const creditAmount = Math.abs(amountTokens[1].value);
      const balanceAmount = amountTokens[2].value;

      if (debitAmount > 0.009) {
        addMovement('debit', -debitAmount);
      }

      if (creditAmount > 0.009) {
        addMovement('credit', creditAmount);
      }

      addMovement('balance', balanceAmount);
      previousBalanceByScope.set(scopeKey, balanceAmount);
      continue;
    }

    if (amountTokens.length >= 2) {
      const movementAmount = Math.abs(amountTokens[0].value);
      const balanceAmount = amountTokens[1].value;
      const delta = previousBalance === null ? null : round2(balanceAmount - previousBalance);

      let movementType: 'debit' | 'credit' | null = null;
      if (containsKeyword(description, INCOME_KEYWORDS)) {
        movementType = 'credit';
      } else if (containsKeyword(description, EXPENSE_KEYWORDS)) {
        movementType = 'debit';
      } else {
        movementType = getMovementSignFromDelta(delta);
        if (!movementType && previousBalance === null) {
          movementType = 'debit';
        }
      }

      if (movementType === 'debit' && movementAmount > 0.009) {
        addMovement('debit', -movementAmount);
      } else if (movementType === 'credit' && movementAmount > 0.009) {
        addMovement('credit', movementAmount);
      } else if (!containsKeyword(description, BALANCE_KEYWORDS)) {
        warnings.push(`Fila ${row.rowId}: no se pudo inferir tipo para movimiento ${description}`);
      }

      addMovement('balance', balanceAmount);
      previousBalanceByScope.set(scopeKey, balanceAmount);
      continue;
    }

    const singleAmount = amountTokens[0].value;
    if (containsKeyword(description, BALANCE_KEYWORDS)) {
      addMovement('balance', singleAmount);
      previousBalanceByScope.set(scopeKey, singleAmount);
      continue;
    }

    if (containsKeyword(description, INCOME_KEYWORDS)) {
      addMovement('credit', Math.abs(singleAmount));
      continue;
    }

    if (containsKeyword(description, EXPENSE_KEYWORDS)) {
      addMovement('debit', -Math.abs(singleAmount));
      continue;
    }

    // Fallback conservador para montos huérfanos: se consideran débitos.
    addMovement('debit', -Math.abs(singleAmount));
  }

  const consolidated = consolidateStatementResult({
    expenses,
    exclusions: [],
    warnings,
    totalRows: rows.length,
    chunksProcessed: 1,
    sourceType: 'pdf',
  });

  const currencyOrder: CurrencyCode[] = ['UYU', 'USD', 'UNKNOWN'];
  const movementsByCurrency = currencyOrder
    .map((currency) => buckets[currency])
    .filter(
      (bucket) =>
        bucket.debits.length > 0 || bucket.credits.length > 0 || bucket.balances.length > 0,
    )
    .map((bucket) => ({
      ...bucket,
      debits: sortMovementItems(bucket.debits),
      credits: sortMovementItems(bucket.credits),
      balances: sortMovementItems(bucket.balances),
      rawCurrencies: [...bucket.rawCurrencies].sort((left, right) => left.localeCompare(right)),
      accountNumbers: [...bucket.accountNumbers].sort((left, right) => left.localeCompare(right)),
    }));

  return {
    ...consolidated,
    movementsByCurrency,
  };
}
