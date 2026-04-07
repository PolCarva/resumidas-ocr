"""
Transaction categorization pipeline.

Default: deterministic rules + memory → embeddings → LLM → fallback.

For a true "LLM only" pass, use the explicit `llm_only=True` parameter in the
public categorization functions.
"""

import logging
import os
import re
import sqlite3
import time
import unicodedata
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np

logger = logging.getLogger("categorizer")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DB_DIR = Path(__file__).parent / "data"
DB_PATH = DB_DIR / "categorizer.db"

os.environ.setdefault("HF_HOME", str(DB_DIR / ".hf_cache"))

EMBEDDING_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
EMBEDDING_THRESHOLD = 0.78
EMBEDDING_DIMENSION = 384  # output dim of the chosen model

# Defaults: usa un modelo free que hoy sí pasa con la política actual de la cuenta.
# Listar en terminal (evita grep + ':' en macOS): jq -r '.data[] | select(.id|contains(":free"))|.id'
LLM_MODEL = os.getenv("LLM_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")
# Second model if the first fails (HTTP error) or returns an invalid category.
# Set LLM_MODEL_FALLBACK=none to disable. For reliability (paid): openai/gpt-4o-mini
_LLMF = os.getenv("LLM_MODEL_FALLBACK", "none").strip()
LLM_MODEL_FALLBACK = (
    "" if _LLMF.lower() in ("", "none", "false", "0") else _LLMF
)
LLM_API_URL = "https://openrouter.ai/api/v1/chat/completions"
LLM_TIMEOUT_PRIMARY = float(os.getenv("LLM_TIMEOUT_PRIMARY", "18"))
LLM_TIMEOUT_FALLBACK = float(os.getenv("LLM_TIMEOUT_FALLBACK", "25"))
LLM_BATCH_SIZE = max(1, int(os.getenv("LLM_BATCH_SIZE", "12")))
LLM_BATCH_INTER_REQUEST_DELAY = float(os.getenv("LLM_BATCH_INTER_REQUEST_DELAY", "0.4"))
# Reintentos solo ante 429 (rate limit upstream / OpenRouter)
LLM_RETRY_MAX = max(1, int(os.getenv("LLM_RETRY_MAX", "3")))
LLM_RETRY_BASE_DELAY = float(os.getenv("LLM_RETRY_BASE_DELAY", "1.0"))

CATEGORIES = [
    "Alimentación",
    "Transporte",
    "Salud",
    "Entretenimiento",
    "Servicios básicos",
    "Educación",
    "Vivienda",
    "Vestimenta",
    "Transferencia",
    "Retiro de efectivo",
    "Seguros",
    "Impuestos y tasas",
    "Ingresos",
    "Suscripciones",
    "Tecnología",
    "Otros",
]

FALLBACK_CATEGORY = "Otros"

CATEGORY_SEEDS: dict[str, list[str]] = {
    "Alimentación": [
        # Supermercados
        "disco", "tata", "devoto", "tienda inglesa", "el dorado",
        "super", "supermercado", "multiahorro", "macro", "frigo", "super 12",
        # Almacenes / minimercados
        "mercadito", "mini market", "almacen", "autoservicio",
        "kinko", "la huerta", "codural", "todolandia",
        # Carnicerías / pescaderías / panaderías
        "carniceria", "pescaderia", "panaderia", "verduleria", "fruteria",
        # Delivery / restaurantes
        "pedidosya", "rappi", "dlo pedidosy",
        "mcdonalds", "burger king", "subway", "mostaza",
        "starbucks", "cafeteria", "roticentro", "rotiseria",
        "restaurante", "pizzeria", "heladeria", "la pasiva",
        "el buen pastor",
    ],
    "Transporte": [
        "uber", "cabify", "ancap", "petrobras", "shell", "axion",
        "estacionamiento", "peaje", "stm", "cutcsa", "copsa",
        "combustible", "nafta", "gasoil",
    ],
    "Salud": [
        "farmashop", "san roque", "farmacia", "mutualista", "hospital",
        "medica uruguaya", "casmu", "cosem", "asociacion espanola",
        "clinica", "laboratorio", "optica", "dentista", "emergencia movil",
        "veterinaria", "vetv",
    ],
    "Entretenimiento": [
        "cine", "teatro", "movie", "tickantel", "entrada",
        "parque", "casino",
    ],
    "Servicios básicos": [
        "antel", "montevideo gas", "gaseba", "ute", "ose",
        "tigo", "movistar", "claro", "dedicado", "internet", "fibra",
    ],
    "Educación": [
        "colegio", "universidad", "instituto", "curso", "ort",
        "udelar", "ucudal", "claeh", "udemy", "coursera",
    ],
    "Vivienda": [
        "alquiler", "inmobiliaria", "expensas", "gastos comunes",
        "condominio",
    ],
    "Vestimenta": [
        "zara", "bershka", "nike", "adidas",
        "calzado", "zapatos", "pull bear",
    ],
    "Transferencia": [
        "transferencia", "traspaso", "merpago", "mercado pago",
    ],
    "Retiro de efectivo": [
        "retiro", "cajero", "extraccion",
    ],
    "Seguros": [
        "seguro", "mapfre", "surco", "porto seguro", "sancor", "bse",
    ],
    "Impuestos y tasas": [
        "impuesto", "tributo", "contribucion",
        "patente", "sucive", "rediva", "bps", "dgi",
    ],
    "Ingresos": [
        "sueldo", "salario", "haberes", "nomina", "aguinaldo",
        "devolucion", "reembolso", "cred directo", "credito sueldo",
    ],
    "Suscripciones": [
        "netflix", "spotify", "amazon prime", "youtube premium",
        "disney", "apple music", "xbox", "playstation", "steam",
        "paramount", "crunchyroll", "deezer",
    ],
    "Tecnología": [
        "google cloud", "google play", "vercel", "railway",
        "mercadolibre", "samsung", "apple",
        "amazon", "etoro",
    ],
}

# Seeds that require exact or substring match only — too short for prefix matching.
# Minimum 4 chars for substring, 6 chars for prefix (enforced in lookup_memory).
SUBSTRING_MIN_LEN = 4
PREFIX_MIN_LEN = 6

