"""HwFar: a small, server-routed 1-to-1 messenger.

The UI pages are deliberately rendered by Flask instead of putting the whole
product in one index document. SQLite keeps the demo portable; replace it with
Postgres and a shared presence store before running multiple workers.
"""
import datetime as dt
import json
import os
import re
import secrets
import sqlite3
from functools import wraps

import jwt
from flask import Flask, jsonify, render_template, request
from flask_socketio import SocketIO, join_room
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.config["SECRET_KEY"] = "chatly-dev-secret-key-change-me-please"
DB_PATH = "chatly.db"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
online_users, sid_to_user = {}, {}


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db()
    conn.executescript("""
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, language TEXT DEFAULT 'en',
        last_seen TEXT, avatar TEXT, age INTEGER, gender TEXT, country TEXT,
        show_online INTEGER DEFAULT 1, show_age INTEGER DEFAULT 0,
        show_gender INTEGER DEFAULT 0, discoverable INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS contacts (
        owner_id INTEGER NOT NULL, contact_id INTEGER NOT NULL,
        added_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(owner_id, contact_id)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL, type TEXT DEFAULT 'text',
        content TEXT NOT NULL, duration INTEGER, sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
        delivered INTEGER DEFAULT 0, read INTEGER DEFAULT 0, expires_at TEXT,
        edited INTEGER DEFAULT 0, deleted_for_sender INTEGER DEFAULT 0,
        deleted_for_receiver INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS chat_settings (
        user_min INTEGER NOT NULL, user_max INTEGER NOT NULL,
        disappearing_seconds INTEGER NOT NULL DEFAULT 0, updated_by INTEGER,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_min, user_max)
      );
      CREATE TABLE IF NOT EXISTS statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER NOT NULL,
        type TEXT NOT NULL DEFAULT 'text', content TEXT NOT NULL,
        caption TEXT DEFAULT '', audience TEXT NOT NULL DEFAULT 'everyone',
        allowed_users TEXT DEFAULT '[]', hidden_users TEXT DEFAULT '[]',
        reshared_from INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS status_views (
        status_id INTEGER NOT NULL, viewer_id INTEGER NOT NULL,
        viewed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(status_id, viewer_id)
      );
      CREATE TABLE IF NOT EXISTS status_reactions (
        status_id INTEGER NOT NULL, viewer_id INTEGER NOT NULL,
        reaction TEXT NOT NULL CHECK(reaction IN ('like','dislike')),
        reacted_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(status_id, viewer_id)
      );
      CREATE TABLE IF NOT EXISTS call_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, caller_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL, mode TEXT NOT NULL DEFAULT 'audio',
        status TEXT NOT NULL DEFAULT 'ringing', call_id TEXT UNIQUE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, ended_at TEXT
      );
    """)
    # Keep databases created by the uploaded version compatible.
    for table, column, ddl in [
        ("users", "language", "language TEXT DEFAULT 'en'"),
        ("users", "show_online", "show_online INTEGER DEFAULT 1"),
        ("users", "age", "age INTEGER"),
        ("users", "gender", "gender TEXT"),
        ("users", "country", "country TEXT"),
        ("users", "show_age", "show_age INTEGER DEFAULT 0"),
        ("users", "show_gender", "show_gender INTEGER DEFAULT 0"),
        ("users", "discoverable", "discoverable INTEGER DEFAULT 1"),
        ("messages", "expires_at", "expires_at TEXT"),
        ("messages", "edited", "edited INTEGER DEFAULT 0"),
        ("messages", "deleted_for_sender", "deleted_for_sender INTEGER DEFAULT 0"),
        ("messages", "deleted_for_receiver", "deleted_for_receiver INTEGER DEFAULT 0"),
        ("call_logs", "call_id", "call_id TEXT"),
        ("call_logs", "ended_at", "ended_at TEXT"),
    ]:
        names = {r["name"] for r in conn.execute("PRAGMA table_info(" + table + ")")}
        if column not in names:
            conn.execute("ALTER TABLE " + table + " ADD COLUMN " + ddl)
    conn.commit()
    conn.close()


init_db()


def purge(conn):
    now = dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn.execute("DELETE FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ?", (now,))
    conn.execute("DELETE FROM statuses WHERE expires_at <= ?", (now,))
    conn.execute("""UPDATE call_logs SET status='missed'
                    WHERE status='ringing'
                    AND datetime(created_at) <= datetime(?, '-30 seconds')""", (now,))


def pair(a, b):
    return (a, b) if a < b else (b, a)


def expiry_policy(conn, a, b):
    lo, hi = pair(a, b)
    row = conn.execute(
        "SELECT disappearing_seconds FROM chat_settings WHERE user_min=? AND user_max=?",
        (lo, hi)).fetchone()
    return int(row["disappearing_seconds"]) if row else 0


def message_payload(row, viewer_id, other_username):
    is_sender = row["sender_id"] == viewer_id
    hidden = bool(row["deleted_for_sender"] if is_sender else row["deleted_for_receiver"])
    return {
        "id": row["id"],
        "from": "me" if is_sender else other_username,
        "type": row["type"],
        "content": "" if hidden else row["content"],
        "duration": row["duration"],
        "sent_at": row["sent_at"],
        "delivered": bool(row["delivered"]),
        "read": bool(row["read"]),
        "expires_at": row["expires_at"],
        "edited": bool(row["edited"]),
        "deleted": hidden,
    }


