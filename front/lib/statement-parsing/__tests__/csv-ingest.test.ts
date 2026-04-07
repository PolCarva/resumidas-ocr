import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsvRowsFromText } from '../ingest-csv';
import { validateAndFilterChunk } from '../validation';
import { ChunkModelResponse } from '../types';

test('csv ingest supports semicolon delimiter and header normalization', async () => {
  const csvText = [
    'Fecha;Descripcion;Importe',
    '01/03/2026;SUPERMERCADO;-150,32',
    '02/03/2026;ABONO NOMINA;2500,00',
  ].join('\n');

  const rows = await parseCsvRowsFromText(csvText);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].rowId, 'csv-r1');
  assert.ok(rows[0].rawText.includes('fecha: 01/03/2026'));
  assert.ok(rows[0].rawText.includes('descripcion: SUPERMERCADO'));
});

test('csv ingest supports tab-delimited files and keeps row boundaries', async () => {
  const csvText = [
    'Date\tDescription\tAmount',
    '03/03/2026\tRestaurant\t-40.00',
    '03/03/2026\tBalance\t1020.00',
  ].join('\n');

  const rows = await parseCsvRowsFromText(csvText);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].rowId, 'csv-r2');
  assert.ok(rows[1].rawText.includes('description: Balance'));
});

test('csv rows with missing amount are excluded by validation rules', async () => {
  const csvText = [
    'Date,Description,Amount',
    '03/03/2026,Coffee Shop,',
  ].join('\n');

  const rows = await parseCsvRowsFromText(csvText);
  const response: ChunkModelResponse = {
    items: [
      {
        row_id: 'csv-r1',
        classification: 'expense',
        confidence: 0.96,
        transaction: {
          date: '03/03/2026',
          description: 'Coffee Shop',
          amount: '',
          category: 'Restaurantes',
        } as unknown as { date: string; description: string; amount: number; category: string },
      },
    ],
  };

  const validation = validateAndFilterChunk({
    rows,
    modelResponse: response,
    confidenceThreshold: 0.8,
    chunkIndex: 1,
  });

  assert.equal(validation.expenses.length, 0);
  assert.equal(validation.exclusions.length, 1);
  assert.equal(validation.exclusions[0].reason, 'invalid_amount');
});

