"""
ai_handler.py  –  Multilingual AI responses
Supports: English (en), Hindi (hi), Kannada (kn)
No external API needed – all responses are generated locally with rich templates.
"""

import random
from typing import Optional, List, Dict


# ── Language translations for UI strings ──────────────────────────────────────
LABELS = {
    "en": {
        "detected":    "Detected",
        "distance":    "Distance",
        "confidence":  "Confidence",
        "this_is":     "This is a",
        "away":        "away",
        "obstacle":    "⚠️ Obstacle Alert!",
        "too_close":   "is very close — only",
        "move_back":   "Please move back or go around it carefully.",
        "no_text":     "No readable text found in the image.",
        "text_found":  "Text detected",
    },
    "hi": {
        "detected":    "पहचाना गया",
        "distance":    "दूरी",
        "confidence":  "विश्वास",
        "this_is":     "यह एक",
        "away":        "दूर है",
        "obstacle":    "⚠️ बाधा चेतावनी!",
        "too_close":   "बहुत करीब है — केवल",
        "move_back":   "कृपया पीछे हटें या ध्यान से जाएं।",
        "no_text":     "छवि में कोई पाठ नहीं मिला।",
        "text_found":  "पाठ मिला",
    },
    "kn": {
        "detected":    "ಪತ್ತೆಯಾಯಿತು",
        "distance":    "ದೂರ",
        "confidence":  "ವಿಶ್ವಾಸ",
        "this_is":     "ಇದು ಒಂದು",
        "away":        "ದೂರದಲ್ಲಿದೆ",
        "obstacle":    "⚠️ ಅಡಚಣೆ ಎಚ್ಚರಿಕೆ!",
        "too_close":   "ತುಂಬಾ ಹತ್ತಿರದಲ್ಲಿದೆ — ಕೇವಲ",
        "move_back":   "ದಯವಿಟ್ಟು ಹಿಂದೆ ಸರಿಯಿರಿ ಅಥವಾ ಎಚ್ಚರಿಕೆಯಿಂದ ಹೋಗಿ.",
        "no_text":     "ಚಿತ್ರದಲ್ಲಿ ಓದಬಹುದಾದ ಪಠ್ಯ ಕಂಡುಬಂದಿಲ್ಲ.",
        "text_found":  "ಪಠ್ಯ ಪತ್ತೆಯಾಯಿತು",
    }
}