def make_token(user_id):
    return jwt.encode({"user_id": user_id, "exp": dt.datetime.utcnow() + dt.timedelta(hours=24)},
                      app.config["SECRET_KEY"], algorithm="HS256")


def user_from_token(value):
    try:
        return jwt.decode(value, app.config["SECRET_KEY"], algorithms=["HS256"])["user_id"]
    except jwt.InvalidTokenError:
        return None


def signup_challenge():
    import random
    left, right = random.randint(2, 9), random.randint(1, 9)
    answer = str(left + right)
    token = jwt.encode({
        "kind": "signup-human", "answer": answer,
        "exp": dt.datetime.utcnow() + dt.timedelta(minutes=10)
    }, app.config["SECRET_KEY"], algorithm="HS256")
    return f"What is {left} + {right}?", token


def auth(handler):
    @wraps(handler)
    def wrapped(*args, **kwargs):
        # No environment token/configuration is required.
        # Use the first registered account as the demo user when a protected
        # endpoint is opened without an Authorization header.
        header = request.headers.get("Authorization", "")
        user_id = None
        if header.startswith("Bearer "):
            user_id = user_from_token(header.split(" ", 1)[1])

        if not user_id:
            conn = db()
            row = conn.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
            conn.close()
            user_id = row["id"] if row else None

        if not user_id:
            return jsonify(error="register an account first"), 401

        return handler(user_id, *args, **kwargs)
    return wrapped


def online(user_id):
    return bool(online_users.get(user_id))


def visible_online(conn, user_id):
    row = conn.execute("SELECT show_online FROM users WHERE id=?", (user_id,)).fetchone()
    return online(user_id) and bool(row and row["show_online"])


def public_profile(conn, row):
    """Return the fields another user is allowed to see on a profile."""
    result = {
        "id": row["id"],
        "username": row["username"],
        "avatar": row["avatar"],
        "country": row["country"],
        "online": visible_online(conn, row["id"]),
        "last_seen": row["last_seen"],
        "age": row["age"] if bool(row["show_age"]) else None,
        "gender": row["gender"] if bool(row["show_gender"]) else None,
        "age_visible": bool(row["show_age"]),
        "gender_visible": bool(row["show_gender"]),
    }
    return result


def json_names(value):
    try:
        result = json.loads(value or "[]")
        return [str(item).strip() for item in result if str(item).strip()]
    except (TypeError, ValueError):
        return []


def are_mutual_friends(conn, owner_id, viewer_id):
    return bool(conn.execute("""
        SELECT 1 FROM contacts a JOIN contacts b
          ON a.contact_id=? AND b.contact_id=?
        WHERE a.owner_id=? AND b.owner_id=?
    """, (viewer_id, owner_id, owner_id, viewer_id)).fetchone())


def status_visible(conn, row, viewer_id, viewer_name):
    if row["owner_id"] == viewer_id:
        return True
    hidden = json_names(row["hidden_users"])
    if viewer_name in hidden:
        return False
    audience = row["audience"] or "everyone"
    if audience == "mutual":
        return are_mutual_friends(conn, row["owner_id"], viewer_id)
    if audience == "custom":
        return viewer_name in json_names(row["allowed_users"])
    return True


def status_payload(conn, row, viewer_id):
    owner = conn.execute("SELECT id,username,avatar FROM users WHERE id=?", (row["owner_id"],)).fetchone()
    viewer_reaction = conn.execute(
        "SELECT reaction FROM status_reactions WHERE status_id=? AND viewer_id=?",
        (row["id"], viewer_id)).fetchone()
    counts = conn.execute(
        "SELECT reaction,COUNT(*) AS count FROM status_reactions WHERE status_id=? GROUP BY reaction",
        (row["id"],)).fetchall()
    reaction_counts = {item["reaction"]: item["count"] for item in counts}
    viewers = []
    if row["owner_id"] == viewer_id:
        viewers = [dict(item) for item in conn.execute("""
          SELECT u.username,u.avatar,v.viewed_at
          FROM status_views v JOIN users u ON u.id=v.viewer_id
          WHERE v.status_id=? ORDER BY v.viewed_at DESC
        """, (row["id"],)).fetchall()]
    return {
        "id": row["id"],
        "owner_id": row["owner_id"],
        "username": owner["username"] if owner else "Unknown",
        "avatar": owner["avatar"] if owner else "",
        "type": row["type"],
        "content": row["content"],
        "caption": row["caption"] or "",
        "audience": row["audience"],
        "reshared_from": row["reshared_from"],
        "created_at": row["created_at"],
        "expires_at": row["expires_at"],
        "mine": row["owner_id"] == viewer_id,
        "view_count": conn.execute(
            "SELECT COUNT(*) FROM status_views WHERE status_id=?", (row["id"],)
        ).fetchone()[0],
        "viewers": viewers,
        "like_count": reaction_counts.get("like", 0),
        "dislike_count": reaction_counts.get("dislike", 0),
        "viewer_reaction": viewer_reaction["reaction"] if viewer_reaction else None,
    }


@app.get("/check-username")
def check_username():
    username = (request.args.get("username") or "").strip()
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{2,24}", username):
        return jsonify(available=False, error="Use 2-24 letters, numbers, dots, dashes, or underscores."), 200
    conn = db()
    exists = conn.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone()
    conn.close()
    return jsonify(available=not bool(exists), error="That username is already taken." if exists else "")


