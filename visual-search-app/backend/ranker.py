"""
ranker.py
---------
Combines FAISS cosine similarity with rich attribute scoring for reranking.

Improvements over v1:
  • SOFT COLOR MATCHING: "blue" matches "navy blue", "light blue", "sky blue", etc.
    via a synonym/family map — not just exact substring match.
  • REWARD + PENALTY scoring:
      - Exact / soft match  → reward  (+)
      - Hard mismatch       → penalty (−)
      - Unknown metadata    → neutral (no reward, no penalty)
  • Weighted multi-attribute scoring with individual field weights.
  • Price scoring is continuous (gradient), not binary.
  • Parser extended: min_price ("above 500"), category keywords.

Score formula:
    attr_score  = weighted sum of per-attribute scores  ∈ [0, 1]
    final_score = SIM_WEIGHT * sim_norm + ATTR_WEIGHT * attr_score
"""

from __future__ import annotations

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ── Global weights ─────────────────────────────────────────────────────────────
SIM_WEIGHT  = 0.55   # visual similarity (FAISS cosine)
ATTR_WEIGHT = 0.45   # attribute match

# ── Per-attribute weights (must sum to 1.0) ────────────────────────────────────
COLOR_W = 0.45
PRICE_W = 0.35
BRAND_W = 0.20

# ── Reward / penalty magnitudes ────────────────────────────────────────────────
MATCH_REWARD   = 1.0    # exact or soft match
MISMATCH_PENALTY = 0.0  # hard mismatch (0 contribution — acts as penalty vs 0.5 neutral)
UNKNOWN_NEUTRAL  = 0.5  # metadata missing — neither reward nor penalty

# ── Color synonym families ─────────────────────────────────────────────────────
# "blue" as a query should match any of these stored color values
COLOR_FAMILIES: dict[str, list[str]] = {
    "blue":   ["blue", "navy", "navy blue", "light blue", "sky blue", "royal blue",
               "cobalt", "teal", "indigo", "denim", "midnight blue", "steel blue"],
    "red":    ["red", "maroon", "crimson", "scarlet", "burgundy", "wine", "rust",
               "dark red", "cherry"],
    "green":  ["green", "olive", "dark green", "light green", "mint", "lime",
               "forest green", "sea green", "sage", "khaki"],
    "pink":   ["pink", "hot pink", "light pink", "blush", "rose", "coral", "salmon",
               "fuchsia", "magenta"],
    "yellow": ["yellow", "mustard", "gold", "lemon", "cream", "off white", "ivory",
               "beige", "khaki"],
    "white":  ["white", "off white", "cream", "ivory", "snow"],
    "black":  ["black", "charcoal", "jet black", "dark grey", "dark gray",
               "graphite"],
    "grey":   ["grey", "gray", "silver", "charcoal", "dark grey", "light grey",
               "slate", "ash"],
    "brown":  ["brown", "tan", "coffee", "caramel", "chocolate", "mocha",
               "sand", "khaki"],
    "orange": ["orange", "peach", "amber", "rust", "tangerine", "apricot"],
    "purple": ["purple", "violet", "lavender", "mauve", "lilac", "plum",
               "indigo"],
}

# Build reverse map: "navy blue" → "blue" family
_COLOR_TO_FAMILY: dict[str, str] = {}
for family, members in COLOR_FAMILIES.items():
    for member in members:
        _COLOR_TO_FAMILY[member.lower()] = family


def _color_family(color: str) -> str:
    """Return the canonical family for a color string, or the color itself."""
    c = color.strip().lower()
    return _COLOR_TO_FAMILY.get(c, c)


def _colors_match(query_color: str, item_color: str) -> bool:
    """
    True if query_color and item_color belong to the same color family,
    OR if either is a substring of the other (handles multi-word colors).
    """
    qc = query_color.strip().lower()
    ic = item_color.strip().lower()

    # Exact match
    if qc == ic:
        return True

    # Soft family match
    if _color_family(qc) == _color_family(ic):
        return True

    # Substring match ("blue" in "navy blue", "navy blue" contains "blue")
    if qc in ic or ic in qc:
        return True

    return False


