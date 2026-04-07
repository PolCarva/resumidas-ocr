import io
import json
import logging
import os
import re
import secrets
import sqlite3
import tempfile
import traceback
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF
import pymupdf4llm
from dotenv import load_dotenv
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Request, HTTPException, status
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import categorizer

load_dotenv(".env.local")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")

try:
    import pytesseract

    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

app = FastAPI(title="OCR Free")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    init_app_db()

# ---------------------------------------------------------------------------
# Constants for structured extraction
# ---------------------------------------------------------------------------

DATE_RE = re.compile(r"^\d{2}[A-Z]{3}$")
CURRENCIES = {"URGP", "US.D", "USD", "UYU", "EUR"}
SPECIAL_CONCEPTS = {"SDO.APERTURA", "TRANSPORTE", "SDO. CIERRE"}
DEBIT_PREFIXES = ("COMPRA", "DEB", "TRASPASO A", "PAGO")

DATA_DIR = Path(__file__).parent / "data"
APP_DB_PATH = DATA_DIR / "app.db"
PASSWORD_MIN_LEN = 8
SESSION_TTL_DAYS = 30
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DEFAULT_FILE_ICON = "bar-chart-3"
DEFAULT_FILE_COLOR = "blue"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(APP_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_app_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = _db_conn()
    try:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS user_sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS saved_statements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                statement_date TEXT,
                source TEXT,
                movement_count INTEGER NOT NULL DEFAULT 0,
                icon TEXT NOT NULL DEFAULT 'bar-chart-3',
                color TEXT NOT NULL DEFAULT 'blue',
                sort_order INTEGER NOT NULL DEFAULT 0,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        _ensure_saved_statements_schema(conn)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_saved_statements_user_created ON saved_statements(user_id, created_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_saved_statements_user_sort ON saved_statements(user_id, sort_order ASC, created_at DESC)"
        )
        conn.commit()
    finally:
        conn.close()


def _table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {str(r["name"]) for r in rows}


def _ensure_saved_statements_schema(conn: sqlite3.Connection) -> None:
    columns = _table_columns(conn, "saved_statements")
    if "icon" not in columns:
        conn.execute("ALTER TABLE saved_statements ADD COLUMN icon TEXT")
    if "color" not in columns:
        conn.execute("ALTER TABLE saved_statements ADD COLUMN color TEXT")
    if "sort_order" not in columns:
        conn.execute("ALTER TABLE saved_statements ADD COLUMN sort_order INTEGER")

    conn.execute(
        "UPDATE saved_statements SET icon = ? WHERE icon IS NULL OR TRIM(icon) = ''",
        (DEFAULT_FILE_ICON,),
    )
    conn.execute(
        "UPDATE saved_statements SET color = ? WHERE color IS NULL OR TRIM(color) = ''",
        (DEFAULT_FILE_COLOR,),
    )

    user_ids = [
        int(r["user_id"])
        for r in conn.execute("SELECT DISTINCT user_id FROM saved_statements").fetchall()
    ]
    for user_id in user_ids:
        rows = conn.execute(
            """SELECT id, sort_order
               FROM saved_statements
               WHERE user_id = ?
               ORDER BY
                 CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END,
                 sort_order ASC,
                 created_at ASC,
                 id ASC""",
            (user_id,),
        ).fetchall()

        for pos, row in enumerate(rows, start=1):
            curr = row["sort_order"]
            if curr is None or int(curr) != pos:
                conn.execute(
                    "UPDATE saved_statements SET sort_order = ? WHERE id = ?",
                    (pos, int(row["id"])),
                )


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _validate_credentials(email: str, password: str) -> None:
    if not _EMAIL_RE.match(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email invalido",
        )
    if len(password) < PASSWORD_MIN_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La password debe tener al menos {PASSWORD_MIN_LEN} caracteres",
        )


def _hash_password(password: str, salt: str) -> str:
    raw = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        200_000,
    )
    return raw.hex()


def _verify_password(password: str, salt: str, expected_hash: str) -> bool:
    got = _hash_password(password, salt)
    return hmac.compare_digest(got, expected_hash)


def _create_session_token(conn: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=SESSION_TTL_DAYS)
    conn.execute(
        """INSERT INTO user_sessions (token, user_id, created_at, expires_at)
           VALUES (?, ?, ?, ?)""",
        (token, user_id, now.isoformat(), expires.isoformat()),
    )
    conn.commit()
    return token


def _extract_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("authorization", "")
    if not auth_header:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_token")
    parts = auth_header.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    return parts[1].strip()


