"""
ingest_myntra.py
----------------
One-time bulk ingestion script: reads styles.csv + images/ folder,
embeds all images in batches, builds FAISS index + metadata cache.

Features:
  • Batch embedding (default 32 images/batch) — 5–10× faster than 1-by-1
  • Embedding cache: already-embedded images are skipped on re-runs
  • Auto-detects styles.csv (preferred) or styles.xlsx
  • Progress logging every batch

Run ONCE from the backend/ directory (with venv active):
    python ingest_myntra.py

Options:
    python ingest_myntra.py --limit 500          # ingest only first 500 images
    python ingest_myntra.py --batch-size 16      # smaller batches for low RAM
    python ingest_myntra.py --images-dir /path   # custom images folder
    python ingest_myntra.py --force              # ignore embedding cache, re-embed all
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).parent
IMAGES_DIR  = BACKEND_DIR / "images"
STYLES_CSV  = BACKEND_DIR / "styles.csv"
STYLES_XLSX = BACKEND_DIR / "styles.xlsx"


def main(limit: int, batch_size: int, images_dir: Path, force: bool) -> None:
    sys.path.insert(0, str(BACKEND_DIR))
    from embedder       import embedder
    from vector_store   import vector_store
    from metadata_store import metadata_store

    # ── Load metadata ─────────────────────────────────────────────────────────
    if metadata_store.count == 0:
        if STYLES_CSV.exists():
            n = metadata_store.load_csv(STYLES_CSV)
            logger.info("Loaded %d metadata rows from styles.csv", n)
        elif STYLES_XLSX.exists():
            n = metadata_store.load_excel(STYLES_XLSX)
            logger.info("Loaded %d metadata rows from styles.xlsx", n)
        else:
            logger.warning("No styles.csv / styles.xlsx — images indexed without metadata.")
    else:
        logger.info("Metadata already cached (%d entries)", metadata_store.count)

    # ── Find images to ingest ─────────────────────────────────────────────────
    already_indexed = set(vector_store.list_all())
    all_images      = sorted(images_dir.glob("*.jpg"))

    if limit:
        all_images = all_images[:limit]

    to_ingest = [p for p in all_images if p.name not in already_indexed]

    if not to_ingest:
        logger.info("No new images to index — all already in FAISS or folder empty.")
        logger.info("Total vectors in FAISS: %d", vector_store.count)
        return

    logger.info(
        "Found %d images to ingest (skipping %d already indexed), batch_size=%d",
        len(to_ingest), len(all_images) - len(to_ingest), batch_size,
    )

    # ── Ingest in batches ─────────────────────────────────────────────────────
    from PIL import Image, UnidentifiedImageError
    import numpy as np

    total_ok    = 0
    total_error = 0

    for batch_start in range(0, len(to_ingest), batch_size):
        batch_paths = to_ingest[batch_start : batch_start + batch_size]
        pil_images  = []
        valid_paths = []

        for path in batch_paths:
            try:
                img = Image.open(path).convert("RGB")
                pil_images.append(img)
                valid_paths.append(path)
            except (UnidentifiedImageError, Exception) as e:
                logger.warning("Skipping %s — %s", path.name, e)
                total_error += 1

        if not pil_images:
            continue

        # Embed batch — uses cache if not force
        try:
            if force:
                embeddings = embedder.embed_batch(pil_images, batch_size=batch_size)
            else:
                fnames     = [p.name for p in valid_paths]
                embeddings = embedder.embed_batch_cached(fnames, pil_images, batch_size=batch_size)
        except Exception as e:
            logger.error("Embedding batch failed: %s", e)
            total_error += len(pil_images)
            continue

        # Add to FAISS in one call
        fnames = [p.name for p in valid_paths]
        try:
            vector_store.add_batch(embeddings, fnames)
            total_ok += len(fnames)
        except Exception as e:
            logger.error("FAISS add_batch failed: %s", e)
            total_error += len(fnames)
            continue

        pct = min(100, (batch_start + len(batch_paths)) / len(to_ingest) * 100)
        logger.info(
            "Progress: %d/%d (%.0f%%) — %d ok, %d errors",
            batch_start + len(batch_paths), len(to_ingest), pct, total_ok, total_error,
        )

    logger.info(
        "\n✅ Done — %d images indexed, %d errors.\n"
        "   FAISS index: %d vectors\n"
        "   Metadata:    %d entries\n"
        "   Run server:  uvicorn main:app --reload --port 8000",
        total_ok, total_error, vector_store.count, metadata_store.count,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest Myntra images into FAISS")
    parser.add_argument("--limit",       type=int,  default=0,          help="Max images (0=all)")
    parser.add_argument("--batch-size",  type=int,  default=32,         help="Images per batch")
    parser.add_argument("--images-dir",  type=Path, default=IMAGES_DIR, help="Path to images folder")
    parser.add_argument("--force",       action="store_true",           help="Re-embed even if cached")
    args = parser.parse_args()

    main(
        limit      = args.limit,
        batch_size = args.batch_size,
        images_dir = args.images_dir,
        force      = args.force,
    )
