"""
seed_images.py
--------------
Optional helper — downloads sample images from Unsplash and indexes them
so you have data to search against immediately after setup.

Run AFTER starting the backend:
    python seed_images.py

Or with a custom backend URL:
    BACKEND_URL=http://localhost:8000 python seed_images.py
"""

import json
import os
import urllib.request

SAMPLE_IMAGES = [
    ("golden_retriever",  "https://images.unsplash.com/photo-1633722715463-d30f4f325e24?w=400"),
    ("red_sports_car",    "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=400"),
    ("mountain_sunset",   "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400"),
    ("city_skyline",      "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400"),
    ("tropical_beach",    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400"),
    ("fresh_salad",       "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400"),
    ("tabby_cat",         "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=400"),
    ("forest_path",       "https://images.unsplash.com/photo-1448375240586-882707db888b?w=400"),
    ("bicycle_city",      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400"),
    ("chess_board",       "https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400"),
    ("vintage_camera",    "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400"),
    ("coffee_morning",    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400"),
    ("hot_air_balloon",   "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400"),
    ("wolf_in_snow",      "https://images.unsplash.com/photo-1474511320723-9a56873867b5?w=400"),
    ("modern_kitchen",    "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400"),
]

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")


def upload_image_bytes(name: str, image_bytes: bytes) -> dict:
    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    header   = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{name}.jpg"\r\n'
        f"Content-Type: image/jpeg\r\n\r\n"
    ).encode()
    footer = f"\r\n--{boundary}--\r\n".encode()
    body   = header + image_bytes + footer

    req = urllib.request.Request(
        f"{BACKEND_URL}/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def main() -> None:
    print(f"\n🔍 Visual Search — Seeding sample images to {BACKEND_URL}\n")
    success = 0
    for desc, url in SAMPLE_IMAGES:
        try:
            print(f"  ↓ {desc} …", end=" ", flush=True)
            with urllib.request.urlopen(url, timeout=15) as r:
                img_bytes = r.read()
            result = upload_image_bytes(desc, img_bytes)
            print(f"✓  vector_id={result['vector_id']}")
            success += 1
        except Exception as exc:
            print(f"✗  {exc}")

    print(f"\n✅ Done — {success}/{len(SAMPLE_IMAGES)} images indexed.")
    print(f"   Open http://localhost:5173 and start searching!\n")


if __name__ == "__main__":
    main()
