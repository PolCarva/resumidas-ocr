import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChunkExtractionError, parseChunkModelResponse } from '../llm-extract';

test('throws ChunkExtractionError when response is not valid JSON', () => {
  assert.throws(
    () => parseChunkModelResponse('not-json'),
    (error: unknown) => error instanceof ChunkExtractionError,
  );
});

test('throws ChunkExtractionError when required schema fields are missing', () => {
  assert.throws(
    () => parseChunkModelResponse(JSON.stringify({ items: [{ classification: 'expense', confidence: 0.9 }] })),
    (error: unknown) => error instanceof ChunkExtractionError,
  );
});

