"""
auth.py – Registration, login, session management
Uses hashlib (SHA-256 + salt) instead of bcrypt — no C compiler needed on Windows.
"""

import secrets
import hashlib
import datetime
from functools import wraps
from flask import request, jsonify, g
from database import query

SESSION_HOURS = 168   # 7 days

# ── Password hashing (no bcrypt needed) ──────────────────────────────────────
def hash_password(password: str) -> str:
    """SHA-256 with random salt. Format: salt:hash"""
    salt   = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{hashed}"

def check_password(password: str, stored_hash: str) -> bool:
    try:
        salt, hashed = stored_hash.split(":")
        return hashlib.sha256((salt + password).encode()).hexdigest() == hashed
    except Exception:
        return False

# ── Register ──────────────────────────────────────────────────────────────────
def register_user(user_id: str, username: str, password: str):
    user_id  = user_id.strip().lower()
    username = username.strip()

    if not user_id or not username or not password:
        return {"ok": False, "error": "All fields required"}
    if len(user_id) < 3:
        return {"ok": False, "error": "User ID must be at least 3 characters"}
    if len(password) < 6:
        return {"ok": False, "error": "Password must be at least 6 characters"}

    exists = query("SELECT id FROM users WHERE user_id=%s OR username=%s",
                   (user_id, username), fetchone=True)
    if exists:
        return {"ok": False, "error": "User ID or username already taken"}

    pw_hash = hash_password(password)
    query(
        "INSERT INTO users (user_id, username, password_hash) VALUES (%s, %s, %s)",
        (user_id, username, pw_hash)
    )
    return {"ok": True, "message": "Registration successful", "user_id": user_id}

# ── Login ─────────────────────────────────────────────────────────────────────
def login_user(identifier: str, password: str):
    """Login with user_id OR username."""
    identifier = identifier.strip().lower()
    row = (
        query("SELECT * FROM users WHERE user_id=%s",  (identifier,), fetchone=True)
        or
        query("SELECT * FROM users WHERE LOWER(username)=%s", (identifier,), fetchone=True)
    )
    if not row:
        return {"ok": False, "error": "User not found"}
    if not check_password(password, row["password_hash"]):
        return {"ok": False, "error": "Incorrect password"}

    token   = secrets.token_hex(32)
    expires = datetime.datetime.now() + datetime.timedelta(hours=SESSION_HOURS)
    query(
        "INSERT INTO sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (row["user_id"], token, expires)
    )
    query("UPDATE users SET last_login=NOW() WHERE user_id=%s", (row["user_id"],))

    return {
        "ok":      True,
        "token":   token,
        "user_id": row["user_id"],
        "username": row["username"],
    }

# ── Token validation ──────────────────────────────────────────────────────────
def validate_token(token: str):
    if not token:
        return None
    return query(
        """SELECT s.user_id, u.username
           FROM sessions s
           JOIN users u ON s.user_id = u.user_id
           WHERE s.token=%s AND s.expires_at > NOW()""",
        (token,), fetchone=True
    )

def logout_user(token: str):
    query("DELETE FROM sessions WHERE token=%s", (token,))

# ── get_db() ─────────────────────────────────────────────────────────────────
def get_db():
    import os, pymysql, pymysql.cursors
    from dotenv import load_dotenv
    load_dotenv()
    return pymysql.connect(
        host=os.getenv("DB_HOST","localhost"), port=int(os.getenv("DB_PORT","3306")),
        user=os.getenv("DB_USER","root"), password=os.getenv("DB_PASSWORD",""),
        database=os.getenv("DB_NAME","smart_vision"),
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor, autocommit=True,
    )

# ── require_auth decorator ────────────────────────────────────────────────────
def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = (
            request.headers.get("Authorization","").replace("Bearer ","")
            or request.headers.get("X-Auth-Token","")
            or request.cookies.get("auth_token","")
            or (request.get_json(silent=True) or {}).get("token","")
            or request.form.get("token","")
            or request.args.get("token","")
        )
        user = validate_token(token)
        if not user:
            return jsonify({"error":"Not authenticated","redirect":"/"}), 401
        g.user_id = user["user_id"]
        g.user    = user
        return f(*args, **kwargs)
    return decorated