@app.get("/signup/challenge")
def signup_human_challenge():
    question, token = signup_challenge()
    return jsonify(question=question, token=token)


@app.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    username, password = (data.get("username") or "").strip(), data.get("password") or ""
    if not username or len(password) < 6:
        return jsonify(error="username required, password min 6 chars"), 400
    if not 2 <= len(username) <= 24:
        return jsonify(error="username must be 2-24 characters"), 400
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{2,24}", username):
        return jsonify(error="username contains unsupported characters"), 400
    country = (data.get("country") or "").strip()
    if not country or len(country) > 80:
        return jsonify(error="choose your country"), 400
    language = data.get("language")
    if language not in ("en", "fr"):
        return jsonify(error="choose English or French"), 400
    if data.get("website"):
        return jsonify(error="signup could not be verified"), 400
    if not data.get("community_accepted"):
        return jsonify(error="accept the Community Guidelines before joining"), 400
    try:
        challenge = jwt.decode(data.get("human_token") or "", app.config["SECRET_KEY"], algorithms=["HS256"])
        if challenge.get("kind") != "signup-human" or str(data.get("human_answer", "")).strip() != challenge.get("answer"):
            raise jwt.InvalidTokenError("wrong answer")
    except jwt.InvalidTokenError:
        return jsonify(error="complete the human verification correctly"), 400
    try:
        age = int(data.get("age"))
    except (TypeError, ValueError):
        age = 0
    if not 13 <= age <= 120:
        return jsonify(error="age must be between 13 and 120"), 400
    gender = (data.get("gender") or "").strip()
    if gender not in ("Female", "Male", "Non-binary", "Prefer not to say"):
        return jsonify(error="choose a gender option"), 400
    avatar = data.get("avatar") or ""
    if avatar and (not avatar.startswith("data:image/") or len(avatar) > 2_500_000):
        return jsonify(error="profile photo must be an image smaller than 2 MB"), 400
    conn = db()
    try:
        conn.execute("""INSERT INTO users(
          username,password_hash,language,avatar,age,gender,country,show_age,show_gender
        ) VALUES(?,?,?,?,?,?,?,?,?)""", (
            username, generate_password_hash(password), language,
            avatar, age, gender, country, 1 if data.get("show_age") else 0,
            1 if data.get("show_gender") else 0))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify(error="username already taken"), 409
    conn.close()
    return jsonify(message="registered"), 201


@app.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    conn = db()
    row = conn.execute("SELECT * FROM users WHERE username=?", ((data.get("username") or "").strip(),)).fetchone()
    conn.close()
    if not row or not check_password_hash(row["password_hash"], data.get("password") or ""):
        return jsonify(error="invalid username or password"), 401
    return jsonify(access_token=make_token(row["id"]), user_id=row["id"], username=row["username"],
                   language=row["language"] or "en", avatar=row["avatar"], country=row["country"], age=row["age"],
                   gender=row["gender"], show_age=bool(row["show_age"]),
                   show_gender=bool(row["show_gender"]))


@app.get("/account/me")
@auth
def account_me(user_id):
    conn = db()
    row = conn.execute("""SELECT id,username,language,avatar,country,age,gender,
      show_online,show_age,show_gender,discoverable FROM users WHERE id=?""",
                       (user_id,)).fetchone()
    conn.close()
    return jsonify(dict(row)) if row else (jsonify(error="not found"), 404)


@app.post("/account/privacy")
@auth
def privacy(user_id):
    data = request.get_json(silent=True) or {}
    allowed = {"show_online", "show_age", "show_gender"}
    if not any(key in data for key in allowed):
        return jsonify(error="a privacy setting is required"), 400
    conn = db()
    updates, values = [], []
    for key in allowed:
        if key in data:
            updates.append(f"{key}=?")
            values.append(1 if data[key] else 0)
    values.append(user_id)
    conn.execute(f"UPDATE users SET {','.join(updates)} WHERE id=?", values)
    conn.commit()
    conn.close()
    broadcast_presence(user_id, online(user_id))
    return jsonify({key: bool(data[key]) for key in allowed if key in data})


@app.post("/account/username")
@auth
def username(user_id):
    name = (request.get_json(silent=True) or {}).get("username", "").strip()
    if not 2 <= len(name) <= 24:
        return jsonify(error="username must be 2-24 characters"), 400
    conn = db()
    try:
        conn.execute("UPDATE users SET username=? WHERE id=?", (name, user_id))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify(error="username already taken"), 409
    conn.close()
    return jsonify(username=name)


@app.post("/account/language")
@auth
def language(user_id):
    language = (request.get_json(silent=True) or {}).get("language")
    if language not in ("en", "fr"):
        return jsonify(error="language must be 'en' or 'fr'"), 400
    conn = db()
    conn.execute("UPDATE users SET language=? WHERE id=?", (language, user_id))
    conn.commit()
    conn.close()
    return jsonify(language=language)


