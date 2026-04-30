"""
main.py
-------
FastAPI backend for Visual Search — CLIP + FAISS + Myntra metadata.

Endpoints:
  GET  /                      Health check
  POST /upload                Index a new image
  POST /search/image          Search by uploaded image
  POST /search/text           Search by text query (CLIP text embedding)
  POST /search/multimodal     Search with image + caption blended
  POST /search/filter         Structured filter search (image or text + filters)
  GET  /metadata/options      Available filter options from dataset
  GET  /images                List all indexed images
  GET  /images/{filename}     Serve an image file
  DELETE /images/{filename}   Remove image from index + disk

Run:
  cd backend
  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import uuid
from io import BytesIO
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError

from embedder       import embedder
from vector_store   import vector_store
from metadata_store import metadata_store
from ranker         import rerank, parse_query_filters, apply_hard_filters

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────
IMAGES_DIR         = Path(__file__).parent / "images"
STYLES_CSV_PATH    = Path(__file__).parent / "styles.csv"
STYLES_XLSX_PATH   = Path(__file__).parent / "styles.csv"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}
MAX_FILE_SIZE_MB   = 10
TOP_K_DEFAULT      = 10

# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Visual Search API — Myntra Edition",
    description="CLIP + FAISS + Myntra metadata: image search with filtering & re-ranking",
    version="2.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup ────────────────────────────────────────────────────────────────────
@app.on_event("startup")
def startup_load_metadata() -> None:
    """
    Load Myntra metadata on startup.
    Prefers styles.csv (faster, no extra deps) → falls back to styles.xlsx.
    Skips if metadata cache already exists (data/metadata_cache.json).
    """
    # Skip if already loaded from cache
    if metadata_store.count > 0:
        logger.info("Metadata already in cache (%d entries) — skipping file load", metadata_store.count)
        return

    if STYLES_CSV_PATH.exists():
        n = metadata_store.load_csv(STYLES_CSV_PATH)
        logger.info("Loaded %d metadata entries from styles.csv", n)
    elif STYLES_XLSX_PATH.exists():
        n = metadata_store.load_excel(STYLES_XLSX_PATH)
        logger.info("Loaded %d metadata entries from styles.xlsx", n)
    else:
        logger.info(
            "No styles.csv / styles.xlsx found — metadata features disabled. "
            "Place styles.csv in the backend/ folder."
        )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validate_image_file(file: UploadFile) -> None:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix}'. Allowed: {ALLOWED_EXTENSIONS}",
        )


def _save_upload(file: UploadFile, content: bytes) -> tuple[str, Path]:
    suffix      = Path(file.filename or ".jpg").suffix.lower()
    unique_name = f"{uuid.uuid4().hex}{suffix}"
    dest        = IMAGES_DIR / unique_name
    dest.write_bytes(content)
    return unique_name, dest


def _open_image(content: bytes, filename: str) -> Image.Image:
    try:
        img = Image.open(BytesIO(content))
        img.verify()
        return Image.open(BytesIO(content))
    except UnidentifiedImageError:
        raise HTTPException(status_code=422, detail=f"'{filename}' is not a valid image.")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not open image: {exc}")


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/", summary="Health check")
def health() -> dict:
    return {
        "status":         "ok",
        "indexed_images": vector_store.count,
        "metadata_count": metadata_store.count,
        "model":          "clip-ViT-B-32",
    }


# ── Upload ─────────────────────────────────────────────────────────────────────
@app.post("/upload", summary="Upload and index an image")
async def upload_image(
    file:     UploadFile        = File(...),
    price:    Optional[float]   = Form(default=None),
    color:    Optional[str]     = Form(default=None),
    category: Optional[str]     = Form(default=None),
    brand:    Optional[str]     = Form(default=None),
) -> dict:
    _validate_image_file(file)

    content = await file.read()
    if len(content) / (1024 * 1024) > MAX_FILE_SIZE_MB:
        raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_FILE_SIZE_MB} MB.")

    pil_image              = _open_image(content, file.filename or "upload")
    unique_name, _         = _save_upload(file, content)
    logger.info("Saved upload → %s (%.1f KB)", unique_name, len(content) / 1024)

    embedding = embedder.embed_image(pil_image)
    vector_id = vector_store.add(embedding, unique_name)

    if any(v is not None for v in [price, color, category, brand]):
        metadata_store.add(unique_name, {
            "id":       unique_name,
            "price":    price,
            "color":    color,
            "category": category,
            "brand":    brand,
        })

    return {
        "success":    True,
        "filename":   unique_name,
        "vector_id":  vector_id,
        "url":        f"/images/{unique_name}",
        "size_kb":    round(len(content) / 1024, 1),
        "dimensions": f"{pil_image.width}×{pil_image.height}",
    }


# ── Image search ───────────────────────────────────────────────────────────────
@app.post("/search/image", summary="Search by uploaded image")
async def search_by_image(
    file:  UploadFile = File(...),
    top_k: int        = Form(default=TOP_K_DEFAULT),
) -> dict:
    _validate_image_file(file)
    content   = await file.read()
    pil_image = _open_image(content, file.filename or "query")

    query_vec = embedder.embed_image(pil_image)
    # Fetch deep (50 candidates), rerank, trim to top_k
    matches   = vector_store.search(query_vec, top_k=top_k)
    results   = rerank(matches, metadata_store, query_filters={}, top_k=top_k)

    return {
        "query_type":    "image",
        "total_indexed": vector_store.count,
        "results_count": len(results),
        "results":       results,
    }


# ── Text search ────────────────────────────────────────────────────────────────
@app.post("/search/text", summary="Search images using a text query")
async def search_by_text(
    query: str = Form(...),
    top_k: int = Form(default=TOP_K_DEFAULT),
) -> dict:
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Query text must not be empty.")

    query_filters = parse_query_filters(query.strip())
    logger.info("Text query '%s' → filters: %s", query, query_filters)

    query_vec = embedder.embed_text(query.strip())
    matches   = vector_store.search(query_vec, top_k=top_k)
    results   = rerank(matches, metadata_store, query_filters, top_k=top_k)

    return {
        "query_type":     "text",
        "query":          query,
        "parsed_filters": query_filters,
        "total_indexed":  vector_store.count,
        "results_count":  len(results),
        "results":        results,
    }


# ── Multimodal search ──────────────────────────────────────────────────────────
@app.post("/search/multimodal", summary="Search with image + text caption blended")
async def search_multimodal(
    file:         UploadFile = File(...),
    caption:      str        = Form(...),
    image_weight: float      = Form(default=0.6),
    top_k:        int        = Form(default=TOP_K_DEFAULT),
) -> dict:
    _validate_image_file(file)
    content   = await file.read()
    pil_image = _open_image(content, file.filename or "query")

    if not caption or not caption.strip():
        raise HTTPException(status_code=400, detail="Caption must not be empty.")

    w        = max(0.1, min(0.9, image_weight))
    img_vec  = embedder.embed_image(pil_image)
    text_vec = embedder.embed_text(caption.strip())

    # Blend and re-normalise
    combined = w * img_vec + (1.0 - w) * text_vec
    norm     = np.linalg.norm(combined)
    if norm > 0:
        combined = (combined / norm).astype(np.float32)

    query_filters = parse_query_filters(caption.strip())
    logger.info("Multimodal caption '%s' → filters: %s", caption, query_filters)

    matches = vector_store.search(combined, top_k=top_k)
    results = rerank(matches, metadata_store, query_filters, top_k=top_k)

    return {
        "query_type":     "multimodal",
        "caption":        caption,
        "image_weight":   round(w, 2),
        "parsed_filters": query_filters,
        "total_indexed":  vector_store.count,
        "results_count":  len(results),
        "results":        results,
    }


# ── Filter search ──────────────────────────────────────────────────────────────
@app.post("/search/filter", summary="Search with explicit structured filters")
async def search_with_filter(
    file:      Optional[UploadFile] = File(default=None),
    query:     Optional[str]        = Form(default=None),
    color:     Optional[str]        = Form(default=None),
    brand:     Optional[str]        = Form(default=None),
    max_price: Optional[float]      = Form(default=None),
    min_price: Optional[float]      = Form(default=None),
    top_k:     int                  = Form(default=TOP_K_DEFAULT),
) -> dict:
    if file is None and (not query or not query.strip()):
        raise HTTPException(status_code=400, detail="Provide an image file or text query.")

    if file is not None:
        _validate_image_file(file)
        content    = await file.read()
        pil_image  = _open_image(content, file.filename or "query")
        query_vec  = embedder.embed_image(pil_image)
        query_type = "image+filter"
    else:
        query_vec  = embedder.embed_text(query.strip())
        query_type = "text+filter"

    # Fetch deep pool for filter — more candidates = better post-filter results
    fetch_k = min(top_k * 5, 200)
    matches = vector_store.search(query_vec, top_k=fetch_k)

    explicit_filters: dict = {}
    if color:     explicit_filters["color"]     = color
    if max_price: explicit_filters["max_price"] = max_price
    if min_price: explicit_filters["min_price"] = min_price
    if brand:     explicit_filters["brand"]     = brand

    text_filters   = parse_query_filters(query.strip()) if query else {}
    merged_filters = {**text_filters, **explicit_filters}   # explicit overrides text-parsed

    results = rerank(matches, metadata_store, merged_filters)
    results = apply_hard_filters(results, color=color, max_price=max_price,
                                  min_price=min_price, brand=brand)
    results = results[:top_k]

    return {
        "query_type":    query_type,
        "filters":       merged_filters,
        "total_indexed": vector_store.count,
        "results_count": len(results),
        "results":       results,
    }


# ── Metadata options ───────────────────────────────────────────────────────────
@app.get("/metadata/options", summary="Return available filter options for frontend")
def metadata_options() -> dict:
    min_price, max_price = metadata_store.price_range()
    return {
        "colors":      metadata_store.get_all_colors(),
        "brands":      metadata_store.get_all_brands(),
        "categories":  metadata_store.get_all_categories(),
        "price_range": {"min": min_price, "max": max_price},
    }


# ── Image serving ──────────────────────────────────────────────────────────────
@app.get("/images/{filename}", summary="Serve a stored image")
def serve_image(filename: str) -> FileResponse:
    safe_path = (IMAGES_DIR / filename).resolve()
    if not str(safe_path).startswith(str(IMAGES_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    if not safe_path.exists():
        raise HTTPException(status_code=404, detail=f"Image '{filename}' not found.")
    return FileResponse(path=str(safe_path), media_type="image/*", filename=filename)


@app.get("/images", summary="List all indexed images")
def list_images() -> dict:
    filenames = vector_store.list_all()
    return {
        "total":  len(filenames),
        "images": [{"filename": f, "url": f"/images/{f}"} for f in filenames],
    }


@app.delete("/images/{filename}", summary="Remove image from store and disk")
def delete_image(filename: str) -> dict:
    removed = vector_store.delete(filename)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Image '{filename}' not found in index.")
    disk_path = IMAGES_DIR / filename
    if disk_path.exists():
        disk_path.unlink()
        logger.info("Deleted file: %s", disk_path)
    return {"success": True, "deleted": filename}
