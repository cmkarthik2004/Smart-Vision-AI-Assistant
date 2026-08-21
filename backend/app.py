"""
Smart Vision AI Assistant - Final Version with Smart Chat
"""
from email.mime import message
import os, base64, datetime, json, torch


_orig = torch.load
def _safe(f, map_location=None, pickle_module=None, **kw):
    kw['weights_only'] = False
    return _orig(f, map_location=map_location, pickle_module=pickle_module, **kw)
torch.load = _safe
os.environ['PYTORCH_ENABLE_WEIGHTS_ONLY_LOAD'] = '0'

import cv2, numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from detection      import ObjectDetector
from ocr_handler    import OCRHandler
from color_detector import get_object_colour
from auth           import register_user, login_user, validate_token, logout_user
from database       import query
from image_store    import save_image, get_user_images, update_image_notes, delete_image
from feedback       import submit_feedback, get_user_feedback
import re
import threading
import urllib.parse
import urllib.request
import json as json_stdlib
# Add after: import json as json_stdlib
from deep_translator import GoogleTranslator
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app, supports_credentials=True)

print("\n" + "="*50)
print("  Smart Vision AI Assistant")
print("="*50)

detector    = ObjectDetector()
ocr_handler = OCRHandler()

CLAUDE_KEY = os.getenv('ANTHROPIC_API_KEY','')
claude_client = None
if CLAUDE_KEY:
    try:
        import anthropic
        claude_client = anthropic.Anthropic(api_key=CLAUDE_KEY)
        print("  Claude AI ready")
    except ImportError: pass

HEIGHTS_CM = {
    "person":170,"car":150,"truck":250,"bus":320,"motorcycle":110,
    "bicycle":100,"dog":55,"cat":35,"bottle":25,"chair":80,
    "laptop":35,"cell phone":15,"book":25,"cup":12,
    "traffic light":90,"fire hydrant":75,"stop sign":75,"bench":90,
    "backpack":50,"handbag":35,"umbrella":100,"suitcase":60,
    "clock":30,"vase":30,"tv":80,"keyboard":3,"mouse":6,
    "remote":20,"couch":90,"bed":60,"dining table":75,
    "toilet":70,"microwave":35,"oven":90,"refrigerator":180,
    "apple":8,"banana":20,"orange":8,"bowl":10,"default":50
}

# Rich object knowledge base for smart offline chat
# OBJECT_KNOWLEDGE = {
#     "person": {
#         "what": "A human being detected by the camera.",
#         "uses": "People are detected for safety, counting, or interaction purposes.",
#         "facts": ["YOLOv8 detects people with high accuracy", "Distance is calculated using average human height of 170cm", "Multiple people can be detected simultaneously"],
#         "safety": "Maintain appropriate distance in public spaces."
#     },
#     "cell phone": {
#         "what": "A mobile phone / smartphone.",
#         "uses": "Communication, photography, internet browsing, apps.",
#         "facts": ["Average smartphone is 15cm tall", "Most people check their phone 96 times a day", "First smartphone was IBM Simon in 1994"],
#         "safety": "Avoid using while driving. Blue light can affect sleep."
#     },
#     "laptop": {
#         "what": "A portable personal computer.",
#         "uses": "Work, study, entertainment, programming, design.",
#         "facts": ["Average laptop weighs 1.5-2.5 kg", "Battery typically lasts 4-8 hours", "First laptop was Osborne 1 in 1981"],
#         "safety": "Take breaks every 20 minutes. Keep ventilation clear."
#     },
#     "bottle": {
#         "what": "A container for liquids, usually plastic or glass.",
#         "uses": "Storing water, beverages, chemicals, medicines.",
#         "facts": ["1 million plastic bottles sold per minute worldwide", "Glass bottles can be recycled endlessly", "Plastic bottles take 450 years to decompose"],
#         "safety": "Check expiry dates. Don't reuse single-use plastic bottles."
#     },
#     "cup": {
#         "what": "A small container for drinking beverages.",
#         "uses": "Tea, coffee, water, juice drinking.",
#         "facts": ["Average person drinks 3-4 cups of tea/coffee daily", "Ceramic cups keep drinks warm longer", "Paper cups were invented in 1907"],
#         "safety": "Check temperature before drinking hot beverages."
#     },
#     "chair": {
#         "what": "A piece of furniture for sitting.",
#         "uses": "Seating at desks, dining tables, offices, homes.",
#         "facts": ["Ergonomic chairs reduce back pain by 60%", "First folding chair dates to ancient Egypt", "Average office worker sits 10 hours per day"],
#         "safety": "Sit with back straight. Take standing breaks every hour."
#     },
#     "book": {
#         "what": "A written or printed work consisting of pages bound together.",
#         "uses": "Reading, learning, reference, entertainment.",
#         "facts": ["First printed book was Gutenberg Bible in 1455", "Average book has 250-300 pages", "Reading 20 minutes/day = 1.8 million words/year"],
#         "safety": "Read in good light to protect your eyes."
#     },
#     "dog": {
#         "what": "A domesticated mammal, common household pet.",
#         "uses": "Companionship, security, working dogs, therapy.",
#         "facts": ["Dogs have 300 million smell receptors (humans have 6 million)", "A dog's nose print is unique like a human fingerprint", "Dogs can understand ~250 words and gestures"],
#         "safety": "Always ask before petting unknown dogs. Keep vaccinations updated."
#     },
#     "cat": {
#         "what": "A small domesticated carnivorous mammal.",
#         "uses": "Companionship, pest control.",
#         "facts": ["Cats sleep 12-16 hours per day", "A cat's purr vibrates at 25-150 Hz, which promotes healing", "Cats can jump 6 times their body length"],
#         "safety": "Keep litter box clean. Regular vet checkups important."
#     },
#     "car": {
#         "what": "A four-wheeled motor vehicle for transportation.",
#         "uses": "Personal transport, cargo delivery, road trips.",
#         "facts": ["Average car has 30,000 parts", "Cars are parked 95% of their lifetime", "Electric cars have only 20 moving parts vs 200 in combustion engine"],
#         "safety": "Always wear seatbelt. Don't use phone while driving."
#     },
#     "tv": {
#         "what": "A television set for watching video content.",
#         "uses": "Entertainment, news, sports, streaming.",
#         "facts": ["Average person watches 4.5 hours of TV per day", "First color TV broadcast was in 1954", "4K TV has 4x the resolution of HD"],
#         "safety": "Sit at least 2 metres away. Limit screen time before bed."
#     },
#     "keyboard": {
#         "what": "An input device for computers with keys for typing.",
#         "uses": "Typing text, coding, gaming, shortcuts.",
#         "facts": ["QWERTY layout invented in 1878 for typewriters", "Average keyboard has 104 keys", "Mechanical keyboards last 50-100 million keystrokes"],
#         "safety": "Use wrist rest to prevent carpal tunnel syndrome."
#     },
#     "mouse": {
#         "what": "A computer pointing device for cursor control.",
#         "uses": "Navigating computer interfaces, clicking, dragging.",
#         "facts": ["First mouse invented by Doug Engelbart in 1964", "Gaming mice can track at 16,000 DPI", "Wireless mice use 2.4 GHz radio frequency"],
#         "safety": "Use a mousepad. Take breaks to prevent repetitive strain."
#     },
#     "backpack": {
#         "what": "A bag carried on the back with shoulder straps.",
#         "uses": "Carrying school supplies, travel gear, daily items.",
#         "facts": ["Word 'backpack' first used in 1910s", "Should not exceed 15% of body weight", "Ergonomic backpacks distribute weight evenly"],
#         "safety": "Use both straps. Don't overload — can cause back pain."
#     },
#     "umbrella": {
#         "what": "A folding canopy on a stick used for rain protection.",
#         "uses": "Rain protection, sun shade.",
#         "facts": ["Umbrella invented in ancient China 4000 years ago", "1 billion umbrellas sold per year globally", "'Brolly' is British slang for umbrella"],
#         "safety": "Close when not in use near others to avoid eye injuries."
#     },
#     "clock": {
#         "what": "A device for measuring and displaying time.",
#         "uses": "Timekeeping, alarms, scheduling.",
#         "facts": ["First mechanical clock invented in 1275", "Atomic clocks are accurate to 1 second in 300 million years", "Big Ben's clock face is 7 metres in diameter"],
#         "safety": "Check time zones when travelling."
#     },
#     "default": {
#         "what": "An object detected by the AI camera system.",
#         "uses": "Various household, commercial, or industrial uses.",
#         "facts": ["YOLOv8 can detect 80 different object classes", "Detection uses deep learning neural networks", "Confidence score shows how certain the AI is"],
#         "safety": "Always handle objects with appropriate care."
#     }
# }