# ── Object name translations (COCO 80 classes) ────────────────────────────────
OBJECT_NAMES = {
    "person":        {"hi": "व्यक्ति",        "kn": "ವ್ಯಕ್ತಿ"},
    "car":           {"hi": "कार",             "kn": "ಕಾರು"},
    "truck":         {"hi": "ट्रक",            "kn": "ಟ್ರಕ್"},
    "bus":           {"hi": "बस",              "kn": "ಬಸ್"},
    "motorcycle":    {"hi": "मोटरसाइकिल",      "kn": "ಮೋಟಾರ್‌ಸೈಕಲ್"},
    "bicycle":       {"hi": "साइकिल",          "kn": "ಸೈಕಲ್"},
    "dog":           {"hi": "कुत्ता",          "kn": "ನಾಯಿ"},
    "cat":           {"hi": "बिल्ली",          "kn": "ಬೆಕ್ಕು"},
    "bottle":        {"hi": "बोतल",            "kn": "ಬಾಟಲ್"},
    "chair":         {"hi": "कुर्सी",          "kn": "ಕುರ್ಚಿ"},
    "laptop":        {"hi": "लैपटॉप",          "kn": "ಲ್ಯಾಪ್‌ಟಾಪ್"},
    "cell phone":    {"hi": "मोबाइल फ़ोन",     "kn": "ಮೊಬೈಲ್ ಫೋನ್"},
    "book":          {"hi": "किताब",           "kn": "ಪುಸ್ತಕ"},
    "cup":           {"hi": "कप",              "kn": "ಕಪ್"},
    "traffic light": {"hi": "ट्रैफिक लाइट",   "kn": "ಟ್ರಾಫಿಕ್ ಲೈಟ್"},
    "fire hydrant":  {"hi": "अग्नि नल",       "kn": "ಅಗ್ನಿ ನಲ"},
    "stop sign":     {"hi": "स्टॉप साइन",     "kn": "ಸ್ಟಾಪ್ ಸೈನ್"},
    "bench":         {"hi": "बेंच",            "kn": "ಬೆಂಚ್"},
    "backpack":      {"hi": "बैकपैक",          "kn": "ಬ್ಯಾಕ್‌ಪ್ಯಾಕ್"},
    "umbrella":      {"hi": "छाता",            "kn": "ಛತ್ರಿ"},
    "handbag":       {"hi": "हैंडबैग",         "kn": "ಹ್ಯಾಂಡ್‌ಬ್ಯಾಗ್"},
    "suitcase":      {"hi": "सूटकेस",          "kn": "ಸೂಟ್‌ಕೇಸ್"},
    "clock":         {"hi": "घड़ी",            "kn": "ಗಡಿಯಾರ"},
    "vase":          {"hi": "फूलदान",          "kn": "ಹೂದಾನಿ"},
    "laptop":        {"hi": "लैपटॉप",          "kn": "ಲ್ಯಾಪ್‌ಟಾಪ್"},
    "tv":            {"hi": "टेलीविजन",        "kn": "ದೂರದರ್ಶನ"},
    "keyboard":      {"hi": "कीबोर्ड",         "kn": "ಕೀಬೋರ್ಡ್"},
    "mouse":         {"hi": "माउस",            "kn": "ಮೌಸ್"},
    "remote":        {"hi": "रिमोट",           "kn": "ರಿಮೋಟ್"},
    "couch":         {"hi": "सोफा",            "kn": "ಸೋಫಾ"},
    "bed":           {"hi": "बिस्तर",          "kn": "ಹಾಸಿಗೆ"},
    "dining table":  {"hi": "खाने की मेज",    "kn": "ಊಟದ ಮೇಜು"},
    "toilet":        {"hi": "शौचालय",          "kn": "ಶೌಚಾಲಯ"},
    "microwave":     {"hi": "माइक्रोवेव",      "kn": "ಮೈಕ್ರೋವೇವ್"},
    "oven":          {"hi": "ओवन",             "kn": "ಓವನ್"},
    "refrigerator":  {"hi": "रेफ्रिजरेटर",    "kn": "ರೆಫ್ರಿಜರೇಟರ್"},
    "apple":         {"hi": "सेब",             "kn": "ಸೇಬು"},
    "banana":        {"hi": "केला",            "kn": "ಬಾಳೆ"},
    "pizza":         {"hi": "पिज़्ज़ा",         "kn": "ಪಿಝ್ಝಾ"},
    "cake":          {"hi": "केक",             "kn": "ಕೇಕ್"},
    "bird":          {"hi": "पक्षी",           "kn": "ಹಕ್ಕಿ"},
    "horse":         {"hi": "घोड़ा",           "kn": "ಕುದುರೆ"},
    "cow":           {"hi": "गाय",             "kn": "ಹಸು"},
    "elephant":      {"hi": "हाथी",            "kn": "ಆನೆ"},
    "bear":          {"hi": "भालू",            "kn": "ಕರಡಿ"},
    "zebra":         {"hi": "ज़ेब्रा",          "kn": "ಜೀಬ್ರಾ"},
    "giraffe":       {"hi": "जिराफ",           "kn": "ಜಿರಾಫೆ"},
    "airplane":      {"hi": "हवाई जहाज",       "kn": "ವಿಮಾನ"},
    "train":         {"hi": "ट्रेन",           "kn": "ರೈಲು"},
    "boat":          {"hi": "नाव",             "kn": "ದೋಣಿ"},
    "kite":          {"hi": "पतंग",            "kn": "ಗಾಳಿಪಟ"},
    "scissors":      {"hi": "कैंची",           "kn": "ಕತ್ತರಿ"},
    "toothbrush":    {"hi": "टूथब्रश",         "kn": "ಹಲ್ಲುಜ್ಜುವ ಬ್ರಷ್"},
    "teddy bear":    {"hi": "टेडी बियर",        "kn": "ಟೆಡ್ಡಿ ಬೇರ್"},
    "fork":          {"hi": "कांटा",           "kn": "ಮುಳ್ಳುಚಮಚ"},
    "knife":         {"hi": "चाकू",            "kn": "ಚಾಕು"},
    "spoon":         {"hi": "चम्मच",           "kn": "ಚಮಚ"},
    "bowl":          {"hi": "कटोरा",           "kn": "ಬಟ್ಟಲು"},
}

