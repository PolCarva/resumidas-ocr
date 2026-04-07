import { ChunkModelResponse, RawRow, RowChunk } from './types';

const VALID_CLASSIFICATIONS = new Set(['expense', 'income', 'balance', 'summary', 'ignore']);
const DEFAULT_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_REQUEST_TIMEOUT_MS || '12000', 10);
const DEFAULT_MAX_ATTEMPTS_PER_MODEL = Number.parseInt(
  process.env.GEMINI_MAX_ATTEMPTS_PER_MODEL || '1',
  10,
);

export class ChunkExtractionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = 'ChunkExtractionError';
    this.statusCode = statusCode;
  }
}

export function isProviderConfigurationErrorMessage(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('api key') ||
    text.includes('permission denied') ||
    text.includes('generative language api has not been used') ||
    text.includes('generativelanguage.googleapis.com') ||
    text.includes('access not configured') ||
    text.includes('is not found for api version') ||
    text.includes('is not supported for generatecontent') ||
    text.includes('quota exceeded')
  );
}

function validateChunkShape(payload: unknown): ChunkModelResponse {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { items?: unknown[] }).items)) {
    throw new ChunkExtractionError('Invalid chunk JSON schema: missing items array');
  }

  const items = (payload as { items: unknown[] }).items;
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      throw new ChunkExtractionError('Invalid chunk JSON schema: item is not an object');
    }

    const typedItem = item as Record<string, unknown>;
    if (typeof typedItem.row_id !== 'string' || typedItem.row_id.trim() === '') {
      throw new ChunkExtractionError('Invalid chunk JSON schema: row_id is required');
    }

    if (typeof typedItem.classification !== 'string' || !VALID_CLASSIFICATIONS.has(typedItem.classification)) {
      throw new ChunkExtractionError('Invalid chunk JSON schema: classification is invalid');
    }

    if (typeof typedItem.confidence !== 'number' || Number.isNaN(typedItem.confidence)) {
      throw new ChunkExtractionError('Invalid chunk JSON schema: confidence must be a number');
    }
  }

  return payload as ChunkModelResponse;
}

export function parseChunkModelResponse(rawContent: string): ChunkModelResponse {
  try {
    const parsed = JSON.parse(rawContent) as unknown;
    return validateChunkShape(parsed);
  } catch (error) {
    if (error instanceof ChunkExtractionError) {
      throw error;
    }
    throw new ChunkExtractionError(
      `Chunk response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildRowsPayload(rows: RawRow[]): Array<Record<string, string | number | null>> {
  return rows.map((row) => ({
    row_id: row.rowId,
    page: row.page || null,
    row_index: row.rowIndex,
    text: row.rawText,
  }));
}

function buildPrompt(rows: RawRow[], chunkIndex: number, totalChunks: number, validationHint?: string): string {
  const rowsPayload = buildRowsPayload(rows);

  return `
You are a bank statement extraction engine.
You must classify EACH input row exactly once.

Chunk context:
- chunk_index: ${chunkIndex}
- total_chunks: ${totalChunks}
- rows_in_chunk: ${rows.length}

Rules:
1) Return exactly one item per input row_id.
2) classification must be one of: expense, income, balance, summary, ignore.
3) expense means a true outgoing expense only.
4) income includes salary/deposit/credit/incoming transfer.
5) balance includes running/final/available/account value.
6) summary includes total/subtotal/statement summary rows.
7) confidence is a number between 0 and 1.
8) For expense rows, include transaction with date, description, amount, type, category.
9) Expense amount must be positive (absolute value).
10) Do not invent row IDs and do not omit any row.

Output JSON format:
{
  "items": [
    {
      "row_id": "string",
      "classification": "expense|income|balance|summary|ignore",
      "confidence": 0.0,
      "exclusion_reason": "optional string",
      "transaction": {
        "date": "DD/MM/YYYY",
        "description": "string",
        "amount": 123.45,
        "type": "string",
        "category": "string"
      }
    }
  ]
}

Input rows:
${JSON.stringify(rowsPayload)}
${validationHint ? `\nValidation hint from previous attempt:\n${validationHint}\n` : ''}
  `.trim();
}

interface ExtractChunkInput {
  apiKey: string;
  models: string[];
  chunk: RowChunk;
  totalChunks: number;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
  error?: {
    message?: string;
  };
}

async function callGeminiModel(apiKey: string, model: string, prompt: string): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_REQUEST_TIMEOUT_MS);

  let response: Response;
  let payload: GeminiGenerateContentResponse = {};
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });

    payload = (await response.json()) as GeminiGenerateContentResponse;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ChunkExtractionError(
        `Gemini request timed out after ${DEFAULT_REQUEST_TIMEOUT_MS}ms for model ${model}`,
        504,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const message = payload?.error?.message || `Gemini request failed with status ${response.status}`;
    throw new ChunkExtractionError(message, response.status >= 400 && response.status < 500 ? 422 : 500);
  }

  if (payload?.promptFeedback?.blockReason) {
    const blockMessage =
      payload.promptFeedback.blockReasonMessage ||
      `Gemini blocked content: ${payload.promptFeedback.blockReason}`;
    throw new ChunkExtractionError(blockMessage, 422);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === 'string')?.text;
  if (!text || !text.trim()) {
    const finishReason = payload?.candidates?.[0]?.finishReason || 'unknown';
    throw new ChunkExtractionError(`Gemini returned empty content (finishReason=${finishReason})`, 422);
  }

  return text;
}

export async function extractChunkWithLLM({
  apiKey,
  models,
  chunk,
  totalChunks,
}: ExtractChunkInput): Promise<ChunkModelResponse> {
  let lastError: Error | null = null;
  const maxAttemptsPerModel = Number.isFinite(DEFAULT_MAX_ATTEMPTS_PER_MODEL)
    ? Math.max(1, DEFAULT_MAX_ATTEMPTS_PER_MODEL)
    : 1;

  if (!Array.isArray(models) || models.length === 0) {
    throw new ChunkExtractionError('No Gemini model configured for extraction', 500);
  }

  for (const model of models) {
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt += 1) {
      const prompt = buildPrompt(
        chunk.rows,
        chunk.chunkIndex,
        totalChunks,
        lastError ? `Previous output failed validation: ${lastError.message}` : undefined,
      );

      try {
        const content = await callGeminiModel(apiKey, model, prompt);
        return parseChunkModelResponse(content);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError instanceof ChunkExtractionError && isProviderConfigurationErrorMessage(lastError.message)) {
          break;
        }
      }
    }
  }

  throw new ChunkExtractionError(
    `Chunk ${chunk.chunkIndex} failed with models [${models.join(', ')}]: ${lastError?.message || 'unknown error'}`,
  );
}