# ── Query parser ───────────────────────────────────────────────────────────────

COLOR_KEYWORDS = list(COLOR_FAMILIES.keys()) + [
    "navy", "maroon", "teal", "beige", "coral", "cream", "lavender", "olive",
]

KNOWN_BRANDS = [
    "nike", "adidas", "puma", "reebok", "new balance", "under armour",
    "zara", "h&m", "mango", "only", "vero moda", "forever 21",
    "levis", "levi's", "wrangler", "pepe jeans",
    "allen solly", "peter england", "arrow", "van heusen", "louis philippe",
    "roadster", "hrx", "here&now", "mast & harbour",
    "w", "biba", "global desi", "aurelia", "fabindia",
    "marks & spencer", "gap",
]

CATEGORY_KEYWORDS = [
    "kurta", "shirt", "tshirt", "t-shirt", "jeans", "dress", "saree",
    "blazer", "jacket", "shorts", "trousers", "skirt", "top", "leggings",
    "kurti", "salwar", "dupatta", "ethnic", "western", "casual", "formal",
]


def parse_query_filters(text: str) -> dict:
    """
    Parse natural language query for filter signals.

    Examples:
        "red kurta under 2000"      → { color: "red", category: "kurta", max_price: 2000 }
        "like this but navy blue"   → { color: "navy blue" }
        "nike shoes above 500"      → { brand: "nike", min_price: 500 }
        "blue dress 1000 to 3000"   → { color: "blue", min_price: 1000, max_price: 3000 }
    """
    if not text:
        return {}

    tl = text.lower()
    result: dict = {}

    # ── Color ──────────────────────────────────────────────────────────────────
    # Try multi-word colors first (e.g. "navy blue"), then single-word
    multi_colors = [
        c for c in _COLOR_TO_FAMILY if " " in c
        and re.search(r'\b' + re.escape(c) + r'\b', tl)
    ]
    if multi_colors:
        result["color"] = max(multi_colors, key=len)   # longest match wins
    else:
        for color in COLOR_KEYWORDS:
            if re.search(r'\b' + color + r'\b', tl):
                result["color"] = color
                break

    # ── Max price ──────────────────────────────────────────────────────────────
    max_price_patterns = [
        r'under\s*[₹rs.]?\s*(\d[\d,]*)',
        r'below\s*[₹rs.]?\s*(\d[\d,]*)',
        r'less\s+than\s*[₹rs.]?\s*(\d[\d,]*)',
        r'<\s*[₹rs.]?\s*(\d[\d,]*)',
        r'upto?\s*[₹rs.]?\s*(\d[\d,]*)',
        r'max\s*[₹rs.]?\s*(\d[\d,]*)',
        r'within\s*[₹rs.]?\s*(\d[\d,]*)',
    ]
    for pat in max_price_patterns:
        m = re.search(pat, tl)
        if m:
            try:
                result["max_price"] = float(m.group(1).replace(",", ""))
            except ValueError:
                pass
            break

    # ── Min price ──────────────────────────────────────────────────────────────
    min_price_patterns = [
        r'above\s*[₹rs.]?\s*(\d[\d,]*)',
        r'over\s*[₹rs.]?\s*(\d[\d,]*)',
        r'more\s+than\s*[₹rs.]?\s*(\d[\d,]*)',
        r'>\s*[₹rs.]?\s*(\d[\d,]*)',
        r'min\s*[₹rs.]?\s*(\d[\d,]*)',
    ]
    for pat in min_price_patterns:
        m = re.search(pat, tl)
        if m:
            try:
                result["min_price"] = float(m.group(1).replace(",", ""))
            except ValueError:
                pass
            break

    # ── Range: "1000 to 3000" ──────────────────────────────────────────────────
    range_m = re.search(r'[₹rs.]?\s*(\d[\d,]*)\s*(?:to|-)\s*[₹rs.]?\s*(\d[\d,]*)', tl)
    if range_m and "min_price" not in result and "max_price" not in result:
        try:
            lo = float(range_m.group(1).replace(",", ""))
            hi = float(range_m.group(2).replace(",", ""))
            result["min_price"] = lo
            result["max_price"] = hi
        except ValueError:
            pass

    # ── Brand ──────────────────────────────────────────────────────────────────
    for brand in sorted(KNOWN_BRANDS, key=len, reverse=True):   # longest first
        if brand in tl:
            result["brand"] = brand
            break

    # ── Category ───────────────────────────────────────────────────────────────
    for cat in CATEGORY_KEYWORDS:
        if re.search(r'\b' + cat + r'\b', tl):
            result["category"] = cat
            break

    return result