# Normalized lookup version of CATEGORIES for validation
_CATEGORIES_NORMALIZED: dict[str, str] = {}

# ---------------------------------------------------------------------------
# Lazy-loaded globals
# ---------------------------------------------------------------------------

_embedding_model = None
_db_initialized = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_account_scope(account_scope: str | None) -> str | None:
    scope = str(account_scope or "").strip()
    return scope or None


# ---------------------------------------------------------------------------
# Text normalization
# ---------------------------------------------------------------------------

_STRIP_SYMBOLS_RE = re.compile(r"[^\w\s]", re.UNICODE)
_MULTI_SPACE_RE = re.compile(r"\s+")
def normalize_text(raw: str) -> str:
    """Normalize transaction text for deterministic matching."""
    text = raw.strip().lower()
    # Remove accents / diacritics
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = _STRIP_SYMBOLS_RE.sub(" ", text)
    text = _MULTI_SPACE_RE.sub(" ", text).strip()
    return text


def build_transaction_text(tx: dict) -> str:
    """
    Build the analysis text the same way as the reference project:
    use the movement type/concept together with the merchant/reference.
    """
    concepto = str(tx.get("concepto") or "").strip()
    referencia = str(tx.get("referencia") or "").strip()
    original = str(tx.get("original_text") or "").strip()

    if original:
        return original
    if concepto and referencia:
        return f"{concepto} {referencia}"
    return referencia or concepto


def classify_with_rules(normalized: str) -> dict | None:
    """
    Reference-style categorization: deterministic substring checks over the
    full movement text (concepto + referencia), no LLM involved.
    """
    for category, keywords in RULE_KEYWORDS:
        for keyword in keywords:
            if keyword in normalized:
                return {"category": category, "reference": keyword}
    return None


def _build_normalized_categories() -> None:
    global _CATEGORIES_NORMALIZED
    for cat in CATEGORIES:
        _CATEGORIES_NORMALIZED[normalize_text(cat)] = cat


_build_normalized_categories()


# ---------------------------------------------------------------------------
# Reference-style deterministic rules
# ---------------------------------------------------------------------------