FOCAL = 700

# def get_object_info(name):
#     """Get knowledge base info for an object."""
#     return OBJECT_KNOWLEDGE.get(name.lower(), OBJECT_KNOWLEDGE["default"])

# def smart_reply(message, obj_name, colour, distance, confidence, language):
#     """
#     Smart context-aware reply in English, Hindi, and Kannada.
#     """
#     msg = message.lower().strip()
#     info = get_object_info(obj_name)
#     col_str  = f" ({colour})" if colour else ""
#     dist_str = f", {distance} सेमी दूर" if distance else ""
#     dist_str_kn = f", {distance} ಸೆಮಿ ದೂರ" if distance else ""

#     # ── HINDI ──────────────────────────────────────────────────
#     if language == 'hi':
#         # greeting
#         if any(w in msg for w in ['हेलो', 'नमस्ते', 'हाय', 'hello', 'hi', 'hey']):
#             return (f"नमस्ते! 👋 मैंने **{obj_name}** पहचाना है"
#                     + (f" — रंग **{colour}**" if colour else "")
#                     + (f", दूरी **{distance} सेमी**" if distance else "")
#                     + f"। आप इसके बारे में क्या जानना चाहते हैं?")
#         # what is
#         if any(w in msg for w in ['क्या है', 'क्या हे', 'बताओ', 'क्या', 'what', 'कौन सा', 'यह क्या']):
#             return (f"यह एक **{obj_name}** है। {info['what']}\n\n"
#                     f"उपयोग: {info['uses']}")
#         # distance
#         if any(w in msg for w in ['दूरी', 'कितनी दूर', 'distance', 'दूर', 'पास']):
#             if distance:
#                 zone = ("बहुत पास" if distance < 50 else "पास" if distance < 100
#                         else "नज़दीक" if distance < 200 else "मध्यम दूरी पर" if distance < 500 else "दूर")
#                 return f"**{obj_name}** आपसे **{distance} सेमी** ({round(distance/100,1)} मीटर) दूर है — यह **{zone}** है।"
#             return f"{obj_name} दिख रहा है लेकिन अभी दूरी माप नहीं सकते। कैमरे को थोड़ा और स्थिर रखें।"
#         # colour
#         if any(w in msg for w in ['रंग', 'color', 'colour', 'कलर', 'रंग क्या']):
#             if colour:
#                 return f"कैमरे में **{obj_name}** का रंग **{colour}** दिख रहा है।"
#             return f"{obj_name} का रंग अभी स्पष्ट नहीं है। बेहतर रोशनी में कैमरा लगाएं।"
#         # facts
#         if any(w in msg for w in ['fact', 'जानकारी', 'बताओ', 'रोचक', 'interesting', 'तथ्य']):
#             facts = info.get('facts', [])
#             if facts:
#                 return f"**{obj_name}** के बारे में रोचक तथ्य:\n\n" + "\n".join(f"• {f}" for f in facts)
#             return f"{obj_name} एक सामान्य वस्तु है। इसके बारे में कुछ और पूछें!"
#         # uses
#         if any(w in msg for w in ['use', 'उपयोग', 'काम', 'purpose', 'function', 'किस काम']):
#             return f"**{obj_name}** का उपयोग: {info['uses']}"
#         # safety
#         if any(w in msg for w in ['safe', 'safety', 'सुरक्षा', 'danger', 'खतरा', 'careful']):
#             return f"**{obj_name}** के लिए सुरक्षा सुझाव: {info['safety']}"
#         # thanks
#         if any(w in msg for w in ['thank', 'धन्यवाद', 'शुक्रिया']):
#             return "आपका स्वागत है! 😊 कुछ और जानना हो तो पूछें।"
#         # default Hindi
#         return (f"मैंने **{obj_name}** पहचाना है{col_str}{dist_str} (विश्वास: {confidence}%)।\n\n"
#                 f"{info['what']}\n\n"
#                 f"आप पूछ सकते हैं:\n• \"यह क्या है?\"\n• \"दूरी कितनी है?\"\n"
#                 f"• \"रंग क्या है?\"\n• \"जानकारी बताओ\"\n• \"सुरक्षित है?\"")

#     # ── KANNADA ────────────────────────────────────────────────
#     if language == 'kn':
#         # greeting
#         if any(w in msg for w in ['ನಮಸ್ಕಾರ', 'ಹಲೋ', 'hello', 'hi', 'hey', 'ಹಾಯ್']):
#             return (f"ನಮಸ್ಕಾರ! 👋 ನಾನು **{obj_name}** ಗುರುತಿಸಿದ್ದೇನೆ"
#                     + (f" — ಬಣ್ಣ **{colour}**" if colour else "")
#                     + (f", ದೂರ **{distance} ಸೆಮಿ**" if distance else "")
#                     + f"। ನೀವು ಏನು ತಿಳಿಯಲು ಬಯಸುತ್ತೀರಿ?")
#         # what is
#         if any(w in msg for w in ['ಏನು', 'ಯಾವುದು', 'what', 'ತಿಳಿಸಿ', 'ಏನಿದು']):
#             return (f"ಇದು **{obj_name}** ಆಗಿದೆ। {info['what']}\n\n"
#                     f"ಉಪಯೋಗ: {info['uses']}")
#         # distance
#         if any(w in msg for w in ['ದೂರ', 'distance', 'ಎಷ್ಟು ದೂರ', 'ಹತ್ತಿರ']):
#             if distance:
#                 zone = ("ತುಂಬಾ ಹತ್ತಿರ" if distance < 50 else "ಹತ್ತಿರ" if distance < 100
#                         else "ಸ್ವಲ್ಪ ದೂರ" if distance < 200 else "ಮಧ್ಯಮ ದೂರ" if distance < 500 else "ದೂರ")
#                 return f"**{obj_name}** ನಿಮ್ಮಿಂದ **{distance} ಸೆಮಿ** ({round(distance/100,1)} ಮೀ) ದೂರದಲ್ಲಿದೆ — ಇದು **{zone}**।"
#             return f"{obj_name} ಕಾಣಿಸುತ್ತಿದೆ ಆದರೆ ದೂರ ಅಳೆಯಲು ಸಾಧ್ಯವಾಗಿಲ್ಲ। ಕ್ಯಾಮೆರಾವನ್ನು ಸ್ಥಿರವಾಗಿ ಹಿಡಿಯಿರಿ।"
#         # colour
#         if any(w in msg for w in ['ಬಣ್ಣ', 'color', 'colour', 'ಯಾವ ಬಣ್ಣ']):
#             if colour:
#                 return f"**{obj_name}** ನ ಬಣ್ಣ **{colour}** ಆಗಿದೆ।"
#             return f"{obj_name} ನ ಬಣ್ಣ ಸ್ಪಷ್ಟವಾಗಿಲ್ಲ। ಉತ್ತಮ ಬೆಳಕಿನಲ್ಲಿ ಪ್ರಯತ್ನಿಸಿ।"
#         # facts
#         if any(w in msg for w in ['fact', 'ಮಾಹಿತಿ', 'ತಿಳಿಸಿ', 'interesting', 'ವಿಷಯ']):
#             facts = info.get('facts', [])
#             if facts:
#                 return f"**{obj_name}** ಬಗ್ಗೆ ಆಸಕ್ತಿಕರ ವಿಷಯಗಳು:\n\n" + "\n".join(f"• {f}" for f in facts)
#             return f"{obj_name} ಒಂದು ಸಾಮಾನ್ಯ ವಸ್ತು। ಇನ್ನಷ್ಟು ಕೇಳಿ!"
#         # uses
#         if any(w in msg for w in ['use', 'ಉಪಯೋಗ', 'ಏನಕ್ಕೆ', 'purpose', 'ಬಳಕೆ']):
#             return f"**{obj_name}** ನ ಉಪಯೋಗ: {info['uses']}"
#         # safety
#         if any(w in msg for w in ['safe', 'safety', 'ಸುರಕ್ಷಿತ', 'ಅಪಾಯ', 'careful']):
#             return f"**{obj_name}** ಗಾಗಿ ಸುರಕ್ಷತಾ ಸಲಹೆ: {info['safety']}"
#         # thanks
#         if any(w in msg for w in ['thank', 'ಧನ್ಯವಾದ', 'ಥ್ಯಾಂಕ್ಸ್']):
#             return "ಧನ್ಯವಾದಗಳು! 😊 ಇನ್ನೇನಾದರೂ ಕೇಳಲು ಮುಕ್ತರಾಗಿ।"
#         # default Kannada
#         return (f"ನಾನು **{obj_name}** ಗುರುತಿಸಿದ್ದೇನೆ{col_str}{dist_str_kn} (ವಿಶ್ವಾಸ: {confidence}%)।\n\n"
#                 f"{info['what']}\n\n"
#                 f"ನೀವು ಕೇಳಬಹುದು:\n• \"ಇದು ಏನು?\"\n• \"ದೂರ ಎಷ್ಟು?\"\n"
#                 f"• \"ಬಣ್ಣ ಏನು?\"\n• \"ಮಾಹಿತಿ ಕೊಡಿ\"\n• \"ಸುರಕ್ಷಿತವೇ?\"")

