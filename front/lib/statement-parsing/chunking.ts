import { RawRow, RowChunk } from './types';

interface ChunkOptions {
  maxRows?: number;
  maxChars?: number;
}

const DEFAULT_MAX_ROWS = 120;
const DEFAULT_MAX_CHARS = 12000;

export function chunkRowsDeterministically(rows: RawRow[], options: ChunkOptions = {}): RowChunk[] {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

  if (maxRows <= 0 || maxChars <= 0) {
    throw new Error('Chunk limits must be greater than zero');
  }

  const chunks: RowChunk[] = [];
  let currentRows: RawRow[] = [];
  let currentChars = 0;

  const flushCurrent = () => {
    if (currentRows.length === 0) {
      return;
    }

    chunks.push({
      chunkIndex: chunks.length + 1,
      rows: currentRows,
      charLength: currentChars,
    });

    currentRows = [];
    currentChars = 0;
  };

  for (const row of rows) {
    const rowLength = row.rawText.length;
    const wouldOverflowRows = currentRows.length >= maxRows;
    const wouldOverflowChars = currentRows.length > 0 && currentChars + rowLength > maxChars;

    if (wouldOverflowRows || wouldOverflowChars) {
      flushCurrent();
    }

    currentRows.push(row);
    currentChars += rowLength;

    // Ensure very large lines still move forward and do not block chunk creation.
    if (rowLength >= maxChars) {
      flushCurrent();
    }
  }

  flushCurrent();
  return chunks;
}

