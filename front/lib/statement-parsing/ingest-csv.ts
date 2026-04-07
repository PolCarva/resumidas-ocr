import { RawRow } from './types';

function detectDelimiter(line: string): string {
  const candidates = [',', ';', '\t'];
  const score = candidates.map((delimiter) => ({
    delimiter,
    count: line.split(delimiter).length - 1,
  }));

  score.sort((a, b) => b.count - a.count);
  return score[0].count > 0 ? score[0].delimiter : ',';
}

function normalizeHeader(value: string, index: number): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || `column_${index + 1}`;
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = index + 1 < line.length ? line[index + 1] : '';

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields;
}

function buildRawText(headers: string[], cells: string[]): string {
  const parts = headers.map((header, index) => `${header}: ${(cells[index] || '').trim()}`);
  return parts.join(' | ').replace(/\s+/g, ' ').trim();
}

export async function parseCsvRowsFromText(text: string): Promise<RawRow[]> {
  const rows: RawRow[] = [];
  let delimiter = ',';
  let headers: string[] | null = null;
  let dataRowIndex = 0;

  const rawLines = text.split(/\r?\n/);
  for (const rawLine of rawLines) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) {
      continue;
    }

    if (!headers) {
      delimiter = detectDelimiter(line);
      headers = parseCsvLine(line, delimiter).map((header, index) => normalizeHeader(header, index));
      continue;
    }

    const cells = parseCsvLine(line, delimiter);
    dataRowIndex += 1;
    const rowId = `csv-r${dataRowIndex}`;
    rows.push({
      rowId,
      sourceType: 'csv',
      rowIndex: dataRowIndex,
      rawLine: line,
      headers,
      cells,
      rawText: buildRawText(headers, cells),
    });
  }

  return rows;
}

export async function ingestCsvRows(file: File): Promise<RawRow[]> {
  const decoder = new TextDecoder();
  const reader = file.stream().getReader();

  let buffer = '';
  let inQuotes = false;
  let delimiter = ',';
  let headers: string[] | null = null;
  let dataRowIndex = 0;
  const rows: RawRow[] = [];

  const processLine = (lineValue: string) => {
    const line = lineValue.replace(/\r$/, '');
    if (!line.trim()) {
      return;
    }

    if (!headers) {
      delimiter = detectDelimiter(line);
      headers = parseCsvLine(line, delimiter).map((header, index) => normalizeHeader(header, index));
      return;
    }

    const cells = parseCsvLine(line, delimiter);
    dataRowIndex += 1;
    rows.push({
      rowId: `csv-r${dataRowIndex}`,
      sourceType: 'csv',
      rowIndex: dataRowIndex,
      rawLine: line,
      headers,
      cells,
      rawText: buildRawText(headers, cells),
    });
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    let cursor = 0;
    while (cursor < buffer.length) {
      const char = buffer[cursor];
      const nextChar = cursor + 1 < buffer.length ? buffer[cursor + 1] : '';

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          cursor += 2;
          continue;
        }
        inQuotes = !inQuotes;
      }

      if (!inQuotes && char === '\n') {
        const line = buffer.slice(0, cursor);
        processLine(line);
        buffer = buffer.slice(cursor + 1);
        cursor = 0;
        continue;
      }

      cursor += 1;
    }

    if (done) {
      if (buffer.trim()) {
        processLine(buffer);
      }
      break;
    }
  }

  return rows;
}

