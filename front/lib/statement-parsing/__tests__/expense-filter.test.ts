import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateAndFilterChunk } from '../validation';
import { ChunkModelResponse, RawRow } from '../types';

const rows: RawRow[] = [
  {
    rowId: 'p1-r1',
    sourceType: 'pdf',
    page: 1,
    rowIndex: 1,
    rawText: '01/02/2026 GROCERY MARKET -52.10',
  },
  {
    rowId: 'p1-r2',
    sourceType: 'pdf',
    page: 1,
    rowIndex: 2,
    rawText: '01/02/2026 SALARY PAYMENT +1500.00',
  },
  {
    rowId: 'p1-r3',
    sourceType: 'pdf',
    page: 1,
    rowIndex: 3,
    rawText: 'Saldo disponible 12345.00',
  },
  {
    rowId: 'p1-r4',
    sourceType: 'pdf',
    page: 1,
    rowIndex: 4,
    rawText: 'TOTAL MOVIMIENTOS 1552.10',
  },
];

const response: ChunkModelResponse = {
  items: [
    {
      row_id: 'p1-r1',
      classification: 'expense',
      confidence: 0.97,
      transaction: {
        date: '01/02/2026',
        description: 'Grocery market',
        amount: -52.1,
        type: 'COMPRA',
        category: 'Alimentación',
      },
    },
    {
      row_id: 'p1-r2',
      classification: 'income',
      confidence: 0.99,
      transaction: {
        date: '01/02/2026',
        description: 'Salary payment',
        amount: 1500,
      },
    },
    {
      row_id: 'p1-r3',
      classification: 'balance',
      confidence: 0.95,
      exclusion_reason: 'running balance',
    },
    {
      row_id: 'p1-r4',
      classification: 'summary',
      confidence: 0.94,
      exclusion_reason: 'summary total',
    },
  ],
};

test('validation returns only expense rows and excludes non-expense values', () => {
  const result = validateAndFilterChunk({
    rows,
    modelResponse: response,
    confidenceThreshold: 0.8,
    chunkIndex: 1,
  });

  assert.equal(result.expenses.length, 1);
  assert.equal(result.expenses[0].sourceRef.rowId, 'p1-r1');
  assert.equal(result.expenses[0].amount, 52.1);
  assert.equal(result.exclusions.length, 3);
  assert.ok(result.exclusions.some((item) => item.reason === 'income'));
  assert.ok(result.exclusions.some((item) => item.reason === 'balance'));
  assert.ok(result.exclusions.some((item) => item.reason === 'summary'));
});

test('validation excludes low-confidence rows and logs warning metadata', () => {
  const lowConfidenceResponse: ChunkModelResponse = {
    items: [
      {
        row_id: 'p1-r1',
        classification: 'expense',
        confidence: 0.42,
        transaction: {
          date: '01/02/2026',
          description: 'Uncertain row',
          amount: 12,
          category: 'Otros',
        },
      },
    ],
  };

  const lowConfidenceRows: RawRow[] = [rows[0]];
  const result = validateAndFilterChunk({
    rows: lowConfidenceRows,
    modelResponse: lowConfidenceResponse,
    confidenceThreshold: 0.8,
    chunkIndex: 2,
  });

  assert.equal(result.expenses.length, 0);
  assert.equal(result.exclusions.length, 1);
  assert.equal(result.exclusions[0].reason, 'low_confidence');
  assert.ok(result.warnings.some((warning) => warning.includes('low confidence exclusion')));
});

test('csv rows are not hard-reclassified as balance just because a balance column exists', () => {
  const csvRows: RawRow[] = [
    {
      rowId: 'csv-r1',
      sourceType: 'csv',
      rowIndex: 1,
      headers: ['date', 'description', 'debit', 'credit', 'balance'],
      cells: ['01/03/2026', 'SUPERMERCADO', '120.50', '', '2030.90'],
      rawText:
        'date: 01/03/2026 | description: SUPERMERCADO | debit: 120.50 | credit: | balance: 2030.90',
    },
  ];

  const csvResponse: ChunkModelResponse = {
    items: [
      {
        row_id: 'csv-r1',
        classification: 'expense',
        confidence: 0.95,
        transaction: {
          date: '01/03/2026',
          description: 'SUPERMERCADO',
          amount: 120.5,
          category: 'Alimentación',
        },
      },
    ],
  };

  const result = validateAndFilterChunk({
    rows: csvRows,
    modelResponse: csvResponse,
    confidenceThreshold: 0.8,
    chunkIndex: 3,
  });

  assert.equal(result.expenses.length, 1);
  assert.equal(result.expenses[0].amount, 120.5);
  assert.equal(result.exclusions.length, 0);
});