# ── Full information per object (EN + translated templates) ───────────────────
FULL_INFO = {
    "bottle": {
        "en": (
            "A bottle is a container used to store liquids such as water, juice, or beverages.\n"
            "• Materials: Plastic, glass, or stainless steel\n"
            "• Common uses: Drinking water, storage, laboratory use\n"
            "• Fun fact: Over 1 million plastic bottles are purchased every minute worldwide\n"
            "• Safety: Reusable bottles reduce plastic waste significantly"
        ),
        "hi": (
            "बोतल एक बर्तन है जिसका उपयोग पानी, जूस या पेय पदार्थ संग्रहीत करने के लिए किया जाता है।\n"
            "• सामग्री: प्लास्टिक, कांच, या स्टेनलेस स्टील\n"
            "• सामान्य उपयोग: पीने का पानी, भंडारण, प्रयोगशाला उपयोग\n"
            "• रोचक तथ्य: दुनिया भर में हर मिनट 10 लाख से अधिक प्लास्टिक बोतलें खरीदी जाती हैं\n"
            "• सुरक्षा: पुन: उपयोग योग्य बोतलें प्लास्टिक कचरे को काफी कम करती हैं"
        ),
        "kn": (
            "ಬಾಟಲ್ ಎಂಬುದು ನೀರು, ಜ್ಯೂಸ್ ಅಥವಾ ಪಾನೀಯ ಸಂಗ್ರಹಿಸಲು ಬಳಸುವ ಪಾತ್ರೆ.\n"
            "• ವಸ್ತುಗಳು: ಪ್ಲಾಸ್ಟಿಕ್, ಗಾಜು, ಅಥವಾ ಸ್ಟೇನ್‌ಲೆಸ್ ಸ್ಟೀಲ್\n"
            "• ಸಾಮಾನ್ಯ ಬಳಕೆ: ಕುಡಿಯುವ ನೀರು, ಸಂಗ್ರಹಣೆ, ಪ್ರಯೋಗಾಲಯ ಬಳಕೆ\n"
            "• ಮೋಜಿನ ಸಂಗತಿ: ವಿಶ್ವದಾದ್ಯಂತ ಪ್ರತಿ ನಿಮಿಷ 10 ಲಕ್ಷಕ್ಕೂ ಹೆಚ್ಚು ಪ್ಲಾಸ್ಟಿಕ್ ಬಾಟಲ್‌ಗಳು ಖರೀದಿಸಲ್ಪಡುತ್ತವೆ\n"
            "• ಸುರಕ್ಷತೆ: ಮರುಬಳಕೆ ಬಾಟಲ್‌ಗಳು ಪ್ಲಾಸ್ಟಿಕ್ ತ್ಯಾಜ್ಯವನ್ನು ಗಣನೀಯವಾಗಿ ಕಡಿಮೆ ಮಾಡುತ್ತವೆ"
        ),
    },
    "chair": {
        "en": (
            "A chair is a piece of furniture designed for a single person to sit on.\n"
            "• Types: Office chair, dining chair, rocking chair, wheelchair\n"
            "• Materials: Wood, metal, plastic, fabric\n"
            "• Fun fact: The ancient Egyptians were among the first to use chairs\n"
            "• Ergonomics: Good posture while sitting prevents back pain"
        ),
        "hi": (
            "कुर्सी एक फर्नीचर का टुकड़ा है जिसे एक व्यक्ति बैठने के लिए बनाया गया है।\n"
            "• प्रकार: ऑफिस चेयर, डाइनिंग चेयर, रॉकिंग चेयर, व्हीलचेयर\n"
            "• सामग्री: लकड़ी, धातु, प्लास्टिक, कपड़ा\n"
            "• रोचक तथ्य: प्राचीन मिस्रवासी कुर्सियों का उपयोग करने वाले पहले लोगों में से थे\n"
            "• एर्गोनॉमिक्स: बैठते समय अच्छी मुद्रा पीठ दर्द को रोकती है"
        ),
        "kn": (
            "ಕುರ್ಚಿ ಒಬ್ಬ ವ್ಯಕ್ತಿ ಕೂರಲು ವಿನ್ಯಾಸಗೊಳಿಸಲಾದ ಪೀಠೋಪಕರಣ.\n"
            "• ವಿಧಗಳು: ಆಫೀಸ್ ಕುರ್ಚಿ, ಊಟದ ಕುರ್ಚಿ, ತೂಗಾಡುವ ಕುರ್ಚಿ, ಗಾಲಿ ಕುರ್ಚಿ\n"
            "• ವಸ್ತುಗಳು: ಮರ, ಲೋಹ, ಪ್ಲಾಸ್ಟಿಕ್, ಬಟ್ಟೆ\n"
            "• ಮೋಜಿನ ಸಂಗತಿ: ಪ್ರಾಚೀನ ಈಜಿಪ್ಟಿಯನ್ನರು ಕುರ್ಚಿ ಬಳಸಿದ ಮೊದಲಿಗರಲ್ಲಿ ಒಬ್ಬರು\n"
            "• ಎರ್ಗೋನಾಮಿಕ್ಸ್: ಕೂರುವಾಗ ಉತ್ತಮ ಭಂಗಿ ಬೆನ್ನುನೋವನ್ನು ತಡೆಗಟ್ಟುತ್ತದೆ"
        ),
    },
    "laptop": {
        "en": (
            "A laptop is a portable personal computer with an integrated display.\n"
            "• Components: CPU, RAM, SSD/HDD, display, keyboard, touchpad, battery\n"
            "• Uses: Work, study, entertainment, communication\n"
            "• Fun fact: The first laptop (Osborne 1) weighed 10.7 kg!\n"
            "• Tip: Keep ventilation clear to avoid overheating"
        ),
        "hi": (
            "लैपटॉप एक पोर्टेबल व्यक्तिगत कंप्यूटर है जिसमें एकीकृत डिस्प्ले होती है।\n"
            "• घटक: CPU, RAM, SSD/HDD, डिस्प्ले, कीबोर्ड, टचपैड, बैटरी\n"
            "• उपयोग: काम, अध्ययन, मनोरंजन, संचार\n"
            "• रोचक तथ्य: पहला लैपटॉप (Osborne 1) का वजन 10.7 किलोग्राम था!\n"
            "• टिप: ओवरहीटिंग से बचाने के लिए वेंटिलेशन साफ रखें"
        ),
        "kn": (
            "ಲ್ಯಾಪ್‌ಟಾಪ್ ಒಂದು ಸಂಯೋಜಿತ ಪ್ರದರ್ಶನದೊಂದಿಗೆ ಪೋರ್ಟಬಲ್ ವೈಯಕ್ತಿಕ ಕಂಪ್ಯೂಟರ್.\n"
            "• ಘಟಕಗಳು: CPU, RAM, SSD/HDD, ಪ್ರದರ್ಶನ, ಕೀಬೋರ್ಡ್, ಟಚ್‌ಪ್ಯಾಡ್, ಬ್ಯಾಟರಿ\n"
            "• ಬಳಕೆ: ಕೆಲಸ, ಅಧ್ಯಯನ, ಮನರಂಜನೆ, ಸಂವಹನ\n"
            "• ಮೋಜಿನ ಸಂಗತಿ: ಮೊದಲ ಲ್ಯಾಪ್‌ಟಾಪ್ (Osborne 1) ತೂಕ 10.7 ಕೆ.ಜಿ. ಇತ್ತು!\n"
            "• ಸಲಹೆ: ಓವರ್‌ಹೀಟಿಂಗ್ ತಪ್ಪಿಸಲು ವೆಂಟಿಲೇಶನ್ ಸ್ಪಷ್ಟವಾಗಿ ಇರಿಸಿ"
        ),
    },
    "person": {
        "en": (
            "A person is a human being, the most complex living organism on Earth.\n"
            "• Average height: ~1.7 m\n"
            "• Capabilities: Speech, abstract thinking, tool use, creativity\n"
            "• Fun fact: The human brain has ~86 billion neurons\n"
            "• Social: Humans are inherently social beings who thrive in communities"
        ),
        "hi": (
            "एक व्यक्ति एक मानव प्राणी है, पृथ्वी पर सबसे जटिल जीवित प्राणी।\n"
            "• औसत ऊंचाई: ~1.7 मीटर\n"
            "• क्षमताएं: भाषण, अमूर्त सोच, उपकरण उपयोग, रचनात्मकता\n"
            "• रोचक तथ्य: मानव मस्तिष्क में लगभग 86 अरब न्यूरॉन्स होते हैं\n"
            "• सामाजिक: मनुष्य स्वभाव से सामाजिक प्राणी हैं"
        ),
        "kn": (
            "ಒಬ್ಬ ವ್ಯಕ್ತಿ ಮಾನವ ಜೀವಿ, ಭೂಮಿಯ ಮೇಲಿನ ಅತ್ಯಂತ ಸಂಕೀರ್ಣ ಜೀವಂತ ಜೀವಿ.\n"
            "• ಸರಾಸರಿ ಎತ್ತರ: ~1.7 ಮೀ\n"
            "• ಸಾಮರ್ಥ್ಯಗಳು: ಭಾಷಣ, ಅಮೂರ್ತ ಚಿಂತನೆ, ಉಪಕರಣ ಬಳಕೆ, ಸೃಜನಶೀಲತೆ\n"
            "• ಮೋಜಿನ ಸಂಗತಿ: ಮಾನವ ಮೆದುಳಿನಲ್ಲಿ ~86 ಶತಕೋಟಿ ನ್ಯೂರಾನ್‌ಗಳಿವೆ\n"
            "• ಸಾಮಾಜಿಕ: ಮನುಷ್ಯರು ಸ್ವಭಾವತಃ ಸಾಮಾಜಿಕ ಜೀವಿಗಳು"
        ),
    },
}