#     # ── ENGLISH ─────────────────────────────────────────────────
#     if any(w in msg for w in ['what is', 'what are', 'describe', 'explain', 'tell me about', "what's"]):
#         return f"That's a **{obj_name}**{col_str}! {info['what']} {info['uses']}"

#     if any(w in msg for w in ['distance', 'how far', 'far away', 'how close', 'near', 'metres', 'meters', 'cm']):
#         if distance:
#             zone = ("very close ⚠️" if distance < 50 else "close" if distance < 100
#                     else "nearby" if distance < 200 else "medium range" if distance < 500 else "far away")
#             return f"The **{obj_name}** is **{distance} cm** ({round(distance/100,1)}m) away — **{zone}** from the camera."
#         return f"I can see the {obj_name} but couldn't calculate exact distance. Hold the camera steady."

#     if any(w in msg for w in ['colour', 'color', 'what color', 'shade']):
#         if colour:
#             return f"The **{obj_name}** appears to be **{colour}** based on colour analysis."
#         return f"Colour of the {obj_name} isn't clear right now. Try better lighting."

#     if any(w in msg for w in ['fact', 'facts', 'interesting', 'tell me more', 'trivia']):
#         facts = info.get('facts', [])
#         if facts:
#             return f"Facts about **{obj_name}**:\n\n" + "\n".join(f"• {f}" for f in facts)
#         return f"The {obj_name} is a common object. Ask anything specific!"

#     if any(w in msg for w in ['use', 'used for', 'purpose', 'function']):
#         return f"**{obj_name.capitalize()} uses:** {info['uses']}"

#     if any(w in msg for w in ['safe', 'safety', 'danger', 'careful', 'warning']):
#         return f"**Safety tip for {obj_name}:** {info['safety']}"

#     if any(w in msg for w in ['confidence', 'sure', 'accurate', 'certain']):
#         level = "High ✅" if confidence > 80 else "Moderate ⚠️" if confidence > 55 else "Low ❌ — try better lighting"
#         return f"I'm **{confidence}% confident** this is a {obj_name}{col_str}. Confidence: {level}."

#     if any(w in msg for w in ['hi', 'hello', 'hey', 'hii']):
#         return f"Hi! 👋 I can see a **{obj_name}**{col_str}{ ', '+str(distance)+'cm away' if distance else ''}. Ask me: what is it, how far, what colour, facts, uses, or is it safe!"

#     if any(w in msg for w in ['thank', 'thanks', 'thx']):
#         return "You're welcome! 😊 Ask me anything else about what the camera sees."

#     if any(w in msg for w in ['buy', 'price', 'cost', 'purchase']):
#         return f"I can detect the {obj_name} but don't have pricing info. Check Amazon, Flipkart, or local stores!"

#     # Default English
#     return (f"I can see a **{obj_name}**{col_str}{ ' at '+str(distance)+'cm' if distance else ''} ({confidence}% confidence).\n\n"
#             f"{info['what']}\n\n"
#             f"Ask me:\n• \"What is it?\" — description\n• \"How far?\" — distance\n"
#             f"• \"What colour?\" — colour analysis\n• \"Tell me facts\" — trivia\n• \"Is it safe?\" — safety tips")

def calc_distance(bbox, name):
    h = bbox[3]-bbox[1]
    if h < 5: return None
    real_h = HEIGHTS_CM.get(name.lower(), HEIGHTS_CM["default"])
    cm = int((real_h * FOCAL) / h)
    return {"cm":cm,"m":round(cm/100,2)}

def decode_img(fs):
    buf = np.frombuffer(fs.read(), np.uint8)
    return cv2.imdecode(buf, cv2.IMREAD_COLOR)

def encode_img(img):
    _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return base64.b64encode(buf).decode()

def get_token():
    return (request.headers.get('Authorization','').replace('Bearer ','')
            or request.form.get('token','')
            or (request.get_json(silent=True) or {}).get('token','')
            or request.args.get('token',''))

def auth():
    return validate_token(get_token())

def safe_json(obj):
    if isinstance(obj, dict): return {k: safe_json(v) for k,v in obj.items()}
    if isinstance(obj, list): return [safe_json(v) for v in obj]
    if isinstance(obj, (datetime.date, datetime.datetime)): return str(obj)
    return obj

# ── PAGES ─────────────────────────────────────────────────────

@app.route('/')
def landing_page(): return send_from_directory('../frontend','landing.html')
@app.route('/login')
def login_page(): return send_from_directory('../frontend','index.html')

@app.route('/app')
def app_page(): return send_from_directory('../frontend','app.html')

@app.route('/uploads/<user_id>/<filename>')
def serve_upload(user_id, filename):
    folder = os.path.join(os.path.dirname(__file__),'..','user_images',str(user_id))
    return send_from_directory(folder, filename)

@app.route('/api/health')
def health():
    return jsonify({"status":"ok","yolo_loaded":detector.model is not None,"ai_ready":claude_client is not None})

# ── AUTH ──────────────────────────────────────────────────────
@app.route('/api/auth/register', methods=['POST'])
def register():
    d = request.get_json(force=True)
    result = register_user(d.get('user_id',''), d.get('username',''), d.get('password',''))
    return jsonify(result), (200 if result['ok'] else 400)

@app.route('/api/auth/login', methods=['POST'])
def login():
    d = request.get_json(force=True)
    result = login_user(d.get('identifier',''), d.get('password',''))
    return jsonify(result), (200 if result['ok'] else 401)

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    logout_user(get_token())
    return jsonify({"ok":True})

@app.route('/api/auth/me')
def me():
    user = auth()
    if not user: return jsonify({"ok":False}), 401
    return jsonify({"ok":True,"user":dict(user)})

# ── DETECT ────────────────────────────────────────────────────
@app.route('/api/detect', methods=['POST'])
def detect():
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    if 'file' not in request.files: return jsonify({"error":"No file"}), 400
    img = decode_img(request.files['file'])
    if img is None: return jsonify({"error":"Bad image"}), 400

    language = request.form.get('language','en')
    raw      = detector.detect(img)
    enriched = []
    annotated= img.copy()

    for det in raw:
        dist   = calc_distance(det['bbox'], det['name'])
        colour = get_object_colour(img, det['bbox'], det['name'])
        det['distance'] = dist
        det['color']    = colour

        x1,y1,x2,y2 = det['bbox']
        ov = annotated.copy()
        cv2.rectangle(ov,(x1-3,y1-3),(x2+3,y2+3),(0,220,255),5)
        cv2.addWeighted(ov,0.35,annotated,0.65,0,annotated)
        cv2.rectangle(annotated,(x1,y1),(x2,y2),(0,220,255),2)
        for (cx,cy,dx,dy) in [(x1,y1,1,1),(x2,y1,-1,1),(x1,y2,1,-1),(x2,y2,-1,-1)]:
            cv2.line(annotated,(cx,cy),(cx+dx*18,cy),(255,255,255),2)
            cv2.line(annotated,(cx,cy),(cx,cy+dy*18),(255,255,255),2)
        try:
            hx = colour.get('hex','#888888').lstrip('#')
            r2,g2,b2 = int(hx[0:2],16),int(hx[2:4],16),int(hx[4:6],16)
            cv2.circle(annotated,(x2-12,y1+12),9,(b2,g2,r2),-1)
            cv2.circle(annotated,(x2-12,y1+12),9,(255,255,255),1)
        except: pass
        dist_str = f" {dist['cm']}cm" if dist else ""
        col_str  = f" {colour['name']}" if colour else ""
        label    = f"{det['name']} {int(det['confidence']*100)}%{dist_str}{col_str}"
        (tw,th),_ = cv2.getTextSize(label,cv2.FONT_HERSHEY_SIMPLEX,0.46,1)
        lx,ly = x1, max(th+8,y1)
        cv2.rectangle(annotated,(lx,ly-th-6),(lx+tw+6,ly),(0,0,0),-1)
        cv2.putText(annotated,label,(lx+3,ly-3),cv2.FONT_HERSHEY_SIMPLEX,0.46,(0,220,255),1)
        enriched.append(det)

        try:
            query("INSERT INTO detection_history(user_id,object_name,confidence,distance_cm,colors,language)"
                  " VALUES(%s,%s,%s,%s,%s,%s)",
                  (user['user_id'], det['name'], round(det['confidence']*100,1),
                   dist['cm'] if dist else None, json.dumps([colour]), language))
        except Exception as e: print(f"History: {e}")

    annotated_b64 = encode_img(annotated)
    saved_image_id = None
    if enriched:
        first = enriched[0]
        try:
            res = save_image(user['user_id'], annotated_b64, first['name'],
                             first['confidence'],
                             first['distance']['cm'] if first.get('distance') else 0,
                             [first.get('color',{})], language)
            if res.get('ok'): saved_image_id = res.get('image_id')
        except Exception as e: print(f"Save: {e}")

    return jsonify({"objects":enriched,"annotated_image":annotated_b64,
                    "count":len(enriched),"saved_image_id":saved_image_id})


OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'llama3.2:3b')
print(f"  🤖  Ollama model: {OLLAMA_MODEL}")
OLLAMA_URL   = os.getenv('OLLAMA_URL',   'http://localhost:11434/api/chat')

def ollama_chat(messages, system_prompt):
    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "options": {
            "temperature": 0.6,
            "num_predict": 200,
            "num_ctx": 1024,
            "top_k": 20,
            "top_p": 0.85,
            "repeat_penalty": 1.15
        },
        "messages": [{"role": "system", "content": system_prompt}] + messages
    }
    try:
        req = urllib.request.Request(
            OLLAMA_URL,
            data=json_stdlib.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json_stdlib.loads(resp.read().decode())
            return data.get("message", {}).get("content", "").strip()
    except Exception as e:
        print(f"Ollama error: {e}")
        return None



def wiki_summary(query, lang_code="en"):
    lang_map = {"hi": "hi", "kn": "kn", "en": "en"}
    wiki_lang = lang_map.get(lang_code, "en")
    url = (
        f"https://{wiki_lang}.wikipedia.org/api/rest_v1/page/summary/"
        + urllib.parse.quote(query.replace(" ", "_"))
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SmartVisionBot/1.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json_stdlib.loads(resp.read().decode())
            extract = data.get("extract", "")
            if extract and len(extract) > 60:
                return extract[:1000]
    except:
        pass
    # fallback to English if regional wiki fails
    if wiki_lang != "en":
        url = (
            "https://en.wikipedia.org/api/rest_v1/page/summary/"
            + urllib.parse.quote(query.replace(" ", "_"))
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "SmartVisionBot/1.0"})
            with urllib.request.urlopen(req, timeout=6) as resp:
                data = json_stdlib.loads(resp.read().decode())
                return data.get("extract", "")[:1000]
        except:
            pass
    return ""

def ddg_search(query):
    url = "https://api.duckduckgo.com/?q=" + urllib.parse.quote(query) + "&format=json&no_redirect=1&no_html=1"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SmartVisionBot/1.0"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json_stdlib.loads(resp.read().decode())
            abstract = data.get("Abstract", "")
            answer   = data.get("Answer", "")
            return (answer + " " + abstract).strip()[:800]
    except:
        return ""

def fetch_context(query, lang):
    wiki = wiki_summary(query, lang)
    if wiki and len(wiki) > 100:
        return wiki
    return ddg_search(query)

# ── TRANSLATION HELPERS ───────────────────────────────────────

def translate_to_en(text: str, source_lang: str) -> tuple[str, bool]:
    """
    Translate text to English.
    Returns (translated_text, success_bool).
    source_lang: 'kn' for Kannada, 'hi' for Hindi
    """
    if not text or not text.strip():
        return text, False
    try:
        lang_map = {'kn': 'kn', 'hi': 'hi'}
        src = lang_map.get(source_lang, source_lang)
        translated = GoogleTranslator(source=src, target='en').translate(text.strip())
        if translated and translated.strip():
            logger.info(f"[translate] {source_lang}→en: '{text[:60]}' → '{translated[:60]}'")
            return translated.strip(), True
        return text, False
    except Exception as e:
        logger.warning(f"[translate] {source_lang}→en failed: {e}")
        return text, False


def translate_from_en(text: str, target_lang: str) -> tuple[str, bool]:
    """
    Translate English text to target language.
    Returns (translated_text, success_bool).
    """
    if not text or not text.strip():
        return text, False
    try:
        lang_map = {'kn': 'kn', 'hi': 'hi'}
        tgt = lang_map.get(target_lang, target_lang)
        
        # Split long responses into chunks (Google Translate has ~5000 char limit)
        MAX_CHUNK = 4000
        if len(text) <= MAX_CHUNK:
            translated = GoogleTranslator(source='en', target=tgt).translate(text.strip())
        else:
            # Chunk by sentences for long responses
            sentences = text.split('. ')
            chunks, current = [], ''
            for s in sentences:
                if len(current) + len(s) < MAX_CHUNK:
                    current += s + '. '
                else:
                    if current:
                        chunks.append(current.strip())
                    current = s + '. '
            if current:
                chunks.append(current.strip())
            
            translated_chunks = []
            for chunk in chunks:
                t = GoogleTranslator(source='en', target=tgt).translate(chunk)
                translated_chunks.append(t or chunk)
            translated = ' '.join(translated_chunks)
        
        if not translated or not translated.strip():
            logger.warning(f"[translate] en→{target_lang}: got empty result")
            return text, False
        
        # Check if translation actually changed the text
        # (Google sometimes returns input unchanged for very short text)
        if translated.strip().lower() == text.strip().lower():
            logger.warning(f"[translate] en→{target_lang}: result identical to input, translation may have failed")
            # Still return it with True — it might genuinely be same words
            # but flag it so we can debug
        
        logger.info(f"[translate] en→{target_lang}: '{text[:50]}' → '{translated[:50]}'")
        return translated.strip(), True
        
    except Exception as e:
        logger.warning(f"[translate] en→{target_lang} failed: {e}")
        return text, False


def translate_cam_context_to_en(cam_context: str, source_lang: str) -> str:
    """
    Translate only the values inside cam_context string to English,
    keeping the keys (Object:, Colour:, Distance:) intact.
    e.g. "Object: ಕುರ್ಚಿ | Colour: ಕೆಂಪು | Distance: 50cm"
         → "Object: chair | Colour: red | Distance: 50cm"
    """
    if not cam_context or source_lang == 'en':
        return cam_context
    parts = cam_context.split('|')
    translated_parts = []
    for part in parts:
        part = part.strip()
        if ':' in part:
            key, _, val = part.partition(':')
            val = val.strip()
            # Don't translate distance/confidence — they're numeric
            if key.strip() in ('Distance', 'Confidence') or not val:
                translated_parts.append(part)
            else:
                translated_val, ok = translate_to_en(val, source_lang)
                translated_parts.append(f"{key}: {translated_val if ok else val}")
        else:
            translated_parts.append(part)
    return ' | '.join(translated_parts)
# ── SMART CHAT ────────────────────────────────────────────────

def smart_multilingual_reply(message, language, cam_context, live_info):
    msg = message.strip()
    obj = col = dist = ""
    for part in cam_context.split("|"):
        part = part.strip()
        if part.startswith("Object:"):   obj  = part.replace("Object:", "").strip()
        if part.startswith("Colour:"):   col  = part.replace("Colour:", "").strip()
        if part.startswith("Distance:"): dist = part.replace("Distance:", "").strip().replace("cm", "").strip()
    # Translate object name for native-language display
    if obj and language in ('kn', 'hi'):
        try:
            from deep_translator import GoogleTranslator
            lang_map = {'kn': 'kn', 'hi': 'hi'}
            obj_native = GoogleTranslator(source='en', target=lang_map[language]).translate(obj)
            if obj_native and obj_native.strip():
                obj = obj_native.strip()
        except Exception:
            pass  # keep English name on failure

    wiki = live_info[:400] if live_info else ""

    def safe_dist_int(d):
        try:
            return int(d)
        except Exception:
            return 9999

    # ── KANNADA ────────────────────────────────────────────────
    if language == 'kn':
        msg_low = msg.lower()
        greet = any(w in msg for w in ['ನಮಸ್ಕಾರ', 'ಹಲೋ', 'hello', 'hi', 'hey', 'ಹಾಯ್'])
        what  = any(w in msg for w in ['ಏನು', 'ಯಾವುದು', 'ಏನಿದು', 'what', 'ತಿಳಿಸಿ', 'ಬಗ್ಗೆ'])
        dist_ = any(w in msg for w in ['ದೂರ', 'ಎಷ್ಟು', 'ಹತ್ತಿರ', 'distance'])
        color = any(w in msg for w in ['ಬಣ್ಣ', 'color', 'colour'])
        safe  = any(w in msg for w in ['ಸುರಕ್ಷಿತ', 'ಅಪಾಯ', 'safe', 'danger'])
        use   = any(w in msg for w in ['ಉಪಯೋಗ', 'ಬಳಕೆ', 'use', 'purpose'])
        fact  = any(w in msg for w in ['ಮಾಹಿತಿ', 'ವಿಷಯ', 'fact', 'interesting'])
        price = any(w in msg for w in ['ಬೆಲೆ', 'price', 'cost', 'buy'])
        thank = any(w in msg for w in ['ಧನ್ಯವಾದ', 'thanks', 'thank'])

        if thank:
            return "ಧನ್ಯವಾದಗಳು! 😊 ಇನ್ನೇನಾದರೂ ಕೇಳಲು ಮುಕ್ತರಾಗಿ."
        if greet and obj:
            return (f"ನಮಸ್ಕಾರ! 👋 ಕ್ಯಾಮೆರಾದಲ್ಲಿ **{obj}** ಕಾಣುತ್ತಿದೆ"
                    + (f", ಬಣ್ಣ **{col}**" if col else "")
                    + (f", **{dist} ಸೆಮಿ** ದೂರ" if dist else "")
                    + ". ಏನು ತಿಳಿಯಬೇಕು?")
        if greet:
            return "ನಮಸ್ಕಾರ! 👋 ಕ್ಯಾಮೆರಾ ಚಾಲೂ ಮಾಡಿ ಅಥವಾ ಚಿತ್ರ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ, ನಂತರ ಏನಾದರೂ ಕೇಳಿ!"
        if dist_ and dist:
            d_int = safe_dist_int(dist)
            zone = ("ತುಂಬಾ ಹತ್ತಿರ ⚠️" if d_int < 50 else "ಹತ್ತಿರ" if d_int < 100
                    else "ಸ್ವಲ್ಪ ದೂರ" if d_int < 200 else "ಮಧ್ಯಮ ದೂರ" if d_int < 500 else "ದೂರ")
            return f"**{obj or 'ವಸ್ತು'}** ನಿಮ್ಮಿಂದ **{dist} ಸೆಮಿ** ({round(safe_dist_int(dist)/100,1)} ಮೀ) ದೂರದಲ್ಲಿದೆ — **{zone}**."
        if dist_ and not dist:
            return f"{obj or 'ವಸ್ತು'} ದೂರ ಅಳೆಯಲು ಸಾಧ್ಯವಾಗಿಲ್ಲ. ಕ್ಯಾಮೆರಾ ಸ್ಥಿರವಾಗಿ ಹಿಡಿಯಿರಿ."
        if color and col:
            return f"**{obj or 'ವಸ್ತು'}** ನ ಬಣ್ಣ **{col}** ಆಗಿದೆ."
        if color:
            return f"{obj or 'ವಸ್ತು'} ಬಣ್ಣ ಸ್ಪಷ್ಟವಾಗಿಲ್ಲ. ಉತ್ತಮ ಬೆಳಕಿನಲ್ಲಿ ಪ್ರಯತ್ನಿಸಿ."
        if safe:
            d_int = safe_dist_int(dist) if dist else 9999
            return f"**{obj or 'ವಸ್ತು'}** {'ತುಂಬಾ ಹತ್ತಿರ ಇದೆ, ಎಚ್ಚರಿಕೆ! ⚠️' if d_int < 80 else 'ಸುರಕ್ಷಿತವಾಗಿ ಕಾಣುತ್ತದೆ ✅'}"
        if price and obj:
            return f"**{obj}** ಬೆಲೆ Amazon ಅಥವಾ Flipkart ನಲ್ಲಿ ಹುಡುಕಿ. ಸಾಮಾನ್ಯವಾಗಿ ₹500 ರಿಂದ ₹50,000 ತನಕ ಇರಬಹುದು."
        if (what or fact or use) and wiki:
            return f"**{obj}** ಬಗ್ಗೆ: {wiki[:400]}{'...' if len(wiki) > 400 else ''}"
        if what and obj:
            return (f"ಇದು **{obj}** ಆಗಿದೆ."
                    + (f" ಬಣ್ಣ: **{col}**." if col else "")
                    + (f" ದೂರ: **{dist} ಸೆಮಿ**." if dist else "")
                    + " ಇನ್ನಷ್ಟು ತಿಳಿಯಲು ಕೇಳಿ!")
        if what:
            return "ನೀವು ಯಾವ ವಸ್ತುವಿನ ಬಗ್ಗೆ ಕೇಳುತ್ತಿದ್ದೀರಿ? ಕ್ಯಾಮೆರಾ ಚಾಲೂ ಮಾಡಿ ಮತ್ತು ವಸ್ತುವಿನ ಕಡೆ ತೋರಿಸಿ."
        # ── Rich default for Kannada (never falls through to Ollama) ──
        if obj:
            return (f"ಕ್ಯಾಮೆರಾದಲ್ಲಿ **{obj}** ಕಾಣುತ್ತಿದೆ."
                    + (f" ಬಣ್ಣ **{col}**." if col else "")
                    + (f" ದೂರ **{dist} ಸೆಮಿ**." if dist else "")
                    + "\n\nನೀವು ಕೇಳಬಹುದು:\n• ಇದು ಏನು?\n• ದೂರ ಎಷ್ಟು?\n• ಬಣ್ಣ ಏನು?\n• ಮಾಹಿತಿ ಕೊಡಿ\n• ಸುರಕ್ಷಿತವೇ?")
        return ("ನಾನು ಕನ್ನಡದಲ್ಲಿ ಮಾತನಾಡಬಲ್ಲೆ! 🤖\n\n"
                "ಕ್ಯಾಮೆರಾ ಚಾಲೂ ಮಾಡಿ ಮತ್ತು ಯಾವುದಾದರೂ ವಸ್ತುವಿನ ಕಡೆ ತೋರಿಸಿ, ನಂತರ ಕೇಳಿ:\n"
                "• ಇದು ಏನು?\n• ದೂರ ಎಷ್ಟು?\n• ಬಣ್ಣ ಏನು?\n• ಸುರಕ್ಷಿತವೇ?")

    # ── HINDI ──────────────────────────────────────────────────
    if language == 'hi':
        greet = any(w in msg for w in ['नमस्ते', 'हेलो', 'हाय', 'hello', 'hi', 'hey'])
        what  = any(w in msg for w in ['क्या', 'कौन', 'what', 'बताओ', 'ये क्या', 'यह क्या'])
        dist_ = any(w in msg for w in ['दूरी', 'कितनी दूर', 'distance', 'दूर', 'पास'])
        color = any(w in msg for w in ['रंग', 'color', 'colour', 'कलर'])
        safe  = any(w in msg for w in ['सुरक्षित', 'खतरा', 'safe', 'danger'])
        use   = any(w in msg for w in ['उपयोग', 'काम', 'use', 'purpose'])
        fact  = any(w in msg for w in ['जानकारी', 'तथ्य', 'fact', 'interesting', 'बताओ'])
        price = any(w in msg for w in ['कीमत', 'price', 'cost', 'buy', 'खरीद'])
        thank = any(w in msg for w in ['धन्यवाद', 'शुक्रिया', 'thanks', 'thank'])

        if thank:
            return "आपका स्वागत है! 😊 कुछ और जानना हो तो पूछें।"
        if greet and obj:
            return (f"नमस्ते! 👋 कैमरे में **{obj}** दिख रहा है"
                    + (f", रंग **{col}**" if col else "")
                    + (f", **{dist} सेमी** दूर" if dist else "")
                    + ". क्या जानना है?")
        if greet:
            return "नमस्ते! 👋 कैमरा चालू करें या इमेज अपलोड करें, फिर कुछ भी पूछें!"
        if dist_ and dist:
            d_int = safe_dist_int(dist)
            zone = ("बहुत पास ⚠️" if d_int < 50 else "पास" if d_int < 100
                    else "नज़दीक" if d_int < 200 else "मध्यम दूरी" if d_int < 500 else "दूर")
            return f"**{obj or 'वस्तु'}** आपसे **{dist} सेमी** ({round(safe_dist_int(dist)/100,1)} मीटर) दूर है — **{zone}**."
        if dist_ and not dist:
            return f"{obj or 'वस्तु'} की दूरी नहीं मापी जा सकी। कैमरा स्थिर रखें।"
        if color and col:
            return f"**{obj or 'वस्तु'}** का रंग **{col}** है।"
        if color:
            return f"{obj or 'वस्तु'} का रंग स्पष्ट नहीं है। बेहतर रोशनी में कोशिश करें।"
        if safe:
            d_int = safe_dist_int(dist) if dist else 9999
            return f"**{obj or 'वस्तु'}** {'बहुत पास है, सावधान! ⚠️' if d_int < 80 else 'सुरक्षित दिख रहा है ✅'}"
        if price and obj:
            return f"**{obj}** की कीमत Amazon या Flipkart पर देखें। आमतौर पर ₹500 से ₹50,000 के बीच हो सकती है।"
        if (what or fact or use) and wiki:
            return f"**{obj}** के बारे में: {wiki[:400]}{'...' if len(wiki) > 400 else ''}"
        if what and obj:
            return (f"यह **{obj}** है।"
                    + (f" रंग: **{col}**." if col else "")
                    + (f" दूरी: **{dist} सेमी**." if dist else "")
                    + " और जानना हो तो पूछें!")
        if what:
            return "आप किस वस्तु के बारे में पूछ रहे हैं? कैमरा चालू करें और किसी वस्तु की तरफ करें।"
        # ── Rich default for Hindi ──
        if obj:
            return (f"कैमरे में **{obj}** दिख रहा है।"
                    + (f" रंग **{col}**." if col else "")
                    + (f" दूरी **{dist} सेमी**." if dist else "")
                    + "\n\nआप पूछ सकते हैं:\n• यह क्या है?\n• दूरी कितनी?\n• रंग क्या?\n• जानकारी बताओ\n• सुरक्षित है?")
        return ("मैं हिंदी में बात कर सकता हूँ! 🤖\n\n"
                "कैमरा चालू करें और किसी वस्तु की तरफ करें, फिर पूछें:\n"
                "• यह क्या है?\n• दूरी कितनी?\n• रंग क्या?\n• सुरक्षित है?")

    return None  # English — handled by Ollama/Claude


# ─────────────────────────────────────────────────────────────────────────────
# REPLACEMENT 2 — /api/chat route
# Key changes:
#   • kn/hi: smart_multilingual_reply always returns a string now (never None)
#     so we return immediately — Ollama is never called for kn/hi
#   • English: Ollama → Claude → buildSmartResponse signal (source='offline')
#   • No more "AI model is not responding" shown to kn/hi users
# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/chat', methods=['POST'])
def chat():
    user = auth()
    if not user:
        return jsonify({"error": "Not logged in"}), 401

    d          = request.get_json(force=True)
    message    = d.get('message', '').strip()
    context    = d.get('object_context', '')
    colour_ctx = d.get('color_context', '')
    dist_ctx   = d.get('distance_context', 0)
    conf_ctx   = d.get('confidence_context', 0)
    language   = d.get('language', 'en')
    history    = d.get('conversation_history', [])

    if not message:
        return jsonify({"response": "Please ask something!"})

    # ── Build camera context string ───────────────────────────
    cam_parts = []
    if context:    cam_parts.append(f"Object: {context}")
    if colour_ctx: cam_parts.append(f"Colour: {colour_ctx}")
    if dist_ctx:   cam_parts.append(f"Distance: {dist_ctx}cm")
    if conf_ctx:   cam_parts.append(f"Confidence: {conf_ctx}%")
    cam_context = " | ".join(cam_parts)

    logger.info(f"\n{'='*50}")
    logger.info(f"[chat] Language : {language}")
    logger.info(f"[chat] Message  : {message[:80]}")
    logger.info(f"[chat] Context  : {cam_context}")

    # ══════════════════════════════════════════════════════════
    # KANNADA / HINDI  —  translate → Ollama → translate back
    # ══════════════════════════════════════════════════════════
    if language in ('kn', 'hi'):

        # Step 1 — translate user message to English
        message_en, translate_ok = translate_to_en(message, language)
        logger.info(f"[chat] Translated to EN : '{message_en[:80]}' (ok={translate_ok})")

        if not translate_ok:
            logger.warning(f"[chat] Input translation failed → smart fallback")
            live_info = ""
            try:
                live_info = fetch_context(context or message, language)
            except Exception:
                pass
            fallback_reply = smart_multilingual_reply(message, language, cam_context, live_info)
            logger.info(f"[chat] Smart fallback reply: {fallback_reply[:80]}")
            return jsonify({"response": fallback_reply, "source": "smart_fallback"})

        # Step 2 — translate cam_context values to English
        cam_context_en = translate_cam_context_to_en(cam_context, language)

        # Step 3 — fetch live Wikipedia/DDG context (English)
        live_info_en = ""
        needs_live = any(w in message_en.lower() for w in [
            "history", "price", "cost", "inventor", "fact", "how does", "why",
            "when", "who", "explain", "tell me", "what is", "what are",
            "uses", "purpose", "safety", "danger"
        ])
        if needs_live and (context or message_en):
            try:
                live_info_en = fetch_context(context if context else message_en, 'en')
                logger.info(f"[chat] Live context fetched: {len(live_info_en)} chars")
            except Exception:
                live_info_en = ""

        # Step 4 — build Ollama system prompt (English reasoning)
        lang_label = "Kannada" if language == 'kn' else "Hindi"
      

        system_prompt = (
            "You are a camera assistant. "
            "You MUST respond ONLY in plain English. "
            "Do NOT use any other language, script, or transliteration. "
            "Do NOT write in Kannada, Hindi, Devanagari, or any non-Latin script. "
            "Do NOT transliterate words — write real English words only. "
            "Be direct and factual. Maximum 2-3 short sentences. No preamble.\n"
            + (f"Camera context: {cam_context_en}\n" if cam_context_en else "")
            + (f"Background info: {live_info_en[:250]}\n" if live_info_en else "")
        )

        # Step 5 — build conversation history (translated to English)
        msgs = []
        for h in history[-6:]:
            role    = h.get('role', '')
            content = h.get('content', '')
            if role in ('user', 'assistant') and content:
                if role == 'user':
                    content_en, _ = translate_to_en(content, language)
                    msgs.append({"role": role, "content": content_en})
                else:
                    content_en, ok = translate_to_en(content, language)
                    msgs.append({"role": role, "content": content_en if ok else content})

        user_content = f"[Camera: {cam_context_en}] {message_en}" if cam_context_en else message_en
        msgs.append({"role": "user", "content": user_content})

        # Step 6 — call Ollama
        reply_en = ollama_chat(msgs, system_prompt)
        logger.info(f"[chat] Ollama EN reply : '{(reply_en or '')[:120]}'")

        # Step 7 — Claude fallback if Ollama failed
        if not reply_en and claude_client:
            try:
                resp = claude_client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=300,
                    system=system_prompt,
                    messages=msgs
                )
                claude_reply = resp.content[0].text.strip()
                logger.info(f"[chat] Claude EN reply : '{claude_reply[:120]}'")
                # Only accept if Claude gave real English (it should always, but guard anyway)
                reply_en = claude_reply if claude_reply else None
            except Exception as e:
                logger.warning(f"[chat] Claude fallback failed: {e}")

        # Step 8 — if both AI backends failed, use smart rule-based reply
        if not reply_en:
            logger.warning(f"[chat] Ollama+Claude both failed → smart fallback")
            live_info_native = ""
            try:
                live_info_native = fetch_context(context or message, language)
            except Exception:
                pass
            fallback_reply = smart_multilingual_reply(message, language, cam_context, live_info_native)
            logger.info(f"[chat] Smart fallback reply: {fallback_reply[:80]}")
            return jsonify({"response": fallback_reply, "source": "smart_fallback"})

        # Step 9 — validate Ollama output is usable English
        def is_native_script(text, lang):
            if lang == 'kn':
                return any('\u0C80' <= c <= '\u0CFF' for c in text)
            if lang == 'hi':
                return any('\u0900' <= c <= '\u097F' for c in text)
            return False

        def is_real_english(text):
            """
            Returns True only if the text is predominantly ASCII Latin characters.
            Rejects transliterated garbage like 'Personu keli magaru gamboodi'
            by checking that at least 85% of alphabetic characters are basic Latin (a-z A-Z).
            Also rejects if any native Unicode script characters are present.
            """
            if not text or not text.strip():
                return False
            # Reject immediately if any Kannada, Hindi, or other non-Latin script chars exist
            for c in text:
                cp = ord(c)
                # Kannada: 0C80–0CFF, Hindi/Devanagari: 0900–097F
                # Also reject Arabic, Greek, Cyrillic, CJK, etc.
                if (0x0900 <= cp <= 0x0CFF or   # Devanagari + Kannada
                    0x0600 <= cp <= 0x06FF or   # Arabic
                    0x0370 <= cp <= 0x03FF or   # Greek
                    0x0400 <= cp <= 0x04FF or   # Cyrillic
                    0x4E00 <= cp <= 0x9FFF):    # CJK
                    return False
            # Check that 85%+ of alphabetic chars are basic Latin
            alpha_chars = [c for c in text if c.isalpha()]
            if not alpha_chars:
                return False
            latin_chars = [c for c in alpha_chars if ord(c) < 128]
            latin_ratio = len(latin_chars) / len(alpha_chars)
            return latin_ratio >= 0.85

        # If Ollama somehow replied in native script directly, use it as-is
        if is_native_script(reply_en, language):
            logger.info(f"[chat] Ollama replied directly in {lang_label} — skipping translation")
            logger.info(f"[chat] Final reply: {reply_en[:120]}")
            return jsonify({"response": reply_en, "source": "ollama_native"})

        # CRITICAL: Reject transliterated or mixed garbage before attempting translation
        if not is_real_english(reply_en):
            logger.warning(
                f"[chat] Ollama output is not real English (garbage/transliteration detected): "
                f"'{reply_en[:80]}' → triggering smart fallback"
            )
            live_info_native = ""
            try:
                live_info_native = fetch_context(context or message, language)
            except Exception:
                pass
            fallback_reply = smart_multilingual_reply(message, language, cam_context, live_info_native)
            return jsonify({"response": fallback_reply, "source": "smart_fallback"})

        # Step 10 — translate English reply → Kannada/Hindi
        reply_native, back_ok = translate_from_en(reply_en, language)
        logger.info(f"[chat] Translated to {language}: '{reply_native[:120]}' (ok={back_ok})")

        if not back_ok or not reply_native.strip():
            logger.warning(f"[chat] Back-translation failed → smart fallback")
            live_info_native = ""
            try:
                live_info_native = fetch_context(context or message, language)
            except Exception:
                pass
            fallback_reply = smart_multilingual_reply(message, language, cam_context, live_info_native)
            return jsonify({"response": fallback_reply, "source": "smart_fallback"})

        # ── Verify the result is actually in the right script ──
        def native_ratio(text, lang):
            if lang == 'kn':
                native_chars = sum(1 for c in text if '\u0C80' <= c <= '\u0CFF')
            elif lang == 'hi':
                native_chars = sum(1 for c in text if '\u0900' <= c <= '\u097F')
            else:
                return 1.0
            total = sum(1 for c in text if c.isalpha())
            return native_chars / total if total else 0

        if not is_native_script(reply_native, language) or native_ratio(reply_native, language) < 0.5:
            logger.warning(f"[chat] Translation quality too low (ratio={native_ratio(reply_native, language):.2f}) → smart fallback")
            live_info_native = ""
            try:
                live_info_native = fetch_context(context or message, language)
            except Exception:
                pass
            fallback_reply = smart_multilingual_reply(message, language, cam_context, live_info_native)
            return jsonify({"response": fallback_reply, "source": "smart_fallback"})

        logger.info(f"[chat] ✅ Success | lang={language} | source=ollama+translate")
        logger.info(f"{'='*50}\n")
        return jsonify({"response": reply_native, "source": "ollama+translate"})

    # ══════════════════════════════════════════════════════════
    # ENGLISH  —  original Ollama flow
    # ══════════════════════════════════════════════════════════
    live_info = ""
    needs_live = any(w in message.lower() for w in [
        "history", "price", "cost", "inventor", "fact", "how does", "why",
        "when", "who", "explain", "tell me", "what is",
    ])
    if needs_live and (context or message):
        try:
            live_info = fetch_context(context if context else message, language)
        except Exception:
            live_info = ""

    system_prompt = (
        "You are a smart AI camera assistant. Reply only in English. "
        "Be direct, friendly and accurate. Answer exactly what is asked. 2-4 sentences max. "
        "Do not give random unrelated facts. Stay on topic.\n"
        + (f"Camera sees: {cam_context}.\n" if cam_context else "")
        + (f"Context: {live_info[:300]}\n" if live_info else "")
    )

    msgs = []
    for h in history[-6:]:
        role    = h.get('role', '')
        content = h.get('content', '')
        if role in ('user', 'assistant') and content:
            msgs.append({"role": role, "content": content})

    user_content = f"[Camera: {cam_context}] {message}" if cam_context else message
    msgs.append({"role": "user", "content": user_content})

    reply = ollama_chat(msgs, system_prompt)

    if not reply and claude_client:
        try:
            resp = claude_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=300,
                system=system_prompt,
                messages=msgs
            )
            reply = resp.content[0].text.strip()
        except Exception:
            pass

    if not reply:
        return jsonify({
            "response": None,
            "source": "offline",
            "use_client_fallback": True
        })

    return jsonify({"response": reply, "source": "ollama"})