RULE_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Transferencia", ("traspaso", "ilink", "merpago", "mercado pago")),
    ("Impuestos y tasas", ("bps", "dgi", "sucive", "rediva")),
    (
        "Servicios básicos",
        ("ute", "ose", "antel", "montevideo gas", "gaseba", "movistar", "claro", "tigo"),
    ),
    ("Salud", ("veterinaria", "vetv")),
    ("Otros", ("cambios", "todolandia")),
    (
        "Alimentación",
        (
            "disco",
            "mercadito",
            "super 12",
            "la huerta",
            "mini market",
            "pescaderia",
            "pedidosya",
            "dlo pedidos",
            "cafeteria",
        ),
    ),
]


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def _get_db() -> sqlite3.Connection:
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_db() -> None:
    global _db_initialized
    if _db_initialized and DB_PATH.exists():
        return
    _db_initialized = False

    conn = _get_db()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS merchant_memory (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                normalized_text TEXT UNIQUE NOT NULL,
                original_text   TEXT NOT NULL,
                category        TEXT NOT NULL,
                source          TEXT NOT NULL DEFAULT 'seed',
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS embedding_store (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                normalized_text TEXT UNIQUE NOT NULL,
                category        TEXT NOT NULL,
                embedding       BLOB NOT NULL,
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS classification_log (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                original_text   TEXT NOT NULL,
                normalized_text TEXT NOT NULL,
                category        TEXT NOT NULL,
                source          TEXT NOT NULL,
                score           REAL,
                reference_text  TEXT,
                created_at      TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS merchant_memory_scoped (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                account_scope   TEXT NOT NULL,
                normalized_text TEXT NOT NULL,
                original_text   TEXT NOT NULL,
                category        TEXT NOT NULL,
                source          TEXT NOT NULL DEFAULT 'seed',
                created_at      TEXT NOT NULL,
                UNIQUE(account_scope, normalized_text)
            );

            CREATE TABLE IF NOT EXISTS embedding_store_scoped (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                account_scope   TEXT NOT NULL,
                normalized_text TEXT NOT NULL,
                category        TEXT NOT NULL,
                embedding       BLOB NOT NULL,
                created_at      TEXT NOT NULL,
                UNIQUE(account_scope, normalized_text)
            );
        """)
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(classification_log)").fetchall()
        }
        if "account_scope" not in columns:
            conn.execute("ALTER TABLE classification_log ADD COLUMN account_scope TEXT")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_merchant_memory_scoped_account_normalized ON merchant_memory_scoped(account_scope, normalized_text)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_embedding_store_scoped_account_normalized ON embedding_store_scoped(account_scope, normalized_text)"
        )
        conn.commit()

        # Seed only if merchant_memory is empty
        row = conn.execute("SELECT COUNT(*) AS cnt FROM merchant_memory").fetchone()
        if row["cnt"] == 0:
            _seed_memory(conn)

        _db_initialized = True
    finally:
        conn.close()


def _seed_memory(conn: sqlite3.Connection) -> None:
    """Insert initial category seeds so the system has a baseline."""
    now = _now_iso()
    rows = []
    for category, seeds in CATEGORY_SEEDS.items():
        for seed in seeds:
            norm = normalize_text(seed)
            rows.append((norm, seed, category, "seed", now))

    conn.executemany(
        """INSERT OR IGNORE INTO merchant_memory
           (normalized_text, original_text, category, source, created_at)
           VALUES (?, ?, ?, ?, ?)""",
        rows,
    )
    conn.commit()
    logger.info("Seeded merchant_memory with %d entries", len(rows))


# ---------------------------------------------------------------------------
# Embedding model
# ---------------------------------------------------------------------------


def _get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Loading embedding model '%s' (first time may download ~420MB)…", EMBEDDING_MODEL_NAME)
        _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        logger.info("Embedding model loaded.")
    return _embedding_model


def _compute_embedding(text: str) -> np.ndarray:
    model = _get_embedding_model()
    return model.encode(text, normalize_embeddings=True)


def _embedding_to_bytes(vec: np.ndarray) -> bytes:
    return vec.astype(np.float32).tobytes()


def _bytes_to_embedding(raw: bytes) -> np.ndarray:
    return np.frombuffer(raw, dtype=np.float32)


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


# ---------------------------------------------------------------------------
# Layer 1: Exact memory lookup
# ---------------------------------------------------------------------------


def lookup_memory(normalized: str, account_scope: str | None = None) -> dict | None:
    """Return category via exact match, substring, or prefix (for OCR-truncated names)."""
    _init_db()
    scope = _normalize_account_scope(account_scope)
    conn = _get_db()
    try:
        if scope:
            row = conn.execute(
                """SELECT category, original_text
                   FROM merchant_memory_scoped
                   WHERE account_scope = ? AND normalized_text = ?""",
                (scope, normalized),
            ).fetchone()
            if row:
                return {"category": row["category"], "reference": row["original_text"]}

        row = conn.execute(
            "SELECT category, original_text FROM merchant_memory WHERE normalized_text = ?",
            (normalized,),
        ).fetchone()
        if row:
            return {"category": row["category"], "reference": row["original_text"]}

        scoped_rows = []
        if scope:
            scoped_rows = conn.execute(
                """SELECT normalized_text, category, original_text
                   FROM merchant_memory_scoped
                   WHERE account_scope = ?
                   ORDER BY LENGTH(normalized_text) DESC""",
                (scope,),
            ).fetchall()

        global_rows = conn.execute(
            "SELECT normalized_text, category, original_text FROM merchant_memory ORDER BY LENGTH(normalized_text) DESC",
        ).fetchall()

        # 2) Substring: known merchant name appears inside the input text
        #    Longest match wins (ORDER BY LENGTH DESC).
        for rows in (scoped_rows, global_rows):
            for row in rows:
                merchant = row["normalized_text"]
                if len(merchant) >= SUBSTRING_MIN_LEN and merchant in normalized:
                    return {"category": row["category"], "reference": row["original_text"]}

        # 3) Prefix: handle OCR-truncated merchant names.
        #    e.g. "tienda ingle" should match seed "tienda inglesa".
        #    We check if input and seed share the same prefix up to the length
        #    of the shorter string.  Minimum PREFIX_MIN_LEN chars to avoid
        #    false positives.
        for rows in (scoped_rows, global_rows):
            for row in rows:
                merchant = row["normalized_text"]
                overlap = min(len(merchant), len(normalized))
                if overlap >= PREFIX_MIN_LEN and merchant[:overlap] == normalized[:overlap]:
                    return {"category": row["category"], "reference": row["original_text"]}

        return None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Layer 2: Embedding similarity search
# ---------------------------------------------------------------------------


def _best_embedding_match(rows, query_vec: np.ndarray) -> dict | None:
    best_score = -1.0
    best_row = None
    for row in rows:
        stored_vec = _bytes_to_embedding(row["embedding"])
        score = _cosine_similarity(query_vec, stored_vec)
        if score > best_score:
            best_score = score
            best_row = row

    if best_score >= EMBEDDING_THRESHOLD and best_row is not None:
        return {
            "category": best_row["category"],
            "score": round(best_score, 4),
            "reference": best_row["normalized_text"],
        }

    return None


def search_embeddings(normalized: str, account_scope: str | None = None) -> dict | None:
    """Find the most similar entry in embedding_store. Returns match info or None."""
    _init_db()
    scope = _normalize_account_scope(account_scope)
    conn = _get_db()
    try:
        query_vec = _compute_embedding(normalized)
        if scope:
            scoped_rows = conn.execute(
                """SELECT normalized_text, category, embedding
                   FROM embedding_store_scoped
                   WHERE account_scope = ?""",
                (scope,),
            ).fetchall()
            scoped_match = _best_embedding_match(scoped_rows, query_vec)
            if scoped_match:
                return scoped_match

        rows = conn.execute("SELECT normalized_text, category, embedding FROM embedding_store").fetchall()
        return _best_embedding_match(rows, query_vec)
    finally:
        conn.close()


def _ensure_seeds_embedded() -> None:
    """Lazily compute and store embeddings for all seeds that lack one."""
    _init_db()
    conn = _get_db()
    try:
        existing = {
            r["normalized_text"]
            for r in conn.execute("SELECT normalized_text FROM embedding_store").fetchall()
        }

        seeds_to_embed = []
        for category, seeds in CATEGORY_SEEDS.items():
            for seed in seeds:
                norm = normalize_text(seed)
                if norm not in existing:
                    seeds_to_embed.append((norm, category))

        if not seeds_to_embed:
            return

        logger.info("Computing embeddings for %d seed entries…", len(seeds_to_embed))
        model = _get_embedding_model()
        texts = [s[0] for s in seeds_to_embed]
        vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)

        now = _now_iso()
        rows = []
        for (norm, cat), vec in zip(seeds_to_embed, vectors):
            rows.append((norm, cat, _embedding_to_bytes(vec), now))

        conn.executemany(
            """INSERT OR IGNORE INTO embedding_store
               (normalized_text, category, embedding, created_at)
               VALUES (?, ?, ?, ?)""",
            rows,
        )
        conn.commit()
        logger.info("Stored %d seed embeddings.", len(rows))
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Layer 3: LLM classification (OpenRouter)
# ---------------------------------------------------------------------------

_LLM_SYSTEM_PROMPT = (
    "Eres un clasificador de movimientos bancarios. "
    "Dada la descripción de un movimiento, responde ÚNICAMENTE con el nombre exacto "
    "de una de las siguientes categorías (sin explicación ni texto adicional):\n\n"
    + "\n".join(f"- {c}" for c in CATEGORIES)
)

_LLM_BATCH_SYSTEM_PROMPT = (
    "Eres un clasificador de movimientos bancarios. "
    "Recibirás una lista de movimientos con un índice. "
    "Devuelve ÚNICAMENTE JSON válido, sin markdown ni explicación. "
    "Formato exacto: un objeto con la clave 'results'. "
    "Dentro de 'results', cada elemento debe tener claves 'i' y 'category'. "
    "El valor de 'category' debe ser exactamente una de estas categorías:\n\n"
    + "\n".join(f"- {c}" for c in CATEGORIES)
    + "\n\nEjemplo de salida válida: "
      '{"results":[{"i":0,"category":"Alimentación"},{"i":1,"category":"Transferencia"}]}'
)

_LLM_BATCH_RESPONSE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "bank_transaction_categories",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "results": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "i": {"type": "integer"},
                            "category": {
                                "type": "string",
                                "enum": CATEGORIES,
                            },
                        },
                        "required": ["i", "category"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["results"],
            "additionalProperties": False,
        },
    },
}


def _llm_message_content_to_str(content: object) -> str:
    """
    OpenRouter / OpenAI chat: message.content is usually a string, but many models
    (e.g. Gemini) return a list of parts like [{"type":"text","text":"..."}].
    Using a list as a string breaks .strip() and makes every call fail → always Otros.
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                t = block.get("text")
                if isinstance(t, str):
                    parts.append(t)
                elif isinstance(t, list):
                    for item in t:
                        if isinstance(item, dict) and isinstance(item.get("text"), str):
                            parts.append(item["text"])
        return "".join(parts)
    if isinstance(content, dict):
        text = content.get("text")
        if isinstance(text, str):
            return text
        return json.dumps(content, ensure_ascii=False)
    return str(content)


def _extract_json_payload(raw: str) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None

    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()

    start_positions = [p for p in (text.find("["), text.find("{")) if p >= 0]
    if not start_positions:
        return None

    start = min(start_positions)
    open_ch = text[start]
    close_ch = "]" if open_ch == "[" else "}"
    depth = 0
    for idx in range(start, len(text)):
        ch = text[idx]
        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return text[start : idx + 1]
    return None


def _parse_llm_category(raw_answer: str) -> str | None:
    """Normalize model output to one of CATEGORIES or None."""
    answer = (raw_answer or "").strip()
    if not answer:
        return None
    # First line only (models sometimes add reasoning)
    answer = answer.split("\n")[0].strip()
    # Strip markdown / quotes (repeat — models may nest * or **)
    for _ in range(4):
        prev = answer
        for prefix in ("```", "**", "*"):
            if answer.startswith(prefix):
                answer = answer[len(prefix) :].strip()
        if answer.endswith("```"):
            answer = answer[:-3].strip()
        for suffix in ("**", "*"):
            if answer.endswith(suffix):
                answer = answer[: -len(suffix)].strip()
        if answer == prev:
            break
    if len(answer) >= 2 and answer[0] in '"«' and answer[-1] in '"»':
        answer = answer[1:-1].strip()
    answer = answer.rstrip(".,;:!?。）")

    if answer in CATEGORIES:
        return answer

    answer_norm = normalize_text(answer)
    if answer_norm in _CATEGORIES_NORMALIZED:
        return _CATEGORIES_NORMALIZED[answer_norm]

    for cat in CATEGORIES:
        if normalize_text(cat) in answer_norm:
            return cat
        # Respuesta acortada p.ej. "Servicios" para "Servicios básicos"
        cat_n = normalize_text(cat)
        if len(answer_norm) >= 4 and answer_norm in cat_n:
            return cat

    return None


def _parse_llm_batch_categories(raw_answer: str, expected_count: int) -> list[str | None] | None:
    payload = _extract_json_payload(raw_answer)
    if not payload:
        return None

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return None

    if isinstance(data, dict):
        data = data.get("results")

    if not isinstance(data, list):
        return None

    results: list[str | None] = [None] * expected_count
    for item in data:
        if not isinstance(item, dict):
            continue
        idx = item.get("i")
        if not isinstance(idx, int) or idx < 0 or idx >= expected_count:
            continue
        category = _parse_llm_category(str(item.get("category") or ""))
        if category:
            results[idx] = category
    return results


def _openrouter_privacy_guardrail_block(body: str) -> bool:
    """404 con mensaje de OpenRouter: guardrails / data policy de la cuenta bloquean proveedores."""
    low = (body or "").lower()
    return "guardrail" in low and "data policy" in low


def _openrouter_rate_limit_exhausted(body: str) -> bool:
    low = (body or "").lower()
    return "free-models-per-day" in low or "free-models-per-min" in low


def _openrouter_privacy_hint() -> str:
    return (
        "En OpenRouter → Settings → Privacy (https://openrouter.ai/settings/privacy) tu cuenta "
        "está filtrando proveedores: no queda ningún endpoint permitido para este modelo. "
        "Activa el envío de prompts a proveedores según lo que aceptes, o desactiva el modo "
        "restrictivo, guarda cambios y vuelve a probar."
    )


def _log_openrouter_http_error(resp: httpx.Response, model: str) -> None:
    """Explica 404/429/etc. en logs (el 404 de Gemini suele ser modelo ya no expuesto como :free)."""
    snippet = ""
    try:
        snippet = (resp.text or "")[:400]
    except Exception:
        pass
    extra = ""
    if resp.status_code == 404:
        if _openrouter_privacy_guardrail_block(snippet):
            extra = " " + _openrouter_privacy_hint()
        else:
            extra = (
                " No hay proveedor para ese id (modelo descontinuado, mal escrito, o sin endpoints :free). "
                "Listado: https://openrouter.ai/models — API: "
                'curl -s https://openrouter.ai/api/v1/models | jq -r \'.data[]|select(.id|contains(":free"))|.id\''
            )
    elif resp.status_code == 429:
        extra = (
            " Cuota RPM del modelo gratuito o de tu cuenta; reintentos con backoff ya se aplican; "
            "espera unos minutos o usa un modelo de pago."
        )
    logger.warning(
        "OpenRouter HTTP %s para modelo %s.%s Respuesta: %s",
        resp.status_code,
        model,
        extra,
        snippet.replace("\n", " "),
    )


def _try_openrouter_model(
    client: httpx.Client,
    api_key: str,
    model: str,
    original: str,
    timeout: float,
) -> str | None:
    """Single OpenRouter call; returns validated category name or None."""
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _LLM_SYSTEM_PROMPT},
            {"role": "user", "content": f"Movimiento: {original}"},
        ],
        "temperature": 0,
        "max_tokens": 40,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    resp: httpx.Response | None = None
    for attempt in range(LLM_RETRY_MAX):
        resp = client.post(
            LLM_API_URL,
            json=payload,
            headers=headers,
            timeout=timeout,
        )
        if resp.status_code == 429 and attempt < LLM_RETRY_MAX - 1:
            body = resp.text or ""
            if _openrouter_rate_limit_exhausted(body):
                break
            delay = LLM_RETRY_BASE_DELAY * (2**attempt)
            logger.warning(
                "OpenRouter 429 model=%s — reintento %d/%d tras %.1fs",
                model,
                attempt + 1,
                LLM_RETRY_MAX,
                delay,
            )
            time.sleep(delay)
            continue
        break

    if resp is None:
        return None
    if resp.status_code >= 400:
        _log_openrouter_http_error(resp, model)
        resp.raise_for_status()
    data = resp.json()
    msg = data.get("choices", [{}])[0].get("message") or {}
    raw = _llm_message_content_to_str(msg.get("content"))
    if not raw and isinstance(msg.get("refusal"), str):
        raw = msg["refusal"]
    cat = _parse_llm_category(raw)
    if not cat and raw:
        logger.warning(
            "LLM respuesta no reconocida (model=%s): %r",
            model,
            raw[:300],
        )
    return cat


def _try_openrouter_model_batch(
    client: httpx.Client,
    api_key: str,
    model: str,
    originals: list[str],
    timeout: float,
) -> list[str | None]:
    """Single OpenRouter batch call; returns one category per input or raises."""
    lines = [f"{idx}. {text}" for idx, text in enumerate(originals)]
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _LLM_BATCH_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "Clasifica estos movimientos:\n\n" + "\n".join(lines),
            },
        ],
        "temperature": 0,
        "reasoning": {
            "effort": "none",
            "exclude": True,
        },
        "response_format": _LLM_BATCH_RESPONSE_SCHEMA,
        "max_tokens": max(200, 36 * len(originals)),
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    resp: httpx.Response | None = None
    for attempt in range(LLM_RETRY_MAX):
        resp = client.post(
            LLM_API_URL,
            json=payload,
            headers=headers,
            timeout=timeout,
        )
        if resp.status_code == 429 and attempt < LLM_RETRY_MAX - 1:
            body = resp.text or ""
            if _openrouter_rate_limit_exhausted(body):
                break
            delay = LLM_RETRY_BASE_DELAY * (2**attempt)
            logger.warning(
                "OpenRouter 429 batch model=%s size=%d — reintento %d/%d tras %.1fs",
                model,
                len(originals),
                attempt + 1,
                LLM_RETRY_MAX,
                delay,
            )
            time.sleep(delay)
            continue
        break

    if resp is None:
        return [None] * len(originals)
    if resp.status_code >= 400:
        _log_openrouter_http_error(resp, model)
        resp.raise_for_status()

    data = resp.json()
    msg = data.get("choices", [{}])[0].get("message") or {}
    raw = _llm_message_content_to_str(msg.get("content"))
    if not raw and isinstance(msg.get("refusal"), str):
        raw = msg["refusal"]

    parsed = _parse_llm_batch_categories(raw, len(originals))
    if parsed is None:
        logger.warning(
            "LLM batch respuesta no reconocida (model=%s, size=%d): %r",
            model,
            len(originals),
            (raw or "")[:400],
        )
        return [None] * len(originals)
    return parsed


