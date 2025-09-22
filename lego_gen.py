from openai import OpenAI
import base64, os, uuid, random, json
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment, allowing .env to override existing env vars for dev convenience
load_dotenv(override=True)

api_key = os.getenv("OPENAI_API_KEY")
assert api_key, "OPENAI_API_KEY is missing"
client = OpenAI(api_key=api_key)

ANIMALS = [
    "fox", "dog", "cat", "panda", "tiger", "bear", "owl", "wolf",
    "rabbit", "koala", "penguin", "lion", "red panda", "otter", "raccoon"
]

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

def build_prompt(artists, songs, animal=None):
    artists_txt = ", ".join(artists[:3]) if artists else ""
    # Combine song title and artist for richer vibe
    song_bits = []
    for s in (songs or [])[:5]:
        if " - " in s:
            song_bits.append(s)
        else:
            song_bits.append(s)
    songs_txt = ", ".join(song_bits)
    animal_txt = animal or random.choice(ANIMALS)

    guidance = (
        "Create a front-facing LEGO minifigure portrait in true LEGO style (stud head, minifig proportions). "
        f"Replace the head with a LEGO-style {animal_txt} head (stylized, not hyper-realistic). "
        "Keep a straight-on pose. Use realistic lighting and subtle neutral background. "
        "No text or logos. No extra characters. "
        "Based on the user's music taste, choose 2–3 cohesive fashion elements (outfit, accessories, color palette) that match the vibe. "
        "Avoid duplicates; keep it modern and tasteful."
    )
    context = (
        (f" Artists: {artists_txt}." if artists_txt else "") +
        (f" Songs: {songs_txt}." if songs_txt else "")
    )
    return guidance + context

def generate_rhythmoji(base_image_path, artists, songs, animal=None):
    os.makedirs("rhythmojis", exist_ok=True)
    prompt = build_prompt(artists, songs, animal=animal)
    try:
        result = client.images.edit(
            model="gpt-image-1",
            image=open(base_image_path, "rb"),
            prompt=prompt,
            size="1024x1024",
            quality="high",
        )

        if result.data and len(result.data) > 0:
            image_data = result.data[0]
            out_name = f"lego_{uuid.uuid4().hex}.png"
            output_filename = os.path.join("rhythmojis", out_name)

            if getattr(image_data, 'b64_json', None):
                with open(output_filename, "wb") as f:
                    f.write(base64.b64decode(image_data.b64_json))
            elif getattr(image_data, 'url', None):
                response = requests.get(image_data.url)
                response.raise_for_status()
                with open(output_filename, "wb") as f:
                    f.write(response.content)
            else:
                return None, None

            return output_filename, f"/rhythmojis/{out_name}"
        else:
            return None, None
    except Exception as e:
        print(f"Error during API call: {e}")
        print(f"Error type: {type(e)}")
        return None, None


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