# ── FULL INFO ─────────────────────────────────────────────────
@app.route('/api/full_info', methods=['POST'])
def full_info():
    user = auth()

    if not user:
        return jsonify({"error":"Not logged in"}), 401

    d = request.get_json(force=True)

    name = d.get('object_name','')
    lang = d.get('language','en')

    lang_name = {
        "en":"English",
        "hi":"Hindi",
        "kn":"Kannada"
    }.get(lang,"English")

    # ── REAL-TIME AI ──────────────────────────────────────────
    if claude_client:
        try:
            resp = claude_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=700,
                tools=[{
                    "type": "web_search_20250305",
                    "name": "web_search"
                }],
                messages=[{
                    "role":"user",
                    "content":
                    f"""
                    Give comprehensive real-time information about '{name}' in {lang_name}.

                    Include:
                    - what it is
                    - history
                    - uses
                    - interesting facts
                    - safety tips
                    - latest trends/news
                    - practical uses

                    Keep response natural and intelligent.
                    """
                }]
            )

            text_parts = [
                b.text for b in resp.content
                if hasattr(b, 'text') and b.text
            ]

            reply = " ".join(text_parts).strip()

            return jsonify({
                "info": reply,
                "source": "claude+search"
            })

        except Exception as e:
            print("Full info error:", e)

    # ── Claude unavailable ────────────────────────────────────
    return jsonify({
        "info": f"Real-time AI service unavailable for '{name}'. Please check ANTHROPIC_API_KEY or internet connection."
    }), 503