# ── Per-attribute scorers ──────────────────────────────────────────────────────

def _score_color(query_color: str, item_color: Optional[str]) -> float:
    if not item_color:
        return UNKNOWN_NEUTRAL
    return MATCH_REWARD if _colors_match(query_color, item_color) else MISMATCH_PENALTY


def _score_price(
    item_price: Optional[float],
    max_price: Optional[float],
    min_price: Optional[float],
) -> float:
    """
    Continuous price scoring:
      • item within range   → 1.0
      • item slightly over  → gradient decay (still some score)
      • item well over      → 0.0
      • price unknown       → 0.5 (neutral)
    """
    if item_price is None:
        return UNKNOWN_NEUTRAL

    score = 1.0

    if max_price is not None and item_price > max_price:
        # Gradient: up to 20% over → partial score, beyond → 0
        over_ratio = (item_price - max_price) / max_price
        score = min(score, max(0.0, 1.0 - over_ratio * 5))   # drops to 0 at 20% over

    if min_price is not None and item_price < min_price:
        under_ratio = (min_price - item_price) / min_price
        score = min(score, max(0.0, 1.0 - under_ratio * 5))

    return score


def _score_brand(query_brand: str, item_brand: Optional[str]) -> float:
    if not item_brand:
        return UNKNOWN_NEUTRAL
    if query_brand.lower() in item_brand.lower() or item_brand.lower() in query_brand.lower():
        return MATCH_REWARD
    return MISMATCH_PENALTY


#def attribute_match_score(query_filters: dict, item_meta: dict) -> float:
    """
    Compute weighted attribute match score ∈ [0, 1].

    • Color:  soft-matched (family-aware)
    • Price:  continuous gradient (not binary)
    • Brand:  substring match
    • Unknown metadata → neutral (0.5) — not penalised
    """
    if not query_filters:
        return 1.0

    weighted_sum  = 0.0
    total_weight  = 0.0

    # Color
    if query_filters.get("color"):
        s = _score_color(query_filters["color"], item_meta.get("color"))
        weighted_sum += COLOR_W * s
        total_weight += COLOR_W

    # Price (either bound)
    if query_filters.get("max_price") or query_filters.get("min_price"):
        s = _score_price(
            item_meta.get("price"),
            query_filters.get("max_price"),
            query_filters.get("min_price"),
        )
        weighted_sum += PRICE_W * s
        total_weight += PRICE_W

    # Brand
    if query_filters.get("brand"):
        s = _score_brand(query_filters["brand"], item_meta.get("brand"))
        weighted_sum += BRAND_W * s
        total_weight += BRAND_W

    if total_weight == 0:
        return 1.0

    return weighted_sum / total_weight
