"""
ocr_handler.py – OCR text extraction (Windows-compatible)
Works with pytesseract if installed, otherwise gives clear install instructions.
"""

import cv2
import numpy as np
import os
import sys
import platform

# ── Try to import and configure pytesseract ───────────────────────────────────
TESSERACT_AVAILABLE = False
TESSERACT_ERROR     = ""

try:
    import pytesseract

    # Windows: auto-detect common Tesseract install paths
    if platform.system() == "Windows":
        possible_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            r"C:\Users\cmkar\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
            r"C:\Tesseract-OCR\tesseract.exe",
        ]
        for p in possible_paths:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                print(f"  ✓  Tesseract found at: {p}")
                break
        else:
            # Try env variable
            env_path = os.environ.get("TESSERACT_PATH", "")
            if env_path and os.path.exists(env_path):
                pytesseract.pytesseract.tesseract_cmd = env_path

    # Quick test to confirm it actually works
    test_img = np.ones((30, 100), dtype=np.uint8) * 255
    pytesseract.image_to_string(test_img)
    TESSERACT_AVAILABLE = True
    print("  ✓  Tesseract OCR ready")

except ImportError:
    TESSERACT_ERROR = "pytesseract not installed"
except Exception as e:
    TESSERACT_ERROR = str(e)
    if "tesseract" in str(e).lower() or "not found" in str(e).lower():
        TESSERACT_ERROR = "Tesseract executable not found"

# ── Language configs ──────────────────────────────────────────────────────────
LANG_CONFIG = {
    'en': 'eng',
    'hi': 'hin+eng',
    'kn': 'kan+eng',
}

# Install instructions per OS
def get_install_instructions():
    system = platform.system()
    if system == "Windows":
        return (
            "To enable OCR on Windows:\n\n"
            "1. Download Tesseract installer from:\n"
            "   https://github.com/UB-Mannheim/tesseract/wiki\n\n"
            "2. Run the installer (install to default path)\n\n"
            "3. Also run: pip install pytesseract\n\n"
            "4. Restart Flask after installing"
        )
    elif system == "Darwin":
        return "Run: brew install tesseract && pip install pytesseract"
    else:
        return "Run: sudo apt install tesseract-ocr && pip install pytesseract"


class OCRHandler:
    """OCR text extraction with multiple preprocessing strategies."""

    def preprocess_standard(self, img: np.ndarray) -> np.ndarray:
        """Standard pipeline: grayscale → upscale → threshold → denoise."""
        gray     = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        upscaled = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        thresh   = cv2.adaptiveThreshold(
            upscaled, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 31, 10
        )
        denoised = cv2.fastNlMeansDenoising(thresh, h=15)
        return denoised

    def preprocess_otsu(self, img: np.ndarray) -> np.ndarray:
        """Otsu thresholding — good for clean printed text."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        up   = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        blur = cv2.GaussianBlur(up, (5, 5), 0)
        _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return thresh

    def preprocess_contrast(self, img: np.ndarray) -> np.ndarray:
        """High contrast — good for faint or low-contrast text."""
        gray    = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        up      = cv2.resize(gray, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        clahe   = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        equaled = clahe.apply(up)
        _, thresh = cv2.threshold(equaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return thresh

    def run_ocr(self, processed_img: np.ndarray, lang_code: str) -> str:
        """Run Tesseract on a preprocessed image with multiple PSM modes."""
        best_text = ""
        for psm in [6, 3, 11]:   # page layout, auto, sparse text
            try:
                cfg  = f"--oem 3 --psm {psm}"
                text = pytesseract.image_to_string(
                    processed_img, lang=lang_code, config=cfg
                ).strip()
                if len(text) > len(best_text):
                    best_text = text
            except Exception:
                continue
        return best_text

    def extract_text(self, img: np.ndarray, language: str = 'en') -> dict:
        """
        Main entry point. Tries 3 preprocessing methods and picks the best result.
        Returns dict with text, method, message, tip.
        """
        if not TESSERACT_AVAILABLE:
            return {
                "text":    None,
                "raw":     "",
                "language": language,
                "method":  "unavailable",
                "message": get_install_instructions(),
                "tip":     "OCR requires Tesseract to be installed on the server machine.",
            }

        lang_code = LANG_CONFIG.get(language, 'eng')
        best_text = ""

        # Try all 3 preprocessing strategies, keep the longest result
        for preprocess_fn in [
            self.preprocess_standard,
            self.preprocess_otsu,
            self.preprocess_contrast,
        ]:
            try:
                processed = preprocess_fn(img)
                text      = self.run_ocr(processed, lang_code)
                if len(text) > len(best_text):
                    best_text = text
            except Exception:
                continue

        if not best_text or len(best_text) < 2:
            return {
                "text":    None,
                "raw":     "",
                "language": language,
                "method":  "tesseract",
                "message": {
                    'en': "No readable text found. Make sure the image has clear, well-lit text.",
                    'hi': "कोई पाठ नहीं मिला। सुनिश्चित करें कि छवि में स्पष्ट पाठ हो।",
                    'kn': "ಯಾವ ಪಠ್ಯವೂ ಕಂಡುಬಂದಿಲ್ಲ. ಚಿತ್ರದಲ್ಲಿ ಸ್ಪಷ್ಟ ಪಠ್ಯ ಇರುವಂತೆ ನೋಡಿ.",
                }.get(language, "No readable text found."),
                "tip": {
                    'en': "💡 Tips: Use good lighting · Hold camera steady · Text should fill the frame · Printed text works best",
                    'hi': "💡 सुझाव: अच्छी रोशनी में लें · कैमरा स्थिर रखें · पाठ फ्रेम में भरा होना चाहिए",
                    'kn': "💡 ಸಲಹೆ: ಉತ್ತಮ ಬೆಳಕು ಬಳಸಿ · ಕ್ಯಾಮೆರಾ ಸ್ಥಿರವಾಗಿ ಹಿಡಿಯಿರಿ · ಮುದ್ರಿತ ಪಠ್ಯ ಉತ್ತಮವಾಗಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ",
                }.get(language, ""),
            }

        return {
            "text":    best_text,
            "raw":     best_text,
            "language": language,
            "method":  "tesseract",
            "message": None,
            "tip":     None,
        }