export type SourceType = 'pdf' | 'csv';

export interface RawRow {
  rowId: string;
  sourceType: SourceType;
  rowIndex: number;
  page?: number;
  rawText: string;
  rawLine?: string;
  headers?: string[];
  cells?: string[];
}

export interface RowChunk {
  chunkIndex: number;
  rows: RawRow[];
  charLength: number;
}

export interface RowSourceRef {
  rowId: string;
  sourceType: SourceType;
  rowIndex: number;
  page?: number;
}

export type RowClassification = 'expense' | 'income' | 'balance' | 'summary' | 'ignore';

export interface ChunkModelTransaction {
  date?: string;
  description?: string;
  amount?: number;
  type?: string;
  category?: string;
}

export interface ChunkModelItem {
  row_id: string;
  classification: RowClassification;
  confidence: number;
  exclusion_reason?: string;
  transaction?: ChunkModelTransaction;
}

export interface ChunkModelResponse {
  items: ChunkModelItem[];
}

export interface NormalizedExpenseCandidate {
  sourceRef: RowSourceRef;
  date: string;
  description: string;
  amount: number;
  type: string;
  category: string;
  confidence: number;
  currency?: CurrencyCode;
  accountNumber?: string;
}

export type ExclusionReason =
  | 'income'
  | 'balance'
  | 'summary'
  | 'other_non_expense'
  | 'low_confidence'
  | 'invalid_amount'
  | 'missing_required_fields'
  | 'model_omitted_row'
  | 'model_invalid_row_reference'
  | 'duplicate';

export interface ExclusionRecord {
  rowId: string;
  sourceRef?: RowSourceRef;
  reason: ExclusionReason;
  confidence?: number;
  detail?: string;
}

export interface TransactionOutput {
  id: number;
  date: string;
  description: string;
  amount: number;
  type: string;
  category: string;
  page?: number;
  currency?: CurrencyCode;
  accountNumber?: string;
}

export type MovementType = 'debit' | 'credit' | 'balance';
export type CurrencyCode = 'UYU' | 'USD' | 'UNKNOWN';

export interface CurrencyMovementItem {
  date: string;
  description: string;
  amount: number;
  type: MovementType;
  currency: CurrencyCode;
  accountNumber?: string;
  sourceRef: RowSourceRef;
}

export interface CurrencyMovementsOutput {
  currency: CurrencyCode;
  rawCurrencies: string[];
  accountNumbers: string[];
  debits: CurrencyMovementItem[];
  credits: CurrencyMovementItem[];
  balances: CurrencyMovementItem[];
}

export interface CategoryDataOutput {
  name: string;
  value: number;
  color: string;
}

export interface DailyDataOutput {
  day: string;
  amount: number;
}

export interface StatementMeta {
  chunks_processed: number;
  total_expenses_detected: number;
  warnings: string[];
  rows_processed: number;
  rows_excluded: number;
  source_type: SourceType;
  exclusions_count: number;
}

export interface StatementParseResult {
  transactions: TransactionOutput[];
  categoryData: CategoryDataOutput[];
  dailyData: DailyDataOutput[];
  movementsByCurrency: CurrencyMovementsOutput[];
  meta: StatementMeta;
}
