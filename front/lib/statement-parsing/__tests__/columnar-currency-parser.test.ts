import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isColumnarCurrencyStatement,
  parseColumnarCurrencyStatement,
} from '../columnar-currency-parser';
import { RawRow } from '../types';

function pdfRow(rowId: string, rowIndex: number, rawText: string, page = 1): RawRow {
  return {
    rowId,
    sourceType: 'pdf',
    page,
    rowIndex,
    rawText,
  };
}

test('detects columnar statement layout by headers and currency hints', () => {
  const rows: RawRow[] = [
    pdfRow('p1-r1', 1, 'Débitos Créditos Saldos'),
    pdfRow('p1-r2', 2, 'Nº de cliente Moneda Nº de cuenta'),
    pdfRow('p1-r3', 3, '694890 URGP 3314679'),
  ];

  assert.equal(isColumnarCurrencyStatement(rows), true);
});

test('parses URGP statement into UYU debits/credits/balances', () => {
  const rows: RawRow[] = [
    pdfRow('p1-r1', 1, 'Débitos Créditos Saldos'),
    pdfRow('p1-r2', 2, 'Nº de cliente Moneda Nº de cuenta'),
    pdfRow('p1-r3', 3, '694890 URGP 3314679'),
    pdfRow('p1-r4', 4, '01/03/2026 COMPRA DEVOTO 3.132,37 10.321,08'),
    pdfRow('p1-r5', 5, '02/03/2026 DEPOSITO NOMINA 2,62 10.323,70'),
    pdfRow('p1-r6', 6, '03/03/2026 COMPRA FARMASHOP 479,00 9.844,70'),
  ];

  const result = parseColumnarCurrencyStatement(rows);
  assert.equal(result.movementsByCurrency.length, 1);
  assert.equal(result.movementsByCurrency[0].currency, 'UYU');
  assert.ok(result.movementsByCurrency[0].rawCurrencies.includes('URGP'));
  assert.equal(result.movementsByCurrency[0].debits.length, 2);
  assert.equal(result.movementsByCurrency[0].credits.length, 1);
  assert.equal(result.movementsByCurrency[0].balances.length, 3);

  assert.equal(result.transactions.length, 2);
  assert.ok(result.transactions.every((transaction) => transaction.currency === 'UYU'));
  assert.ok(result.transactions.every((transaction) => transaction.amount > 0));

  assert.ok(result.movementsByCurrency[0].debits.every((item) => item.amount < 0));
  assert.ok(result.movementsByCurrency[0].credits.every((item) => item.amount > 0));
});

test('separates UYU and USD accounts in different currency buckets', () => {
  const rows: RawRow[] = [
    pdfRow('p1-r1', 1, 'Débitos Créditos Saldos'),
    pdfRow('p1-r2', 2, 'Nº de cliente Moneda Nº de cuenta'),
    pdfRow('p1-r3', 3, '694890 URGP 3314679'),
    pdfRow('p1-r4', 4, '04/03/2026 COMPRA DEVOTO 500,00 9.344,70'),
    pdfRow('p1-r5', 5, 'Nº de cliente Moneda Nº de cuenta'),
    pdfRow('p1-r6', 6, '694890 US.D 998877'),
    pdfRow('p1-r7', 7, '04/03/2026 COMPRA AMAZON 10,50 190,75'),
    pdfRow('p1-r8', 8, '05/03/2026 DEPOSITO PAYROLL 2,00 192,75'),
  ];

  const result = parseColumnarCurrencyStatement(rows);
  assert.equal(result.movementsByCurrency.length, 2);

  const uyuBucket = result.movementsByCurrency.find((bucket) => bucket.currency === 'UYU');
  const usdBucket = result.movementsByCurrency.find((bucket) => bucket.currency === 'USD');

  assert.ok(uyuBucket);
  assert.ok(usdBucket);
  assert.equal(uyuBucket?.debits.length, 1);
  assert.equal(usdBucket?.debits.length, 1);
  assert.equal(usdBucket?.credits.length, 1);
  assert.ok(usdBucket?.rawCurrencies.includes('US.D'));
});

test('inherits active currency when movement row does not restate it', () => {
  const rows: RawRow[] = [
    pdfRow('p1-r1', 1, 'Débitos Créditos Saldos'),
    pdfRow('p1-r2', 2, 'Nº de cliente Moneda Nº de cuenta'),
    pdfRow('p1-r3', 3, '694890 URGP 3314679'),
    pdfRow('p1-r4', 4, '05/03/2026 COMPRA SUPERMERCADO 536,00 8.808,70'),
    pdfRow('p1-r5', 5, '06/03/2026 COMPRA FARMACIA 757,94 8.050,76'),
  ];

  const result = parseColumnarCurrencyStatement(rows);
  assert.equal(result.movementsByCurrency.length, 1);
  assert.equal(result.movementsByCurrency[0].currency, 'UYU');
  assert.equal(result.movementsByCurrency[0].debits.length, 2);
  assert.ok(result.transactions.every((transaction) => transaction.currency === 'UYU'));
});
