from openai import OpenAI
import base64, os, uuid, json, tempfile
import requests
from urllib.parse import quote_plus
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import time
from rembg import remove
from PIL import Image
import re
from functools import lru_cache

# Load environment
load_dotenv(override=True)
api_key = os.getenv("OPENAI_API_KEY")
assert api_key, "OPENAI_API_KEY is missing"
client = OpenAI(api_key=api_key)

def normalize_text_list(vals):
    out = []
    for v in vals or []:
        if isinstance(v, str):
            name = v.strip()
        elif isinstance(v, dict):
            name = v.get('name') or v.get('title') or v.get('artist') or ''
            name = str(name).strip()
        else:
            name = str(v).strip()
        if name:
            out.append(name)
    return out

def _save_result_image(image_data, out_path):
    if getattr(image_data, 'b64_json', None):
        with open(out_path, "wb") as f:
            f.write(base64.b64decode(image_data.b64_json))
        return True
    if getattr(image_data, 'url', None):
        resp = requests.get(image_data.url)
        resp.raise_for_status()
        with open(out_path, "wb") as f:
            f.write(resp.content)
        return True
    return False

def _strip_code_fences(text):
    t = (text or "").strip()
    if t.startswith("```") and t.endswith("```"):
        t = t.split('\n', 1)[1]
        if t.endswith("```"):
            t = t[:-3]
    return t.strip()

def _edit_step(input_path, prompt, mask_path=None):
    try:
        if mask_path and os.path.exists(mask_path):
            with open(input_path, 'rb') as img_f, open(mask_path, 'rb') as mask_f:
                result = client.images.edit(model=os.getenv("OPENAI_EDIT_MODEL","gpt-image-1"), image=img_f, mask=mask_f, prompt=prompt, size="1024x1024")
        else:
            with open(input_path, 'rb') as img_f:
                result = client.images.edit(model=os.getenv("OPENAI_EDIT_MODEL","gpt-image-1"), image=img_f, prompt=prompt, size="1024x1024")
        if not result or not result.data:
            return None
        image_data = result.data[0]
        tmp_path = os.path.join(tempfile.gettempdir(), f"rhythm_{uuid.uuid4().hex}.png")
        return tmp_path if _save_result_image(image_data, tmp_path) else None
    except Exception as e:
        print("Edit step failed:", e)
        return None

def generate_style_plan(genres, artists, songs=None, temperature=None, top_p=None):
    """
    Return strict JSON with richer, brand-inspired fashion and 1–2 vivid adjectives per slot.
    Fallback safely if parsing fails.
    """
    # not correlated with genres
    # maybe decide on animal head w/o LLM call (i.e. randomly select from list)
    sys = (
        "Output ONLY strict JSON with keys: animal, upper, lower, shoes, accessory. "
        "animal: random animal head (unrelated to genres). "
        "Use the provided artists and songs to align items with RECENT (2023–2025) fashion trends, collabs, and streetwear moments; prefer mainstream, viral labels. "
        "Assign each clothing item to a different influence from the lists (no repeats across items). "
        "upper: brand/model + colorway + logo placement, 12–24 words; tie to first influence. "
        "lower: brand/model + colorway + logo/stripe placement, 12–24 words; tie to second influence. "
        "shoes: brand/model + colorway + logo placement, 12–24 words; tie to third influence. "
        "accessory: brand/model + finish, 8–18 words; tie to fourth influence. "
        "Rules: use different brands across items; include at least one real brand/model per item; allow visible logos/wordmarks; avoid quotes and extra prose."
    )
    user = {"genres": (genres or [])[:5], "artists": (artists or [])[:5], "songs": (songs or [])[:5]}

    def _sanitize(v: str) -> str:
        v = (v or "").strip().replace("\n", " ")
        return (v[:180]).strip()

    def _fallback_plan():
        return {"animal":"wolf","upper":"Nike NOCTA tech fleece hoodie, black chest logo","lower":"Levi's 501 jeans, faded indigo","shoes":"Air Jordan 1 Retro, red/black heel logo","accessory":"Chrome Hearts chain, silver"}

    temp = float(temperature if temperature is not None else 1.6)
    tp = float(top_p if top_p is not None else 0.97)

    def _ask(system_msg, user_obj):
        return client.chat.completions.create(
            model=os.getenv("OPENAI_TEXT_MODEL","gpt-4o-mini"),
            temperature=temp,
            top_p=tp,
            messages=[{"role":"system","content":system_msg},{"role":"user","content":json.dumps(user_obj)}]
        )

    try:
        resp = _ask(sys, user)
        content = _strip_code_fences(resp.choices[0].message.content or '{}')
        try:
            data = json.loads(content)
        except Exception:
            # Retry once with extra constraint
            strict_sys = sys + " Return only a JSON object, no prose."
            resp2 = _ask(strict_sys, user)
            content2 = _strip_code_fences(resp2.choices[0].message.content or '{}')
            data = json.loads(content2)

        plan = {
            "animal": _sanitize(str(data.get("animal","fox"))),
            "upper": _sanitize(str(data.get("upper","oversized graphic tee"))),
            "lower": _sanitize(str(data.get("lower","relaxed-fit jeans"))),
            "shoes": _sanitize(str(data.get("shoes","retro sneakers"))),
            "accessory": _sanitize(str(data.get("accessory","chunky chain"))),
        }
        return plan
    except Exception as e:
        print("Plan generation failed:", e)
        return _fallback_plan()