def llm_health_check() -> dict:
    """
    Prueba rápida: envía «hola» al modelo principal (LLM_MODEL) y devuelve la respuesta en texto plano.
    Útil para verificar API key, id de modelo y conectividad sin categorizar movimientos.
    """
    api_key = (os.getenv("OPEN_ROUTER_API_KEY") or os.getenv("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        return {
            "ok": False,
            "error": "Falta OPEN_ROUTER_API_KEY (o OPENROUTER_API_KEY) en el entorno / .env.local",
        }

    model = LLM_MODEL
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "Responde en una sola frase muy breve en español.",
            },
            {"role": "user", "content": "hola"},
        ],
        "temperature": 0.3,
        "max_tokens": 80,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://127.0.0.1:8000",
        "X-Title": "ocr-free llm ping",
    }
    t0 = time.perf_counter()
    try:
        with httpx.Client() as client:
            resp = client.post(
                LLM_API_URL,
                json=payload,
                headers=headers,
                timeout=max(LLM_TIMEOUT_PRIMARY, 25.0),
            )
            elapsed = round(time.perf_counter() - t0, 3)
            if resp.status_code >= 400:
                _log_openrouter_http_error(resp, model)
                err_body = (resp.text or "")[:800]
                out = {
                    "ok": False,
                    "model": model,
                    "http_status": resp.status_code,
                    "error": err_body,
                    "seconds": elapsed,
                }
                if _openrouter_privacy_guardrail_block(err_body):
                    out["hint"] = _openrouter_privacy_hint()
                    out["privacy_settings_url"] = "https://openrouter.ai/settings/privacy"
                return out
            data = resp.json()
            msg = data.get("choices", [{}])[0].get("message") or {}
            raw = _llm_message_content_to_str(msg.get("content")).strip()
            return {
                "ok": True,
                "model": model,
                "reply": raw or "(vacío)",
                "seconds": elapsed,
            }
    except Exception as e:
        elapsed = round(time.perf_counter() - t0, 3)
        logger.exception("llm_health_check falló")
        return {
            "ok": False,
            "model": model,
            "error": str(e),
            "seconds": elapsed,
        }


