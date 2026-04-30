# Visual Search — CLIP + FAISS + Myntra

AI-powered visual search system using CLIP embeddings and FAISS vector search.

## Features
- **True multimodal search**: image + text caption blended into a single query vector
- **Text-to-image search**: CLIP maps text and images to the same embedding space
- **FAISS reranking**: retrieves 50 candidates, reranks to top-K for better quality
- **Smart ranker**: reward/penalty scoring with soft color matching ("blue" → "navy blue")
- **Embedding cache**: images embedded once, cached to disk — fast re-indexing
- **Batch processing**: 32 images per forward pass — 5–10× faster ingestion
- **Metadata filters**: color, price, brand from Myntra dataset

---

## Project Structure

```
visual-search-app/
├── backend/
│   ├── main.py              # FastAPI app
│   ├── embedder.py          # CLIP model + embedding cache
│   ├── vector_store.py      # FAISS index (retrieval depth 50)
│   ├── ranker.py            # Soft color matching + reward/penalty scoring
│   ├── metadata_store.py    # Myntra styles.csv/xlsx loader + cache
│   ├── ingest_myntra.py     # Bulk ingestion script (batch + cached)
│   ├── seed_images.py       # Quick-start with sample images
│   ├── requirements.txt
│   ├── styles.csv           # Myntra metadata (place here)
│   ├── images/              # Uploaded/indexed images
│   └── data/                # FAISS index, ID map, caches (auto-created)
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── index.css
        ├── api/searchApi.js
        ├── hooks/useSearch.js
        └── components/
            ├── MultimodalSearch.jsx
            ├── TextSearch.jsx
            ├── CameraCapture.jsx
            ├── FilterPanel.jsx
            ├── SearchResults.jsx
            ├── ImageCard.jsx
            ├── ImageUploader.jsx
            ├── LibraryPanel.jsx
            ├── SearchHistory.jsx
            └── StatsBar.jsx
```

---

## Setup & Run

### Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

**Option A — Quick start with sample images:**
```bash
uvicorn main:app --reload --port 8000
# In another terminal:
python seed_images.py
```

**Option B — Use Myntra dataset:**
```bash
# Place styles.csv and images/ folder in backend/
python ingest_myntra.py                  # all images
python ingest_myntra.py --limit 1000     # first 1000 only
python ingest_myntra.py --batch-size 16  # lower RAM usage
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

---

## Embedding Cache

Embeddings are saved to `backend/data/`:
- `embed_cache.npy` — float32 matrix (N × 512)
- `embed_cache_map.json` — filename → row index
- `metadata_cache.json` — parsed Myntra metadata
- `faiss.index` — FAISS vector index
- `id_map.json` — FAISS ID → filename

Re-running `ingest_myntra.py` skips already-cached images automatically.
Use `--force` to re-embed everything from scratch.

---

## New Dependencies vs v1

| Package | Purpose |
|---------|---------|
| `numpy` | Embedding cache (`.npy` format) |
| `pandas` + `openpyxl` | styles.xlsx support (optional — CSV works without them) |

No new packages required beyond what was already in requirements.txt.
