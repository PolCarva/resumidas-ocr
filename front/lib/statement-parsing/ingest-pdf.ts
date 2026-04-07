import { createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import PDFParser from 'pdf2json';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { RawRow } from './types';

interface PDFToken {
  T?: string;
}

interface PDFTextItem {
  x?: number;
  y?: number;
  R?: PDFToken[];
}

interface PDFPage {
  Texts?: PDFTextItem[];
}

interface ParsedPDFData {
  Pages?: PDFPage[];
}

interface PDFParserInstance {
  on(event: string, callback: (data?: unknown) => void): void;
  loadPDF(filePath: string): void;
  data?: ParsedPDFData;
}

function decodePdfValue(value?: string): string {
  if (!value) {
    return '';
  }

  try {
    return decodeURIComponent(value).replace(/\+/g, ' ');
  } catch {
    return value;
  }
}

async function writeFileToTempPath(file: File, extension: string): Promise<string> {
  const tempPath = path.join(
    os.tmpdir(),
    `statement_${Date.now()}_${Math.random().toString(36).slice(2)}${extension}`,
  );

  const outputStream = createWriteStream(tempPath);
  const inputStream = Readable.fromWeb(file.stream() as never);
  await pipeline(inputStream, outputStream);

  return tempPath;
}

async function parsePdf(filePath: string): Promise<ParsedPDFData> {
  const parser = new (PDFParser as unknown as { new(arg1: null, arg2: number): PDFParserInstance })(
    null,
    1,
  );

  return new Promise<ParsedPDFData>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout while parsing PDF'));
    }, 30000);

    parser.on('pdfParser_dataError', (errData: unknown) => {
      clearTimeout(timeout);
      const typedError = errData as { parserError?: string };
      reject(new Error(typedError.parserError || 'PDF parser error'));
    });

    parser.on('pdfParser_dataReady', () => {
      clearTimeout(timeout);
      resolve(parser.data || {});
    });

    parser.loadPDF(filePath);
  });
}

export async function ingestPdfRows(file: File): Promise<RawRow[]> {
  const tempFilePath = await writeFileToTempPath(file, '.pdf');

  try {
    const pdfData = await parsePdf(tempFilePath);
    const pages = pdfData.Pages || [];
    const rows: RawRow[] = [];

    pages.forEach((page, pageIndex) => {
      const texts = page.Texts || [];
      const yLineMap = new Map<string, { y: number; tokens: Array<{ x: number; text: string }> }>();

      for (const item of texts) {
        const tokenText = (item.R || [])
          .map((token) => decodePdfValue(token.T))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (!tokenText) {
          continue;
        }

        const y = typeof item.y === 'number' ? item.y : 0;
        const x = typeof item.x === 'number' ? item.x : 0;
        const yKey = (Math.round(y * 10) / 10).toFixed(1);

        const line = yLineMap.get(yKey) || { y, tokens: [] };
        line.tokens.push({ x, text: tokenText });
        yLineMap.set(yKey, line);
      }

      const orderedLines = Array.from(yLineMap.values()).sort((a, b) => a.y - b.y);
      let lineIndex = 1;

      for (const line of orderedLines) {
        const rawText = line.tokens
          .sort((a, b) => a.x - b.x)
          .map((entry) => entry.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (!rawText) {
          continue;
        }

        const pageNumber = pageIndex + 1;
        rows.push({
          rowId: `p${pageNumber}-r${lineIndex}`,
          sourceType: 'pdf',
          page: pageNumber,
          rowIndex: lineIndex,
          rawText,
        });

        lineIndex += 1;
      }
    });

    return rows;
  } finally {
    try {
      await fs.unlink(tempFilePath);
    } catch {
      // Best effort cleanup.
    }
  }
}