def edit_pipeline_from_plan(base_image_path, plan):
    masks_dir = os.getenv("MASKS_DIR","base_pngs/masks")
    head_mask = os.path.join(masks_dir,"head.png")
    torso_mask = os.path.join(masks_dir,"torso.png")
    legs_mask = os.path.join(masks_dir,"legs.png")
    acc_mask = os.path.join(masks_dir,"accessory.png")

    current = base_image_path
    # Head
    head_prompt = (
        f"Replace only the head with a LEGO-style {plan['animal']} head. "
        "Keep proportions; don't touch torso/legs/background. "
        "Render glossy ABS plastic with clear specular highlights and studio product lighting; no on-image text/logos."
    )
    out = _edit_step(current, head_prompt, head_mask if os.path.exists(head_mask) else None)
    current = out or current
    # Torso
    if plan.get('upper'):
        torso_prompt = (
            f"Apply {plan['upper']} to torso/arms adapted to LEGO; only modify torso/arms; keep head/legs unchanged. "
            "Glossy ABS plastic finish with specular highlights; studio product lighting; no on-image text/logos."
        )
        out = _edit_step(current, torso_prompt, torso_mask if os.path.exists(torso_mask) else None)
        current = out or current
    # Legs + shoes
    legs_desc = ", ".join([x for x in [plan.get('lower'), plan.get('shoes')] if x])
    if legs_desc:
        legs_prompt = (
            f"Update legs/feet with: {legs_desc}, adapted to LEGO; only modify legs/feet; keep head/torso unchanged. "
            "Glossy ABS plastic finish with specular highlights; studio product lighting; no on-image text/logos."
        )
        out = _edit_step(current, legs_prompt, legs_mask if os.path.exists(legs_mask) else None)
        current = out or current
    # Accessory
    if plan.get('accessory'):
        acc_prompt = (
            f"Add a subtle {plan['accessory']} accessory adapted to LEGO; avoid altering other regions. "
            "Glossy ABS plastic realism where applicable; specular highlights; studio product lighting; no on-image text/logos."
        )
        out = _edit_step(current, acc_prompt, acc_mask if os.path.exists(acc_mask) else None)
        current = out or current

    os.makedirs("rhythmojis", exist_ok=True)
    out_name = f"lego_{uuid.uuid4().hex}.png"
    out_path = os.path.join("rhythmojis", out_name)
    with open(current, 'rb') as src, open(out_path, 'wb') as dst:
        dst.write(src.read())
    return out_path, f"/rhythmojis/{out_name}"