# ── Generic templates for unknown objects ─────────────────────────────────────
GENERIC_TEMPLATES = {
    "en": (
        "{name} is an object commonly encountered in everyday environments.\n"
        "• It serves specific functional purposes depending on its context.\n"
        "• It can come in various shapes, sizes, and materials.\n"
        "• Modern versions are often designed with both form and function in mind.\n"
        "• Always handle objects with appropriate care and safety awareness."
    ),
    "hi": (
        "{name} एक ऐसी वस्तु है जो रोजमर्रा के वातावरण में आमतौर पर पाई जाती है।\n"
        "• यह अपने संदर्भ के आधार पर विशिष्ट कार्यात्मक उद्देश्यों की पूर्ति करती है।\n"
        "• यह विभिन्न आकारों, आकृतियों और सामग्रियों में उपलब्ध हो सकती है।\n"
        "• आधुनिक संस्करण अक्सर रूप और कार्य दोनों को ध्यान में रखकर डिजाइन किए जाते हैं।\n"
        "• वस्तुओं को उचित देखभाल और सुरक्षा जागरूकता के साथ संभालें।"
    ),
    "kn": (
        "{name} ದೈನಂದಿನ ಪರಿಸರದಲ್ಲಿ ಸಾಮಾನ್ಯವಾಗಿ ಕಂಡುಬರುವ ವಸ್ತು.\n"
        "• ಇದು ತನ್ನ ಸಂದರ್ಭದ ಆಧಾರದ ಮೇಲೆ ನಿರ್ದಿಷ್ಟ ಕ್ರಿಯಾತ್ಮಕ ಉದ್ದೇಶಗಳನ್ನು ಪೂರೈಸುತ್ತದೆ.\n"
        "• ಇದು ವಿವಿಧ ಆಕಾರ, ಗಾತ್ರ ಮತ್ತು ವಸ್ತುಗಳಲ್ಲಿ ಬರಬಹುದು.\n"
        "• ಆಧುನಿಕ ಆವೃತ್ತಿಗಳು ಸಾಮಾನ್ಯವಾಗಿ ರೂಪ ಮತ್ತು ಕಾರ್ಯ ಎರಡನ್ನೂ ಗಮನದಲ್ಲಿಟ್ಟು ವಿನ್ಯಾಸಗೊಳಿಸಲ್ಪಡುತ್ತವೆ.\n"
        "• ವಸ್ತುಗಳನ್ನು ಸೂಕ್ತ ಕಾಳಜಿ ಮತ್ತು ಸುರಕ್ಷತಾ ಅರಿವಿನೊಂದಿಗೆ ನಿಭಾಯಿಸಿ."
    ),
}

