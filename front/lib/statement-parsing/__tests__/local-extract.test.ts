import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsvRowsFromText } from '../ingest-csv';
import { extractChunkWithLocalRules, extractDocumentWithLocalRules } from '../local-extract';
import { RawRow } from '../types';
import { validateAndFilterChunk } from '../validation';

test('local extractor keeps only expenses for debit/credit/balance column format', async () => {
  const csvText = [
    'Date,Description,Debit,Credit,Balance',
    '01/03/2026,SUPERMERCADO,120.50,,2030.90',
    '01/03/2026,SALARY,,2500.00,4530.90',
    '01/03/2026,TOTAL MOVIMIENTOS,,,4530.90',
  ].join('\n');

  const rows = await parseCsvRowsFromText(csvText);
  const modelResponse = extractChunkWithLocalRules(rows);

  const result = validateAndFilterChunk({
    rows,
    modelResponse,
    confidenceThreshold: 0.8,
    chunkIndex: 1,
  });

  assert.equal(result.expenses.length, 1);
  assert.equal(result.expenses[0].description, 'SUPERMERCADO');
  assert.equal(result.expenses[0].amount, 120.5);
  assert.equal(result.exclusions.length, 2);
  assert.ok(result.exclusions.some((item) => item.reason === 'income'));
  assert.ok(result.exclusions.some((item) => item.reason === 'summary'));
});

test('local extractor is deterministic for identical input', async () => {
  const csvText = [
    'Date,Description,Amount',
    '02/03/2026,Coffee,-4.50',
    '02/03/2026,Transferencia recibida,+100.00',
    '02/03/2026,Saldo disponible,900.00',
  ].join('\n');

  const rows = await parseCsvRowsFromText(csvText);
  const first = extractChunkWithLocalRules(rows);
  const second = extractChunkWithLocalRules(rows);

  assert.deepEqual(first, second);
  assert.equal(first.items.length, 3);
});

test('pdf local extractor uses balance delta to avoid false 40k expenses', () => {
  const rows: RawRow[] = [
    {
      rowId: 'p1-r10',
      sourceType: 'pdf',
      page: 1,
      rowIndex: 10,
      rawText: '30JAN2026',
    },
    {
      rowId: 'p1-r36',
      sourceType: 'pdf',
      page: 1,
      rowIndex: 36,
      rawText: '05JAN COMPRA DEVOTO EXPRE 475,00 14.815,53',
    },
    {
      rowId: 'p1-r37',
      sourceType: 'pdf',
      page: 1,
      rowIndex: 37,
      rawText: '05JAN COMPRA AXION SERV. 1.000,00 13.815,53',
    },
    {
      rowId: 'p1-r38',
      sourceType: 'pdf',
      page: 1,
      rowIndex: 38,
      rawText: '05JAN COMPRA FARMASHOP 40 259,00 13.556,53',
    },
    {
      rowId: 'p1-r49',
      sourceType: 'pdf',
      page: 1,
      rowIndex: 49,
      rawText: '05JAN REDIVA 19210 FARMASHOP 40 4,71 13.561,24',
    },
    {
      rowId: 'p2-r44',
      sourceType: 'pdf',
      page: 2,
      rowIndex: 44,
      rawText: '12JAN TRASPASO A 3969951ILINK 600,00 625,40',
    },
  ];

  const modelResponse = extractDocumentWithLocalRules(rows);
  const validation = validateAndFilterChunk({
    rows,
    modelResponse,
    confidenceThreshold: 0.8,
    chunkIndex: 1,
  });

  assert.equal(validation.expenses.length, 3);
  const farmashop = validation.expenses.find((item) => item.sourceRef.rowId === 'p1-r38');
  assert.ok(farmashop);
  assert.equal(farmashop?.amount, 259);
  assert.equal(farmashop?.date, '05/01/2026');
  assert.equal(farmashop?.category, 'Salud');

  assert.ok(validation.exclusions.some((item) => item.rowId === 'p1-r49' && item.reason === 'income'));
  assert.ok(validation.exclusions.some((item) => item.rowId === 'p2-r44'));
  assert.ok(validation.expenses.every((item) => item.amount < 5000));
});