def generate_rhythmoji(base_image_path, plan):
    upper = plan.get('upper')
    lower = plan.get('lower')
    shoes = plan.get('shoes')
    accessory = plan.get('accessory')
    animal = plan.get('animal')

    prompt = f"""
Front-on LEGO minifigure edit; keep pose/camera/framing.
Head: replace with LEGO-style {animal}.
Torso: {upper}; show real brand logo as clean decal aligned to plastic.
Legs: {lower}; allow proportional logo/stripe prints.
Shoes: {shoes}; include side/heel logos as crisp prints.
Accessory: {accessory}; adapted to LEGO geometry.
Material/lighting: glossy injection-molded ABS, crisp speculars, micro-bevels, subtle mold lines; bright soft 3‑point; white seamless; soft contact shadow.
Constraints: no extra props, no side views, only intended logos (no unrelated text).
"""

    try:
        result = client.images.edit(
            model="gpt-image-1",
            image=open(base_image_path, "rb"),
            prompt=prompt,
            size="1024x1024",
            quality="high"
        )
    
        if not result or not result.data:
            return None
        image_data = result.data[0]

        os.makedirs("rhythmojis", exist_ok=True)
        temp_path = f"rhythmojis/temp_{uuid.uuid4().hex}.png"
        if not _save_result_image(image_data, temp_path):
            return None, None
        
        # Remove background
        with open(temp_path, 'rb') as input_file:
            input_data = input_file.read()
            output_data = remove(input_data)
        
        # Save final image without background
        out_path = f"rhythmojis/lego_{uuid.uuid4().hex}.png"
        with open(out_path, 'wb') as output_file:
            output_file.write(output_data)
        
        # Clean up temp file
        os.remove(temp_path)
        
        return out_path, f"/{out_path}"
    except Exception as e:
        print("Edit step failed:", e)
        return None

# Flask API
app = Flask(__name__)
CORS(app)

@app.route('/api/generate', methods=['POST'])
def api_generate():
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error":"Invalid JSON"}), 400
    
    # log time start
    start_time = time.time()

    print("music data sent:\n", json.dumps(data, indent=2,ensure_ascii=False))
    artists = normalize_text_list(data.get('artists') or [])
    # Normalize songs to enrich style planning
    def _normalize_songs(vals):
        out = []
        for v in vals or []:
            if isinstance(v, str):
                t = v.strip()
                if t:
                    out.append(t)
            elif isinstance(v, dict):
                title = str(v.get('title') or '').strip()
                artist = str(v.get('artist') or '').strip()
                if title and artist:
                    out.append(f"{title} — {artist}")
                elif title or artist:
                    out.append(title or artist)
            else:
                s = str(v).strip()
                if s:
                    out.append(s)
        return out
    songs = _normalize_songs(data.get('songs') or [])
    genres = []
    for g in (data.get('genres') or []):
        if isinstance(g, dict):
            genres.append(str(g.get('genre') or '').strip())
        else:
            genres.append(str(g))
    animal = (data.get('animal') or '').strip() or None
    creative = bool(data.get('creative'))
    base_path = data.get('base_image') or "base_pngs/base_lego_realistic.png"
    if not os.path.exists(base_path):
        return jsonify({"error": f"Base image not found at {base_path}"}), 400

    # Keep temperature stable and high for creativity
    plan = generate_style_plan(
        genres,
        artists,
        songs=songs,
        temperature=float(os.getenv('STYLE_TEMP', '1.6')),
        top_p=float(os.getenv('STYLE_TOP_P', '0.97'))
    )
    if animal:
        plan['animal'] = animal
    print("style plan:", plan)
    # file_path, url_path = edit_pipeline_from_plan(base_path, plan)
    file_path, url_path = generate_rhythmoji(base_path, plan)
    
    # log time end
    end_time = time.time()
    print(f"Time taken: {end_time - start_time} seconds")
    if not file_path:
        return jsonify({"error":"Image generation failed"}), 500
    return jsonify({"image_url": url_path, "file_path": file_path})

@app.route('/api/search/artist')
def api_search_artist():
    q = (request.args.get('q') or '').strip()
    if not q or len(q) < 2:
        return jsonify({"artists": []})
    try:
        items = _musicbrainz_search_artists(q, limit=int(request.args.get('limit') or 25))
        return jsonify({"artists": items})
    except Exception as e:
        return jsonify({"error": str(e), "artists": []}), 500