# ── OCR ───────────────────────────────────────────────────────
@app.route('/api/ocr', methods=['POST'])
def ocr():
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    if 'file' not in request.files: return jsonify({"error":"No file"}), 400
    img = decode_img(request.files['file'])
    if img is None: return jsonify({"error":"Bad image"}), 400
    return jsonify(ocr_handler.extract_text(img, request.form.get('language','en')))

# ── HISTORY ───────────────────────────────────────────────────
@app.route('/api/history')
def get_history():
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    rows = query(
        "SELECT object_name AS name, confidence, distance_cm, colors, language,"
        " DATE_FORMAT(detected_at,'%%H:%%i:%%s') AS time"
        " FROM detection_history WHERE user_id=%s ORDER BY detected_at DESC LIMIT 20",
        (user['user_id'],), fetchall=True) or []
    for r in rows:
        try: r['colors'] = json.loads(r['colors']) if r['colors'] else []
        except: r['colors'] = []
    return jsonify({"history": safe_json(rows)})

@app.route('/api/history/with_images')
def get_history_with_images():
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    try:
        rows = query(
            "SELECT id, object_name AS name, confidence, distance_cm, colors,"
            " DATE_FORMAT(detected_at,'%%H:%%i:%%s') AS time,"
            " DATE_FORMAT(detected_at,'%%Y-%%m-%%d %%H:%%i:%%S') AS ts"
            " FROM detection_history WHERE user_id=%s"
            " ORDER BY detected_at DESC LIMIT 30",
            (user['user_id'],), fetchall=True) or []
        result = []
        for r in rows:
            try: r['colors'] = json.loads(r['colors']) if r['colors'] else []
            except: r['colors'] = []
            img_row = query(
                "SELECT filename FROM user_images"
                " WHERE user_id=%s AND detected_object=%s"
                " AND ABS(TIMESTAMPDIFF(SECOND, created_at, STR_TO_DATE(%s,'%%Y-%%m-%%d %%H:%%i:%%S'))) < 30"
                " ORDER BY ABS(TIMESTAMPDIFF(SECOND, created_at, STR_TO_DATE(%s,'%%Y-%%m-%%d %%H:%%i:%%S'))) LIMIT 1",
                (user['user_id'], r['name'], r['ts'], r['ts']), fetchone=True)
            r['image_url'] = f"/uploads/{user['user_id']}/{img_row['filename']}" if img_row else None
            r.pop('ts', None)
            result.append(r)
        return jsonify({"history": result})
    except Exception as e:
        print(f"History error: {e}"); import traceback; traceback.print_exc()
        return jsonify({"error":str(e),"history":[]}), 500