def _require_user(request: Request) -> dict:
    token = _extract_bearer_token(request)
    conn = _db_conn()
    try:
        row = conn.execute(
            """SELECT s.token, s.expires_at, u.id AS user_id, u.email
               FROM user_sessions s
               JOIN users u ON u.id = s.user_id
               WHERE s.token = ?""",
            (token,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

        expires_at = datetime.fromisoformat(row["expires_at"])
        if expires_at <= datetime.now(timezone.utc):
            conn.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
            conn.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="expired_token")

        return {"id": int(row["user_id"]), "email": row["email"], "token": token}
    finally:
        conn.close()


def _movement_count_from_payload(ocr_result: dict, categorized_result: dict | None) -> int:
    data = categorized_result or ocr_result or {}
    structured = data.get("structured_data") or []
    return sum(len(page.get("transactions", [])) for page in structured)


def _structured_pages_from_result(result: Any) -> list[dict[str, Any]]:
    if not isinstance(result, dict):
        return []

    structured = result.get("structured_data")
    if not isinstance(structured, list):
        return []

    return [page for page in structured if isinstance(page, dict)]


def _transaction_lookup_text(tx: dict[str, Any]) -> str:
    original = str(tx.get("original_text") or "").strip()
    if original:
        return original

    analysis = str(tx.get("analysis_text") or "").strip()
    if analysis:
        return analysis

    concepto = str(tx.get("concepto") or "").strip()
    referencia = str(tx.get("referencia") or "").strip()
    return " ".join(part for part in (concepto, referencia) if part).strip()


def _page_account_scope(page: dict[str, Any] | None) -> str | None:
    if not isinstance(page, dict):
        return None

    account_info = page.get("account_info")
    if not isinstance(account_info, dict):
        return None

    account_no = str(account_info.get("account_no") or "").strip()
    return account_no or None


def _apply_manual_category(
    tx: dict[str, Any],
    new_category: str,
    lookup_text: str,
) -> bool:
    changed = False

    if str(tx.get("category") or "").strip() != new_category:
        tx["category"] = new_category
        changed = True
    if str(tx.get("source") or "").strip() != "manual":
        tx["source"] = "manual"
        changed = True

    if lookup_text:
        if str(tx.get("analysis_text") or "").strip() != lookup_text:
            tx["analysis_text"] = lookup_text
            changed = True
        if str(tx.get("original_text") or "").strip() != lookup_text:
            tx["original_text"] = lookup_text
            changed = True

    return changed


def _update_matching_transactions_in_pages(
    pages: list[dict[str, Any]],
    lookup_text: str,
    account_scope: str | None,
    new_category: str,
) -> int:
    normalized_lookup = categorizer.normalize_text(lookup_text)
    if not normalized_lookup:
        return 0

    updated = 0
    for page in pages:
        page_scope = _page_account_scope(page)
        if account_scope and page_scope != account_scope:
            continue

        transactions = page.get("transactions")
        if not isinstance(transactions, list):
            continue

        for tx in transactions:
            if not isinstance(tx, dict):
                continue

            tx_lookup = _transaction_lookup_text(tx)
            if categorizer.normalize_text(tx_lookup) != normalized_lookup:
                continue

            if _apply_manual_category(tx, new_category, lookup_text):
                updated += 1

    return updated


def _normalize_saved_payload(
    payload: dict[str, Any],
    file_id: int,
) -> tuple[dict[str, Any], bool]:
    changed = False
    ocr_pages = _structured_pages_from_result(payload.get("ocr_result"))
    categorized_pages = _structured_pages_from_result(payload.get("categorized_result"))

    for page_idx in range(max(len(ocr_pages), len(categorized_pages))):
        page_number = page_idx + 1
        page_variants: list[dict[str, Any]] = []

        if page_idx < len(ocr_pages):
            page_variants.append(ocr_pages[page_idx])
        if page_idx < len(categorized_pages):
            page_variants.append(categorized_pages[page_idx])

        for page in page_variants:
            if int(page.get("page_number") or 0) <= 0:
                page["page_number"] = page_number
                changed = True

        tx_groups: list[tuple[str, list[Any]]] = []
        if page_idx < len(ocr_pages):
            tx_groups.append(("ocr", ocr_pages[page_idx].get("transactions") or []))
        if page_idx < len(categorized_pages):
            tx_groups.append(("categorized", categorized_pages[page_idx].get("transactions") or []))

        tx_count = max((len(group) for _, group in tx_groups), default=0)
        for tx_idx in range(tx_count):
            tx_id = ""
            for _, group in tx_groups:
                if tx_idx < len(group) and isinstance(group[tx_idx], dict):
                    existing_id = str(group[tx_idx].get("id") or "").strip()
                    if existing_id:
                        tx_id = existing_id
                        break

            if not tx_id:
                tx_id = f"tx-{file_id}-{page_number}-{tx_idx + 1}"

            for group_name, group in tx_groups:
                if tx_idx >= len(group) or not isinstance(group[tx_idx], dict):
                    continue

                tx = group[tx_idx]
                if str(tx.get("id") or "").strip() != tx_id:
                    tx["id"] = tx_id
                    changed = True

                lookup_text = _transaction_lookup_text(tx)
                if lookup_text and str(tx.get("analysis_text") or "").strip() != lookup_text:
                    tx["analysis_text"] = lookup_text
                    changed = True
                if lookup_text and str(tx.get("original_text") or "").strip() != lookup_text:
                    tx["original_text"] = lookup_text
                    changed = True

                if group_name == "categorized":
                    if not str(tx.get("category") or "").strip():
                        tx["category"] = categorizer.FALLBACK_CATEGORY
                        changed = True
                    if not str(tx.get("source") or "").strip():
                        tx["source"] = "fallback"
                        changed = True

    return payload, changed


def _persist_saved_payload(
    conn: sqlite3.Connection,
    file_id: int,
    payload: dict[str, Any],
) -> int:
    movement_count = _movement_count_from_payload(
        payload.get("ocr_result") or {},
        payload.get("categorized_result"),
    )
    conn.execute(
        """UPDATE saved_statements
           SET payload_json = ?, movement_count = ?
           WHERE id = ?""",
        (json.dumps(payload, ensure_ascii=False), movement_count, file_id),
    )
    return movement_count


def _find_transaction_in_pages(
    pages: list[dict[str, Any]],
    transaction_id: str,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    for page in pages:
        transactions = page.get("transactions") or []
        for tx in transactions:
            if not isinstance(tx, dict):
                continue
            if str(tx.get("id") or "").strip() == transaction_id:
                return tx, page

    return None, None


def _delete_transaction_from_pages(
    pages: list[dict[str, Any]],
    transaction_id: str,
) -> bool:
    deleted = False
    for page in pages:
        transactions = page.get("transactions")
        if not isinstance(transactions, list):
            continue

        filtered = [
            tx
            for tx in transactions
            if not isinstance(tx, dict)
            or str(tx.get("id") or "").strip() != transaction_id
        ]
        if len(filtered) != len(transactions):
            page["transactions"] = filtered
            deleted = True

    return deleted


def _guess_title(ocr_result: dict, fallback_name: str = "Resumen") -> str:
    md = (ocr_result or {}).get("md_results") or ""
    match = re.search(r"\b\d{2}[A-Z]{3}\d{4}\b", md)
    if not match:
        return fallback_name
    token = match.group(0)
    month_map = {
        "JAN": "Enero",
        "FEB": "Febrero",
        "MAR": "Marzo",
        "APR": "Abril",
        "MAY": "Mayo",
        "JUN": "Junio",
        "JUL": "Julio",
        "AUG": "Agosto",
        "SEP": "Setiembre",
        "OCT": "Octubre",
        "NOV": "Noviembre",
        "DEC": "Diciembre",
    }
    month = token[2:5]
    year = token[5:]
    return f"Resumen {month_map.get(month, month)} {year}"


# ---------------------------------------------------------------------------
# Markdown table parsing helpers
# ---------------------------------------------------------------------------


def split_md_row(line: str) -> list[str]:
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.replace("<br>", " ").replace("<br/>", " ").strip() for c in line.split("|")]


def clean_amount(s: str) -> str:
    return s.replace("<br>", "").replace("<br/>", "").strip()


def clean_md_text(text: str) -> str:
    text = text.replace("\u0001", "").replace("\u0000", "")
    text = text.replace("╩", "º")
    text = re.sub(r"[�]", "", text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Structured extraction: 2 clean tables per page
# ---------------------------------------------------------------------------


def extract_structured(raw_md: str) -> list[dict]:
    """Parse raw pymupdf4llm markdown → list of pages with account_info + transactions."""
    pages_md = raw_md.split("\n\n---\n\n")
    result = []

    for page_idx, page_md in enumerate(pages_md):
        account_info = None
        transactions: list[dict] = []

        for line in page_md.strip().split("\n"):
            if not (line.startswith("|") and line.endswith("|")):
                continue
            if "|---" in line:
                continue

            cells = split_md_row(line)

            # --- Detect account info row (N° cliente | Moneda | N° cuenta) ---
            if not account_info:
                for i, c in enumerate(cells):
                    if c in CURRENCIES and i > 0 and i < len(cells) - 1:
                        client = cells[i - 1].strip()
                        acct = cells[i + 1].strip()
                        if client.isdigit() and acct.isdigit():
                            account_info = {
                                "client_no": client,
                                "currency": c,
                                "account_no": acct,
                            }
                            break

            # --- Detect transaction rows ---
            first = cells[0] if cells else ""
            is_date = bool(DATE_RE.match(first))
            is_special = first == "" and len(cells) > 1 and cells[1] in SPECIAL_CONCEPTS

            if not (is_date or is_special):
                continue

            n = len(cells)
            if n >= 7:
                # UYU layout: Fecha(0) Concepto(1) Referencia(2) _(3) Débitos(4) Créditos(5) Saldos(6)
                transactions.append(
                    {
                        "fecha": cells[0],
                        "concepto": cells[1],
                        "referencia": cells[2],
                        "debitos": clean_amount(cells[4]),
                        "creditos": clean_amount(cells[5]),
                        "saldos": clean_amount(cells[6]),
                    }
                )
            elif n >= 5:
                # USD layout: Fecha(0) Concepto(1) Referencia(2) Amount(3) Saldos(4)
                amount = clean_amount(cells[3])
                concepto = cells[1]
                is_debit = concepto.upper().startswith(DEBIT_PREFIXES)
                transactions.append(
                    {
                        "fecha": cells[0],
                        "concepto": concepto,
                        "referencia": cells[2],
                        "debitos": amount if is_debit else "",
                        "creditos": "" if is_debit else amount,
                        "saldos": clean_amount(cells[4]),
                    }
                )

        result.append(
            {
                "page_number": page_idx + 1,
                "account_info": account_info,
                "transactions": transactions,
            }
        )

    return result


def build_clean_md(pages: list[dict]) -> str:
    """Build clean markdown from structured data — only the 2 important tables."""
    parts = []
    for p in pages:
        section = [f"## Página {p['page_number']}"]

        if p["account_info"]:
            ai = p["account_info"]
            section.append("")
            section.append("| N° de cliente | Moneda | N° de cuenta |")
            section.append("|---|---|---|")
            section.append(f"| {ai['client_no']} | {ai['currency']} | {ai['account_no']} |")

        if p["transactions"]:
            section.append("")
            section.append(
                "| Fecha | Concepto | Referencia | Débitos | Créditos | Saldos |"
            )
            section.append("|---|---|---|---:|---:|---:|")
            for tx in p["transactions"]:
                section.append(
                    f"| {tx['fecha']} | {tx['concepto']} | {tx['referencia']} "
                    f"| {tx['debitos']} | {tx['creditos']} | {tx['saldos']} |"
                )

        parts.append("\n".join(section))

    return "\n\n---\n\n".join(parts)


# ---------------------------------------------------------------------------
# PDF Processing
# ---------------------------------------------------------------------------


def process_pdf(content: bytes) -> dict:
    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.write(content)
    tmp.close()

    try:
        page_chunks = pymupdf4llm.to_markdown(tmp.name, page_chunks=True)
        raw_md = "\n\n---\n\n".join(
            clean_md_text(c.get("text", "")) for c in page_chunks
        )

        structured = extract_structured(raw_md)
        clean_markdown = build_clean_md(structured)

        doc = fitz.open(stream=content, filetype="pdf")
        pages_info = [
            {"width": int(p.rect.width), "height": int(p.rect.height)} for p in doc
        ]
        doc.close()
    finally:
        os.unlink(tmp.name)

    return {
        "md_results": clean_markdown,
        "structured_data": structured,
        "data_info": {"num_pages": len(pages_info), "pages": pages_info},
    }


# ---------------------------------------------------------------------------
# Image Processing (Tesseract OCR)
# ---------------------------------------------------------------------------


def process_image(content: bytes) -> dict:
    img = Image.open(io.BytesIO(content))
    width, height = img.size
    full_text = ""

    if TESSERACT_AVAILABLE:
        full_text = pytesseract.image_to_string(img, lang="spa+eng")
    else:
        full_text = "[Tesseract no disponible — instálalo para OCR de imágenes]"

    return {
        "md_results": full_text,
        "structured_data": [],
        "data_info": {"num_pages": 1, "pages": [{"width": width, "height": height}]},
    }


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS = {
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif", ".webp"
}


class AuthRequest(BaseModel):
    email: str
    password: str


class SaveFileRequest(BaseModel):
    title: str | None = None
    statement_date: str | None = None
    source: str | None = None
    icon: str | None = None
    color: str | None = None
    ocr_result: dict
    categorized_result: dict | None = None


class UpdateFileRequest(BaseModel):
    title: str | None = None
    statement_date: str | None = None
    icon: str | None = None
    color: str | None = None


class ReorderFilesRequest(BaseModel):
    file_ids: list[int]


class TransactionCategoryRequest(BaseModel):
    category: str


@app.post("/api/auth/register")
async def register(req: AuthRequest):
    email = _normalize_email(req.email)
    password = req.password or ""
    _validate_credentials(email, password)

    conn = _db_conn()
    try:
        salt = secrets.token_hex(16)
        pw_hash = _hash_password(password, salt)
        now = _now_iso()
        cur = conn.execute(
            """INSERT INTO users (email, password_hash, salt, created_at)
               VALUES (?, ?, ?, ?)""",
            (email, pw_hash, salt, now),
        )
        user_id = int(cur.lastrowid)
        token = _create_session_token(conn, user_id)
        return JSONResponse(
            content={
                "token": token,
                "user": {"id": user_id, "email": email},
            }
        )
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="email_in_use",
        )
    finally:
        conn.close()


@app.post("/api/auth/login")
async def login(req: AuthRequest):
    email = _normalize_email(req.email)
    password = req.password or ""
    _validate_credentials(email, password)

    conn = _db_conn()
    try:
        row = conn.execute(
            "SELECT id, email, password_hash, salt FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")

        if not _verify_password(password, row["salt"], row["password_hash"]):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")

        token = _create_session_token(conn, int(row["id"]))
        return JSONResponse(
            content={
                "token": token,
                "user": {"id": int(row["id"]), "email": row["email"]},
            }
        )
    finally:
        conn.close()


@app.post("/api/auth/logout")
async def logout(request: Request):
    user = _require_user(request)
    conn = _db_conn()
    try:
        conn.execute("DELETE FROM user_sessions WHERE token = ?", (user["token"],))
        conn.commit()
    finally:
        conn.close()
    return JSONResponse(content={"ok": True})


@app.get("/api/auth/me")
async def me(request: Request):
    user = _require_user(request)
    return JSONResponse(content={"user": {"id": user["id"], "email": user["email"]}})


@app.get("/api/files")
async def list_files(request: Request):
    user = _require_user(request)
    conn = _db_conn()
    try:
        rows = conn.execute(
            """SELECT id, title, statement_date, source, movement_count, icon, color, sort_order, created_at
               FROM saved_statements
               WHERE user_id = ?
               ORDER BY sort_order ASC, created_at DESC, id ASC
               LIMIT 300""",
            (user["id"],),
        ).fetchall()
        items = [
            {
                "id": int(r["id"]),
                "title": r["title"],
                "statement_date": r["statement_date"],
                "source": r["source"],
                "movement_count": int(r["movement_count"] or 0),
                "icon": (r["icon"] or DEFAULT_FILE_ICON),
                "color": (r["color"] or DEFAULT_FILE_COLOR),
                "sort_order": int(r["sort_order"] or 0),
                "created_at": r["created_at"],
            }
            for r in rows
        ]
        return JSONResponse(content={"items": items})
    finally:
        conn.close()


@app.get("/api/files/{file_id}")
async def get_file(file_id: int, request: Request):
    user = _require_user(request)
    conn = _db_conn()
    try:
        row = conn.execute(
            """SELECT id, title, statement_date, source, movement_count, icon, color, sort_order, payload_json, created_at
               FROM saved_statements
               WHERE id = ? AND user_id = ?""",
            (file_id, user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

        payload = json.loads(row["payload_json"])
        payload, changed = _normalize_saved_payload(payload, int(row["id"]))
        movement_count = int(row["movement_count"] or 0)
        if changed:
            movement_count = _persist_saved_payload(conn, int(row["id"]), payload)
            conn.commit()

        item = {
            "id": int(row["id"]),
            "title": row["title"],
            "statement_date": row["statement_date"],
            "source": row["source"],
            "movement_count": movement_count,
            "icon": (row["icon"] or DEFAULT_FILE_ICON),
            "color": (row["color"] or DEFAULT_FILE_COLOR),
            "sort_order": int(row["sort_order"] or 0),
            "created_at": row["created_at"],
        }
        return JSONResponse(content={"item": item, "payload": payload})
    finally:
        conn.close()


@app.post("/api/files")
async def save_file(req: SaveFileRequest, request: Request):
    user = _require_user(request)
    title = (req.title or "").strip() or _guess_title(req.ocr_result)
    source = (req.source or "").strip() or "ocr_free_v1"
    statement_date = (req.statement_date or "").strip() or None
    icon = (req.icon or "").strip() or DEFAULT_FILE_ICON
    color = (req.color or "").strip() or DEFAULT_FILE_COLOR

    payload = {
        "ocr_result": req.ocr_result,
        "categorized_result": req.categorized_result,
    }
    movement_count = _movement_count_from_payload(req.ocr_result, req.categorized_result)
    now = _now_iso()

    conn = _db_conn()
    try:
        max_sort_row = conn.execute(
            "SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM saved_statements WHERE user_id = ?",
            (user["id"],),
        ).fetchone()
        next_sort_order = int(max_sort_row["max_sort"] or 0) + 1

        cur = conn.execute(
            """INSERT INTO saved_statements
               (user_id, title, statement_date, source, movement_count, icon, color, sort_order, payload_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                user["id"],
                title,
                statement_date,
                source,
                movement_count,
                icon,
                color,
                next_sort_order,
                json.dumps(payload, ensure_ascii=False),
                now,
            ),
        )
        file_id = int(cur.lastrowid)
        payload, _ = _normalize_saved_payload(payload, file_id)
        movement_count = _persist_saved_payload(conn, file_id, payload)
        conn.commit()
        return JSONResponse(
            content={
                "id": file_id,
                "title": title,
                "movement_count": movement_count,
                "icon": icon,
                "color": color,
                "sort_order": next_sort_order,
                "created_at": now,
            },
            status_code=status.HTTP_201_CREATED,
        )
    finally:
        conn.close()


@app.patch("/api/files/{file_id}")
async def update_file(file_id: int, req: UpdateFileRequest, request: Request):
    user = _require_user(request)
    conn = _db_conn()
    try:
        row = conn.execute(
            """SELECT id, title, statement_date, source, movement_count, icon, color, sort_order, created_at
               FROM saved_statements
               WHERE id = ? AND user_id = ?""",
            (file_id, user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

        title = row["title"]
        if req.title is not None:
            new_title = req.title.strip()
            if not new_title:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="title_empty",
                )
            title = new_title

        statement_date = row["statement_date"]
        if req.statement_date is not None:
            statement_date = req.statement_date.strip() or None

        icon = row["icon"] or DEFAULT_FILE_ICON
        if req.icon is not None:
            icon = req.icon.strip() or DEFAULT_FILE_ICON

        color = row["color"] or DEFAULT_FILE_COLOR
        if req.color is not None:
            color = req.color.strip() or DEFAULT_FILE_COLOR

        conn.execute(
            """UPDATE saved_statements
               SET title = ?, statement_date = ?, icon = ?, color = ?
               WHERE id = ? AND user_id = ?""",
            (title, statement_date, icon, color, file_id, user["id"]),
        )
        conn.commit()

        item = {
            "id": int(row["id"]),
            "title": title,
            "statement_date": statement_date,
            "source": row["source"],
            "movement_count": int(row["movement_count"] or 0),
            "icon": icon,
            "color": color,
            "sort_order": int(row["sort_order"] or 0),
            "created_at": row["created_at"],
        }
        return JSONResponse(content={"ok": True, "item": item})
    finally:
        conn.close()


@app.post("/api/files/reorder")
async def reorder_files(req: ReorderFilesRequest, request: Request):
    user = _require_user(request)
    ordered_ids = [int(x) for x in req.file_ids]
    if not ordered_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="file_ids_empty",
        )

    conn = _db_conn()
    try:
        rows = conn.execute(
            "SELECT id FROM saved_statements WHERE user_id = ?",
            (user["id"],),
        ).fetchall()
        existing_ids = [int(r["id"]) for r in rows]
        if len(ordered_ids) != len(existing_ids) or set(ordered_ids) != set(existing_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="file_ids_mismatch",
            )

        for pos, file_id in enumerate(ordered_ids, start=1):
            conn.execute(
                "UPDATE saved_statements SET sort_order = ? WHERE id = ? AND user_id = ?",
                (pos, file_id, user["id"]),
            )
        conn.commit()
        return JSONResponse(content={"ok": True})
    finally:
        conn.close()


@app.delete("/api/files/{file_id}")
async def delete_file(file_id: int, request: Request):
    user = _require_user(request)
    conn = _db_conn()
    try:
        cur = conn.execute(
            "DELETE FROM saved_statements WHERE id = ? AND user_id = ?",
            (file_id, user["id"]),
        )
        conn.commit()
        return JSONResponse(content={"ok": cur.rowcount > 0})
    finally:
        conn.close()


@app.patch("/api/transactions/{transaction_id}/category")
async def update_transaction_category(
    transaction_id: str,
    req: TransactionCategoryRequest,
    request: Request,
):
    user = _require_user(request)
    new_category = (req.category or "").strip()
    if not new_category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="category_empty",
        )
    if new_category not in categorizer.CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown category: {new_category}",
        )

    conn = _db_conn()
    try:
        rows = conn.execute(
            """SELECT id, payload_json
               FROM saved_statements
               WHERE user_id = ?
               ORDER BY created_at DESC, id DESC""",
            (user["id"],),
        ).fetchall()

        loaded_rows: list[dict[str, Any]] = []
        target_file_id: int | None = None
        target_payload: dict[str, Any] | None = None
        target_tx: dict[str, Any] | None = None
        target_lookup_text = ""
        target_account_scope: str | None = None

        for row in rows:
            payload = json.loads(row["payload_json"])
            payload, _ = _normalize_saved_payload(payload, int(row["id"]))

            categorized_pages = _structured_pages_from_result(payload.get("categorized_result"))
            ocr_pages = _structured_pages_from_result(payload.get("ocr_result"))
            if not categorized_pages and ocr_pages:
                payload["categorized_result"] = {"structured_data": ocr_pages}
                categorized_pages = ocr_pages

            current_target_tx, current_target_page = _find_transaction_in_pages(categorized_pages, transaction_id)
            if current_target_tx is None:
                current_target_tx, current_target_page = _find_transaction_in_pages(ocr_pages, transaction_id)
                if current_target_tx is not None and categorized_pages is not ocr_pages:
                    payload["categorized_result"] = {"structured_data": ocr_pages}
                    categorized_pages = ocr_pages

            loaded_rows.append(
                {
                    "id": int(row["id"]),
                    "payload": payload,
                    "categorized_pages": categorized_pages,
                }
            )

            if current_target_tx is not None and target_tx is None:
                target_file_id = int(row["id"])
                target_payload = payload
                target_tx = current_target_tx
                target_lookup_text = _transaction_lookup_text(current_target_tx)
                target_account_scope = _page_account_scope(current_target_page)

        if target_tx is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transaction_not_found")

        updated_transactions = 0
        updated_files = 0
        target_movement_count = 0

        if target_lookup_text:
            for loaded in loaded_rows:
                changed = _update_matching_transactions_in_pages(
                    loaded["categorized_pages"],
                    target_lookup_text,
                    target_account_scope,
                    new_category,
                )
                if changed <= 0:
                    continue

                movement_count = _persist_saved_payload(conn, loaded["id"], loaded["payload"])
                if loaded["id"] == target_file_id:
                    target_movement_count = movement_count
                updated_transactions += changed
                updated_files += 1
        else:
            _apply_manual_category(target_tx, new_category, target_lookup_text)
            if target_file_id is not None and target_payload is not None:
                target_movement_count = _persist_saved_payload(conn, target_file_id, target_payload)
                updated_transactions = 1
                updated_files = 1

        conn.commit()

        categorizer_warning = None
        if target_lookup_text:
            try:
                categorizer.update_category(
                    target_lookup_text,
                    new_category,
                    account_scope=target_account_scope,
                )
            except Exception:
                logging.exception("Could not persist manual category memory")
                categorizer_warning = "category_memory_not_updated"

        return JSONResponse(
            content={
                "ok": True,
                "transaction_id": transaction_id,
                "category": new_category,
                "movement_count": target_movement_count,
                "updated_transactions": updated_transactions,
                "updated_files": updated_files,
                "account_scope": target_account_scope,
                "warning": categorizer_warning,
            }
        )
    finally:
        conn.close()


@app.delete("/api/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, request: Request):
    user = _require_user(request)
    conn = _db_conn()
    try:
        rows = conn.execute(
            """SELECT id, payload_json
               FROM saved_statements
               WHERE user_id = ?
               ORDER BY created_at DESC, id DESC""",
            (user["id"],),
        ).fetchall()

        for row in rows:
            payload = json.loads(row["payload_json"])
            payload, _ = _normalize_saved_payload(payload, int(row["id"]))
            categorized_pages = _structured_pages_from_result(payload.get("categorized_result"))
            ocr_pages = _structured_pages_from_result(payload.get("ocr_result"))

            deleted = _delete_transaction_from_pages(categorized_pages, transaction_id)
            deleted = _delete_transaction_from_pages(ocr_pages, transaction_id) or deleted
            if not deleted:
                continue

            movement_count = _persist_saved_payload(conn, int(row["id"]), payload)
            conn.commit()
            return JSONResponse(
                content={
                    "ok": True,
                    "transaction_id": transaction_id,
                    "movement_count": movement_count,
                }
            )

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transaction_not_found")
    finally:
        conn.close()


@app.post("/api/ocr")
async def ocr(file: UploadFile = File(...)):
    filename = (file.filename or "").lower()
    ext = os.path.splitext(filename)[1]

    if ext not in ALLOWED_EXTENSIONS:
        return JSONResponse(
            content={"error": f"Formato no soportado: {ext}"}, status_code=400
        )

    content = await file.read()

    try:
        if ext == ".pdf":
            result = process_pdf(content)
        else:
            result = process_image(content)
    except Exception:
        return JSONResponse(
            content={"error": traceback.format_exc()}, status_code=500
        )

    return JSONResponse(content=result)


class CategorizeRequest(BaseModel):
    structured_data: list[dict]
    llm_only: bool = False


@app.post("/api/categorize")
async def categorize(req: CategorizeRequest):
    """Categorize transactions extracted by OCR."""
    try:
        stats = {
            "memory": 0,
            "embedding": 0,
            "model": 0,
            "model_fallback": 0,
            "fallback": 0,
            "rule": 0,
            "manual": 0,
        }

        enriched_pages = []
        page_sizes = [len(page.get("transactions", [])) for page in req.structured_data]
        all_txs = []
        for page in req.structured_data:
            account_scope = _page_account_scope(page)
            for tx in page.get("transactions", []):
                if not isinstance(tx, dict):
                    continue
                enriched_tx = dict(tx)
                if account_scope and not str(enriched_tx.get("account_scope") or "").strip():
                    enriched_tx["account_scope"] = account_scope
                all_txs.append(enriched_tx)
        categorized_all = categorizer.categorize_batch(all_txs, llm_only=req.llm_only)

        cursor = 0
        for page, size in zip(req.structured_data, page_sizes):
            categorized_txs = categorized_all[cursor : cursor + size]
            cursor += size
            for tx in categorized_txs:
                source = tx.get("source", "fallback")
                stats[source] = stats.get(source, 0) + 1
            enriched_pages.append({**page, "transactions": categorized_txs})

        return JSONResponse(content={
            "structured_data": enriched_pages,
            "categorization_stats": stats,
        })

    except Exception:
        return JSONResponse(
            content={"error": traceback.format_exc()}, status_code=500
        )


class RecategorizeRequest(BaseModel):
    text: str
    category: str
    account_scope: str | None = None


@app.get("/api/llm/ping")
async def llm_ping():
    """Envía «hola» al modelo LLM_MODEL (OpenRouter) y devuelve la respuesta o el error."""
    try:
        return JSONResponse(content=categorizer.llm_health_check())
    except Exception:
        return JSONResponse(
            content={"ok": False, "error": traceback.format_exc()},
            status_code=500,
        )


@app.post("/api/recategorize")
async def recategorize(req: RecategorizeRequest):
    """Manual category correction — persists for future runs."""
    try:
        result = categorizer.update_category(req.text, req.category, account_scope=req.account_scope)
        return JSONResponse(content=result)
    except ValueError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)
    except Exception:
        return JSONResponse(
            content={"error": traceback.format_exc()}, status_code=500
        )


@app.get("/")
async def root():
    return HTMLResponse(
        content="""
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OCR Free Backend</title>
    <style>
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
        color: #0f172a;
      }
      main {
        max-width: 780px;
        margin: 0 auto;
        padding: 72px 24px;
      }
      .card {
        background: #ffffff;
        border: 1px solid #dbeafe;
        border-radius: 20px;
        box-shadow: 0 20px 45px -35px rgba(15, 23, 42, 0.35);
        padding: 32px;
      }
      h1 {
        margin: 0 0 16px;
        font-size: 38px;
        line-height: 1.1;
      }
      p {
        color: #334155;
        line-height: 1.6;
      }
      code {
        background: #eff6ff;
        border-radius: 8px;
        padding: 2px 8px;
      }
      a {
        color: #2563eb;
        text-decoration: none;
        font-weight: 600;
      }
      ul {
        color: #334155;
        line-height: 1.8;
        padding-left: 20px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>OCR Free Backend listo</h1>
        <p>El frontend nuevo tipo <strong>Resumidas Cuentas</strong> vive en <a href="http://127.0.0.1:3000">http://127.0.0.1:3000</a>.</p>
        <ul>
          <li>Backend FastAPI: <code>./run.sh</code></li>
          <li>Frontend Next.js: <code>./run_front.sh</code></li>
          <li>API base: <code>/api</code></li>
        </ul>
        <p>Si todavía no levantaste el frontend, iniciá primero <code>./run_front.sh</code> en otra terminal.</p>
      </div>
    </main>
  </body>
</html>
""".strip()
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
