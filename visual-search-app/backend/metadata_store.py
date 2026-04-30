"""
metadata_store.py
-----------------
Loads Myntra styles.csv / styles.xlsx → in-memory dict keyed by image filename.
Also handles manually-uploaded images (no metadata → graceful fallback).

Expected columns (case-insensitive):
  id, price, baseColour, articleType, brandName   (or brand, color, category)

Image path convention:  images/{id}.jpg
"""

from __future__ import annotations

import csv
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

DATA_DIR   = Path(__file__).parent / "data"
META_CACHE = DATA_DIR / "metadata_cache.json"

try:
    import pandas as pd
    _PANDAS_OK = True
except ImportError:
    _PANDAS_OK = False
    logger.warning("pandas not installed — Excel load disabled. CSV still works.")


class MetadataStore:

    def __init__(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._store: dict[str, dict] = {}
        self._load_cache()

    # ── Cache I/O ──────────────────────────────────────────────────────────────

    def _load_cache(self) -> None:
        if META_CACHE.exists():
            try:
                with META_CACHE.open() as f:
                    self._store = json.load(f)
                logger.info("MetadataStore: %d entries loaded from cache", len(self._store))
            except Exception as e:
                logger.warning("Cache load failed (%s) — will re-parse source file", e)

    def _save_cache(self) -> None:
        try:
            with META_CACHE.open("w") as f:
                json.dump(self._store, f)
        except Exception as e:
            logger.warning("Could not save metadata cache: %s", e)

    # ── Column normaliser ──────────────────────────────────────────────────────

    _RENAME = {
        "basecolour":   "color",
        "base colour":  "color",
        "base_colour":  "color",
        "articletype":  "category",
        "article type": "category",
        "article_type": "category",
        "brandname":    "brand",
        "brand name":   "brand",
        "brand_name":   "brand",
        "productdisplayname": "name",
        "product display name": "name",
        "mastercategory": "master_category",
        "subcategory":  "sub_category",
    }

    @classmethod
    def _normalise_columns(cls, raw_columns: list[str]) -> dict[str, str]:
        mapping = {}
        for col in raw_columns:
            key = col.strip().lower()
            mapping[col] = cls._RENAME.get(key, key)
        return mapping

    # ── CSV loader (preferred) ─────────────────────────────────────────────────

    def load_csv(self, csv_path: str | Path) -> int:
        """
        Parse styles.csv and populate the store.
        Returns number of rows loaded.
        """
        csv_path = Path(csv_path)
        if not csv_path.exists():
            logger.warning("CSV not found at %s", csv_path)
            return 0

        try:
            with csv_path.open(newline="", encoding="utf-8", errors="replace") as f:
                reader  = csv.DictReader(f)
                col_map = self._normalise_columns(reader.fieldnames or [])
                loaded  = 0

                for row in reader:
                    try:
                        norm = {col_map.get(k, k.strip().lower()): (v or "") for k, v in row.items()}

                        item_id = str(norm.get("id", "")).strip()
                        if not item_id or item_id.lower() == "nan":
                            continue

                        meta = {
                            "id":       item_id,
                            "price":    _parse_price(norm.get("price", "")),
                            "color":    _clean(norm.get("color")),
                            "category": _clean(norm.get("category")),
                            "brand":    _clean(norm.get("brand")),
                            "name":     _clean(norm.get("name")),
                            "gender":   _clean(norm.get("gender")),
                        }
                        self._store[f"{item_id}.jpg"] = meta
                        loaded += 1
                    except Exception as e:
                        logger.debug("Skipping row: %s", e)
                        continue

            self._save_cache()
            logger.info("MetadataStore: %d rows loaded from %s", loaded, csv_path)
            return loaded

        except Exception as e:
            logger.error("Failed to parse CSV: %s", e)
            return 0

    # ── Excel loader ───────────────────────────────────────────────────────────

    def load_excel(self, xlsx_path: str | Path) -> int:
        """
        Parse styles.xlsx and populate the store.
        Returns number of rows loaded.
        """
        if not _PANDAS_OK:
            logger.error("pandas not installed — cannot load Excel.")
            return 0

        xlsx_path = Path(xlsx_path)
        if not xlsx_path.exists():
            logger.warning("File not found at %s — metadata disabled.", xlsx_path)
            return 0

        try:
            df = pd.read_excel(xlsx_path, dtype=str, keep_default_na=False)
            df.columns = [str(c).strip().lower() for c in df.columns]
            df.rename(columns=self._RENAME, inplace=True)

            loaded = 0
            for _, row in df.iterrows():
                try:
                    item_id = str(row.get("id", "")).strip()
                    if not item_id or item_id.lower() == "nan":
                        continue

                    meta = {
                        "id":       item_id,
                        "price":    _parse_price(str(row.get("price", ""))),
                        "color":    _clean(row.get("color", "")),
                        "category": _clean(row.get("category", "")),
                        "brand":    _clean(row.get("brand", "")),
                        "name":     _clean(row.get("name", "")),
                        "gender":   _clean(row.get("gender", "")),
                    }
                    self._store[f"{item_id}.jpg"] = meta
                    loaded += 1
                except Exception as e:
                    logger.debug("Skipping row: %s", e)
                    continue

            self._save_cache()
            logger.info("MetadataStore: loaded %d rows from %s", loaded, xlsx_path)
            return loaded

        except Exception as e:
            logger.error("Failed to parse Excel: %s", e)
            return 0

    # ── Public API ─────────────────────────────────────────────────────────────

    def get(self, filename: str) -> dict:
        return self._store.get(filename, {
            "id": None, "price": None, "color": None,
            "category": None, "brand": None, "name": None, "gender": None,
        })

    def add(self, filename: str, meta: dict) -> None:
        self._store[filename] = meta
        self._save_cache()

    def get_all_colors(self) -> list[str]:
        colors = {m["color"] for m in self._store.values() if m.get("color")}
        return sorted(colors)

    def get_all_brands(self) -> list[str]:
        brands = {m["brand"] for m in self._store.values() if m.get("brand")}
        return sorted(brands)

    def get_all_categories(self) -> list[str]:
        cats = {m["category"] for m in self._store.values() if m.get("category")}
        return sorted(cats)

    def price_range(self) -> tuple[float, float]:
        prices = [
            m["price"] for m in self._store.values()
            if m.get("price") is not None and m["price"] > 0
        ]
        if not prices:
            return (0.0, 10000.0)
        return (min(prices), max(prices))

    @property
    def count(self) -> int:
        return len(self._store)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _clean(val) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s if s and s.lower() not in ("nan", "none", "") else None


def _parse_price(raw: str) -> Optional[float]:
    import re
    digits = re.sub(r"[^\d.]", "", str(raw))
    if not digits:
        return None
    try:
        return float(digits)
    except ValueError:
        return None


# ── Module singleton ───────────────────────────────────────────────────────────
metadata_store = MetadataStore()