@app.route('/api/history/clear', methods=['POST'])
def clear_history():
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    query("DELETE FROM detection_history WHERE user_id=%s",(user['user_id'],))
    return jsonify({"status":"cleared"})

# ── OBSTACLE ──────────────────────────────────────────────────
@app.route('/api/obstacle_check', methods=['POST'])
def obstacle_check():
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    d    = request.get_json(force=True)
    lang = d.get('language','en')
    alerts = []
    for det in d.get('detections',[]):
        dist = det.get('distance')
        if dist and isinstance(dist,dict) and dist.get('cm') and dist['cm'] < 80:
            name,cm = det['name'],dist['cm']
            msgs = {"en":f"⚠️ {name} only {cm} cm away!",
                    "hi":f"⚠️ {name} केवल {cm} सेमी!",
                    "kn":f"⚠️ {name} ಕೇವಲ {cm} ಸೆಮಿ!"}
            alerts.append(msgs.get(lang,msgs["en"]))
    return jsonify({"alerts":alerts,"has_alert":bool(alerts)})

# ── GALLERY ───────────────────────────────────────────────────
@app.route('/api/gallery')
def gallery_list():
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    return jsonify(get_user_images(user['user_id'], int(request.args.get('page',1))))

@app.route('/api/gallery/<int:image_id>/notes', methods=['PUT'])
def gallery_notes(image_id):
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    d = request.get_json(force=True)
    return jsonify(update_image_notes(image_id, user['user_id'], d.get('notes','')))

