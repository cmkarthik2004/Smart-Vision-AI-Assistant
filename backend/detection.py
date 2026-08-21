"""
detection.py - Improved detection with lower confidence and better settings
"""
# 
"""
detection.py — Smart Vision AI Assistant
Fixed: High-accuracy detection with strict confidence, NMS deduplication,
       size-based sanity checks, and user correction learning.
"""

import os, json
import numpy as np

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False

# ── Confidence thresholds ─────────────────────────────────────
# Primary threshold — only detections above this are accepted
MIN_CONFIDENCE = 0.60        

# Per-class minimum confidence (stricter for commonly confused classes)
CLASS_MIN_CONF = {
    "dog":          0.70,      # dogs often confused with cats/bears/people
    "cat":          0.70,
    "person":       0.60,
    "bear":         0.80,      # rare — needs very high confidence
    "horse":        0.75,
    "cow":          0.75,
    "sheep":        0.75,
    "bird":         0.70,
    "cell phone":   0.65,
    "remote":       0.65,      # often confused with phone
    "knife":        0.80,      # safety — only flag if very sure
}

# ── Classes that need a minimum bounding-box size ─────────────
# Prevents detecting a dog the size of a button, or a person as a tiny blob
MIN_BOX_AREA_FRACTION = {
    "person":    0.005,   # must be at least 0.5% of image area
    "dog":       0.002,
    "cat":       0.001,
    "car":       0.010,
    "truck":     0.020,
    "bus":       0.020,
}

# ── Classes that are almost never indoors — reject if image is small ──
OUTDOOR_ONLY_CLASSES = {"bear", "elephant", "giraffe", "zebra", "horse", "cow", "sheep"}

# ── NMS (Non-Maximum Suppression) overlap threshold ───────────
NMS_IOU_THRESHOLD = 0.45   # boxes overlapping > 45% are deduplicated

# ── Commonly confused pairs — if score diff < threshold, pick neither ──
CONFUSED_PAIRS = [
    ({"dog", "cat"},          0.20),   # if dog=0.60 and cat=0.55, skip both
    ({"person", "dog"},       0.25),
    ({"cell phone", "remote"},0.20),
    ({"knife", "spoon"},      0.25),
    ({"fork", "spoon"},       0.15),
]

# ── Corrections file (user feedback) ─────────────────────────
CORRECTIONS_FILE = os.path.join(os.path.dirname(__file__), '..', 'corrections.json')


