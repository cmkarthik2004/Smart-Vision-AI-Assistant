"""
feedback.py – Model correction feedback system.
Users report wrong detections; data saved to DB + JSONL file for retraining.
"""

import os, json, datetime
from database import query

FEEDBACK_LOG = os.path.join(os.path.dirname(__file__), '..', 'feedback_log.jsonl')


def submit_feedback(user_id, image_filename, wrong_label, correct_label,
                    wrong_distance=None, correct_distance=None, extra_notes=''):
    """Save a user correction to DB and append to JSONL training log."""
    if not wrong_label or not correct_label:
        return {"ok": False, "error": "Both wrong and correct labels are required"}

    try:
        fb_id = query(
            """INSERT INTO model_feedback
               (user_id, image_filename, wrong_label, correct_label,
                wrong_distance, correct_distance, extra_notes, status)
               VALUES (%s,%s,%s,%s,%s,%s,%s,'pending')""",
            (user_id, image_filename, wrong_label.strip(), correct_label.strip(),
             wrong_distance, correct_distance, extra_notes)
        )

        # Append to JSONL file for future model retraining pipeline
        entry = {
            "id":               fb_id,
            "user_id":          user_id,
            "timestamp":        datetime.datetime.now().isoformat(),
            "image_filename":   image_filename,
            "wrong_label":      wrong_label,
            "correct_label":    correct_label,
            "wrong_distance":   wrong_distance,
            "correct_distance": correct_distance,
            "extra_notes":      extra_notes,
            "status":           "pending",
        }
        with open(FEEDBACK_LOG, 'a', encoding='utf-8') as f:
            f.write(json.dumps(entry) + '\n')

        return {
            "ok":         True,
            "feedback_id": fb_id,
            "message":    "Thank you! Your correction has been saved and will help improve the model."
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


def get_user_feedback(user_id):
    """Return all feedback submitted by a user."""
    rows = query(
        """SELECT id, image_filename, wrong_label, correct_label,
                  wrong_distance, correct_distance, extra_notes, status,
                  DATE_FORMAT(created_at,'%%Y-%%m-%%d %%H:%%i') AS created_at
           FROM model_feedback
           WHERE user_id=%s
           ORDER BY created_at DESC LIMIT 50""",
        (user_id,), fetchall=True
    ) or []
    return {"ok": True, "feedback": rows}


def export_training_corrections():
    """Export all approved corrections as training data JSON."""
    rows = query(
        """SELECT mf.*, ui.filename AS stored_filename
           FROM model_feedback mf
           LEFT JOIN user_images ui
             ON mf.image_filename = ui.filename AND mf.user_id = ui.user_id
           WHERE mf.status IN ('reviewed','approved')
           ORDER BY mf.created_at""",
        fetchall=True
    ) or []
    return {"ok": True, "training_data": rows, "count": len(rows)}


def get_correction_stats():
    """Admin stats on feedback submissions."""
    total  = (query("SELECT COUNT(*) AS c FROM model_feedback",
                    fetchone=True) or {}).get('c', 0)
    pending = (query("SELECT COUNT(*) AS c FROM model_feedback WHERE status='pending'",
                     fetchone=True) or {}).get('c', 0)
    trained = (query("SELECT COUNT(*) AS c FROM model_feedback WHERE status='trained'",
                     fetchone=True) or {}).get('c', 0)

    top = query(
        """SELECT wrong_label, correct_label, COUNT(*) AS freq
           FROM model_feedback
           GROUP BY wrong_label, correct_label
           ORDER BY freq DESC LIMIT 10""",
        fetchall=True
    ) or []

    return {
        "ok":          True,
        "total":       total,
        "pending":     pending,
        "trained":     trained,
        "top_corrections": top,
    }