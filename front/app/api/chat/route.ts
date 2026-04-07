import { NextRequest, NextResponse } from 'next/server';
import { chunkRowsDeterministically } from '@/lib/statement-parsing/chunking';
import {
  isColumnarCurrencyStatement,
  parseColumnarCurrencyStatement,
} from '@/lib/statement-parsing/columnar-currency-parser';
import { consolidateStatementResult } from '@/lib/statement-parsing/consolidate';
import { ingestCsvRows } from '@/lib/statement-parsing/ingest-csv';
import { ingestPdfRows } from '@/lib/statement-parsing/ingest-pdf';
import { extractDocumentWithLocalRules } from '@/lib/statement-parsing/local-extract';
import {
  ChunkExtractionError,
  extractChunkWithLLM,
  isProviderConfigurationErrorMessage,
} from '@/lib/statement-parsing/llm-extract';
import {
  ChunkModelItem,
  ExclusionRecord,
  NormalizedExpenseCandidate,
  SourceType,
} from '@/lib/statement-parsing/types';
import { validateAndFilterChunk } from '@/lib/statement-parsing/validation';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const DEFAULT_PRIMARY_GEMINI_MODEL =
  process.env.GEMINI_PARSING_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const DEFAULT_FALLBACK_GEMINI_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-1.5-pro';
const CONFIDENCE_THRESHOLD = 0.8;
const LOCAL_PARSER_FALLBACK_ENABLED = process.env.LOCAL_PARSER_FALLBACK !== 'false';
const MAX_LLM_CHUNKS = Number.parseInt(process.env.MAX_LLM_CHUNKS || '2', 10);
const MAX_LLM_ROWS = Number.parseInt(process.env.MAX_LLM_ROWS || '240', 10);
const MAX_LLM_ELAPSED_MS = Number.parseInt(process.env.MAX_LLM_ELAPSED_MS || '25000', 10);

function getGeminiConfig(): { apiKey: string; models: string[] } {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const models = Array.from(
    new Set([DEFAULT_PRIMARY_GEMINI_MODEL, DEFAULT_FALLBACK_GEMINI_MODEL].filter(Boolean)),
  );
  return { apiKey, models };
}

