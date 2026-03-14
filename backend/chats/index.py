"""
Чаты X Test Anomalies.
GET /         — список чатов
GET /?chat_id=N — сообщения чата
POST /        — отправить сообщение
"""
import json
import os
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p36965254_kursk_anomaly_messen")
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-Id",
}
LEVEL_ORDER = ["seeker", "observer", "hunter", "stalker", "tester", "x_tester"]


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def get_user_by_session(conn, session_id: str):
    if not session_id:
        return None
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


def level_rank(level: str) -> int:
    try:
        return LEVEL_ORDER.index(level)
    except ValueError:
        return 0


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    session_id = event.get("headers", {}).get("X-Session-Id", "")
    conn = get_conn()

    try:
        user = get_user_by_session(conn, session_id)

        # Список чатов
        if method == "GET" and not qs.get("chat_id"):
            cur = conn.cursor()
            cur.execute(
                f"SELECT id, name, slug, type, description, min_level FROM {SCHEMA}.chats ORDER BY id"
            )
            rows = cur.fetchall()
            cur.close()
            chats = []
            for r in rows:
                # Подсчёт непрочитанных (просто последние 5 мин как unread для демо)
                cur2 = conn.cursor()
                cur2.execute(
                    f"SELECT COUNT(*) FROM {SCHEMA}.chat_messages WHERE chat_id = %s AND is_hidden = FALSE",
                    (r[0],)
                )
                msg_count = cur2.fetchone()[0]
                cur2.close()
                chats.append({
                    "id": r[0], "name": r[1], "slug": r[2], "type": r[3],
                    "description": r[4], "min_level": r[5], "message_count": msg_count,
                })
            return {"statusCode": 200, "headers": CORS, "body": json.dumps(chats)}

        # Сообщения чата
        if method == "GET" and qs.get("chat_id"):
            chat_id = int(qs["chat_id"])
            limit = int(qs.get("limit", 50))

            # Проверяем доступ по уровню
            cur = conn.cursor()
            cur.execute(f"SELECT min_level FROM {SCHEMA}.chats WHERE id = %s", (chat_id,))
            row = cur.fetchone()
            cur.close()
            if not row:
                return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "chat_not_found"})}

            min_level = row[0]
            if not user:
                return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "auth_required"})}
            if level_rank(user["level"]) < level_rank(min_level) and user["role"] not in ("moderator", "admin"):
                return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "level_too_low"})}

            cur = conn.cursor()
            cur.execute(
                f"SELECT m.id, m.user_id, u.username, u.level, u.role, m.txt, m.created_at "
                f"FROM {SCHEMA}.chat_messages m "
                f"LEFT JOIN {SCHEMA}.users u ON m.user_id = u.id "
                f"WHERE m.chat_id = %s AND m.is_hidden = FALSE "
                f"ORDER BY m.created_at DESC LIMIT %s",
                (chat_id, limit)
            )
            rows = cur.fetchall()
            cur.close()
            msgs = [
                {"id": r[0], "user_id": r[1], "username": r[2] or r[3], "level": r[3] or "seeker",
                 "role": r[4] or "user", "text": r[5], "time": str(r[6])}
                for r in reversed(rows)
            ]
            return {"statusCode": 200, "headers": CORS, "body": json.dumps(msgs)}

        # Отправить сообщение
        if method == "POST":
            if not user:
                return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "auth_required"})}
            if user["is_banned"]:
                return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "banned"})}

            chat_id = body.get("chat_id")
            text = body.get("text", "").strip()
            if not chat_id or not text:
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "missing_fields"})}
            if len(text) > 2000:
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "too_long"})}

            # Проверка уровня доступа
            cur = conn.cursor()
            cur.execute(f"SELECT min_level FROM {SCHEMA}.chats WHERE id = %s", (chat_id,))
            row = cur.fetchone()
            cur.close()
            if not row:
                return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "chat_not_found"})}
            if level_rank(user["level"]) < level_rank(row[0]) and user["role"] not in ("moderator", "admin"):
                return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "level_too_low"})}

            cur = conn.cursor()
            cur.execute(
                f"INSERT INTO {SCHEMA}.chat_messages (chat_id, user_id, author_name, txt) VALUES (%s, %s, %s, %s) RETURNING id",
                (chat_id, user["id"], user["username"], text)
            )
            new_id = cur.fetchone()[0]
            # XP за активность
            cur.execute(f"UPDATE {SCHEMA}.users SET xp = xp + 5 WHERE id = %s", (user["id"],))
            conn.commit()
            cur.close()
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"id": new_id, "ok": True})}

        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "not_found"})}
    finally:
        conn.close()
