"""
vector_store.py
---------------
Manages the FAISS index and the mapping between vector IDs ↔ image filenames.

Why FAISS?
  • Zero cost, runs fully locally
  • Sub-millisecond search across millions of vectors on CPU
  • IndexFlatIP (inner product) on L2-normalised vectors == cosine similarity

Improvements over v1:
  • RETRIEVAL_DEPTH = 50: always fetches top-50 candidates from FAISS,
    then the ranker reranks and returns only top_k to the client.
    More candidates → better reranking quality without increasing final result count.
  • Paths moved to data/ subdirectory to keep backend/ clean.
  • add_batch(): index multiple vectors in a single FAISS call (faster for ingestion).

Persistence:
  • FAISS index  →  data/faiss.index
  • ID→filename  →  data/id_map.json
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Tuple

import faiss
import numpy as np

logger = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_DIR    = Path(__file__).parent / "data"
INDEX_PATH  = DATA_DIR / "faiss.index"
ID_MAP_PATH = DATA_DIR / "id_map.json"

EMBEDDING_DIM   = 512    # must match CLIPEmbedder output
RETRIEVAL_DEPTH = 50     # candidates fetched from FAISS before reranking


class VectorStore:
    """
    Thread-safe-ish FAISS wrapper.

    Always retrieves RETRIEVAL_DEPTH=50 candidates from FAISS, regardless of
    the top_k the caller requests. The ranker then reranks and trims to top_k.
    This improves result quality significantly when metadata filters are active.

    Internal state:
      self.index   – FAISS IndexFlatIP  (cosine sim via inner-product on L2-normed vecs)
      self.id_map  – { int_id : image_filename }
    """

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.index: faiss.IndexFlatIP = self._load_or_create_index()
        self.id_map: Dict[int, str]   = self._load_id_map()
        logger.info("VectorStore ready — %d vectors indexed", self.index.ntotal)

    # ── Index lifecycle ────────────────────────────────────────────────────────

    def _load_or_create_index(self) -> faiss.IndexFlatIP:
        if INDEX_PATH.exists():
            logger.info("Loading FAISS index from %s", INDEX_PATH)
            index = faiss.read_index(str(INDEX_PATH))
            logger.info("Loaded %d vectors", index.ntotal)
            return index
        logger.info("Creating new FAISS IndexFlatIP (dim=%d)", EMBEDDING_DIM)
        return faiss.IndexFlatIP(EMBEDDING_DIM)

    def _load_id_map(self) -> Dict[int, str]:
        if ID_MAP_PATH.exists():
            with ID_MAP_PATH.open() as f:
                raw = json.load(f)
            return {int(k): v for k, v in raw.items()}
        return {}

    def _save(self) -> None:
        faiss.write_index(self.index, str(INDEX_PATH))
        with ID_MAP_PATH.open("w") as f:
            json.dump(self.id_map, f, indent=2)
        logger.debug("VectorStore saved (%d vectors)", self.index.ntotal)

    # ── Public API ─────────────────────────────────────────────────────────────

    def add(self, embedding: np.ndarray, filename: str) -> int:
        """
        Add one embedding to the index.

        Args:
            embedding: float32 (512,) — must be L2-normalised
            filename:  image filename, e.g. "12345.jpg"

        Returns:
            Assigned integer ID.
        """
        if embedding.ndim == 1:
            embedding = embedding.reshape(1, -1)
        new_id              = self.index.ntotal
        self.index.add(embedding)
        self.id_map[new_id] = filename
        self._save()
        logger.debug("Added id=%d  file=%s", new_id, filename)
        return new_id

    def add_batch(self, embeddings: np.ndarray, filenames: List[str]) -> List[int]:
        """
        Add multiple embeddings in one FAISS call.

        Args:
            embeddings: float32 (N, 512) — all L2-normalised
            filenames:  list of N image filenames

        Returns:
            List of assigned integer IDs.
        """
        assert embeddings.shape[0] == len(filenames), "embeddings/filenames length mismatch"
        if embeddings.ndim == 1:
            embeddings = embeddings.reshape(1, -1)

        start_id = self.index.ntotal
        self.index.add(embeddings.astype(np.float32))

        new_ids = list(range(start_id, start_id + len(filenames)))
        for vid, fname in zip(new_ids, filenames):
            self.id_map[vid] = fname

        self._save()
        logger.info("Batch-added %d vectors (ids %d–%d)", len(filenames), start_id, new_ids[-1])
        return new_ids

    def search(
        self,
        query_embedding: np.ndarray,
        top_k: int = 10,
    ) -> List[Tuple[str, float]]:
        """
        Find similar images.

        Always retrieves min(RETRIEVAL_DEPTH, ntotal) candidates from FAISS
        to give the ranker enough material to work with, then trims to top_k
        after reranking.

        Args:
            query_embedding: float32 (512,)
            top_k:           final result count requested by caller

        Returns:
            List of (filename, cosine_score) up to RETRIEVAL_DEPTH candidates.
            The ranker is responsible for final trimming to top_k.
        """
        if self.index.ntotal == 0:
            logger.warning("Search on empty index — returning []")
            return []

        if query_embedding.ndim == 1:
            query_embedding = query_embedding.reshape(1, -1)

        # Always fetch at least RETRIEVAL_DEPTH candidates for better reranking
        fetch_k = min(max(top_k, RETRIEVAL_DEPTH), self.index.ntotal)

        distances, indices = self.index.search(query_embedding.astype(np.float32), fetch_k)

        results: List[Tuple[str, float]] = []
        for idx, score in zip(indices[0], distances[0]):
            if idx == -1:
                continue
            fname = self.id_map.get(int(idx))
            if fname:
                results.append((fname, float(score)))

        return results

    def delete(self, filename: str) -> bool:
        """
        Remove a vector by filename (rebuilds index — slow for large stores).
        Returns True if found and removed.
        """
        target_id: int | None = None
        for vid, fname in self.id_map.items():
            if fname == filename:
                target_id = vid
                break

        if target_id is None:
            return False

        all_vecs = self.index.reconstruct_n(0, self.index.ntotal)
        keep_ids = [i for i in range(self.index.ntotal) if i != target_id]

        new_index = faiss.IndexFlatIP(EMBEDDING_DIM)
        if keep_ids:
            new_index.add(all_vecs[keep_ids])

        old_filenames = [self.id_map[i] for i in keep_ids]
        new_id_map    = {new_i: fname for new_i, fname in enumerate(old_filenames)}

        self.index   = new_index
        self.id_map  = new_id_map
        self._save()
        logger.info("Deleted vector for file=%s", filename)
        return True

    def list_all(self) -> List[str]:
        return list(self.id_map.values())

    @property
    def count(self) -> int:
        return self.index.ntotal


# ── Module-level singleton ─────────────────────────────────────────────────────
vector_store = VectorStore()