def _musicbrainz_search_artists(q: str, limit: int = 25):
    url = (
        "https://musicbrainz.org/ws/2/artist/"
        f"?query={quote_plus(q)}&fmt=json&limit={int(limit)}&inc=aliases+url-rels"
    )
    headers = {
        "User-Agent": os.getenv("MB_USER_AGENT", "Rhythmoji/1.0 (artist-search)"),
        "Accept": "application/json"
    }
    resp = requests.get(url, headers=headers, timeout=6)
    resp.raise_for_status()
    data = resp.json()
    out = []
    artists = data.get('artists', [])
    for idx, a in enumerate(artists[:limit]):
        name = a.get('name') or ''
        if not name:
            continue
        aliases = []
        for al in (a.get('aliases') or []):
            if isinstance(al, dict) and al.get('name'):
                aliases.append(str(al['name']))
            elif isinstance(al, str):
                aliases.append(al)
        image_url = None
        # Try to enrich image from linked Wikidata/Wikipedia
        try:
            rels = a.get('relations') or []
            qid = _mb_relations_qid(rels)
            if qid:
                image_url = _wikidata_image_for_qid(qid) or image_url
            if not image_url:
                wp = _mb_relations_wikipedia(rels)
                if wp:
                    image_url = _wikipedia_image_for_title(wp.get('lang') or 'en', wp.get('title') or '') or image_url
            if not image_url and idx < 10:
                # Final fallback: search Wikidata by name for top results only
                image_url = _wikidata_image_for_name(name)
            if not image_url and idx < 10:
                # Extra fallback: iTunes search artist artwork
                image_url = _itunes_artist_image_for_name(name)
        except Exception:
            pass
        out.append({
            "name": name,
            "image_url": image_url,
            "aliases": aliases[:10]
        })
    return out

def _mb_relations_qid(relations) -> str | None:
    try:
        for r in relations or []:
            url = (r.get('url') or {}).get('resource') or ''
            if 'wikidata.org/wiki/Q' in url or 'wikidata.org/entity/Q' in url:
                m = re.search(r'/Q(\d+)', url)
                if m:
                    return f"Q{m.group(1)}"
    except Exception:
        return None
    return None

def _mb_relations_wikipedia(relations) -> dict | None:
    try:
        for r in relations or []:
            url = (r.get('url') or {}).get('resource') or ''
            m = re.search(r'https?://([a-z]+)\.wikipedia\.org/wiki/([^?#]+)', url)
            if m:
                return { 'lang': m.group(1), 'title': re.sub(r'_', ' ', requests.utils.unquote(m.group(2))) }
    except Exception:
        return None
    return None

def _commons_file_url(filename: str, width: int = 256) -> str:
    if not filename:
        return None
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{quote_plus(filename)}?width={int(width)}"

@lru_cache(maxsize=2048)
def _wikidata_image_for_qid(qid: str) -> str | None:
    if not qid:
        return None
    try:
        url = (
            "https://www.wikidata.org/w/api.php"
            f"?action=wbgetentities&ids={quote_plus(qid)}&props=claims&format=json"
        )
        headers = { "Accept": "application/json", "User-Agent": os.getenv("MB_USER_AGENT", "Rhythmoji/1.0 (image) ") }
        resp = requests.get(url, headers=headers, timeout=6)
        resp.raise_for_status()
        data = resp.json()
        claims = (data.get('entities') or {}).get(qid, {}).get('claims') or {}
        p18 = None
        if 'P18' in claims and claims['P18']:
            snak = claims['P18'][0].get('mainsnak') or {}
            datavalue = snak.get('datavalue') or {}
            p18 = datavalue.get('value')
        return _commons_file_url(p18) if p18 else None
    except Exception:
        return None