@app.get("/contacts")
@auth
def contacts(user_id):
    conn = db()
    purge(conn)
    conn.commit()
    rows = conn.execute("""
      SELECT u.id,u.username,u.avatar,u.last_seen,
        (SELECT content FROM messages m WHERE
          ((m.sender_id=? AND m.receiver_id=u.id) OR (m.sender_id=u.id AND m.receiver_id=?))
          ORDER BY m.id DESC LIMIT 1) last_content,
        (SELECT type FROM messages m WHERE
          ((m.sender_id=? AND m.receiver_id=u.id) OR (m.sender_id=u.id AND m.receiver_id=?))
          ORDER BY m.id DESC LIMIT 1) last_type,
        (SELECT sent_at FROM messages m WHERE
          ((m.sender_id=? AND m.receiver_id=u.id) OR (m.sender_id=u.id AND m.receiver_id=?))
          ORDER BY m.id DESC LIMIT 1) last_sent_at,
        (SELECT sender_id FROM messages m WHERE
          ((m.sender_id=? AND m.receiver_id=u.id) OR (m.sender_id=u.id AND m.receiver_id=?))
          ORDER BY m.id DESC LIMIT 1) last_sender_id,
        (SELECT COUNT(*) FROM messages m WHERE m.sender_id=u.id AND m.receiver_id=? AND m.read=0) unread_count
      FROM contacts c JOIN users u ON u.id=c.contact_id WHERE c.owner_id=?
      ORDER BY (last_sent_at IS NULL), last_sent_at DESC, u.username
    """, (user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id)).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["online"] = visible_online(conn, row["id"])
        item["last_mine"] = row["last_sender_id"] == user_id
        if row["last_type"] == "voice":
            item["last_content"] = "Voice message"
        elif row["last_type"] == "image":
            item["last_content"] = "Photo"
        elif row["last_type"] == "video":
            item["last_content"] = "Video"
        item.pop("last_sender_id", None)
        result.append(item)
    conn.close()
    return jsonify(result)


@app.post("/contacts/add")
@auth
def add_contact(user_id):
    name = (request.get_json(silent=True) or {}).get("username", "").strip()
    conn = db()
    target = conn.execute("SELECT id,username,avatar FROM users WHERE username=?", (name,)).fetchone()
    if not target or target["id"] == user_id:
        conn.close()
        return jsonify(error="no such user" if not target else "can't add yourself"), 404 if not target else 400
    for owner, contact in ((user_id, target["id"]), (target["id"], user_id)):
        conn.execute("INSERT OR IGNORE INTO contacts(owner_id,contact_id) VALUES(?,?)", (owner, contact))
    conn.commit()
    conn.close()
    return jsonify(dict(target)), 201


@app.get("/users/suggestions")
@auth
def suggestions(user_id):
    conn = db()
    rows = conn.execute("""
      SELECT id,username,avatar,country,age,gender,show_age,show_gender,last_seen
      FROM users WHERE discoverable=1 AND id != ?
      AND id NOT IN (SELECT contact_id FROM contacts WHERE owner_id=?) ORDER BY username
    """, (user_id, user_id)).fetchall()
    result = [public_profile(conn, row) for row in rows]
    conn.close()
    return jsonify(result)


@app.get("/profile/<name>")
@auth
def profile(user_id, name):
    conn = db()
    row = conn.execute("""SELECT id,username,avatar,country,age,gender,show_age,show_gender,last_seen
                          FROM users WHERE username=?""", (name,)).fetchone()
    if not row:
        conn.close()
        return jsonify(error="no such user"), 404
    result = public_profile(conn, row)
    conn.close()
    return jsonify(result)


def audience_names(value):
    if isinstance(value, list):
        return list(dict.fromkeys(str(item).strip() for item in value if str(item).strip()))[:100]
    return list(dict.fromkeys(item.strip() for item in str(value or "").split(",") if item.strip()))[:100]


@app.get("/statuses")
@auth
def statuses(user_id):
    conn = db()
    purge(conn)
    viewer = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
    rows = conn.execute("SELECT * FROM statuses ORDER BY created_at DESC, id DESC").fetchall()
    result = []
    for row in rows:
        if not viewer or not status_visible(conn, row, user_id, viewer["username"]):
            continue
        if row["owner_id"] != user_id:
            conn.execute("INSERT OR IGNORE INTO status_views(status_id,viewer_id) VALUES(?,?)",
                         (row["id"], user_id))
        result.append(status_payload(conn, row, user_id))
    conn.commit()
    conn.close()
    return jsonify(result)


@app.post("/statuses")
@auth
def create_status(user_id):
    data = request.get_json(silent=True) or {}
    kind = data.get("type", "text")
    content = data.get("content", "")
    caption = (data.get("caption") or "").strip()
    audience = data.get("audience", "everyone")
    if kind not in ("text", "image", "video", "audio"):
        return jsonify(error="choose a valid story type"), 400
    if audience not in ("everyone", "mutual", "custom"):
        return jsonify(error="choose a valid audience"), 400
    if not isinstance(content, str) or not content.strip():
        return jsonify(error="your story cannot be empty"), 400
    if kind == "text" and len(content.strip()) > 2000:
        return jsonify(error="text stories must be 2000 characters or less"), 400
    if kind != "text":
        prefixes = {"image": "data:image", "video": "data:video", "audio": "data:audio"}
        if not content.startswith(prefixes[kind]):
            return jsonify(error=f"{kind} story must be a data URL"), 400
        if len(content) > 18_000_000:
            return jsonify(error="media must be smaller than 12 MB"), 413
    if len(caption) > 280:
        return jsonify(error="caption must be 280 characters or less"), 400
    allowed = audience_names(data.get("allowed_users"))
    hidden = audience_names(data.get("hidden_users"))
    expires = (dt.datetime.utcnow() + dt.timedelta(hours=48)).strftime("%Y-%m-%d %H:%M:%S")
    conn = db()
    cur = conn.execute("""INSERT INTO statuses
      (owner_id,type,content,caption,audience,allowed_users,hidden_users,expires_at)
      VALUES(?,?,?,?,?,?,?,?)""", (
        user_id, kind, content.strip() if kind == "text" else content, caption, audience,
        json.dumps(allowed), json.dumps(hidden), expires))
    conn.commit()
    row = conn.execute("SELECT * FROM statuses WHERE id=?", (cur.lastrowid,)).fetchone()
    result = status_payload(conn, row, user_id)
    conn.close()
    return jsonify(result), 201