def classify_with_llm(original: str, normalized: str) -> dict | None:
    """
    Try primary LLM, then optional fallback model on OpenRouter.
    """
    api_key = (os.getenv("OPEN_ROUTER_API_KEY") or os.getenv("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        logger.warning(
            "Falta API key (OPEN_ROUTER_API_KEY u OPENROUTER_API_KEY) — sin LLM, todo cae en Otros"
        )
        return None

    models: list[tuple[str, float]] = [(LLM_MODEL, LLM_TIMEOUT_PRIMARY)]
    if LLM_MODEL_FALLBACK and LLM_MODEL_FALLBACK != LLM_MODEL:
        models.append((LLM_MODEL_FALLBACK, LLM_TIMEOUT_FALLBACK))

    last_error: Exception | None = None
    try:
        with httpx.Client() as client:
            for model_name, tout in models:
                try:
                    cat = _try_openrouter_model(
                        client, api_key, model_name, original, tout
                    )
                    if cat:
                        if model_name != LLM_MODEL:
                            logger.info(
                                "[model] fallback '%s' classified '%s' → %s",
                                model_name,
                                normalized[:50],
                                cat,
                            )
                        return {"category": cat, "llm_model": model_name}
                    logger.warning(
                        "LLM %s returned no valid category for: %s",
                        model_name,
                        original[:80],
                    )
                except httpx.HTTPStatusError as e:
                    last_error = e
                    # El detalle ya se loguea en _log_openrouter_http_error dentro de _try_openrouter_model
                    if e.response is not None and e.response.status_code not in (404, 429):
                        logger.warning(
                            "OpenRouter HTTP %s for model %s: %s",
                            e.response.status_code,
                            model_name,
                            (e.response.text or "")[:200],
                        )
                except Exception as e:
                    last_error = e
                    logger.warning("LLM %s failed: %s", model_name, e)

        if last_error:
            logger.warning("Todos los modelos LLM fallaron o no devolvieron categoría válida")
        return None

    except Exception:
        logger.exception("LLM classification failed")
        return None


def classify_with_llm_batch(originals: list[str]) -> tuple[list[dict | None], bool]:
    """
    Batch LLM classification.

    Returns:
      (results, rate_limited)
      where `results` has one entry per input and `rate_limited` indicates
      the request quota is exhausted and callers should stop sending more batches.
    """
    if not originals:
        return ([], False)

    api_key = (os.getenv("OPEN_ROUTER_API_KEY") or os.getenv("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        logger.warning(
            "Falta API key (OPEN_ROUTER_API_KEY u OPENROUTER_API_KEY) — sin LLM, todo cae en Otros"
        )
        return ([None] * len(originals), False)

    models: list[tuple[str, float]] = [(LLM_MODEL, LLM_TIMEOUT_PRIMARY)]
    if LLM_MODEL_FALLBACK and LLM_MODEL_FALLBACK != LLM_MODEL:
        models.append((LLM_MODEL_FALLBACK, LLM_TIMEOUT_FALLBACK))

    results: list[dict | None] = [None] * len(originals)
    pending_indices = list(range(len(originals)))
    rate_limited = False
    last_error: Exception | None = None

    try:
        with httpx.Client() as client:
            for model_name, tout in models:
                if not pending_indices:
                    break

                batch_inputs = [originals[idx] for idx in pending_indices]
                try:
                    cats = _try_openrouter_model_batch(
                        client, api_key, model_name, batch_inputs, tout
                    )
                    still_pending: list[int] = []
                    for local_idx, cat in enumerate(cats):
                        global_idx = pending_indices[local_idx]
                        if cat:
                            results[global_idx] = {
                                "category": cat,
                                "llm_model": model_name,
                            }
                        else:
                            still_pending.append(global_idx)
                    pending_indices = still_pending
                except httpx.HTTPStatusError as e:
                    last_error = e
                    body = ""
                    if e.response is not None:
                        body = e.response.text or ""
                        if _openrouter_rate_limit_exhausted(body):
                            rate_limited = True
                            break
                        if e.response.status_code not in (404, 429):
                            logger.warning(
                                "OpenRouter HTTP %s for model %s: %s",
                                e.response.status_code,
                                model_name,
                                body[:200],
                            )
                except Exception as e:
                    last_error = e
                    logger.warning("LLM batch %s failed: %s", model_name, e)

        if last_error and any(r is not None for r in results):
            logger.warning("LLM batch parcial: algunas filas no devolvieron categoría válida")
        elif last_error:
            logger.warning("Todos los modelos LLM batch fallaron o no devolvieron categoría válida")
        return (results, rate_limited)

    except Exception:
        logger.exception("LLM batch classification failed")
        return ([None] * len(originals), False)


# ---------------------------------------------------------------------------
# Persistence: save new classification
# ---------------------------------------------------------------------------


def update_category(
    raw_text: str,
    new_category: str,
    account_scope: str | None = None,
) -> dict:
    """
    Manual correction: update the category for a text in merchant_memory
    and embedding_store.  Returns the updated result dict.
    """
    if new_category not in CATEGORIES:
        raise ValueError(f"Unknown category: {new_category}")

    original = raw_text.strip()
    normalized = normalize_text(original)
    scope = _normalize_account_scope(account_scope)
    _init_db()
    conn = _get_db()
    now = _now_iso()
    try:
        if scope:
            conn.execute(
                """INSERT INTO merchant_memory_scoped
                   (account_scope, normalized_text, original_text, category, source, created_at)
                   VALUES (?, ?, ?, ?, 'manual', ?)
                   ON CONFLICT(account_scope, normalized_text) DO UPDATE SET
                     original_text = excluded.original_text,
                     category = excluded.category,
                     source   = 'manual',
                     created_at = excluded.created_at""",
                (scope, normalized, original, new_category, now),
            )
        else:
            conn.execute(
                """INSERT INTO merchant_memory
                   (normalized_text, original_text, category, source, created_at)
                   VALUES (?, ?, ?, 'manual', ?)
                   ON CONFLICT(normalized_text) DO UPDATE SET
                     original_text = excluded.original_text,
                     category = excluded.category,
                     source   = 'manual',
                     created_at = excluded.created_at""",
                (normalized, original, new_category, now),
            )

        vec = _compute_embedding(normalized)
        if scope:
            conn.execute(
                """INSERT INTO embedding_store_scoped
                   (account_scope, normalized_text, category, embedding, created_at)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(account_scope, normalized_text) DO UPDATE SET
                     category   = excluded.category,
                     embedding  = excluded.embedding,
                     created_at = excluded.created_at""",
                (scope, normalized, new_category, _embedding_to_bytes(vec), now),
            )
        else:
            conn.execute(
                """INSERT INTO embedding_store
                   (normalized_text, category, embedding, created_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(normalized_text) DO UPDATE SET
                     category   = excluded.category,
                     embedding  = excluded.embedding,
                     created_at = excluded.created_at""",
                (normalized, new_category, _embedding_to_bytes(vec), now),
            )

        conn.commit()
    finally:
        conn.close()

    _log_classification(original, normalized, new_category, "manual", account_scope=scope)
    logger.info("[manual%s] '%s' → %s", f":{scope}" if scope else "", normalized, new_category)

    return _make_result(original, normalized, new_category, "manual")


def save_to_memory(
    normalized: str,
    original: str,
    category: str,
    source: str,
    store_embedding: bool = True,
    account_scope: str | None = None,
) -> None:
    """Persist a new classification into merchant_memory and embedding_store."""
    _init_db()
    scope = _normalize_account_scope(account_scope)
    conn = _get_db()
    now = _now_iso()
    try:
        if scope:
            conn.execute(
                """INSERT OR IGNORE INTO merchant_memory_scoped
                   (account_scope, normalized_text, original_text, category, source, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (scope, normalized, original, category, source, now),
            )
        else:
            conn.execute(
                """INSERT OR IGNORE INTO merchant_memory
                   (normalized_text, original_text, category, source, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (normalized, original, category, source, now),
            )

        if store_embedding:
            # Also store the embedding for future similarity searches.
            vec = _compute_embedding(normalized)
            if scope:
                conn.execute(
                    """INSERT OR IGNORE INTO embedding_store_scoped
                       (account_scope, normalized_text, category, embedding, created_at)
                       VALUES (?, ?, ?, ?, ?)""",
                    (scope, normalized, category, _embedding_to_bytes(vec), now),
                )
            else:
                conn.execute(
                    """INSERT OR IGNORE INTO embedding_store
                       (normalized_text, category, embedding, created_at)
                       VALUES (?, ?, ?, ?)""",
                    (normalized, category, _embedding_to_bytes(vec), now),
                )

        conn.commit()
    finally:
        conn.close()


def _log_classification(
    original: str,
    normalized: str,
    category: str,
    source: str,
    score: float | None = None,
    reference: str | None = None,
    account_scope: str | None = None,
) -> None:
    _init_db()
    conn = _get_db()
    try:
        conn.execute(
            """INSERT INTO classification_log
               (original_text, normalized_text, category, source, score, reference_text, created_at, account_scope)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (original, normalized, category, source, score, reference, _now_iso(), _normalize_account_scope(account_scope)),
        )
        conn.commit()
    finally:
        conn.close()


def _result_template(result: dict) -> dict:
    return {
        "category": result["category"],
        "source": result["source"],
        "score": result.get("score"),
        "reference": result.get("reference"),
    }


def _apply_result_template(original: str, normalized: str, template: dict) -> dict:
    return _make_result(
        original,
        normalized,
        template["category"],
        template["source"],
        score=template.get("score"),
        reference=template.get("reference"),
    )


def _categorize_pre_llm(
    original: str,
    normalized: str,
    account_scope: str | None = None,
) -> dict | None:
    """Apply all non-LLM layers. Returns a result dict or None if unresolved."""
    scope = _normalize_account_scope(account_scope)
    rule = classify_with_rules(normalized)
    if rule:
        result = _make_result(
            original,
            normalized,
            rule["category"],
            "rule",
            reference=rule.get("reference"),
        )
        _log_classification(
            original,
            normalized,
            rule["category"],
            "rule",
            reference=rule.get("reference"),
            account_scope=scope,
        )
        save_to_memory(
            normalized,
            original,
            rule["category"],
            "rule",
            store_embedding=False,
            account_scope=scope,
        )
        return result

    mem = lookup_memory(normalized, account_scope=scope)
    if mem:
        logger.info("[memory] '%s' → %s", normalized, mem["category"])
        result = _make_result(original, normalized, mem["category"], "memory")
        _log_classification(
            original,
            normalized,
            mem["category"],
            "memory",
            reference=mem.get("reference"),
            account_scope=scope,
        )
        return result

    _ensure_seeds_embedded()
    emb = search_embeddings(normalized, account_scope=scope)
    if emb:
        logger.info(
            "[embedding] '%s' → %s (score=%.4f, ref='%s')",
            normalized,
            emb["category"],
            emb["score"],
            emb["reference"],
        )
        save_to_memory(normalized, original, emb["category"], "embedding", account_scope=scope)
        result = _make_result(
            original,
            normalized,
            emb["category"],
            "embedding",
            score=emb["score"],
            reference=emb["reference"],
        )
        _log_classification(
            original,
            normalized,
            emb["category"],
            "embedding",
            score=emb["score"],
            reference=emb["reference"],
            account_scope=scope,
        )
        return result

    return None


def _classify_texts_with_llm_chunked(texts: list[str]) -> list[dict | None]:
    results: list[dict | None] = []
    rate_limited = False

    for start in range(0, len(texts), LLM_BATCH_SIZE):
        chunk_texts = texts[start : start + LLM_BATCH_SIZE]
        if rate_limited:
            chunk_results = [None] * len(chunk_texts)
        else:
            chunk_results, rate_limited = classify_with_llm_batch(chunk_texts)
            if rate_limited:
                logger.warning(
                    "OpenRouter quedó rate-limited; el resto del lote se marca como fallback sin seguir enviando requests"
                )
        results.extend(chunk_results)

        if not rate_limited and start + LLM_BATCH_SIZE < len(texts):
            time.sleep(LLM_BATCH_INTER_REQUEST_DELAY)

    return results


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def categorize_transaction(
    raw_text: str,
    llm_only: bool = False,
    account_scope: str | None = None,
) -> dict:
    """
    Categorize a single transaction text.

    Returns dict with keys:
      category, source, score, reference, normalized_text, original_text
    """
    original = raw_text.strip()
    normalized = normalize_text(original)
    scope = _normalize_account_scope(account_scope)

    if not normalized:
        result = _make_result(original, normalized, FALLBACK_CATEGORY, "fallback")
        _log_classification(original, normalized, FALLBACK_CATEGORY, "fallback", account_scope=scope)
        return result

    if llm_only:
        llm = classify_with_llm(original, normalized)
        if llm:
            used = llm.get("llm_model") or LLM_MODEL
            llm_src = "model_fallback" if used != LLM_MODEL else "model"
            logger.info("[%s] '%s' → %s", llm_src, normalized, llm["category"])
            save_to_memory(normalized, original, llm["category"], llm_src, store_embedding=True, account_scope=scope)
            result = _make_result(original, normalized, llm["category"], llm_src)
            _log_classification(original, normalized, llm["category"], llm_src, account_scope=scope)
            return result
        logger.warning("[fallback] '%s' → %s (LLM-only real, sin respuesta)", normalized, FALLBACK_CATEGORY)
        result = _make_result(original, normalized, FALLBACK_CATEGORY, "fallback")
        _log_classification(original, normalized, FALLBACK_CATEGORY, "fallback", account_scope=scope)
        return result

    pre_llm = _categorize_pre_llm(original, normalized, account_scope=scope)
    if pre_llm:
        return pre_llm

    # --- Layer 3: LLM fallback (primary model, then LLM_MODEL_FALLBACK) ---
    llm = classify_with_llm(original, normalized)
    if llm:
        used = llm.get("llm_model") or LLM_MODEL
        llm_src = "model_fallback" if used != LLM_MODEL else "model"
        logger.info("[%s] '%s' → %s", llm_src, normalized, llm["category"])
        save_to_memory(normalized, original, llm["category"], llm_src, account_scope=scope)
        result = _make_result(original, normalized, llm["category"], llm_src)
        _log_classification(original, normalized, llm["category"], llm_src, account_scope=scope)
        return result

    # --- Fallback ---
    logger.warning("[fallback] '%s' → %s", normalized, FALLBACK_CATEGORY)
    result = _make_result(original, normalized, FALLBACK_CATEGORY, "fallback")
    _log_classification(original, normalized, FALLBACK_CATEGORY, "fallback", account_scope=scope)
    return result


def categorize_batch(transactions: list[dict], llm_only: bool = False) -> list[dict]:
    """
    Categorize transaction dicts using the same strategy as the reference app:
    analyze the full movement text, not only the merchant/reference column.
    """
    prepared = []
    results: list[dict | None] = [None] * len(transactions)
    cached_by_scope: dict[tuple[str, str | None], dict] = {}
    pending_unique_order: list[tuple[str, str | None]] = []
    pending_unique_map: dict[tuple[str, str | None], dict] = {}

    for idx, tx in enumerate(transactions):
        text = build_transaction_text(tx).strip()
        normalized = normalize_text(text)
        scope = _normalize_account_scope(
            tx.get("account_scope")
            or tx.get("account_number")
            or tx.get("accountNumber")
        )
        cache_key = (normalized, scope)
        prepared.append((tx, text, normalized, scope))

        existing_category = tx.get("category")
        if isinstance(existing_category, str) and existing_category in CATEGORIES:
            source = tx.get("source") if isinstance(tx.get("source"), str) else "manual"
            template = {
                "category": existing_category,
                "source": source,
                "score": tx.get("score"),
                "reference": tx.get("reference"),
            }
            if normalized:
                cached_by_scope[cache_key] = template
            results[idx] = {**tx, **_apply_result_template(text, normalized, template), "analysis_text": text}
            continue

        if not normalized:
            fallback = _make_result("", "", FALLBACK_CATEGORY, "fallback")
            results[idx] = {**tx, **fallback, "analysis_text": text}
            continue

        cached = cached_by_scope.get(cache_key)
        if cached:
            results[idx] = {**tx, **_apply_result_template(text, normalized, cached), "analysis_text": text}
            continue

        if llm_only:
            if cache_key not in pending_unique_map:
                pending_unique_order.append(cache_key)
                pending_unique_map[cache_key] = {"text": text, "indices": []}
            pending_unique_map[cache_key]["indices"].append(idx)
            continue

        pre_llm = _categorize_pre_llm(text, normalized, account_scope=scope)
        if pre_llm:
            template = _result_template(pre_llm)
            cached_by_scope[cache_key] = template
            results[idx] = {**tx, **_apply_result_template(text, normalized, template), "analysis_text": text}
            continue

        if cache_key not in pending_unique_map:
            pending_unique_order.append(cache_key)
            pending_unique_map[cache_key] = {"text": text, "indices": []}
        pending_unique_map[cache_key]["indices"].append(idx)

    if pending_unique_order:
        unique_texts = [pending_unique_map[key]["text"] for key in pending_unique_order]
        llm_outputs = _classify_texts_with_llm_chunked(unique_texts)

        for cache_key, llm in zip(pending_unique_order, llm_outputs):
            normalized, scope = cache_key
            text = pending_unique_map[cache_key]["text"]
            if llm:
                used = llm.get("llm_model") or LLM_MODEL
                llm_src = "model_fallback" if used != LLM_MODEL else "model"
                save_to_memory(
                    normalized,
                    text,
                    llm["category"],
                    llm_src,
                    store_embedding=True,
                    account_scope=scope,
                )
                result = _make_result(text, normalized, llm["category"], llm_src)
                _log_classification(text, normalized, llm["category"], llm_src, account_scope=scope)
            else:
                result = _make_result(text, normalized, FALLBACK_CATEGORY, "fallback")
                _log_classification(text, normalized, FALLBACK_CATEGORY, "fallback", account_scope=scope)

            template = _result_template(result)
            cached_by_scope[cache_key] = template

            for idx in pending_unique_map[cache_key]["indices"]:
                tx, original_text, tx_normalized, _tx_scope = prepared[idx]
                results[idx] = {
                    **tx,
                    **_apply_result_template(original_text, tx_normalized, template),
                    "analysis_text": original_text,
                }

    finalized = []
    for idx, item in enumerate(results):
        if item is not None:
            finalized.append(item)
            continue
        tx, text, normalized, _scope = prepared[idx]
        fallback = _make_result(text, normalized, FALLBACK_CATEGORY, "fallback")
        finalized.append({**tx, **fallback, "analysis_text": text})
    return finalized


def _make_result(
    original: str,
    normalized: str,
    category: str,
    source: str,
    score: float | None = None,
    reference: str | None = None,
) -> dict:
    return {
        "category": category,
        "source": source,
        "score": score,
        "reference": reference,
        "normalized_text": normalized,
        "original_text": original,
    }