@lru_cache(maxsize=2048)
def _wikidata_image_for_name(name: str) -> str | None:
    if not name:
        return None
    try:
        s_url = (
            "https://www.wikidata.org/w/api.php"
            f"?action=wbsearchentities&search={quote_plus(name)}&language=en&format=json&limit=1"
        )
        headers = { "Accept": "application/json", "User-Agent": os.getenv("MB_USER_AGENT", "Rhythmoji/1.0 (image) ") }
        s = requests.get(s_url, headers=headers, timeout=6)
        s.raise_for_status()
        j = s.json()
        qid = (j.get('search') or [{}])[0].get('id')
        if not qid:
            return None
        return _wikidata_image_for_qid(qid)
    except Exception:
        return None

@lru_cache(maxsize=4096)
def _wikipedia_image_for_title(lang: str, title: str) -> str | None:
    if not title:
        return None
    try:
        api = f"https://{lang}.wikipedia.org/w/api.php"
        params = {
            'action': 'query',
            'prop': 'pageimages',
            'format': 'json',
            'piprop': 'thumbnail',
            'pithumbsize': '256',
            'titles': title
        }
        resp = requests.get(api, params=params, headers={ 'Accept': 'application/json', 'User-Agent': os.getenv('MB_USER_AGENT', 'Rhythmoji/1.0 (image)') }, timeout=6)
        resp.raise_for_status()
        data = resp.json()
        pages = (data.get('query') or {}).get('pages') or {}
        for _, page in pages.items():
            thumb = (page.get('thumbnail') or {}).get('source')
            if thumb:
                return thumb
        return None
    except Exception:
        return None

@lru_cache(maxsize=2048)
def _itunes_artist_image_for_name(name: str) -> str | None:
    try:
        url = (
            "https://itunes.apple.com/search"
            f"?term={quote_plus(name)}&entity=musicArtist&limit=1&country=us"
        )
        resp = requests.get(url, headers={ 'Accept': 'application/json', 'User-Agent': os.getenv('MB_USER_AGENT', 'Rhythmoji/1.0 (image)') }, timeout=6)
        resp.raise_for_status()
        data = resp.json()
        item = (data.get('results') or [None])[0]
        if not item:
            return None
        art = item.get('artworkUrl100') or item.get('artworkUrl60')
        if not art:
            return None
        return art.replace('100x100bb.jpg', '200x200bb.jpg')
    except Exception:
        return None

@app.route('/api/search/song')
def api_search_song():
    q = (request.args.get('q') or '').strip()
    if not q or len(q) < 2:
        return jsonify({"songs": []})
    try:
        items = _musicbrainz_search_songs(q, limit=int(request.args.get('limit') or 25))
        return jsonify({"songs": items})
    except Exception as e:
        return jsonify({"error": str(e), "songs": []}), 500

def _musicbrainz_search_songs(q: str, limit: int = 25):
    url = (
        "https://musicbrainz.org/ws/2/recording/"
        f"?query={quote_plus(q)}&fmt=json&limit={int(limit)}&inc=artist-credits+releases"
    )
    headers = {
        "User-Agent": os.getenv("MB_USER_AGENT", "Rhythmoji/1.0 (song-search)"),
        "Accept": "application/json"
    }
    resp = requests.get(url, headers=headers, timeout=8)
    resp.raise_for_status()
    data = resp.json()
    out = []
    for r in data.get('recordings', [])[:limit]:
        title = r.get('title') or ''
        if not title:
            continue
        # Join artist-credit names
        artists = []
        for ac in (r.get('artist-credit') or []):
            if isinstance(ac, dict):
                n = ac.get('name') or (ac.get('artist') or {}).get('name')
                if n:
                    artists.append(str(n))
            elif isinstance(ac, str):
                artists.append(ac)
        artist = ", ".join([a for a in artists if a])
        # Try to provide a cover art URL based on first release if present
        image_url = None
        rels = r.get('releases') or []
        if rels:
            mbid = rels[0].get('id')
            if mbid:
                image_url = f"https://coverartarchive.org/release/{mbid}/front-250"
        out.append({
            "title": title,
            "artist": artist,
            "image_url": image_url
        })
    return out

@app.route('/rhythmojis/<path:filename>')
def serve_rhythmoji(filename):
    return send_from_directory('rhythmojis', filename, as_attachment=False)

if __name__ == '__main__':
    port = int(os.getenv('PORT','5001'))
    app.run(host='0.0.0.0', port=port, debug=True)