def attribute_match_score(query_filters: dict, item_meta: dict) -> float:
    if not query_filters:
        return 1.0

    checks = []
    weights = []

    if "color" in query_filters and query_filters["color"]:
        item_color = (item_meta.get("color") or "").lower()
        query_color = query_filters["color"].lower()
        if not item_color:
            checks.append(0.5)
        else:
            checks.append(1.0 if query_color in item_color else 0.0)
        weights.append(3.0)   # color counts 3x more than other attributes

    if "max_price" in query_filters and query_filters["max_price"]:
        item_price = item_meta.get("price")
        if item_price is None:
            checks.append(0.5)
        else:
            checks.append(1.0 if item_price <= query_filters["max_price"] else 0.0)
        weights.append(1.0)

    if "brand" in query_filters and query_filters["brand"]:
        item_brand = (item_meta.get("brand") or "").lower()
        query_brand = query_filters["brand"].lower()
        if not item_brand:
            checks.append(0.5)
        else:
            checks.append(1.0 if query_brand in item_brand else 0.0)
        weights.append(1.0)

    if not checks:
        return 1.0

    weighted_sum = sum(c * w for c, w in zip(checks, weights))
    total_weight = sum(weights)
    return weighted_sum / total_weight

# ── Main ranking function ─────────────────────────────────────────────────────

def rerank(
    faiss_results: list[tuple[str, float]],
    metadata_store,
    query_filters: dict,
    top_k: Optional[int] = None,
    sim_weight: float = SIM_WEIGHT,
    attr_weight: float = ATTR_WEIGHT,
) -> list[dict]:
    """
    Rerank FAISS candidates using combined visual + attribute score.

    Args:
        faiss_results:   [(filename, cosine_score), ...]  — up to RETRIEVAL_DEPTH items
        metadata_store:  MetadataStore instance
        query_filters:   dict from parse_query_filters()
        top_k:           trim to this many results after reranking (None = return all)
        sim_weight:      weight for visual similarity (default 0.65)
        attr_weight:     weight for attribute match   (default 0.35)

    Returns:
        List of result dicts sorted by final_score descending, trimmed to top_k.
    """
    ranked = []

    for filename, sim_score in faiss_results:
        meta = metadata_store.get(filename)

        # Normalise cosine sim [-1, 1] → [0, 1]
        sim_norm   = (sim_score + 1.0) / 2.0
        attr_score = attribute_match_score(query_filters, meta)
        final_score = sim_weight * sim_norm + attr_weight * attr_score

        ranked.append({
            "filename":       filename,
            "url":            f"/images/{filename}",
            "score":          round(sim_score, 4),
            "similarity_pct": round(sim_norm * 100, 1),
            "attr_score":     round(attr_score, 3),
            "final_score":    round(final_score, 4),
            # metadata
            "id":             meta.get("id"),
            "price":          meta.get("price"),
            "color":          meta.get("color"),
            "category":       meta.get("category"),
            "brand":          meta.get("brand"),
        })

    ranked.sort(key=lambda x: x["final_score"], reverse=True)

    if top_k is not None:
        ranked = ranked[:top_k]

    return ranked


# ── Hard filter (post-rerank) ─────────────────────────────────────────────────

def apply_hard_filters(
    results: list[dict],
    color:     Optional[str]   = None,
    max_price: Optional[float] = None,
    min_price: Optional[float] = None,
    brand:     Optional[str]   = None,
) -> list[dict]:
    """
    Hard-filter a result list by explicit values (used by /search/filter).

    Color uses soft matching (family-aware).
    Items with unknown metadata (None) are KEPT (benefit of the doubt).
    """
    out = []
    for r in results:
        if color and r.get("color"):
            if not _colors_match(color, r["color"]):
                continue
        if max_price is not None and r.get("price") is not None:
            if r["price"] > max_price * 1.05:   # 5% tolerance
                continue
        if min_price is not None and r.get("price") is not None:
            if r["price"] < min_price * 0.95:
                continue
        if brand and r.get("brand"):
            if brand.lower() not in r["brand"].lower():
                continue
        out.append(r)
    return out
