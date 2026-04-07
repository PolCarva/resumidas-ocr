import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkRowsDeterministically } from '../chunking';
import { RawRow } from '../types';

function createRows(total: number): RawRow[] {
  return Array.from({ length: total }, (_, index) => ({
    rowId: `csv-r${index + 1}`,
    sourceType: 'csv' as const,
    rowIndex: index + 1,
    rawText: `row ${index + 1} - sample expense line`,
  }));
}

test('chunking preserves all rows without splitting boundaries', () => {
  const rows = createRows(1005);
  const chunks = chunkRowsDeterministically(rows, { maxRows: 100, maxChars: 100000 });

  const totalRows = chunks.reduce((sum, chunk) => sum + chunk.rows.length, 0);
  assert.equal(totalRows, 1005);
  assert.ok(chunks.every((chunk) => chunk.rows.length <= 100));
  assert.equal(chunks[0].rows[0].rowId, 'csv-r1');
  assert.equal(chunks[chunks.length - 1].rows[chunks[chunks.length - 1].rows.length - 1].rowId, 'csv-r1005');
});

test('chunking is deterministic for repeated runs', () => {
  const rows = createRows(240);
  const firstRun = chunkRowsDeterministically(rows, { maxRows: 75, maxChars: 4000 });
  const secondRun = chunkRowsDeterministically(rows, { maxRows: 75, maxChars: 4000 });

  assert.deepEqual(
    firstRun.map((chunk) => chunk.rows.map((row) => row.rowId)),
    secondRun.map((chunk) => chunk.rows.map((row) => row.rowId)),
  );
});