@app.patch("/statuses/<int:status_id>")
@auth
def edit_status(user_id, status_id):
    data = request.get_json(silent=True) or {}
    conn = db()
    row = conn.execute("SELECT * FROM statuses WHERE id=? AND owner_id=?", (status_id, user_id)).fetchone()
    if not row:
        conn.close()
        return jsonify(error="story not found"), 404
    caption = (data.get("caption", row["caption"]) or "").strip()
    content = data.get("content", row["content"])
    if len(caption) > 280:
        conn.close()
        return jsonify(error="caption must be 280 characters or less"), 400
    if row["type"] == "text" and (not isinstance(content, str) or not content.strip() or len(content.strip()) > 2000):
        conn.close()
        return jsonify(error="text stories must be 1-2000 characters"), 400
    conn.execute("UPDATE statuses SET content=?,caption=? WHERE id=?",
                 (content.strip() if row["type"] == "text" else row["content"], caption, status_id))
    conn.commit()
    updated = conn.execute("SELECT * FROM statuses WHERE id=?", (status_id,)).fetchone()
    result = status_payload(conn, updated, user_id)
    conn.close()
    return jsonify(result)


@app.delete("/statuses/<int:status_id>")
@auth
def delete_status(user_id, status_id):
    conn = db()
    cur = conn.execute("DELETE FROM statuses WHERE id=? AND owner_id=?", (status_id, user_id))
    conn.commit()
    conn.close()
    return jsonify(deleted=bool(cur.rowcount))


@app.post("/statuses/<int:status_id>/reaction")
@auth
def react_status(user_id, status_id):
    data = request.get_json(silent=True) or {}
    reaction = data.get("reaction")
    if reaction not in ("like", "dislike", "none", None, ""):
        return jsonify(error="reaction must be like, dislike, or none"), 400
    conn = db()
    viewer = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
    source = conn.execute("SELECT * FROM statuses WHERE id=?", (status_id,)).fetchone()
    if not source or not viewer or not status_visible(conn, source, user_id, viewer["username"]):
        conn.close()
        return jsonify(error="story is no longer available"), 404
    if source["owner_id"] == user_id:
        conn.close()
        return jsonify(error="you cannot like or dislike your own story"), 403
    if reaction in ("none", None, ""):
        conn.execute("DELETE FROM status_reactions WHERE status_id=? AND viewer_id=?",
                     (status_id, user_id))
    else:
        conn.execute("""
          INSERT INTO status_reactions(status_id,viewer_id,reaction)
          VALUES(?,?,?)
          ON CONFLICT(status_id,viewer_id) DO UPDATE SET
            reaction=excluded.reaction, reacted_at=CURRENT_TIMESTAMP
        """, (status_id, user_id, reaction))
    conn.commit()
    result = status_payload(conn, source, user_id)
    conn.close()
    return jsonify({
        "status_id": status_id,
        "viewer_reaction": result["viewer_reaction"],
        "like_count": result["like_count"],
        "dislike_count": result["dislike_count"],
    })


@app.get("/statuses/<int:status_id>/views")
@auth
def status_views(user_id, status_id):
    conn = db()
    source = conn.execute("SELECT * FROM statuses WHERE id=? AND owner_id=?",
                          (status_id, user_id)).fetchone()
    if not source:
        conn.close()
        return jsonify(error="only the story owner can see its viewers"), 403
    viewers = [dict(item) for item in conn.execute("""
      SELECT u.username,u.avatar,v.viewed_at
      FROM status_views v JOIN users u ON u.id=v.viewer_id
      WHERE v.status_id=? ORDER BY v.viewed_at DESC
    """, (status_id,)).fetchall()]
    conn.close()
    return jsonify(viewers)


@app.post("/statuses/<int:status_id>/reshare")
@auth
def reshare_status(user_id, status_id):
    conn = db()
    purge(conn)
    viewer = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
    source = conn.execute("SELECT * FROM statuses WHERE id=?", (status_id,)).fetchone()
    if not source or not viewer or not status_visible(conn, source, user_id, viewer["username"]):
        conn.close()
        return jsonify(error="story is no longer available"), 404
    if source["owner_id"] == user_id:
        conn.close()
        return jsonify(error="you cannot reshare your own story"), 403
    expires = (dt.datetime.utcnow() + dt.timedelta(hours=48)).strftime("%Y-%m-%d %H:%M:%S")
    owner = conn.execute("SELECT username FROM users WHERE id=?", (source["owner_id"],)).fetchone()
    caption = source["caption"] or f"Shared from @{owner['username'] if owner else 'HwFar'}"
    cur = conn.execute("""INSERT INTO statuses
      (owner_id,type,content,caption,audience,allowed_users,hidden_users,reshared_from,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?)""", (
        user_id, source["type"], source["content"], caption, "everyone", "[]", "[]",
        source["id"], expires))
    conn.commit()
    row = conn.execute("SELECT * FROM statuses WHERE id=?", (cur.lastrowid,)).fetchone()
    result = status_payload(conn, row, user_id)
    conn.close()
    return jsonify(result), 201


