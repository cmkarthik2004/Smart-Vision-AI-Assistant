from database import query
from auth import hash_password

try:
    query("ALTER TABLE users ADD COLUMN is_admin TINYINT(1) DEFAULT 0")
    print("is_admin column added")
except:
    print("is_admin column already exists")

pwd = hash_password("karthik@2004")

try:
    query(
        "INSERT INTO users (user_id, username, password_hash, is_admin) VALUES (%s,%s,%s,%s)",
        ("cmkaarthik", "CM Karthik", pwd, 1)
    )

    print("Admin created successfully")
    print("Username: cmkaarthik")
    print("Password: karthik@2004")

except Exception as e:
    print("Error:", e)