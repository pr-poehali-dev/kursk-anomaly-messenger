"""
Админ-панель X Test Anomalies.
GET /users           — список пользователей (admin/moderator)
POST /users/role     — изменить роль (admin only)
POST /users/level    — изменить уровень (admin/moderator)
POST /users/ban      — забанить/разбанить (admin only)
GET /stats           — статистика платформы
POST /messages/hide  — скрыть сообщение (admin/moderator)
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


def require_admin(user, moderator_ok=False) -> bool:
    if not user or user["is_banned"]:
        return False
    if user["role"] == "admin":
        return True
    if moderator_ok and user["role"] == "moderator":
        return True
    return False


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
        user = get_user_by_session(conn, session_id)
        if not require_admin(user, moderator_ok=True):
            return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "forbidden"})}

        # Статистика
        if method == "GET" and path.endswith("/stats"):
            cur = conn.cursor()
            cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.users")
            total_users = cur.fetchone()[0]
            cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.anomalies")
            total_anomalies = cur.fetchone()[0]
            cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.anomalies WHERE status = 'confirmed'")
            confirmed = cur.fetchone()[0]
            cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.anomalies WHERE status = 'under_review'")
            pending = cur.fetchone()[0]
            cur.execute(f"SELECT COUNT(*) FROM {SCHEMA}.chat_messages WHERE is_hidden = FALSE")
            total_messages = cur.fetchone()[0]
            cur.close()
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({
                "total_users": total_users,
                "total_anomalies": total_anomalies,
                "confirmed_anomalies": confirmed,
                "pending_anomalies": pending,
                "total_messages": total_messages,
            })}

        # Список пользователей
        if method == "GET" and path.endswith("/users"):
            cur = conn.cursor()
            cur.execute(
                f"SELECT id, username, role, level, xp, is_banned, created_at, last_seen "
                f"FROM {SCHEMA}.users ORDER BY xp DESC"
            )
            rows = cur.fetchall()
            cur.close()
            users = [
                {"id": r[0], "username": r[1], "role": r[2], "level": r[3], "xp": r[4],
                 "is_banned": r[5], "created_at": str(r[6]), "last_seen": str(r[7])}
                for r in rows
            ]
            return {"statusCode": 200, "headers": CORS, "body": json.dumps(users)}

        # Изменить роль (только admin)
        if method == "POST" and path.endswith("/users/role"):
            if user["role"] != "admin":
                return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "admin_only"})}
            target_id = body.get("user_id")
            new_role = body.get("role")
            if not target_id or new_role not in ("user", "moderator", "admin"):
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "invalid_params"})}
            cur = conn.cursor()
            cur.execute(f"UPDATE {SCHEMA}.users SET role = %s WHERE id = %s", (new_role, target_id))
            conn.commit()
            cur.close()
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

        # Изменить уровень (admin/moderator)
        if method == "POST" and path.endswith("/users/level"):
            target_id = body.get("user_id")
            new_level = body.get("level")
            valid_levels = ("seeker", "observer", "hunter", "stalker", "tester", "x_tester")
            if not target_id or new_level not in valid_levels:
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "invalid_params"})}
            level_xp = {"seeker": 0, "observer": 500, "hunter": 1500, "stalker": 4000, "tester": 10000, "x_tester": 25000}
            cur = conn.cursor()
            cur.execute(
                f"UPDATE {SCHEMA}.users SET level = %s, xp = GREATEST(xp, %s) WHERE id = %s",
                (new_level, level_xp[new_level], target_id)
            )
            conn.commit()
            cur.close()
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

        # Бан/разбан (только admin)
        if method == "POST" and path.endswith("/users/ban"):
            if user["role"] != "admin":
                return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "admin_only"})}
            target_id = body.get("user_id")
            banned = body.get("banned", True)
            if not target_id:
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "invalid_params"})}
            cur = conn.cursor()
            cur.execute(f"UPDATE {SCHEMA}.users SET is_banned = %s WHERE id = %s", (banned, target_id))
            conn.commit()
            cur.close()
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

        # Скрыть сообщение
        if method == "POST" and path.endswith("/messages/hide"):
            msg_id = body.get("message_id")
            hide = body.get("hide", True)
            if not msg_id:
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "invalid_params"})}
            cur = conn.cursor()
            cur.execute(f"UPDATE {SCHEMA}.chat_messages SET is_hidden = %s WHERE id = %s", (hide, msg_id))
            conn.commit()
            cur.close()
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "not_found"})}
    finally:
        conn.close()