@app.get("/calls")
@auth
def call_history(user_id):
    conn = db()
    purge(conn)
    rows = conn.execute("""
      SELECT c.*, u.username AS peer_username, u.avatar AS peer_avatar
      FROM call_logs c JOIN users u ON u.id=CASE WHEN c.caller_id=? THEN c.receiver_id ELSE c.caller_id END
      ORDER BY c.id DESC LIMIT 40
    """, (user_id,)).fetchall()
    conn.commit()
    result = []
    for row in rows:
        result.append({
            "id": row["id"], "username": row["peer_username"], "avatar": row["peer_avatar"],
            "direction": "outgoing" if row["caller_id"] == user_id else "incoming",
            "mode": row["mode"], "status": row["status"], "created_at": row["created_at"],
        })
    conn.close()
    return jsonify(result)


@app.post("/send")
@auth
def send(user_id):
    data = request.get_json(silent=True) or {}
    to = (data.get("to") or "").strip()
    kind, content = data.get("type", "text"), data.get("content", "")
    if kind not in ("text", "voice", "image", "video") or not to:
        return jsonify(error="recipient and valid type are required"), 400
    if kind == "text":
        content = content.strip()
        if not content:
            return jsonify(error="content is required"), 400
    else:
        prefixes = {"voice": "data:audio", "image": "data:image", "video": "data:video"}
        if not isinstance(content, str) or not content.startswith(prefixes[kind]):
            return jsonify(error=f"{kind} content must be a data URL"), 400
        if len(content) > 18_000_000:
            return jsonify(error="media must be smaller than 12 MB"), 413
    conn = db()
    purge(conn)
    receiver = conn.execute("SELECT id,username FROM users WHERE username=?", (to,)).fetchone()
    sender = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
    if not receiver:
        conn.close()
        return jsonify(error="no such user"), 404
    conn.execute("INSERT OR IGNORE INTO contacts(owner_id,contact_id) VALUES(?,?)", (user_id, receiver["id"]))
    conn.execute("INSERT OR IGNORE INTO contacts(owner_id,contact_id) VALUES(?,?)", (receiver["id"], user_id))
    seconds = expiry_policy(conn, user_id, receiver["id"])
    expires = (dt.datetime.utcnow() + dt.timedelta(seconds=seconds)).strftime("%Y-%m-%d %H:%M:%S") if seconds else None
    cur = conn.execute("""INSERT INTO messages(sender_id,receiver_id,type,content,duration,delivered,expires_at)
                         VALUES(?,?,?,?,?,?,?)""",
                       (user_id, receiver["id"], kind, content, data.get("duration"),
                        1 if online(receiver["id"]) else 0, expires))
    conn.commit()
    row = conn.execute("SELECT * FROM messages WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    payload = {"id":row["id"],"from":"me","to":to,"type":row["type"],"content":row["content"],
               "duration":row["duration"],"sent_at":row["sent_at"],"delivered":bool(row["delivered"]),
               "read":bool(row["read"]),"expires_at":row["expires_at"],"edited":False,"deleted":False}
    incoming = dict(payload)
    incoming["from"] = sender["username"]
    socketio.emit("new_message", incoming, room=f"user_{receiver['id']}")
    if payload["delivered"]:
        socketio.emit("message_status", {"ids":[row["id"]],"status":"delivered"}, room=f"user_{user_id}")
    return jsonify(payload), 201


@app.get("/messages/<other>")
@auth
def messages(user_id, other):
    conn = db()
    purge(conn)
    target = conn.execute("SELECT id,username FROM users WHERE username=?", (other,)).fetchone()
    if not target:
        conn.close()
        return jsonify(error="no such user"), 404
    rows = conn.execute("""SELECT * FROM messages WHERE
      ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?))
      ORDER BY id ASC""", (user_id,target["id"],target["id"],user_id)).fetchall()
    conn.commit()
    conn.close()
    return jsonify([message_payload(r, user_id, target["username"]) for r in rows])


@app.post("/messages/<other>/read")
@auth
def mark_read(user_id, other):
    conn = db()
    purge(conn)
    target = conn.execute("SELECT id FROM users WHERE username=?", (other,)).fetchone()
    if not target:
        conn.close()
        return jsonify(error="no such user"), 404
    rows = conn.execute("SELECT id FROM messages WHERE sender_id=? AND receiver_id=? AND read=0",
                        (target["id"], user_id)).fetchall()
    ids = [r["id"] for r in rows]
    if ids:
        marks = ",".join("?" for _ in ids)
        conn.execute(f"UPDATE messages SET read=1,delivered=1 WHERE id IN ({marks})", ids)
        conn.commit()
    conn.close()
    if ids:
        socketio.emit("message_status", {"ids":ids,"status":"read"}, room=f"user_{target['id']}")
    return jsonify(read_ids=ids)


