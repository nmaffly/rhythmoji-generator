from openai import OpenAI
import base64, os, uuid, json, tempfile
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment, allowing .env to override existing env vars for dev convenience
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
            # accept {name}, {title,artist}, etc.
            name = v.get('name') or v.get('title') or v.get('artist') or ''
            name = str(name).strip()
        else:
            name = str(v).strip()
        if name:
            out.append(name)
    return out

def choose_animal_and_fashion(artists, songs):
    """Use an LLM to pick a fitting animal head and 2–3 real fashion pieces."""
    sys = (
        "You help design a LEGO-style minifigure inspired by music tastes. "
        "Pick exactly one animal for the head that fits the vibe, and 2–3 real-world fashion pieces (brands/styles). "
        "Output strict JSON with keys: animal (string), fashion (array of 2-3 short strings)."
    )
    user = {
        "artists": artists[:3],
        "songs": songs[:5],
    }
    try:
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_TEXT_MODEL", "gpt-4o-mini"),
            temperature=1.2,
            messages=[
                {"role": "system", "content": sys},
                {"role": "user", "content": json.dumps(user)}
            ]
        )
        content = resp.choices[0].message.content.strip()
        data = json.loads(content)
        animal = str(data.get("animal", "fox")).strip() or "fox"
        fashion = [str(x).strip() for x in (data.get("fashion") or []) if str(x).strip()]
        if len(fashion) == 0:
            fashion = ["bomber jacket", "Levi's 501 jeans"]
    except Exception:
        animal = "fox"
        fashion = ["bomber jacket", "Levi's 501 jeans"]
    return animal, fashion

def build_prompt(artists, songs, animal=None):
    artists_txt = ", ".join(artists[:3]) if artists else ""
    # Combine song title and artist for richer vibe
    song_bits = []
    for s in (songs or [])[:5]:
        song_bits.append(s)
    songs_txt = ", ".join(song_bits)

    # Let the LLM pick the animal/fashion if not provided
    chosen_animal, fashion = choose_animal_and_fashion(artists, songs)
    animal_txt = (animal or chosen_animal).strip()
    fashion_txt = "; ".join(fashion[:3])

    guidance = (
        "Create a front-facing LEGO minifigure portrait in true LEGO realism (authentic studs, minifig proportions). "
        f"Replace the head with a LEGO-style {animal_txt} head (stylized but clearly {animal_txt}, not hyper-realistic). "
        "Use realistic lighting and a subtle neutral studio background. "
        "No text, no logos, no extra characters. Keep the pose straight-on. "
        "Incorporate real fashion references adapted into LEGO form: " + fashion_txt + ". "
        "Ensure the outfit is cohesive and modern; avoid clutter."
    )
    context = (
        (f" Artists: {artists_txt}." if artists_txt else "") +
        (f" Songs: {songs_txt}." if songs_txt else "")
    )
    return guidance + context

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

def _edit_step(input_path, prompt, mask_path=None):
    """Run a single images.edit step; returns path to new temp file or None on failure."""
    try:
        if mask_path and os.path.exists(mask_path):
            with open(input_path, 'rb') as img_f, open(mask_path, 'rb') as mask_f:
                result = client.images.edit(
                    model=os.getenv("OPENAI_EDIT_MODEL", "gpt-image-1"),
                    prompt=prompt,
                    image=img_f,
                    mask=mask_f,
                    size="1024x1024",
                    response_format="b64_json",
                )
        else:
            with open(input_path, 'rb') as img_f:
                result = client.images.edit(
                    model=os.getenv("OPENAI_EDIT_MODEL", "gpt-image-1"),
                    prompt=prompt,
                    image=img_f,
                    size="1024x1024",
                    response_format="b64_json",
                )
        if not result.data:
            return None
        image_data = result.data[0]
        out_tmp = os.path.join(tempfile.gettempdir(), f"rhythm_{uuid.uuid4().hex}.png")
        ok = _save_result_image(image_data, out_tmp)
        return out_tmp if ok else None
    except Exception as e:
        print("Edit step failed:", e)
        return None

def _categorize_fashion(items):
    tops_kw = ["jacket","bomber","hoodie","tee","t-shirt","shirt","sweater","coat","blazer","cardigan","vest","parka"]
    bottoms_kw = ["jeans","pants","trouser","cargos","cargo","khakis","skirt","shorts"]
    shoes_kw = ["boot","boots","sneaker","sneakers","shoe","loafers","loafer","heel","heels","jordan","adidas","nike","timberland","doc martens","dr. martens"]
    accessories_kw = ["hat","cap","beanie","glasses","sunglasses","chain","belt","watch","scarf"]

    def has_kw(text, kws):
        t = text.lower()
        return any(k in t for k in kws)

    top = bottom = shoe = accessory = None
    for it in items:
        if not top and has_kw(it, tops_kw): top = it
        elif not bottom and has_kw(it, bottoms_kw): bottom = it
        elif not shoe and has_kw(it, shoes_kw): shoe = it
        elif not accessory and has_kw(it, accessories_kw): accessory = it
    # Fill fallbacks
    if not top and items: top = items[0]
    if not bottom and len(items) > 1: bottom = items[1]
    if not shoe and len(items) > 2: shoe = items[2]
    return top, bottom, shoe, accessory