@app.route('/api/gallery/<int:image_id>', methods=['DELETE'])
def gallery_delete(image_id):
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    return jsonify(delete_image(image_id, user['user_id']))

# ── FEEDBACK ──────────────────────────────────────────────────
@app.route('/api/feedback', methods=['POST'])
def feedback_submit():
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    d = request.get_json(force=True)
    result = submit_feedback(user['user_id'], d.get('image_filename',''),
                             d.get('wrong_label',''), d.get('correct_label',''),
                             extra_notes=d.get('extra_notes',''))
    if result.get('ok'):
        try: detector.reload_corrections()
        except: pass
    return jsonify(result)

@app.route('/api/feedback', methods=['GET'])
def feedback_list():
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    return jsonify(get_user_feedback(user['user_id']))

@app.route('/api/corrections/reload', methods=['POST'])
def reload_corrections():
    user = auth()
    if not user: return jsonify({"error":"Not logged in"}), 401
    try: detector.reload_corrections(); return jsonify({"ok":True})
    except Exception as e: return jsonify({"ok":False,"error":str(e)})

# ── ADMIN PAGES ───────────────────────────────────────────────
@app.route('/admin/dashboard')
def admin_dashboard():
    return send_from_directory('../frontend', 'admin.html')

@app.route('/adminlogin.html')
def admin_login_page():
    return send_from_directory('../frontend', 'adminlogin.html')

# ── ADMIN AUTH ────────────────────────────────────────────────
def require_admin(f):
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization','').replace('Bearer ','')
        # admin tokens are prefixed with "admin_"
        if not token.startswith('admin_'):
            return jsonify({"error":"Admin access required"}), 403
        user = validate_token(token)
        if not user:
            return jsonify({"error":"Not logged in"}), 401
        admin = query("SELECT is_admin FROM users WHERE user_id=%s",
                      (user['user_id'],), fetchone=True)
        if not admin or not admin.get('is_admin'):
            return jsonify({"error":"Admin access required"}), 403
        from flask import g
        g.user = user
        return f(*args, **kwargs)
    return decorated

@app.route('/admin/login', methods=['POST'])
def admin_login():
    from auth import check_password
    import secrets, datetime
    d = request.get_json(force=True)
    identifier = d.get('identifier','').strip().lower()
    password   = d.get('password','')
    row = (query("SELECT * FROM users WHERE user_id=%s", (identifier,), fetchone=True)
           or query("SELECT * FROM users WHERE LOWER(username)=%s", (identifier,), fetchone=True))
    if not row:
        return jsonify({"error":"User not found"}), 401
    if not check_password(password, row["password_hash"]):
        return jsonify({"error":"Incorrect password"}), 401
    if not row.get("is_admin"):
        return jsonify({"error":"Not an admin account. Contact system administrator."}), 403
    token   = "admin_" + secrets.token_hex(32)
    expires = datetime.datetime.now() + datetime.timedelta(hours=168)
    query("INSERT INTO sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
          (row["user_id"], token, expires))
    return jsonify({"ok":True,"token":token,"username":row["username"]})

@app.route('/api/admin/stats')
@require_admin
def admin_stats():
    total = (query("SELECT COUNT(*) AS c FROM users", fetchone=True) or {}).get('c', 0)
    active = (query("SELECT COUNT(DISTINCT user_id) AS c FROM sessions WHERE expires_at > NOW()", fetchone=True) or {}).get('c', 0)
    return jsonify({"total_users": total, "active_now": active})

@app.route('/api/admin/users')
@require_admin
def admin_list_users():
    rows = query("""
        SELECT user_id, username,
               DATE_FORMAT(created_at,'%%Y-%%m-%%d %%H:%%i') AS created_at,
               DATE_FORMAT(last_login,'%%Y-%%m-%%d %%H:%%i') AS last_login,
               (SELECT COUNT(*) FROM sessions s WHERE s.user_id=users.user_id AND s.expires_at > NOW()) AS is_active
        FROM users ORDER BY created_at DESC
    """, fetchall=True) or []
    return jsonify(rows)

@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
@require_admin
def admin_delete_user(user_id):
    from flask import g
    if user_id == g.user['user_id']:
        return jsonify({"error":"Cannot delete yourself"}), 400
    query("DELETE FROM sessions WHERE user_id=%s", (user_id,))
    query("DELETE FROM users WHERE user_id=%s", (user_id,))
    return jsonify({"ok": True})

@app.route('/api/admin/logs')
@require_admin
def admin_get_logs():
    log_type = request.args.get('type','')
    limit    = request.args.get('limit', 150, type=int)
    if log_type:
        rows = query(
            "SELECT *, DATE_FORMAT(created_at,'%%Y-%%m-%%d %%H:%%i:%%S') AS created_at"
            " FROM system_logs WHERE log_type=%s ORDER BY created_at DESC LIMIT %s",
            (log_type, limit), fetchall=True) or []
    else:
        rows = query(
            "SELECT *, DATE_FORMAT(created_at,'%%Y-%%m-%%d %%H:%%i:%%S') AS created_at"
            " FROM system_logs ORDER BY created_at DESC LIMIT %s",
            (limit,), fetchall=True) or []
    return jsonify(rows)

@app.route('/api/debug/translate', methods=['POST'])
def debug_translate():
    d = request.get_json(force=True)
    text = d.get('text', 'Hello, this is a test.')
    lang = d.get('lang', 'kn')
    
    result_native, ok1 = translate_from_en(text, lang)
    back_to_en, ok2 = translate_to_en(result_native, lang)
    
    return jsonify({
        "original_en": text,
        "translated_to_native": result_native,
        "translate_ok": ok1,
        "back_to_en": back_to_en,
        "back_ok": ok2,
        "lang": lang
    })

if __name__ == '__main__':
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8",80))
        local_ip = s.getsockname()[0]
        s.close()
    except:
        local_ip = "192.168.x.x"

    print(f"\n  PC:    http://localhost:5000")
    print(f"  Phone: http://{local_ip}:5000")
    print(f"  Admin: http://127.0.0.1:5000/adminlogin.html")

    print(f"\n  For phone camera on ngrok:")
    print(f"  1. python app.py")
    print(f"  2. ngrok http 5000")
    print(f"  3. Open ngrok HTTPS URL on phone\n")

    app.run(host='0.0.0.0', port=5000, debug=False)