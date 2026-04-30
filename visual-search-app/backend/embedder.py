"""
embedder.py
-----------
Wraps the CLIP model (clip-ViT-B-32 via sentence-transformers) to produce
512-dimensional L2-normalised embeddings for both images and text queries.

Improvements over v1:
  • Embedding cache: image embeddings saved to data/embed_cache.npy + data/embed_cache_map.json
    — avoids recomputing embeddings for already-indexed images on re-index runs
  • Batch processing: embed_batch() processes in configurable batch sizes (default 32)
  • Guaranteed L2 normalisation on every output (critical for cosine similarity via FAISS IP)
  • GPU auto-detect (falls back to CPU transparently)

CLIP maps images and text into the same 512-dim embedding space, enabling
cross-modal search out-of-the-box.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
from PIL import Image
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# ── Model configuration ────────────────────────────────────────────────────────
CLIP_MODEL_NAME = "clip-ViT-B-32"
EMBEDDING_DIM   = 512
BATCH_SIZE      = 32   # images per forward pass

# ── Cache paths ────────────────────────────────────────────────────────────────
DATA_DIR        = Path(__file__).parent / "data"
CACHE_NPY       = DATA_DIR / "embed_cache.npy"    # shape (N, 512) float32
CACHE_MAP_JSON  = DATA_DIR / "embed_cache_map.json"  # { filename: row_index }


def _l2_normalize(v: np.ndarray) -> np.ndarray:
    """Guarantee unit-norm regardless of model output. Safe against zero vectors."""
    norm = np.linalg.norm(v, axis=-1, keepdims=True)
    norm = np.where(norm == 0, 1.0, norm)
    return (v / norm).astype(np.float32)


class CLIPEmbedder:
    """
    Singleton-style embedder that lazily loads the CLIP model on first use.

    Embedding cache:
        Images embedded once are stored to disk (data/embed_cache.npy).
        On subsequent calls for the same filename, the cached vector is
        returned directly without running inference.

    Usage:
        embedder = CLIPEmbedder()
        image_vec = embedder.embed_image(pil_image)          # shape (512,)
        text_vec  = embedder.embed_text("a red kurta")       # shape (512,)
        batch_vecs = embedder.embed_batch(pil_list)          # shape (N, 512)
        cached    = embedder.embed_image_cached("img.jpg", pil_image)
    """

    def __init__(self, model_name: str = CLIP_MODEL_NAME) -> None:
        self.model_name = model_name
        self._model: Optional[SentenceTransformer] = None

        DATA_DIR.mkdir(parents=True, exist_ok=True)

        # Load existing cache from disk
        self._cache_matrix: np.ndarray = self._load_cache_matrix()
        self._cache_map: Dict[str, int] = self._load_cache_map()

        logger.info(
            "CLIPEmbedder initialised — %d embeddings in cache",
            len(self._cache_map),
        )

    # ── Lazy model loader ──────────────────────────────────────────────────────

    @property
    def model(self) -> SentenceTransformer:
        """Load the model once, cache in-process, return every subsequent time."""
        if self._model is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info("Loading CLIP model '%s' on %s …", self.model_name, device)
            self._model = SentenceTransformer(self.model_name, device=device)
            logger.info("CLIP model loaded.")
        return self._model

    # ── Disk cache helpers ─────────────────────────────────────────────────────

    def _load_cache_matrix(self) -> np.ndarray:
        if CACHE_NPY.exists():
            try:
                mat = np.load(str(CACHE_NPY))
                logger.debug("Loaded embedding cache: shape %s", mat.shape)
                return mat.astype(np.float32)
            except Exception as e:
                logger.warning("Could not load embed cache: %s", e)
        return np.empty((0, EMBEDDING_DIM), dtype=np.float32)

    def _load_cache_map(self) -> Dict[str, int]:
        if CACHE_MAP_JSON.exists():
            try:
                with CACHE_MAP_JSON.open() as f:
                    return json.load(f)
            except Exception as e:
                logger.warning("Could not load cache map: %s", e)
        return {}

    def _save_cache(self) -> None:
        try:
            np.save(str(CACHE_NPY), self._cache_matrix)
            with CACHE_MAP_JSON.open("w") as f:
                json.dump(self._cache_map, f)
        except Exception as e:
            logger.warning("Failed to save embedding cache: %s", e)

    def _store_in_cache(self, filename: str, vec: np.ndarray) -> None:
        """Append a new embedding to the in-memory cache and persist to disk."""
        new_idx = len(self._cache_map)
        vec_2d  = vec.reshape(1, -1)
        if self._cache_matrix.shape[0] == 0:
            self._cache_matrix = vec_2d
        else:
            self._cache_matrix = np.vstack([self._cache_matrix, vec_2d])
        self._cache_map[filename] = new_idx
        self._save_cache()

    def get_cached(self, filename: str) -> Optional[np.ndarray]:
        """Return cached embedding for filename, or None if not cached."""
        idx = self._cache_map.get(filename)
        if idx is not None and idx < self._cache_matrix.shape[0]:
            return self._cache_matrix[idx]
        return None

    # ── Public API ─────────────────────────────────────────────────────────────

    def embed_image(self, image: Image.Image) -> np.ndarray:
        """
        Convert a PIL Image → L2-normalised float32 vector of shape (512,).
        """
        if image.mode != "RGB":
            image = image.convert("RGB")
        raw = self.model.encode(
            image,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return _l2_normalize(raw.astype(np.float32))

    def embed_text(self, text: str) -> np.ndarray:
        """
        Convert a text string → L2-normalised float32 vector of shape (512,).

        CLIP maps text and images into the same space — text queries find
        visually matching images without any training on the target dataset.
        """
        if not text or not text.strip():
            raise ValueError("Text query must not be empty.")
        raw = self.model.encode(
            text,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return _l2_normalize(raw.astype(np.float32))

    def embed_image_file(self, path: str | Path) -> np.ndarray:
        """Convenience: load an image from disk path and embed it."""
        return self.embed_image(Image.open(path))

    def embed_image_cached(self, filename: str, image: Image.Image) -> np.ndarray:
        """
        Return cached embedding if available, otherwise embed and cache.

        Use this during bulk ingestion to avoid recomputing embeddings for
        images already processed in a previous run.
        """
        cached = self.get_cached(filename)
        if cached is not None:
            logger.debug("Cache hit: %s", filename)
            return cached

        vec = self.embed_image(image)
        self._store_in_cache(filename, vec)
        return vec

    def embed_batch(
        self,
        images: List[Image.Image],
        batch_size: int = BATCH_SIZE,
    ) -> np.ndarray:
        """
        Embed a list of PIL images in batches of `batch_size`.
        Returns float32 array of shape (N, 512), all L2-normalised.

        Processing in batches (16–32) is 5–10× faster than one-by-one
        because of GPU/CPU parallelism in the transformer forward pass.
        """
        rgb_images = [img.convert("RGB") for img in images]

        all_vecs: List[np.ndarray] = []
        for start in range(0, len(rgb_images), batch_size):
            chunk = rgb_images[start : start + batch_size]
            vecs  = self.model.encode(
                chunk,
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
                batch_size=batch_size,
            )
            all_vecs.append(vecs.astype(np.float32))

        result = np.vstack(all_vecs) if all_vecs else np.empty((0, EMBEDDING_DIM), dtype=np.float32)
        return _l2_normalize(result)

    def embed_batch_cached(
        self,
        filenames: List[str],
        images: List[Image.Image],
        batch_size: int = BATCH_SIZE,
    ) -> np.ndarray:
        """
        Batch embed with per-image caching.

        Images whose filename is already in the cache are skipped (no inference).
        Newly embedded images are written back to the cache.
        Returns shape (N, 512) preserving input order.
        """
        results     = np.empty((len(images), EMBEDDING_DIM), dtype=np.float32)
        need_embed  = []   # (original_index, image)

        for i, (fname, img) in enumerate(zip(filenames, images)):
            cached = self.get_cached(fname)
            if cached is not None:
                results[i] = cached
            else:
                need_embed.append((i, fname, img))

        if need_embed:
            idxs   = [x[0] for x in need_embed]
            fnames = [x[1] for x in need_embed]
            imgs   = [x[2] for x in need_embed]

            vecs = self.embed_batch(imgs, batch_size=batch_size)
            for pos, (idx, fname, vec) in enumerate(zip(idxs, fnames, vecs)):
                results[idx] = vec
                self._store_in_cache(fname, vec)

            logger.info(
                "Embedded %d new images (%d were cached)",
                len(need_embed),
                len(images) - len(need_embed),
            )

        return results


# ── Module-level singleton (imported by main.py and ingest_myntra.py) ──────────
embedder = CLIPEmbedder()