# ── Quick descriptions (spoken) ───────────────────────────────────────────────
QUICK_DESCS = {
    "en": {
        "bottle":     "This is a bottle. It is used to store liquids.",
        "chair":      "This is a chair. It is used for sitting.",
        "laptop":     "This is a laptop computer. It is a portable computing device.",
        "person":     "A person is standing in front of the camera.",
        "car":        "This is a car. It is a motor vehicle for transportation.",
        "dog":        "This is a dog. Dogs are loyal domestic animals.",
        "cat":        "This is a cat. Cats are popular household pets.",
        "book":       "This is a book. Books are used for reading and learning.",
        "cup":        "This is a cup. It is used for drinking beverages.",
        "cell phone": "This is a mobile phone. It is used for communication.",
        "default":    "An object has been detected in the camera view.",
    },
    "hi": {
        "bottle":     "यह एक बोतल है। इसका उपयोग तरल पदार्थ संग्रहीत करने के लिए किया जाता है।",
        "chair":      "यह एक कुर्सी है। इसका उपयोग बैठने के लिए किया जाता है।",
        "laptop":     "यह एक लैपटॉप कंप्यूटर है। यह एक पोर्टेबल कंप्यूटिंग डिवाइस है।",
        "person":     "कैमरे के सामने एक व्यक्ति खड़ा है।",
        "car":        "यह एक कार है। यह परिवहन के लिए एक मोटर वाहन है।",
        "dog":        "यह एक कुत्ता है। कुत्ते वफादार पालतू जानवर होते हैं।",
        "cat":        "यह एक बिल्ली है। बिल्लियाँ लोकप्रिय पालतू जानवर हैं।",
        "book":       "यह एक किताब है। किताबें पढ़ने और सीखने के लिए उपयोग की जाती हैं।",
        "cup":        "यह एक कप है। इसका उपयोग पेय पदार्थ पीने के लिए किया जाता है।",
        "cell phone": "यह एक मोबाइल फ़ोन है। इसका उपयोग संचार के लिए किया जाता है।",
        "default":    "कैमरे में एक वस्तु पकड़ी गई है।",
    },
    "kn": {
        "bottle":     "ಇದು ಒಂದು ಬಾಟಲ್. ಇದನ್ನು ದ್ರವ ಸಂಗ್ರಹಿಸಲು ಬಳಸಲಾಗುತ್ತದೆ.",
        "chair":      "ಇದು ಒಂದು ಕುರ್ಚಿ. ಇದನ್ನು ಕೂರಲು ಬಳಸಲಾಗುತ್ತದೆ.",
        "laptop":     "ಇದು ಒಂದು ಲ್ಯಾಪ್‌ಟಾಪ್ ಕಂಪ್ಯೂಟರ್. ಇದು ಪೋರ್ಟಬಲ್ ಕಂಪ್ಯೂಟಿಂಗ್ ಸಾಧನ.",
        "person":     "ಕ್ಯಾಮೆರಾ ಮುಂದೆ ಒಬ್ಬ ವ್ಯಕ್ತಿ ನಿಂತಿದ್ದಾರೆ.",
        "car":        "ಇದು ಒಂದು ಕಾರು. ಇದು ಸಾರಿಗೆಗಾಗಿ ಮೋಟಾರು ವಾಹನ.",
        "dog":        "ಇದು ಒಂದು ನಾಯಿ. ನಾಯಿಗಳು ನಿಷ್ಠಾವಂತ ಸಾಕು ಪ್ರಾಣಿಗಳು.",
        "cat":        "ಇದು ಒಂದು ಬೆಕ್ಕು. ಬೆಕ್ಕುಗಳು ಜನಪ್ರಿಯ ಮನೆ ಸಾಕು ಪ್ರಾಣಿಗಳು.",
        "book":       "ಇದು ಒಂದು ಪುಸ್ತಕ. ಪುಸ್ತಕಗಳನ್ನು ಓದಲು ಮತ್ತು ಕಲಿಯಲು ಬಳಸಲಾಗುತ್ತದೆ.",
        "cup":        "ಇದು ಒಂದು ಕಪ್. ಇದನ್ನು ಪಾನೀಯ ಕುಡಿಯಲು ಬಳಸಲಾಗುತ್ತದೆ.",
        "cell phone": "ಇದು ಒಂದು ಮೊಬೈಲ್ ಫೋನ್. ಇದನ್ನು ಸಂವಹನಕ್ಕಾಗಿ ಬಳಸಲಾಗುತ್ತದೆ.",
        "default":    "ಕ್ಯಾಮೆರಾದಲ್ಲಿ ಒಂದು ವಸ್ತು ಪತ್ತೆಯಾಗಿದೆ.",
    },
}