@app.route("/messages/<int:message_id>", methods=["PATCH", "DELETE"])
@auth
def message_action(user_id, message_id):
    conn = db()
    row = conn.execute("SELECT * FROM messages WHERE id=?", (message_id,)).fetchone()
    if not row or row["sender_id"] != user_id:
        conn.close()
        return jsonify(error="only your own messages can be changed"), 403
    sender = conn.execute("SELECT username FROM users WHERE id=?", (row["sender_id"],)).fetchone()
    receiver = conn.execute("SELECT username FROM users WHERE id=?", (row["receiver_id"],)).fetchone()
    if request.method == "PATCH":
        content = (request.get_json(silent=True) or {}).get("content", "").strip()
        if row["type"] != "text" or row["deleted_for_sender"] or row["deleted_for_receiver"]:
            conn.close()
            return jsonify(error="only active text messages can be edited"), 400
        if not content or len(content) > 4000:
            conn.close()
            return jsonify(error="message must contain 1-4000 characters"), 400
        conn.execute("UPDATE messages SET content=?, edited=1 WHERE id=?", (content, message_id))
        conn.commit()
        row = conn.execute("SELECT * FROM messages WHERE id=?", (message_id,)).fetchone()
        mine = message_payload(row, user_id, receiver["username"])
        theirs = message_payload(row, row["receiver_id"], sender["username"])
        conn.close()
        socketio.emit("message_updated", theirs, room=f"user_{row['receiver_id']}")
        return jsonify(mine)
    # WhatsApp-style rule: once read, delete only from the sender's view.
    if row["read"]:
        conn.execute("UPDATE messages SET deleted_for_sender=1 WHERE id=?", (message_id,))
    else:
        conn.execute("UPDATE messages SET deleted_for_sender=1,deleted_for_receiver=1 WHERE id=?", (message_id,))
    conn.commit()
    row = conn.execute("SELECT * FROM messages WHERE id=?", (message_id,)).fetchone()
    mine = message_payload(row, user_id, receiver["username"])
    theirs = message_payload(row, row["receiver_id"], sender["username"])
    affects_receiver = not bool(row["read"])
    conn.close()
    if affects_receiver:
        socketio.emit("message_updated", theirs, room=f"user_{row['receiver_id']}")
    return jsonify(mine)


@app.get("/presence/<name>")
@auth
def presence(user_id, name):
    conn = db()
    row = conn.execute("SELECT id,last_seen FROM users WHERE username=?", (name,)).fetchone()
    if not row:
        conn.close()
        return jsonify(error="no such user"), 404
    result = {"online":visible_online(conn,row["id"]),"last_seen":row["last_seen"]}
    conn.close()
    return jsonify(result)


@app.route("/chat/<name>/disappearing", methods=["GET", "POST"])
@auth
def disappearing(user_id, name):
    valid = {0, 86400, 604800, 7776000}
    conn = db()
    target = conn.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()
    if not target:
        conn.close()
        return jsonify(error="no such user"), 404
    lo, hi = pair(user_id, target["id"])
    if request.method == "POST":
        try: seconds = int((request.get_json(silent=True) or {}).get("seconds", 0))
        except (TypeError, ValueError): seconds = -1
        if seconds not in valid:
            conn.close()
            return jsonify(error="unsupported timer"), 400
        conn.execute("""INSERT INTO chat_settings(user_min,user_max,disappearing_seconds,updated_by)
          VALUES(?,?,?,?) ON CONFLICT(user_min,user_max) DO UPDATE SET
          disappearing_seconds=excluded.disappearing_seconds,updated_by=excluded.updated_by,
          updated_at=CURRENT_TIMESTAMP""", (lo,hi,seconds,user_id))
        conn.commit()
    row = conn.execute("SELECT disappearing_seconds FROM chat_settings WHERE user_min=? AND user_max=?",
                       (lo,hi)).fetchone()
    conn.close()
    return jsonify(seconds=int(row["disappearing_seconds"]) if row else 0)


def broadcast_presence(user_id, is_online):
    conn = db()
    me = conn.execute("SELECT username,last_seen,show_online FROM users WHERE id=?", (user_id,)).fetchone()
    owners = conn.execute("SELECT owner_id FROM contacts WHERE contact_id=?", (user_id,)).fetchall()
    conn.close()
    if not me: return
    payload = {"username":me["username"],"online":bool(is_online and me["show_online"]),"last_seen":me["last_seen"]}
    for row in owners: socketio.emit("presence", payload, room=f"user_{row['owner_id']}")


@app.get("/")
def home(): return render_template("index.html")


@app.get("/chat")
@auth
def chat_page(user_id): return render_template("chat.html", active_username=None)


@app.get("/chat/<name>")
@auth
def chat_thread_page(user_id, name): return render_template("chat.html", active_username=name)


@app.get("/settings")
@auth
def settings_page(user_id): return render_template("settings.html", settings_section="root")


@app.get("/settings/<section>")
@auth
def settings_section_page(user_id, section):
    valid = {"account","privacy","appearance","notifications","language"}
    if section not in valid: return render_template("settings.html", settings_section="root"), 404
    return render_template("settings.html", settings_section=section)


@app.get("/discover")
@auth
def discover_page(user_id): return render_template("discover.html")


@app.get("/stories")
@auth
def stories_page(user_id): return render_template("stories.html")


@app.get("/new-chat")
@auth
def new_chat_page(user_id): return render_template("new_chat.html")


@app.get("/call/<name>")
@auth
def call_page(user_id, name):
    conn = db()
    target = conn.execute("SELECT username FROM users WHERE username=?", (name,)).fetchone()
    conn.close()
    if not target:
        return render_template("call.html", call_username=name), 404
    return render_template("call.html", call_username=target["username"])


