import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consolidateStatementResult } from '../consolidate';
import { ExclusionRecord, NormalizedExpenseCandidate } from '../types';

test('meta fields are populated and coherent with totals and warnings', () => {
  const expenses: NormalizedExpenseCandidate[] = [
    {
      sourceRef: { rowId: 'csv-r1', sourceType: 'csv', rowIndex: 1 },
      date: '10/03/2026',
      description: 'Uber',
      amount: 18,
      type: 'gasto',
      category: 'Transporte',
      confidence: 0.95,
    },
  ];

  const exclusions: ExclusionRecord[] = [
    {
      rowId: 'csv-r2',
      sourceRef: { rowId: 'csv-r2', sourceType: 'csv', rowIndex: 2 },
      reason: 'low_confidence',
      confidence: 0.52,
      detail: 'confidence below threshold',
    },
  ];

  const result = consolidateStatementResult({
    expenses,
    exclusions,
    warnings: ['Chunk 1: low confidence exclusion for row csv-r2 (0.52)'],
    totalRows: 2,
    chunksProcessed: 1,
    sourceType: 'csv',
  });

  assert.equal(result.meta.chunks_processed, 1);
  assert.equal(result.meta.total_expenses_detected, 1);
  assert.equal(result.meta.rows_processed, 2);
  assert.equal(result.meta.rows_excluded, 1);
  assert.equal(result.meta.source_type, 'csv');
  assert.ok(result.meta.warnings.length > 0);
  assert.equal(result.meta.exclusions_count, 1);
});