# ── Chat responses ─────────────────────────────────────────────────────────────
CHAT_TEMPLATES = {
    "en": {
        "what": "A {obj} is an everyday object. {desc}",
        "use":  "A {obj} is primarily used for its intended purpose in daily life.",
        "safe": "A {obj} is generally safe when handled with normal care and attention.",
        "where":"You can typically find a {obj} at home, in stores, or in public spaces.",
        "how":  "{obj}s are manufactured to meet quality standards for durability and safety.",
        "fact": random.choice([
            "{obj}s have been used by humans for many centuries.",
            "Modern {obj}s often incorporate innovative design features.",
            "{obj}s come in countless varieties across different cultures.",
        ]),
        "default": "I see a {obj}! Ask me what it is, what it's used for, or any other question.",
    },
    "hi": {
        "what": "{obj} एक रोजमर्रा की वस्तु है। {desc}",
        "use":  "{obj} का उपयोग मुख्य रूप से दैनिक जीवन में अपने उद्देश्य के लिए किया जाता है।",
        "safe": "{obj} सामान्यतः सावधानी से संभालने पर सुरक्षित होता है।",
        "where":"आप आमतौर पर {obj} घर, दुकानों या सार्वजनिक स्थानों पर पा सकते हैं।",
        "how":  "{obj} गुणवत्ता मानकों को पूरा करने के लिए निर्मित किए जाते हैं।",
        "fact": "{obj} कई शताब्दियों से मनुष्यों द्वारा उपयोग किए जाते रहे हैं।",
        "default": "मैं एक {obj} देख रहा हूँ! पूछें यह क्या है, इसका उपयोग क्या है, या कोई अन्य प्रश्न।",
    },
    "kn": {
        "what": "{obj} ಒಂದು ದೈನಂದಿನ ವಸ್ತು. {desc}",
        "use":  "{obj} ಅನ್ನು ಮುಖ್ಯವಾಗಿ ದೈನಂದಿನ ಜೀವನದಲ್ಲಿ ಅದರ ಉದ್ದೇಶಕ್ಕಾಗಿ ಬಳಸಲಾಗುತ್ತದೆ.",
        "safe": "{obj} ಸಾಮಾನ್ಯ ಎಚ್ಚರಿಕೆಯಿಂದ ನಿಭಾಯಿಸಿದಾಗ ಸಾಮಾನ್ಯವಾಗಿ ಸುರಕ್ಷಿತ.",
        "where":"ನೀವು ಸಾಮಾನ್ಯವಾಗಿ {obj} ಅನ್ನು ಮನೆ, ಅಂಗಡಿ ಅಥವಾ ಸಾರ್ವಜನಿಕ ಸ್ಥಳಗಳಲ್ಲಿ ಕಾಣಬಹುದು.",
        "how":  "{obj}ಗಳನ್ನು ಗುಣಮಟ್ಟದ ಮಾನದಂಡಗಳನ್ನು ಪೂರೈಸಲು ತಯಾರಿಸಲಾಗುತ್ತದೆ.",
        "fact": "{obj}ಗಳನ್ನು ಮನುಷ್ಯರು ಅನೇಕ ಶತಮಾನಗಳಿಂದ ಬಳಸುತ್ತಿದ್ದಾರೆ.",
        "default": "ನಾನು ಒಂದು {obj} ನೋಡುತ್ತಿದ್ದೇನೆ! ಇದು ಏನೆಂದು, ಇದನ್ನು ಯಾಕೆ ಬಳಸುತ್ತಾರೆ ಎಂದು ಕೇಳಿ.",
    },
}


