"""
run_check.py - Run this FIRST to diagnose why app.py won't start
Place in: K:\virtual assistant\backend\
Run with: python run_check.py
"""
import sys
print(f"Python version: {sys.version}")
print()

errors = []

# Check each import
modules = [
    ("flask",        "pip install flask"),
    ("flask_cors",   "pip install flask-cors"),
    ("cv2",          "pip install opencv-python"),
    ("numpy",        "pip install numpy"),
    ("torch",        "pip install torch --index-url https://download.pytorch.org/whl/cpu"),
    ("ultralytics",  "pip install ultralytics"),
    ("pymysql",      "pip install PyMySQL"),
    ("dotenv",       "pip install python-dotenv"),
    ("anthropic",    "pip install anthropic  (optional - for AI chat)"),
]

print("Checking required packages...")
print("-" * 50)
for mod, install_cmd in modules:
    try:
        __import__(mod)
        print(f"  OK   {mod}")
    except ImportError as e:
        print(f"  MISSING  {mod}  →  run:  {install_cmd}")
        errors.append((mod, install_cmd))

print()

# Check local modules
local_modules = ["detection", "ocr_handler", "color_detector", "auth",
                 "database", "image_store", "feedback"]
print("Checking local project files...")
print("-" * 50)
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for mod in local_modules:
    try:
        __import__(mod)
        print(f"  OK   {mod}.py")
    except ImportError as e:
        print(f"  MISSING  {mod}.py — file not found in backend folder")
        errors.append((mod, f"Create {mod}.py in backend folder"))
    except Exception as e:
        print(f"  ERROR  {mod}.py — {e}")
        errors.append((mod, str(e)))

print()

# Check .env file
print("Checking .env file...")
print("-" * 50)
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(env_path):
    print("  OK   .env file found")
    with open(env_path) as f:
        content = f.read()
    if 'DB_PASSWORD' in content:
        print("  OK   DB_PASSWORD is set")
    else:
        print("  WARN  DB_PASSWORD not found in .env")
else:
    print("  MISSING  .env file — create it with DB_PASSWORD=yourpassword")

print()

# Check MySQL connection
print("Checking MySQL connection...")
print("-" * 50)
try:
    import pymysql
    from dotenv import load_dotenv
    load_dotenv()
    conn = pymysql.connect(
        host=os.getenv('DB_HOST','localhost'),
        port=int(os.getenv('DB_PORT','3306')),
        user=os.getenv('DB_USER','root'),
        password=os.getenv('DB_PASSWORD',''),
        database=os.getenv('DB_NAME','smart_vision'),
        connect_timeout=5
    )
    conn.close()
    print("  OK   MySQL connected successfully")
except Exception as e:
    print(f"  ERROR  MySQL: {e}")
    print("         Make sure XAMPP MySQL is running and schema.sql was run")
    errors.append(("mysql", str(e)))

print()
print("=" * 50)
if errors:
    print(f"FOUND {len(errors)} PROBLEM(S) — fix them then run app.py again:")
    for mod, cmd in errors:
        print(f"  • {mod}: {cmd}")
else:
    print("ALL OK — you can now run:  python app.py")
print("=" * 50)