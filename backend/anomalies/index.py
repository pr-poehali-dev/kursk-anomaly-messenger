"""
Аномалии X Test Anomalies.
GET /         — список аномалий (фильтр по ?status=)
GET /?id=N    — одна аномалия
POST /        — создать (нужна сессия)
POST /review  — верифицировать/опровергнуть (нужна роль moderator/admin)
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


def next_code(conn) -> str:
    cur = conn.cursor()
    cur.execute(f"SELECT code FROM {SCHEMA}.anomalies ORDER BY id DESC LIMIT 1")
    row = cur.fetchone()
    cur.close()
    if not row:
        return "KRS-001"
    try:
        num = int(row[0].split("-")[1]) + 1
    except Exception:
        num = 1
    return f"KRS-{num:03d}"


def row_to_anomaly(row) -> dict:
    return {
        "id": row[0], "code": row[1], "title": row[2], "category": row[3],
        "status": row[4], "location": row[5], "description": row[6],
        "coords_x": row[7], "coords_y": row[8],
        "reporter_id": row[9], "reporter_name": row[10],
        "reviewed_by_name": row[11], "reviewed_at": str(row[12]) if row[12] else None,
        "review_comment": row[13], "evidence_count": row[14],
        "created_at": str(row[15]),
    }


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    path = event.get("path", "/")
    qs = event.get("queryStringParameters") or {}
    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    session_id = event.get("headers", {}).get("X-Session-Id", "")
    conn = get_conn()

    try:
        user = get_user_by_session(conn, session_id)

        SELECT = (
            f"SELECT a.id, a.code, a.title, a.category, a.status, a.location, a.description, "
            f"a.coords_x, a.coords_y, a.reporter_id, r.username, rv.username, "
            f"a.reviewed_at, a.review_comment, a.evidence_count, a.created_at "
            f"FROM {SCHEMA}.anomalies a "
            f"LEFT JOIN {SCHEMA}.users r ON a.reporter_id = r.id "
            f"LEFT JOIN {SCHEMA}.users rv ON a.reviewed_by = rv.id "
        )

        # Список / одна
        if method == "GET":
            if qs.get("id"):
                cur = conn.cursor()
                cur.execute(SELECT + "WHERE a.id = %s", (int(qs["id"]),))
                row = cur.fetchone()
                cur.close()
                if not row:
                    return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "not_found"})}
                return {"statusCode": 200, "headers": CORS, "body": json.dumps(row_to_anomaly(row))}

            status_filter = qs.get("status", "")
            cur = conn.cursor()
            if status_filter and status_filter != "all":
                cur.execute(SELECT + "WHERE a.status = %s ORDER BY a.created_at DESC", (status_filter,))
            else:
                cur.execute(SELECT + "ORDER BY a.created_at DESC")
            rows = cur.fetchall()
            cur.close()
            return {"statusCode": 200, "headers": CORS, "body": json.dumps([row_to_anomaly(r) for r in rows])}

        # Создать аномалию
        if method == "POST" and not path.endswith("/review"):
            if not user:
                return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "auth_required"})}
            if user["is_banned"]:
                return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "banned"})}

            title = body.get("title", "").strip()
            category = body.get("category", "electromagnetic")
            location = body.get("location", "").strip()
            description = body.get("description", "").strip()
            coords_x = body.get("coords_x")
            coords_y = body.get("coords_y")

            if not title or not location:
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "missing_fields"})}

            code = next_code(conn)
            cur = conn.cursor()
            cur.execute(
                f"INSERT INTO {SCHEMA}.anomalies (code, title, category, status, location, description, coords_x, coords_y, reporter_id) "
                f"VALUES (%s, %s, %s, 'possible', %s, %s, %s, %s, %s) RETURNING id",
                (code, title, category, location, description, coords_x, coords_y, user["id"])
            )
            new_id = cur.fetchone()[0]
            # XP за репорт
            cur.execute(f"UPDATE {SCHEMA}.users SET xp = xp + 100 WHERE id = %s", (user["id"],))
            conn.commit()
            cur.close()
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"id": new_id, "code": code})}

        # Верификация (только moderator/admin)
        if method == "POST" and path.endswith("/review"):
            if not user or user["role"] not in ("moderator", "admin"):
                return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "forbidden"})}

            anomaly_id = body.get("anomaly_id")
            new_status = body.get("status")  # confirmed | denied | under_review | possible
            comment = body.get("comment", "")

            if not anomaly_id or new_status not in ("confirmed", "denied", "under_review", "possible"):
                return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "invalid_params"})}

            cur = conn.cursor()
            cur.execute(
                f"UPDATE {SCHEMA}.anomalies SET status = %s, reviewed_by = %s, reviewed_at = NOW(), review_comment = %s WHERE id = %s",
                (new_status, user["id"], comment, anomaly_id)
            )
            # Если подтверждена — XP репортёру
            if new_status == "confirmed":
                cur.execute(
                    f"UPDATE {SCHEMA}.users SET xp = xp + 500 WHERE id = (SELECT reporter_id FROM {SCHEMA}.anomalies WHERE id = %s)",
                    (anomaly_id,)
                )
            conn.commit()
            cur.close()
            return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "status": new_status})}

        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "not_found"})}
    finally:
        conn.close()