function resolveSourceType(file: File): SourceType | null {
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  if (fileName.endsWith('.pdf') || fileType === 'application/pdf') {
    return 'pdf';
  }

  if (
    fileName.endsWith('.csv') ||
    fileType === 'text/csv' ||
    fileType === 'application/vnd.ms-excel'
  ) {
    return 'csv';
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const requestStart = Date.now();
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
    }

    const sourceType = resolveSourceType(file);
    if (!sourceType) {
      return NextResponse.json(
        { error: 'El archivo debe ser PDF o CSV' },
        { status: 400 },
      );
    }

    const rows = sourceType === 'pdf' ? await ingestPdfRows(file) : await ingestCsvRows(file);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron filas procesables en el archivo' },
        { status: 422 },
      );
    }

    if (sourceType === 'pdf' && isColumnarCurrencyStatement(rows)) {
      const result = parseColumnarCurrencyStatement(rows);
      return NextResponse.json({
        message: result,
        wasRepaired: false,
        model: 'local-columnar-currency',
      });
    }

    const chunks = chunkRowsDeterministically(rows, {
      maxRows: 120,
      maxChars: 12000,
    });

    let gemini: { apiKey: string; models: string[] } | null = null;
    let usedLocalFallback = false;
    let localFallbackReason: string | null = null;
    let localItemsByRowId: Map<string, ChunkModelItem> | null = null;
    const expenses: NormalizedExpenseCandidate[] = [];
    const exclusions: ExclusionRecord[] = [];
    const warnings: string[] = [];

    const getLocalModelResponseForChunk = (chunkRows: typeof chunks[number]['rows']) => {
      if (!localItemsByRowId) {
        const localDocumentResponse = extractDocumentWithLocalRules(rows);
        localItemsByRowId = new Map(
          localDocumentResponse.items.map((item) => [item.row_id, item]),
        );
      }

      return {
        items: chunkRows.map((row) => {
          const item = localItemsByRowId?.get(row.rowId);
          if (item) {
            return item;
          }

          return {
            row_id: row.rowId,
            classification: 'ignore' as const,
            confidence: 0,
            exclusion_reason: 'local extractor omitted row',
          };
        }),
      };
    };

    try {
      gemini = getGeminiConfig();
    } catch (error) {
      if (!LOCAL_PARSER_FALLBACK_ENABLED) {
        throw error;
      }

      usedLocalFallback = true;
      localFallbackReason =
        error instanceof Error ? error.message : 'Gemini configuration is unavailable';
      warnings.push(
        `Extractor local activado: ${localFallbackReason}. Ajusta GEMINI_API_KEY para usar modelos.`,
      );
    }

    if (!usedLocalFallback && LOCAL_PARSER_FALLBACK_ENABLED) {
      const chunkLimitReached = chunks.length > MAX_LLM_CHUNKS;
      const rowLimitReached = rows.length > MAX_LLM_ROWS;

      if (chunkLimitReached || rowLimitReached) {
        usedLocalFallback = true;
        localFallbackReason = `input too large for bounded LLM mode (rows=${rows.length}, chunks=${chunks.length})`;
        warnings.push(
          `Extractor local activado por tamaño de archivo: rows=${rows.length}, chunks=${chunks.length}.`,
        );
      }
    }

    for (const chunk of chunks) {
      let modelResponse;
      const elapsedMs = Date.now() - requestStart;

      if (!usedLocalFallback && LOCAL_PARSER_FALLBACK_ENABLED && elapsedMs > MAX_LLM_ELAPSED_MS) {
        usedLocalFallback = true;
        localFallbackReason = `llm time budget exceeded (${elapsedMs}ms)`;
        warnings.push(
          `Chunk ${chunk.chunkIndex}: se agotó el presupuesto de tiempo LLM; se continúa en extractor local.`,
        );
      }

      if (usedLocalFallback || !gemini) {
        modelResponse = getLocalModelResponseForChunk(chunk.rows);
      } else {
        try {
          modelResponse = await extractChunkWithLLM({
            apiKey: gemini.apiKey,
            models: gemini.models,
            chunk,
            totalChunks: chunks.length,
          });
        } catch (error) {
          if (
            LOCAL_PARSER_FALLBACK_ENABLED &&
            error instanceof ChunkExtractionError
          ) {
            usedLocalFallback = true;
            localFallbackReason = error.message;
            warnings.push(
              `Chunk ${chunk.chunkIndex}: Gemini falló (${error.message}); se usó extractor local determinístico.`,
            );
            modelResponse = getLocalModelResponseForChunk(chunk.rows);
          } else {
            throw error;
          }
        }
      }

      const validatedChunk = validateAndFilterChunk({
        rows: chunk.rows,
        modelResponse,
        confidenceThreshold: CONFIDENCE_THRESHOLD,
        chunkIndex: chunk.chunkIndex,
      });

      expenses.push(...validatedChunk.expenses);
      exclusions.push(...validatedChunk.exclusions);
      warnings.push(...validatedChunk.warnings);
    }

    const result = consolidateStatementResult({
      expenses,
      exclusions,
      warnings,
      totalRows: rows.length,
      chunksProcessed: chunks.length,
      sourceType,
    });

    return NextResponse.json({
      message: result,
      wasRepaired: false,
      model: usedLocalFallback
        ? localFallbackReason
          ? 'local-deterministic-fallback'
          : 'local-deterministic'
        : gemini?.models[0] || 'gemini-2.0-flash',
    });
  } catch (error) {
    const typedError = error as Error & { statusCode?: number };
    const details = typedError?.message || 'Error desconocido';

    if (error instanceof ChunkExtractionError) {
      const looksLikeProviderConfigError = isProviderConfigurationErrorMessage(details);

      if (looksLikeProviderConfigError) {
        return NextResponse.json(
          {
            error: 'Error de configuración del servidor',
            details,
            errorCode: 'server_config_error',
          },
          { status: 500 },
        );
      }

      return NextResponse.json(
        {
          error: 'Error de validación en la extracción de chunks',
          details,
          errorCode: 'chunk_validation_error',
        },
        { status: error.statusCode || 422 },
      );
    }

    if (details.includes('GEMINI_API_KEY')) {
      return NextResponse.json(
        {
          error: 'Error de configuración del servidor',
          details,
          errorCode: 'server_config_error',
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        error: 'Error al procesar el extracto',
        details,
        errorCode: 'statement_processing_error',
      },
      { status: 500 },
    );
  }
}
