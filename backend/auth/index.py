"""
Авторизация X Test Anomalies.
POST /register — регистрация
POST /login — вход
POST /logout — выход
GET / — проверка сессии
"""
import json
import os
import hashlib
import secrets
from datetime import datetime, timedelta
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p36965254_kursk_anomaly_messen")
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}

LEVEL_XP = {
    "seeker": 0, "observer": 500, "hunter": 1500,
    "stalker": 4000, "tester": 10000, "x_tester": 25000,
}
LEVELS_ORDER = ["seeker", "observer", "hunter", "stalker", "tester", "x_tester"]


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def hash_password(pwd: str) -> str:
    return hashlib.sha256(pwd.encode()).hexdigest()


def calc_level(xp: int) -> str:
    level = "seeker"
    for lv in LEVELS_ORDER:
        if xp >= LEVEL_XP[lv]:
            level = lv
    return level


def get_user_by_session(conn, session_id: str):
    cur = conn.cursor()
    cur.execute(
        f"SELECT u.id, u.username, u.role, u.level, u.xp, u.is_banned "
        f"FROM {SCHEMA}.sessions s JOIN {SCHEMA}.users u ON s.user_id = u.id "
        f"WHERE s.id = %s AND s.expires_at > NOW()",
        (session_id,)
    )
    row = cur.fetchone()
    cur.close()
    if not row:
        return None
    return {"id": row[0], "username": row[1], "role": row[2], "level": row[3], "xp": row[4], "is_banned": row[5]}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    session_id = event.get("headers", {}).get("X-Session-Id", "")

    conn = get_conn()
    try:
        # Проверка сессии
        if method == "GET" and path == "/":
            if not session_id:
                return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "no_session"})}
            user = get_user_by_session(conn, session_id)
            if not user:
                return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "invalid_session"})}
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"user": user})}

        # Регистрация
        if method == "POST" and path.endswith("/register"):
            username = body.get("username", "").strip()
            password = body.get("password", "").strip()
            if not username or not password:
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "empty_fields"})}
            if len(username) < 3 or len(username) > 50:
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "username_length"})}
            if len(password) < 6:
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "password_too_short"})}

            cur = conn.cursor()
            cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE username = %s", (username,))
            if cur.fetchone():
                cur.close()
                return {"statusCode": 409, "headers": CORS, "body": json.dumps({"error": "username_taken"})}

            pw_hash = hash_password(password)
            cur.execute(
                f"INSERT INTO {SCHEMA}.users (username, password_hash, role, level, xp) VALUES (%s, %s, 'user', 'seeker', 0) RETURNING id",
                (username, pw_hash)
            )
            user_id = cur.fetchone()[0]
            conn.commit()

            sid = secrets.token_hex(32)
            expires = datetime.now() + timedelta(days=30)
            cur.execute(
                f"INSERT INTO {SCHEMA}.sessions (id, user_id, expires_at) VALUES (%s, %s, %s)",
                (sid, user_id, expires)
            )
            conn.commit()
            cur.close()

            return {
                "statusCode": 200, "headers": CORS,
                "body": json.dumps({"session_id": sid, "user": {"id": user_id, "username": username, "role": "user", "level": "seeker", "xp": 0}})
            }

        # Вход
        if method == "POST" and path.endswith("/login"):
            username = body.get("username", "").strip()
            password = body.get("password", "").strip()
            pw_hash = hash_password(password)

            cur = conn.cursor()
            cur.execute(
                f"SELECT id, username, role, level, xp, is_banned FROM {SCHEMA}.users WHERE username = %s AND password_hash = %s",
                (username, pw_hash)
            )
            row = cur.fetchone()
            if not row:
                cur.close()
                return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "wrong_credentials"})}
            if row[5]:
                cur.close()
                return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "banned"})}

            user_id, uname, role, level, xp, _ = row
            # Пересчёт уровня по XP
            actual_level = calc_level(xp)
            if actual_level != level:
                cur.execute(f"UPDATE {SCHEMA}.users SET level = %s WHERE id = %s", (actual_level, user_id))
                conn.commit()
                level = actual_level

            sid = secrets.token_hex(32)
            expires = datetime.now() + timedelta(days=30)
            cur.execute(
                f"INSERT INTO {SCHEMA}.sessions (id, user_id, expires_at) VALUES (%s, %s, %s)",
                (sid, user_id, expires)
            )
            cur.execute(f"UPDATE {SCHEMA}.users SET last_seen = NOW() WHERE id = %s", (user_id,))
            conn.commit()
            cur.close()

            return {
                "statusCode": 200, "headers": CORS,
                "body": json.dumps({"session_id": sid, "user": {"id": user_id, "username": uname, "role": role, "level": level, "xp": xp}})
            }

        # Выход
        if method == "POST" and path.endswith("/logout"):
            if session_id:
                cur = conn.cursor()
                cur.execute(f"UPDATE {SCHEMA}.sessions SET expires_at = NOW() WHERE id = %s", (session_id,))
                conn.commit()
                cur.close()
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "not_found"})}
    finally:
        conn.close()
