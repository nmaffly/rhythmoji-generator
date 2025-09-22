from openai import OpenAI
import base64, os, uuid, json, tempfile
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

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

def generate_style_plan(genres, artists):
    sys = ("Return strict JSON with keys: animal, upper, lower, shoes, accessory. "
           "Pick 1 animal (unrelated to genres). Use concise real-world fashion pieces.")
    user = {"genres": (genres or [])[:5], "artists": (artists or [])[:5]}
    try:
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_TEXT_MODEL","gpt-4o-mini"),
            temperature=0.9,
            messages=[{"role":"system","content":sys},{"role":"user","content":json.dumps(user)}]
        )
        content = _strip_code_fences(resp.choices[0].message.content or '{}')
        data = json.loads(content)
        return {
            "animal": str(data.get("animal","fox")),
            "upper": str(data.get("upper","graphic tee")),
            "lower": str(data.get("lower","jeans")),
            "shoes": str(data.get("shoes","sneakers")),
            "accessory": str(data.get("accessory","sunglasses")),
        }
    except Exception as e:
        print("Plan generation failed:", e)
        return {"animal":"fox","upper":"graphic tee","lower":"jeans","shoes":"sneakers","accessory":"sunglasses"}

def edit_pipeline_from_plan(base_image_path, plan):
    masks_dir = os.getenv("MASKS_DIR","base_pngs/masks")
    head_mask = os.path.join(masks_dir,"head.png")
    torso_mask = os.path.join(masks_dir,"torso.png")
    legs_mask = os.path.join(masks_dir,"legs.png")
    acc_mask = os.path.join(masks_dir,"accessory.png")

    current = base_image_path
    # Head
    head_prompt = f"Replace only the head with a LEGO-style {plan['animal']} head. Keep proportions; don't touch torso/legs/background."
    out = _edit_step(current, head_prompt, head_mask if os.path.exists(head_mask) else None)
    current = out or current
    # Torso
    if plan.get('upper'):
        torso_prompt = f"Apply {plan['upper']} to torso/arms adapted to LEGO; only modify torso/arms; keep head/legs unchanged."
        out = _edit_step(current, torso_prompt, torso_mask if os.path.exists(torso_mask) else None)
        current = out or current
    # Legs + shoes
    legs_desc = ", ".join([x for x in [plan.get('lower'), plan.get('shoes')] if x])
    if legs_desc:
        legs_prompt = f"Update legs/feet with: {legs_desc}, adapted to LEGO; only modify legs/feet; keep head/torso unchanged."
        out = _edit_step(current, legs_prompt, legs_mask if os.path.exists(legs_mask) else None)
        current = out or current
    # Accessory
    if plan.get('accessory'):
        acc_prompt = f"Add a subtle {plan['accessory']} accessory adapted to LEGO; avoid altering other regions."
        out = _edit_step(current, acc_prompt, acc_mask if os.path.exists(acc_mask) else None)
        current = out or current

    os.makedirs("rhythmojis", exist_ok=True)
    out_name = f"lego_{uuid.uuid4().hex}.png"
    out_path = os.path.join("rhythmojis", out_name)
    with open(current, 'rb') as src, open(out_path, 'wb') as dst:
        dst.write(src.read())
    return out_path, f"/rhythmojis/{out_name}"

def edit_lego_head(base_image_path, animal_name, mask_path=None, model=None):
    os.makedirs("rhythmojis", exist_ok=True)
    base_prompt = (f"Replace the head with a LEGO-style {animal_name} head that fits naturally. "
                   "Preserve LEGO proportions and straight-on pose; neutral lighting; no text or logos.")
    try:
        if (model or os.getenv("OPENAI_IMAGE_MODEL","")).strip().lower() == "dall-e-3":
            result = client.images.generate(model="dall-e-3",
                                            prompt=(f"Front-facing LEGO minifigure with a LEGO-style {animal_name} head;"
                                                    " LEGO realism; neutral studio background; no text."),
                                            size="1024x1024", quality="hd", response_format="b64_json")
        else:
            if mask_path and os.path.exists(mask_path):
                with open(base_image_path,'rb') as img_f, open(mask_path,'rb') as m_f:
                    result = client.images.edit(model="gpt-image-1", image=img_f, mask=m_f, prompt=base_prompt, size="1024x1024")
            else:
                with open(base_image_path,'rb') as img_f:
                    result = client.images.edit(model="gpt-image-1", image=img_f, prompt=base_prompt, size="1024x1024")
        if not result or not result.data:
            return None, None
        image_data = result.data[0]
        out_name = f"lego_{animal_name.replace(' ','_')}_{uuid.uuid4().hex}.png"
        out_path = os.path.join("rhythmojis", out_name)
        if not _save_result_image(image_data, out_path):
            return None, None
        return out_path, f"/rhythmojis/{out_name}"
    except Exception as e:
        print("Error during API call:", e)
        print("Error type:", type(e))
        return None, None

def generate_rhythmoji(base_image_path, artists, songs, animal=None, model=None):
    plan = generate_style_plan(None, artists)
    if animal:
        plan['animal'] = animal
    try:
        return edit_pipeline_from_plan(base_image_path, plan)
    except Exception as e:
        print("Pipeline failed; fallback to head-only:", e)
        return edit_lego_head(base_image_path, plan.get('animal','fox'))

# Flask API
app = Flask(__name__)
CORS(app)

@app.route('/api/generate', methods=['POST'])
def api_generate():
    try:
        data = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error":"Invalid JSON"}), 400

    print("music data sent:", json.dumps(data, ensure_ascii=False))
    artists = normalize_text_list(data.get('artists') or [])
    genres = []
    for g in (data.get('genres') or []):
        if isinstance(g, dict):
            genres.append(str(g.get('genre') or '').strip())
        else:
            genres.append(str(g))
    animal = (data.get('animal') or '').strip() or None
    base_path = data.get('base_image') or "base_pngs/base_lego_realistic.png"
    if not os.path.exists(base_path):
        return jsonify({"error": f"Base image not found at {base_path}"}), 400

    plan = generate_style_plan(genres, artists)
    if animal:
        plan['animal'] = animal
    print("style plan:", plan)
    file_path, url_path = edit_pipeline_from_plan(base_path, plan)
    if not file_path:
        return jsonify({"error":"Image generation failed"}), 500
    return jsonify({"image_url": url_path, "file_path": file_path})

@app.route('/rhythmojis/<path:filename>')
def serve_rhythmoji(filename):
    return send_from_directory('rhythmojis', filename, as_attachment=False)

if __name__ == '__main__':
    port = int(os.getenv('PORT','5001'))
    app.run(host='0.0.0.0', port=port, debug=True)
