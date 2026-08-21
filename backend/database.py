"""
database.py – MySQL helper using PyMySQL
"""

import os
import pymysql
import pymysql.cursors
from dotenv import load_dotenv

load_dotenv()

def _connect():
    return pymysql.connect(
        host     = os.getenv("DB_HOST",     "localhost"),
        port     = int(os.getenv("DB_PORT", "3306")),
        user     = os.getenv("DB_USER",     "root"),
        password = os.getenv("DB_PASSWORD", ""),
        database = os.getenv("DB_NAME",     "smart_vision"),
        charset  = "utf8mb4",
        cursorclass = pymysql.cursors.DictCursor,
        autocommit  = True,
    )

def query(sql, args=None, fetchone=False, fetchall=False):
    """
    Run any SQL statement.
    - fetchone=True  → return single dict or None
    - fetchall=True  → return list of dicts
    - otherwise      → return lastrowid (for INSERT) or None
    """
    conn = _connect()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, args or ())
            if fetchone:
                return cur.fetchone()
            if fetchall:
                return cur.fetchall()
            return cur.lastrowid
    finally:
        conn.close()

def test_connection():
    try:
        row = query("SELECT VERSION() AS v", fetchone=True)
        print(f"  ✓  MySQL connected — {row['v']}")
        return True
    except Exception as e:
        print(f"  ✗  MySQL error: {e}")
        print(f"     Check your .env file — make sure DB_PASSWORD is correct")
        return False