@app.get("/call")
@auth
def calls_page(user_id):
    return render_template("call.html", call_username=None)


@socketio.on("connect")
def socket_connect(auth_data):
    user_id = user_from_token((auth_data or {}).get("token", ""))
    if not user_id: return False
    join_room(f"user_{user_id}")
    online_users.setdefault(user_id, set()).add(request.sid)
    sid_to_user[request.sid] = user_id
    conn = db()
    pending = conn.execute("SELECT id,sender_id FROM messages WHERE receiver_id=? AND delivered=0", (user_id,)).fetchall()
    if pending:
        ids = [r["id"] for r in pending]
        conn.execute(f"UPDATE messages SET delivered=1 WHERE id IN ({','.join('?' for _ in ids)})", ids)
        conn.commit()
    conn.close()
    for sender in {r["sender_id"] for r in pending}:
        socketio.emit("message_status", {"ids":[r["id"] for r in pending if r["sender_id"]==sender],
                                         "status":"delivered"}, room=f"user_{sender}")
    broadcast_presence(user_id, True)


@socketio.on("disconnect")
def socket_disconnect():
    user_id = sid_to_user.pop(request.sid, None)
    if user_id is None: return
    online_users.get(user_id, set()).discard(request.sid)
    if not online_users.get(user_id):
        online_users.pop(user_id, None)
        conn = db()
        conn.execute("UPDATE users SET last_seen=? WHERE id=?",
                     (dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), user_id))
        conn.commit(); conn.close()
        broadcast_presence(user_id, False)


@socketio.on("typing")
def typing(data):
    user_id = sid_to_user.get(request.sid)
    if not user_id: return
    conn = db()
    me = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
    target = conn.execute("SELECT id FROM users WHERE username=?", ((data or {}).get("to"),)).fetchone()
    conn.close()
    if me and target:
        socketio.emit("typing", {"from":me["username"],"active":bool((data or {}).get("active"))},
                      room=f"user_{target['id']}")


def call_target(data, conn, user_id):
    target_name = ((data or {}).get("to") or "").strip()
    target = conn.execute("SELECT id,username FROM users WHERE username=?", (target_name,)).fetchone()
    if not target or target["id"] == user_id:
        return None
    return target


@socketio.on("call_invite")
def call_invite(data):
    user_id = sid_to_user.get(request.sid)
    if not user_id:
        return
    conn = db()
    target = call_target(data, conn, user_id)
    caller = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    if caller and ((data or {}).get("to") or "").strip() == caller["username"]:
        socketio.emit("call_error", {"message":"You cannot call yourself."}, to=request.sid)
        return
    if not target or not caller:
        socketio.emit("call_error", {"message":"That user could not be reached."}, to=request.sid)
        return
    call_id = (data or {}).get("call_id") or secrets.token_urlsafe(12)
    mode = "video" if (data or {}).get("mode") == "video" else "audio"
    conn = db()
    conn.execute("""INSERT INTO call_logs(caller_id,receiver_id,mode,status,call_id)
                    VALUES(?,?,?,?,?)""", (user_id, target["id"], mode, "ringing", call_id))
    conn.commit()
    conn.close()
    socketio.emit("incoming_call", {
        "from": caller["username"], "call_id": call_id, "mode": mode
    }, room=f"user_{target['id']}")


@socketio.on("call_response")
def call_response(data):
    user_id = sid_to_user.get(request.sid)
    if not user_id:
        return
    conn = db()
    target = call_target(data, conn, user_id)
    me = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    if not target or not me:
        return
    accepted = bool((data or {}).get("accepted"))
    conn = db()
    conn.execute("""UPDATE call_logs SET status=?,ended_at=CASE WHEN ?=0 THEN CURRENT_TIMESTAMP ELSE ended_at END
                    WHERE call_id=?""", ("accepted" if accepted else "missed", 1 if accepted else 0,
                                         (data or {}).get("call_id", "")))
    conn.commit()
    conn.close()
    socketio.emit("call_response", {
        "from": me["username"],
        "call_id": (data or {}).get("call_id", ""),
        "accepted": accepted,
    }, room=f"user_{target['id']}")


@socketio.on("call_signal")
def call_signal(data):
    user_id = sid_to_user.get(request.sid)
    if not user_id:
        return
    conn = db()
    target = call_target(data, conn, user_id)
    me = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    if target and me and (data or {}).get("signal"):
        socketio.emit("call_signal", {
            "from": me["username"],
            "call_id": (data or {}).get("call_id", ""),
            "signal": (data or {}).get("signal"),
        }, room=f"user_{target['id']}")


@socketio.on("call_end")
def call_end(data):
    user_id = sid_to_user.get(request.sid)
    if not user_id:
        return
    conn = db()
    target = call_target(data, conn, user_id)
    conn.close()
    if target:
        conn = db()
        conn.execute("""UPDATE call_logs SET status=CASE WHEN status='accepted' THEN 'completed' ELSE 'missed' END,
                        ended_at=CURRENT_TIMESTAMP WHERE call_id=?""", ((data or {}).get("call_id", ""),))
        conn.commit()
        conn.close()
        socketio.emit("call_end", {
            "call_id": (data or {}).get("call_id", "")
        }, room=f"user_{target['id']}")


if __name__ == "__main__":
    print("HwFar running at http://127.0.0.1:5000")
    socketio.run(app, host="0.0.0.0", port=5000,
                 debug=False, allow_unsafe_werkzeug=True)