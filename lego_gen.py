from openai import OpenAI
import base64, os, uuid, json
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

def edit_lego_head(base_image_path: str, animal_name: str, mask_path: str | None = None, model: str | None = None):
    """
    Minimal, single-step edit of the base LEGO image to swap the head to a chosen animal.
    - base_image_path: path to the base LEGO PNG
    - animal_name: e.g., "red panda", "bear" (from client)
    - mask_path: optional mask PNG for the head region; if present, the edit will be restricted to the mask
    - model: choose image model; defaults to gpt-image-1 for edits, or 'dall-e-3' to generate from scratch
    Returns (file_path, url_path) or (None, None) on failure.
    """
    os.makedirs("rhythmojis", exist_ok=True)

    # Simple, non-hardcoded prompt
    base_prompt = (
        f"Replace the head with a LEGO-style {animal_name} head that fits naturally. "
        "Preserve true LEGO proportions and straight-on pose. Keep realistic, neutral studio lighting. "
        "Do not add text or logos. Avoid changing torso or legs unless necessary to integrate the head."
    )

    try:
        # If caller requests DALL·E, generate from scratch instead of editing
        if (model or os.getenv("OPENAI_IMAGE_MODEL", "")).strip().lower() == "dall-e-3":
            result = client.images.generate(
                model="dall-e-3",
                prompt=(
                    f"Create a front-facing LEGO minifigure portrait with a LEGO-style {animal_name} head. "
                    "LEGO realism, authentic proportions, neutral studio background, no text or logos."
                ),
                size="1024x1024",
                quality="hd",
                response_format="b64_json",
            )
        else:
            if mask_path and os.path.exists(mask_path):
                with open(base_image_path, "rb") as img_f, open(mask_path, "rb") as m_f:
                    result = client.images.edit(
                        model="gpt-image-1",
                        image=img_f,
                        mask=m_f,
                        prompt=base_prompt,
                        size="1024x1024",
                    )
            else:
                with open(base_image_path, "rb") as img_f:
                    result = client.images.edit(
                        model="gpt-image-1",
                        image=img_f,
                        prompt=base_prompt,
                        size="1024x1024",
                    )

        if not result or not result.data:
            return None, None

        image_data = result.data[0]
        out_name = f"lego_{animal_name.replace(' ', '_')}_{uuid.uuid4().hex}.png"
        out_path = os.path.join("rhythmojis", out_name)
        if not _save_result_image(image_data, out_path):
            return None, None
        return out_path, f"/rhythmojis/{out_name}"

    except Exception as e:
        print("Error during API call:", e)
        print("Error type:", type(e))
        return None, None

def build_context_prompt(artists: list[str] | None, songs: list[str] | None) -> str:
    ctx = []
    if artists:
        ctx.append("Artists: " + ", ".join([str(a) for a in artists][:3]))
    if songs:
        ctx.append("Songs: " + ", ".join([str(s) for s in songs][:5]))
    return (" Inspired by " + "; ".join(ctx) + ".") if ctx else ""

def generate_rhythmoji(base_image_path: str, artists: list[str] | None, songs: list[str] | None, animal: str | None = None, model: str | None = None):
    """
    Minimal single-step generator that either edits the base image (gpt-image-1) or generates from scratch (DALL·E) with a simple prompt.
    """
    os.makedirs("rhythmojis", exist_ok=True)
    animal_name = (animal or "fox").strip()
    context = build_context_prompt(artists, songs)

    if (model or os.getenv("OPENAI_IMAGE_MODEL", "")).strip().lower() == "dall-e-3":
        prompt = (
            f"Create a front-facing LEGO minifigure portrait with a LEGO-style {animal_name} head. "
            "LEGO realism, authentic proportions, neutral studio background, no text or logos." + context
        )
        result = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size="1024x1024",
            quality="hd",
            response_format="b64_json",
        )
        if not result or not result.data:
            return None, None
        image_data = result.data[0]
        out_name = f"lego_{animal_name.replace(' ', '_')}_{uuid.uuid4().hex}.png"
        out_path = os.path.join("rhythmojis", out_name)
        if not _save_result_image(image_data, out_path):
            return None, None
        return out_path, f"/rhythmojis/{out_name}"
    else:
        # Edit mode using base image
        prompt = (
            f"Replace the head with a LEGO-style {animal_name} head that fits naturally. "
            "Preserve true LEGO proportions and straight-on pose. Keep realistic, neutral studio lighting. "
            "Do not add text or logos. Avoid changing torso or legs unless necessary." + context
        )
        with open(base_image_path, "rb") as img_f:
            result = client.images.edit(
                model="gpt-image-1",
                image=img_f,
                prompt=prompt,
                size="1024x1024",
            )
        if not result or not result.data:
            return None, None
        image_data = result.data[0]
        out_name = f"lego_{animal_name.replace(' ', '_')}_{uuid.uuid4().hex}.png"
        out_path = os.path.join("rhythmojis", out_name)
        if not _save_result_image(image_data, out_path):
            return None, None
        return out_path, f"/rhythmojis/{out_name}"


# Minimal Flask API for the frontend
app = Flask(__name__)
CORS(app)

@app.route('/api/generate', methods=['POST'])
def api_generate():
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    artists = normalize_text_list(data.get('artists') or [])
    # Songs can be objects; compress to "title - artist" if possible
    songs = []
    for s in (data.get('songs') or []):
        if isinstance(s, dict):
            t = (s.get('title') or '').strip()
            a = (s.get('artist') or '').strip()
            songs.append(f"{t} - {a}" if t and a else (t or a))
        else:
            songs.append(str(s))
    animal = (data.get('animal') or '').strip() or None
    model = (data.get('model') or os.getenv('OPENAI_IMAGE_MODEL') or '').strip() or None

    base_path = data.get('base_image') or "base_pngs/base_lego_realistic.png"
    if not os.path.exists(base_path):
        return jsonify({"error": f"Base image not found at {base_path}"}), 400

    file_path, url_path = generate_rhythmoji(base_path, artists, songs, animal=animal, model=model)
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