class AIHandler:
    """Multilingual AI response generator for all YOLO objects."""

    def get_translated_name(self, name: str, lang: str) -> str:
        if lang == 'en':
            return name
        translations = OBJECT_NAMES.get(name.lower(), {})
        return translations.get(lang, name)

    def get_quick_description(self, name: str, lang: str = 'en') -> str:
        descs = QUICK_DESCS.get(lang, QUICK_DESCS['en'])
        return descs.get(name.lower(), descs['default'])

    def get_full_info(self, name: str, lang: str = 'en') -> str:
        info_map = FULL_INFO.get(name.lower(), {})
        if info_map:
            return info_map.get(lang, info_map.get('en', ''))
        # Generic template
        tmpl = GENERIC_TEMPLATES.get(lang, GENERIC_TEMPLATES['en'])
        trans_name = self.get_translated_name(name, lang)
        return tmpl.format(name=trans_name)

    def chat(self,
             message: str,
             obj_context: str | None,
             history: list,
             lang: str = 'en') -> str:
        msg  = message.lower()
        name = obj_context or "object"
        trans_name = self.get_translated_name(name, lang)
        tmpl = CHAT_TEMPLATES.get(lang, CHAT_TEMPLATES['en'])
        desc = self.get_quick_description(name, lang)

        if any(w in msg for w in ["what is","what's","what are","describe","tell me"]):
            return tmpl["what"].format(obj=trans_name, desc=desc)
        elif any(w in msg for w in ["use","purpose","for","why"]):
            return tmpl["use"].format(obj=trans_name)
        elif any(w in msg for w in ["safe","danger","hazard","harmful"]):
            return tmpl["safe"].format(obj=trans_name)
        elif any(w in msg for w in ["where","find","locate","buy"]):
            return tmpl["where"].format(obj=trans_name)
        elif any(w in msg for w in ["how","made","manufacture","create"]):
            return tmpl["how"].format(obj=trans_name)
        elif any(w in msg for w in ["fact","interesting","fun","know"]):
            return tmpl["fact"].format(obj=trans_name)
        else:
            return tmpl["default"].format(obj=trans_name)

    def obstacle_alert(self, name: str, dist_m: float, lang: str = 'en') -> str:
        lbl = LABELS.get(lang, LABELS['en'])
        trans_name = self.get_translated_name(name, lang)
        dist_str = f"{dist_m} m"
        return (f"{lbl['obstacle']} {trans_name} {lbl['too_close']} "
                f"{dist_str}! {lbl['move_back']}")