def generate_rhythmoji(base_image_path, artists, songs, animal=None):
    """
    Multi-step edit pipeline with masks to minimize hallucination.
    Expected masks (optional): base_pngs/masks/head.png, torso.png, legs.png, accessory.png
    """
    os.makedirs("rhythmojis", exist_ok=True)
    # Decide animal and fashion via LLM
    chosen_animal, fashion = choose_animal_and_fashion(artists, songs)
    animal_txt = (animal or chosen_animal).strip()
    top, bottom, shoe, accessory = _categorize_fashion(fashion)

    # Masks
    masks_dir = os.getenv("MASKS_DIR", "base_pngs/masks")
    head_mask = os.path.join(masks_dir, "head.png")
    torso_mask = os.path.join(masks_dir, "torso.png")
    legs_mask = os.path.join(masks_dir, "legs.png")
    acc_mask = os.path.join(masks_dir, "accessory.png")

    current = base_image_path

    # Step 1: Animal head swap
    head_prompt = (
        f"Replace ONLY the head with a LEGO-style {animal_txt} head; keep minifig proportions, studs. "
        "Do not touch torso, arms, legs, or background. Straight-on pose, LEGO realism, neutral background."
    )
    out = _edit_step(current, head_prompt, head_mask if os.path.exists(head_mask) else None)
    current = out or current

    # Step 2: Torso/top
    if top:
        torso_prompt = (
            f"Apply a {top} as the upper outfit, adapted to LEGO minifigure styling (prints/shapes). "
            "Only modify torso/arms region. Keep head as-is, keep legs/feet unchanged. LEGO realism."
        )
        out = _edit_step(current, torso_prompt, torso_mask if os.path.exists(torso_mask) else None)
        current = out or current

    # Step 3: Legs/feet
    legs_desc = ", ".join([x for x in [bottom, shoe] if x])
    if legs_desc:
        legs_prompt = (
            f"Update legs/feet with: {legs_desc}, adapted to LEGO. Only modify legs/feet. Keep head/torso unchanged. LEGO realism."
        )
        out = _edit_step(current, legs_prompt, legs_mask if os.path.exists(legs_mask) else None)
        current = out or current

    # Step 4: Accessory (optional)
    if accessory:
        acc_prompt = (
            f"Add a subtle {accessory} as accessory, adapted to LEGO. If no mask, place minimally without changing other regions."
        )
        out = _edit_step(current, acc_prompt, acc_mask if os.path.exists(acc_mask) else None)
        current = out or current

    # Save final
    out_name = f"lego_{uuid.uuid4().hex}.png"
    output_filename = os.path.join("rhythmojis", out_name)
    # If current is still base, force a single overall enhancement to ensure an output asset
    if current == base_image_path:
        enhance_prompt = (
            f"Create a LEGO-style portrait with a {animal_txt} head and cohesive outfit inspired by the user's music. Maintain LEGO realism."
        )
        out = _edit_step(current, enhance_prompt, None)
        current = out or current
    # Copy final temp to output file
    with open(current, 'rb') as src, open(output_filename, 'wb') as dst:
        dst.write(src.read())
    return output_filename, f"/rhythmojis/{out_name}"


# Minimal Flask API for the frontend
app = Flask(__name__)
CORS(app)

@app.route('/api/generate', methods=['POST'])
def api_generate():
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    artists_in = data.get('artists') or []
    songs_in = data.get('songs') or []
    animal = data.get('animal')  # optional override

    artists = normalize_text_list(artists_in)
    # For songs, prefer "title - artist" if dict
    songs = []
    for s in songs_in:
        if isinstance(s, dict):
            title = str(s.get('title') or '').strip()
            art = str(s.get('artist') or '').strip()
            if title and art:
                songs.append(f"{title} - {art}")
            elif title or art:
                songs.append(title or art)
        else:
            songs.append(str(s))

    if len(artists) == 0 or len(songs) == 0:
        return jsonify({"error": "Provide at least one artist and one song"}), 400

    base_path = data.get('base_image') or "base_pngs/base_lego_realistic.png"
    if not os.path.exists(base_path):
        return jsonify({"error": f"Base image not found at {base_path}"}), 400

    file_path, url_path = generate_rhythmoji(base_path, artists, songs, animal=animal)
    if not file_path:
        return jsonify({"error": "Image generation failed"}), 500
    return jsonify({"image_url": url_path, "file_path": file_path})

@app.route('/rhythmojis/<path:filename>')
def serve_rhythmoji(filename):
    return send_from_directory('rhythmojis', filename, as_attachment=False)


if __name__ == "__main__":
    # Run the API server for local dev
    port = int(os.getenv("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=True)
