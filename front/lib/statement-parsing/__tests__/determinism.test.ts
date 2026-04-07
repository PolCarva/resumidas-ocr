import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consolidateStatementResult } from '../consolidate';
import { ExclusionRecord, NormalizedExpenseCandidate } from '../types';

function sampleExpenses(): NormalizedExpenseCandidate[] {
  return [
    {
      sourceRef: { rowId: 'p1-r2', sourceType: 'pdf', page: 1, rowIndex: 2 },
      date: '02/03/2026',
      description: 'Restaurant',
      amount: 45.5,
      type: 'gasto',
      category: 'Restaurantes',
      confidence: 0.95,
    },
    {
      sourceRef: { rowId: 'p1-r1', sourceType: 'pdf', page: 1, rowIndex: 1 },
      date: '01/03/2026',
      description: 'Market',
      amount: 90.12,
      type: 'gasto',
      category: 'Alimentación',
      confidence: 0.99,
    },
  ];
}

test('consolidation produces deterministic ordering and ids across runs', () => {
  const exclusions: ExclusionRecord[] = [];
  const warnings = ['Chunk 1: sample warning'];

  const firstRun = consolidateStatementResult({
    expenses: sampleExpenses(),
    exclusions,
    warnings,
    totalRows: 2,
    chunksProcessed: 1,
    sourceType: 'pdf',
  });

  const secondRun = consolidateStatementResult({
    expenses: sampleExpenses(),
    exclusions,
    warnings,
    totalRows: 2,
    chunksProcessed: 1,
    sourceType: 'pdf',
  });

  assert.deepEqual(firstRun, secondRun);
  assert.equal(firstRun.transactions[0].id, 1);
  assert.equal(firstRun.transactions[1].id, 2);
  assert.equal(firstRun.transactions[0].description, 'Market');
});