class ObjectDetector:
    def __init__(self):
        self.model = None
        self.corrections = {}    # wrong_name → correct_name
        self._load_model()
        self.reload_corrections()

    def _load_model(self):
        """Load YOLOv8 model. Tries nano first (fast), then small (more accurate)."""
        if not YOLO_AVAILABLE:
            print("  ⚠️  ultralytics not installed — detection disabled")
            return
        for model_name in ['yolov8m.pt', 'yolov8s.pt']:
            try:
                self.model = YOLO(model_name)
                print(f"  ✅  YOLOv8 loaded: {model_name}")
                return
            except Exception as e:
                print(f"  ⚠️  Could not load {model_name}: {e}")
        print("  ❌  No YOLOv8 model found")

    def reload_corrections(self):
        """Load user-submitted label corrections from JSON file."""
        try:
            if os.path.exists(CORRECTIONS_FILE):
                with open(CORRECTIONS_FILE, 'r') as f:
                    data = json.load(f)
                self.corrections = {
                    item['wrong_label'].lower(): item['correct_label'].lower()
                    for item in data if item.get('wrong_label') and item.get('correct_label')
                }
        except Exception as e:
            print(f"  Corrections load error: {e}")
            self.corrections = {}

    def detect(self, img):
        """
        Run detection on a BGR image (numpy array).
        Returns list of dicts: {name, confidence, bbox, original_name}
        """
        if self.model is None or img is None:
            return []

        h, w = img.shape[:2]
        img_area = h * w

        try:
            # Run inference — confidence filter applied at model level too
            results = self.model(
                img,
                conf=MIN_CONFIDENCE,   # model-level pre-filter
                iou=NMS_IOU_THRESHOLD, # model-level NMS
                verbose=False,
                max_det=10             # never return more than 10 boxes
            )
        except Exception as e:
            print(f"  Detection error: {e}")
            return []

        raw_dets = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                try:
                    conf  = float(box.conf[0])
                    cls_id= int(box.cls[0])
                    name  = self.model.names[cls_id].lower()
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                    # ── 1. Per-class confidence gate ──────────────────
                    required = CLASS_MIN_CONF.get(name, MIN_CONFIDENCE)
                    if conf < required:
                        continue

                    # ── 2. Bounding box sanity check ──────────────────
                    box_area = (x2 - x1) * (y2 - y1)
                    min_frac = MIN_BOX_AREA_FRACTION.get(name, 0.0005)
                    if box_area < img_area * min_frac:
                        continue   # box is too tiny to be a real detection

                    # ── 3. Aspect ratio sanity ─────────────────────────
                    box_w = x2 - x1
                    box_h = y2 - y1
                    if box_w < 10 or box_h < 10:
                        continue   # degenerate box

                    raw_dets.append({
                        'name':       name,
                        'confidence': conf,
                        'bbox':       [x1, y1, x2, y2],
                    })
                except Exception:
                    continue

        # ── 4. Resolve confused pairs ──────────────────────────────────
        raw_dets = self._resolve_confused_pairs(raw_dets)

        # ── 5. Sort by confidence, keep best per-class ─────────────────
        raw_dets = self._deduplicate_by_class(raw_dets)

        # ── 6. Apply user corrections ──────────────────────────────────
        enriched = []
        for det in raw_dets:
            original_name = det['name']
            corrected     = self.corrections.get(original_name, original_name)
            enriched.append({
                'name':          corrected,
                'original_name': original_name,
                'confidence':    round(det['confidence'], 4),
                'bbox':          det['bbox'],
            })

        return enriched

    def _resolve_confused_pairs(self, dets):
        """
        If two detections belong to a commonly confused pair and their
        confidence scores are close, remove the lower-confidence one.
        If both are very close in score, remove both.
        """
        if len(dets) < 2:
            return dets

        to_remove = set()

        for pair_set, threshold in CONFUSED_PAIRS:
            # Find all detections belonging to this pair
            pair_dets = [(i, d) for i, d in enumerate(dets) if d['name'] in pair_set]
            if len(pair_dets) < 2:
                continue

            # Sort by confidence descending
            pair_dets.sort(key=lambda x: x[1]['confidence'], reverse=True)
            best_idx, best_det = pair_dets[0]
            for other_idx, other_det in pair_dets[1:]:
                diff = best_det['confidence'] - other_det['confidence']
                if diff < threshold:
                    # Too close — remove the lower one (ambiguous)
                    to_remove.add(other_idx)
                    # If extremely close, remove both
                    if diff < threshold * 0.3:
                        to_remove.add(best_idx)
                else:
                    # Clear winner — just remove the loser
                    to_remove.add(other_idx)

        return [d for i, d in enumerate(dets) if i not in to_remove]

    def _deduplicate_by_class(self, dets):
        """
        Per class, keep only the detection with the highest confidence.
        This prevents the same object being reported twice as slightly
        different bounding boxes (YOLOv8 NMS sometimes misses these).
        Also applies a hard cap: max 5 unique classes returned.
        """
        seen = {}
        for det in sorted(dets, key=lambda d: d['confidence'], reverse=True):
            name = det['name']
            if name not in seen:
                seen[name] = det
        # Return top 5 by confidence
        result = sorted(seen.values(), key=lambda d: d['confidence'], reverse=True)
        return result[:8]