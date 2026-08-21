"""
image_store.py – Save and serve captured detection images per user.
"""
import os, base64, json, datetime
from database import query

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), '..', 'user_images')
os.makedirs(UPLOAD_DIR, exist_ok=True)

def save_image(user_id, image_b64, detected_object, confidence,
               distance_cm=0, colors=None, language='en', notes=''):
    try:
        folder = os.path.join(UPLOAD_DIR, str(user_id))
        os.makedirs(folder, exist_ok=True)
        ts       = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"{user_id}_{ts}.jpg"
        filepath = os.path.join(folder, filename)
        img_data = base64.b64decode(image_b64)
        with open(filepath, 'wb') as f:
            f.write(img_data)
        colors_json = json.dumps(colors or [])
        image_id = query(
            """INSERT INTO user_images
               (user_id, filename, detected_object, confidence,
                distance_cm, colors, language, notes)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (user_id, filename, detected_object,
             round(float(confidence), 4), int(distance_cm or 0),
             colors_json, language, notes)
        )
        return {"ok": True, "image_id": image_id, "filename": filename}
    except Exception as e:
        print(f"save_image error: {e}")
        return {"ok": False, "error": str(e)}

def get_user_images(user_id, page=1, per_page=20):
    offset = (page-1)*per_page
    rows = query(
        """SELECT id, filename, detected_object, confidence,
                  distance_cm, colors, notes,
                  DATE_FORMAT(created_at,'%%Y-%%m-%%d %%H:%%i:%%s') AS created_at
           FROM user_images WHERE user_id=%s
           ORDER BY created_at DESC LIMIT %s OFFSET %s""",
        (user_id, per_page, offset), fetchall=True
    ) or []
    for r in rows:
        try: r['colors'] = json.loads(r['colors']) if r['colors'] else []
        except: r['colors'] = []
        r['url'] = f"/uploads/{user_id}/{r['filename']}"
    total = (query("SELECT COUNT(*) AS c FROM user_images WHERE user_id=%s",
                   (user_id,), fetchone=True) or {}).get('c', 0)
    return {"ok": True, "images": rows, "total": total, "page": page}

def get_image_b64(user_id, filename):
    """Read image from disk and return as base64 string."""
    filepath = os.path.join(UPLOAD_DIR, str(user_id), filename)
    if os.path.exists(filepath):
        with open(filepath, 'rb') as f:
            return base64.b64encode(f.read()).decode()
    return None

def update_image_notes(image_id, user_id, notes):
    query("UPDATE user_images SET notes=%s WHERE id=%s AND user_id=%s",
          (notes, image_id, user_id))
    return {"ok": True}

def delete_image(image_id, user_id):
    row = query("SELECT filename FROM user_images WHERE id=%s AND user_id=%s",
                (image_id, user_id), fetchone=True)
    if not row: return {"ok": False, "error": "Not found"}
    filepath = os.path.join(UPLOAD_DIR, str(user_id), row['filename'])
    if os.path.exists(filepath): os.remove(filepath)
    query("DELETE FROM user_images WHERE id=%s AND user_id=%s", (image_id, user_id))
    return {"ok": True}