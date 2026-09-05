"""HwFar: a small, server-routed 1-to-1 messenger.

The UI pages are deliberately rendered by Flask instead of putting the whole
product in one index document. SQLite keeps the demo portable; replace it with
Postgres and a shared presence store before running multiple workers.
"""
import eventlet
eventlet.monkey_patch()
# Must happen before anything else touches sockets/threads (sqlite3, urllib,
# psycopg2's connection handling, etc.) — eventlet patches the standard
# library so those calls cooperate with its green threads instead of
# blocking them. Doing this after those modules are imported is a common
# cause of Socket.IO connections randomly dying under real traffic
# ("Invalid session", 400s on /socket.io/ polling requests) even though
# everything looks fine with only one user testing at a time.

import datetime as dt
import json
import os
import re
import secrets
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from functools import wraps

import jwt
from flask import Flask, jsonify, render_template, request, send_from_directory
from flask_socketio import SocketIO, join_room
from werkzeug.security import check_password_hash, generate_password_hash

try:
    # Optional: loads SMTP_*, GOOGLE_CLIENT_ID, etc. from a .env file that
    # sits right next to THIS FILE (app.py) — not the current working
    # directory. On Pydroid3, the working directory when you hit Run often
    # isn't the same as the script's folder, so a plain load_dotenv() can
    # silently find nothing. Anchoring to __file__ fixes that: put .env in
    # the same folder as app.py and it will always be found.
    # `pip install python-dotenv` if this import fails — the app still runs
    # fine without it, it just won't auto-load .env (set real env vars then).
    from dotenv import load_dotenv
    ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    load_dotenv(ENV_PATH)
except ImportError:
    pass

try:
    # Optional: only needed when DATABASE_URL is set (i.e. a Postgres addon
    # is attached on Railway). Local/Pydroid3 runs without it just fine and
    # keep using the SQLite file below. `pip install psycopg2-binary` if
    # you want to test against Postgres locally too.
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "chatly-dev-secret-key-change-me-please")
# IMPORTANT (Railway): a plain relative sqlite path lives on the container's
# ephemeral filesystem, which is wiped on every redeploy/restart — that
# wipes every registered user while old login tokens in people's browsers
# stay valid, so the server can no longer find the account the token points
# at and the app bounces them back asking to "register first".
#
# Fix: add a Postgres database to this Railway project (+ New -> Database ->
# Add PostgreSQL). Railway auto-populates a DATABASE_URL variable that this
# service can reference — once it's set, everything below switches to
# Postgres automatically and survives redeploys. If DATABASE_URL isn't set
# (e.g. running locally/Pydroid3), this falls back to the old SQLite file
# at DB_PATH, so nothing changes for local development.
DATABASE_URL = os.environ.get("DATABASE_URL")
DB_PATH = os.environ.get("DB_PATH", "chatly.db")
INSTALL_COUNT_BASELINE = 45_000_000

# --- Postgres/SQLite compatibility shim -------------------------------
# The rest of this file was written against sqlite3's API: "?" parameter
# placeholders, Connection.execute() as a cursor shortcut, and dict-style
# row access. Rather than rewrite every one of the ~130 queries below, this
# shim makes a psycopg2 connection quack like a sqlite3 one, so the same
# query code runs unmodified against either database.
PG_NOW = "(to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))"


def _pg_execute(self, sql, params=None):
    """Drop-in replacement for sqlite3.Connection.execute() on a psycopg2
    connection: translates '?' placeholders to '%s', SQLite's
    AUTOINCREMENT/CURRENT_TIMESTAMP to Postgres equivalents, and returns a
    cursor (like sqlite3 does) instead of requiring conn.cursor() first."""
    translated = (sql.replace("?", "%s")
                     .replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
                     .replace("CURRENT_TIMESTAMP", PG_NOW))
    cur = self.cursor()
    if params:
        cur.execute(translated, params)
    else:
        cur.execute(translated)
    return cur


class _PGConnWrapper:
    """psycopg2 connections are C-level objects with no __dict__, so you
    can't attach a new .execute attribute directly (raises AttributeError).
    This thin wrapper adds the sqlite-style .execute() method and forwards
    everything else (commit, close, cursor, rollback, ...) to the real
    connection untouched."""
    def __init__(self, raw):
        self._raw = raw

    def execute(self, sql, params=None):
        return _pg_execute(self._raw, sql, params)

    def __getattr__(self, name):
        return getattr(self._raw, name)


def pg_connect():
    raw = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    return _PGConnWrapper(raw)


# sqlite3.IntegrityError and psycopg2's IntegrityError are different
# exception classes; catch whichever one is relevant for unique-constraint
# violations (duplicate username, etc.) depending on which DB is active.
DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError, psycopg2.IntegrityError) if psycopg2 else (sqlite3.IntegrityError,)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")
online_users, sid_to_user = {}, {}

print(f"[env] looking for .env at: {ENV_PATH if 'ENV_PATH' in dir() else '(python-dotenv not installed)'}")
print(f"[env] SMTP_HOST is {'set' if os.environ.get('SMTP_HOST') else 'NOT set'}, "
      f"GOOGLE_CLIENT_ID is {'set' if os.environ.get('GOOGLE_CLIENT_ID') else 'NOT set'}")


@app.get("/sw.js")
def service_worker():
    """Serve the root-scoped worker (lives next to app.py) so it can handle
    offline app navigations. Served from root rather than /static so the
    default scope covers the whole app, not just /static/."""
    return send_from_directory(app.root_path, "sw.js", mimetype="application/javascript")


@app.get("/manifest.json")
def manifest():
    """Serve manifest.json from the project root, alongside app.py."""
    return send_from_directory(app.root_path, "manifest.json", mimetype="application/manifest+json")


@app.get("/offline.html")
def offline_page():
    """Serve the offline fallback page from the project root (not /static)
    so it lives next to sw.js/manifest.json and matches OFFLINE_URL in sw.js."""
    return send_from_directory(app.root_path, "offline.html", mimetype="text/html")


@app.get("/icons/<path:filename>")
def pwa_icons(filename):
    """Serve PWA icons from a root-level /icons folder (not /static/icons),
    matching the paths used in manifest.json, sw.js, offline.html and base.html."""
    return send_from_directory(os.path.join(app.root_path, "icons"), filename)


def db():
    if DATABASE_URL:
        return pg_connect()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db()
    schema_sql = """
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, language TEXT DEFAULT 'en',
        last_seen TEXT, avatar TEXT, age INTEGER, gender TEXT, country TEXT,
        show_online INTEGER DEFAULT 1, show_age INTEGER DEFAULT 0,
        show_gender INTEGER DEFAULT 0, discoverable INTEGER DEFAULT 1,
        show_status_reactions INTEGER DEFAULT 1, welcome_animation INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS contacts (
        owner_id INTEGER NOT NULL, contact_id INTEGER NOT NULL,
        added_at TEXT DEFAULT CURRENT_TIMESTAMP, archived INTEGER DEFAULT 0,
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
      CREATE TABLE IF NOT EXISTS blocks (
        blocker_id INTEGER NOT NULL, blocked_id INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(blocker_id, blocked_id)
      );
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL,
        reported_id INTEGER NOT NULL, reason TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS app_installs (
        device_id TEXT PRIMARY KEY, user_id INTEGER,
        installed_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS app_ratings (
        user_id INTEGER PRIMARY KEY, stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
        rated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
        device_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(endpoint)
      );
    """
    if DATABASE_URL:
        conn.execute(schema_sql)  # _pg_execute translates AUTOINCREMENT/CURRENT_TIMESTAMP
    else:
        conn.executescript(schema_sql)
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
        ("users", "show_last_seen", "show_last_seen INTEGER DEFAULT 1"),
        ("users", "share_status_views", "share_status_views INTEGER DEFAULT 1"),
        ("contacts", "archived", "archived INTEGER DEFAULT 0"),
        ("users", "email", "email TEXT"),
        ("users", "email_verified", "email_verified INTEGER DEFAULT 0"),
        ("users", "reset_code_hash", "reset_code_hash TEXT"),
        ("users", "reset_code_expires", "reset_code_expires TEXT"),
        ("users", "reset_code_purpose", "reset_code_purpose TEXT"),
        ("users", "google_sub", "google_sub TEXT"),
        ("users", "show_status_reactions", "show_status_reactions INTEGER DEFAULT 1"),
        ("users", "welcome_animation", "welcome_animation INTEGER DEFAULT 1"),
        ("users", "notification_prefs", "notification_prefs TEXT"),
        ("push_subscriptions", "fcm_token", "fcm_token TEXT"),
    ]:
        if DATABASE_URL:
            names = {r["column_name"] for r in conn.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name=?",
                (table,)).fetchall()}
        else:
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
    """Require a genuine, valid Bearer token. No fallback: a request with a
    missing, malformed, or expired token is rejected outright — it never
    falls through to "just use the first registered account" like an
    earlier version of this file did. That behavior meant anyone hitting a
    protected endpoint with no token at all got silently logged in as your
    first user, which is a real authentication bypass, not a convenience."""
    @wraps(handler)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        user_id = user_from_token(header.split(" ", 1)[1]) if header.startswith("Bearer ") else None
        if not user_id:
            return jsonify(error="please log in to continue"), 401
        return handler(user_id, *args, **kwargs)
    return wrapped


def auth_strict(handler):
    """Historically identical to @auth after the bypass above was removed;
    kept as a separate name so call sites that intentionally demanded the
    stricter behavior (password/recovery-email/avatar changes) still read
    clearly, without implying the relaxed behavior is available elsewhere.
    """
    @wraps(handler)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        user_id = user_from_token(header.split(" ", 1)[1]) if header.startswith("Bearer ") else None
        if not user_id:
            return jsonify(error="please log in again to continue"), 401
        return handler(user_id, *args, **kwargs)
    return wrapped


def generate_reset_code():
    return f"{secrets.randbelow(1_000_000):06d}"


def _send_email_via_brevo_api(api_key, to_addr, subject, body):
    """Send via Brevo's HTTPS transactional-email API (stdlib urllib only,
    no extra dependency — same reasoning as verify_google_token above).
    Goes over port 443, so it works on Railway plans that block outbound
    SMTP. Needs a Brevo *API key* (Brevo dashboard -> SMTP & API -> API
    Keys), which is a different credential from the SMTP login/key used
    for the smtplib path below.
    """
    sender = os.environ.get("MAIL_FROM") or "no-reply@playconsistency.com.ng"
    payload = json.dumps({
        "sender": {"email": sender},
        "to": [{"email": to_addr}],
        "subject": subject,
        "textContent": body,
    }).encode()
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=payload,
        method="POST",
        headers={
            "api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    print(f"[EMAIL ATTEMPT via Brevo API] sender={sender} to={to_addr}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"[EMAIL OK] Brevo API accepted, status={resp.status}")
        return True
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        print(f"[EMAIL ERROR] Brevo API rejected the request: "
              f"{exc.code} {detail}")
        return False
    except Exception as exc:  # noqa: BLE001 - report and keep the app alive
        print(f"[EMAIL ERROR] could not reach Brevo API for {to_addr}: "
              f"{type(exc).__name__}: {exc}")
        return False


def send_email(to_addr, subject, body):
    """Send a plaintext email, or print it to the console when no SMTP
    provider is configured (e.g. local Pydroid3 development).

    Configure via env vars: SMTP_HOST, SMTP_PORT (default 587), SMTP_USER,
    SMTP_PASS, MAIL_FROM. Any SMTP-compatible relay works, including the
    Brevo SMTP relay already used for the main Consistency platform
    (smtp-relay.brevo.com, port 587, login = your Brevo SMTP login, key =
    your Brevo SMTP key).
    """
    # Railway blocks outbound SMTP (ports 25/465/587/2525) on its Free,
    # Trial, and Hobby plans to protect its IPs from spam abuse — SMTP is
    # only unblocked on Pro and above. Since Brevo also offers a plain
    # HTTPS API, prefer that when BREVO_API_KEY is set: it sends over
    # port 443, so it isn't affected by that block and works on every
    # Railway plan. Falls back to SMTP (used for local Pydroid3 dev,
    # where no port is blocked) when BREVO_API_KEY isn't set.
    api_key = os.environ.get("BREVO_API_KEY")
    if api_key:
        return _send_email_via_brevo_api(api_key, to_addr, subject, body)

    host = os.environ.get("SMTP_HOST")
    if not host:
        # NOTE: this branch means NO EMAIL WAS SENT. Setting MAIL_FROM alone
        # does nothing — SMTP_HOST must also be set, or send_email() falls
        # straight into this dev/console-only path and reports success.
        print(f"[DEV EMAIL - NOT ACTUALLY SENT, SMTP_HOST/BREVO_API_KEY unset] "
              f"to={to_addr} subject={subject!r}\n{body}\n")
        return True
    import smtplib
    from email.mime.text import MIMEText
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    sender = os.environ.get("MAIL_FROM") or user or "no-reply@playconsistency.com.ng"

    print(f"[EMAIL ATTEMPT] host={host} port={port} "
          f"user={'set' if user else 'NOT SET'} "
          f"password={'set' if password else 'NOT SET'} "
          f"sender={sender} to={to_addr}")
    if not user or not password:
        print("[EMAIL WARNING] SMTP_USER or SMTP_PASS missing — Brevo's relay "
              "requires authenticated login (SMTP login + SMTP key from "
              "Brevo, not your account password). Without both, the server "
              "call below will likely be rejected with a 535 auth error.")

    msg = MIMEText(body)
    msg["Subject"], msg["From"], msg["To"] = subject, sender, to_addr
    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.set_debuglevel(1)  # prints the raw SMTP conversation to console
            server.starttls()
            if user and password:
                server.login(user, password)
            refused = server.sendmail(sender, [to_addr], msg.as_string())
            if refused:
                print(f"[EMAIL WARNING] server accepted the connection but "
                      f"refused some recipients: {refused}")
            else:
                print(f"[EMAIL OK] accepted by {host} for delivery to {to_addr}")
        return True
    except smtplib.SMTPAuthenticationError as exc:
        print(f"[EMAIL ERROR] AUTH FAILED to {host} — check SMTP_USER/SMTP_PASS "
              f"are your Brevo SMTP *login* and SMTP *key* (not account "
              f"password): {exc.smtp_code} {exc.smtp_error}")
        return False
    except smtplib.SMTPRecipientsRefused as exc:
        print(f"[EMAIL ERROR] recipient {to_addr} refused: {exc.recipients}")
        return False
    except smtplib.SMTPSenderRefused as exc:
        print(f"[EMAIL ERROR] sender {sender} refused (domain/sender not "
              f"verified in Brevo?): {exc.smtp_code} {exc.smtp_error}")
        return False
    except Exception as exc:  # noqa: BLE001 - report and keep the app alive
        print(f"[EMAIL ERROR] could not send to {to_addr}: "
              f"{type(exc).__name__}: {exc}")
        return False


try:
    # firebase-admin talks to Firebase Cloud Messaging's HTTP v1 API using a
    # service account, instead of hand-rolled Web Push VAPID signing. Add
    # "firebase-admin" to requirements.txt and set FIREBASE_SERVICE_ACCOUNT_JSON
    # (the full service account JSON from Firebase console → Project
    # Settings → Service Accounts → Generate new private key) to enable
    # real push notifications. Without it, push calls are quietly skipped
    # so the rest of the app keeps working.
    import firebase_admin
    from firebase_admin import credentials as fb_credentials, messaging as fb_messaging
    _fb_key_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if not _fb_key_json:
        fb_messaging = None
        print("[push] FIREBASE_SERVICE_ACCOUNT_JSON not set — push "
              "notifications are disabled until it's added.")
    elif not firebase_admin._apps:
        try:
            _fb_creds_dict = json.loads(_fb_key_json)
        except json.JSONDecodeError as exc:
            # BUGFIX: this used to fall through to the generic except below
            # with a vague message. In practice this is the #1 way Railway
            # deployments end up here: pasting the pretty-printed, multi-line
            # service account JSON straight into a Railway variable can leave
            # raw (unescaped) newlines inside the "private_key" string value,
            # which is invalid JSON — json.loads chokes on it. Say so
            # explicitly so it's fixable from the Railway logs alone.
            fb_messaging = None
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON "
                f"({exc}). This usually means the private_key field has "
                "real line breaks in it instead of the escaped \\n from the "
                "downloaded file — re-paste the *entire* service account "
                "JSON on one line, exactly as downloaded from Firebase "
                "console → Project Settings → Service Accounts."
            ) from exc
        firebase_admin.initialize_app(fb_credentials.Certificate(_fb_creds_dict))
        print("[push] firebase-admin initialized OK — push notifications are enabled.")
    else:
        print("[push] firebase-admin already initialized.")
except ImportError:
    fb_messaging = None
    print("[push] firebase-admin not installed — push notifications are "
          "disabled. Add 'firebase-admin' to requirements.txt and set "
          "FIREBASE_SERVICE_ACCOUNT_JSON to enable them.")
except Exception as exc:  # noqa: BLE001 - a bad/malformed key shouldn't crash the app
    fb_messaging = None
    print(f"[push] could not initialize firebase-admin: {type(exc).__name__}: {exc}")

# Sanity-check the web config too, at startup rather than only when a browser
# happens to hit /firebase-config — missing pieces here mean getToken() will
# fail client-side even though the service-account half above is fine.
_fb_web_keys = ["FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN", "FIREBASE_PROJECT_ID",
                "FIREBASE_STORAGE_BUCKET", "FIREBASE_MESSAGING_SENDER_ID",
                "FIREBASE_APP_ID", "FIREBASE_VAPID_KEY"]
_fb_web_missing = [k for k in _fb_web_keys if not os.environ.get(k)]
if _fb_web_missing:
    print(f"[push] missing web config env vars: {', '.join(_fb_web_missing)} — "
          "the browser can't call getToken() until these are set on Railway "
          "(Firebase console → Project Settings → General for most of these, "
          "→ Cloud Messaging → Web Push certificates for FIREBASE_VAPID_KEY).")

_turn_url_check = os.environ.get("TURN_URL")
if _turn_url_check and os.environ.get("TURN_USERNAME") and os.environ.get("TURN_CREDENTIAL"):
    _turn_count = len([u for u in re.split(r"[,\n\r]+", _turn_url_check) if u.strip()])
    print(f"[calls] TURN configured — {_turn_count} relay url(s) will be sent to "
          "the browser from /ice-servers.")
elif _turn_url_check:
    print("[calls] TURN_URL is set but TURN_USERNAME/TURN_CREDENTIAL are missing "
          "— all three are required, calls will fall back to STUN-only.")
else:
    print("[calls] No TURN_URL/TURN_USERNAME/TURN_CREDENTIAL set — calls will "
          "only work when both users are on networks that allow direct/STUN "
          "connections. Behind carrier-grade NAT (common on Nigerian mobile "
          "data) both sides will hang at 'Connecting…' and time out.")

DEFAULT_NOTIFICATION_PREFS = {"messages": True, "calls": True, "voice_notes": True, "status": True}


def notification_prefs(row):
    """Parse a user row's notification_prefs JSON, filling in defaults for
    any category that's missing (e.g. added after the user last saved)."""
    prefs = dict(DEFAULT_NOTIFICATION_PREFS)
    raw = row["notification_prefs"] if row and "notification_prefs" in row.keys() else None
    if raw:
        try:
            prefs.update({k: bool(v) for k, v in json.loads(raw).items() if k in prefs})
        except (ValueError, TypeError):
            pass
    return prefs


def send_push(user_id, category, title, body, url="/chat", tag=None):
    """Push a notification to every device a user has subscribed on,
    honoring their per-category preference. Silently no-ops if
    firebase-admin isn't installed or configured — the in-app/socket
    notification still works either way, this is only the "app is closed"
    channel."""
    if fb_messaging is None:
        return
    conn = db()
    user = conn.execute("SELECT notification_prefs FROM users WHERE id=?", (user_id,)).fetchone()
    if not notification_prefs(user).get(category, True):
        conn.close()
        return
    subs = conn.execute("SELECT id,fcm_token FROM push_subscriptions WHERE user_id=?",
                        (user_id,)).fetchall()
    conn.close()
    if not subs:
        return
    stale_ids = []
    for sub in subs:
        if not sub["fcm_token"]:
            continue
        try:
            fb_messaging.send(fb_messaging.Message(
                # Data-only (no top-level `notification` field) so this
                # always reaches our own onBackgroundMessage handler in
                # sw.js for display, instead of FCM's automatic notification
                # rendering — which would skip our custom tag/vibrate/click
                # routing.
                data={"title": title, "body": body, "url": url, "tag": tag or category},
                token=sub["fcm_token"],
            ))
        except firebase_admin.messaging.UnregisteredError:
            stale_ids.append(sub["id"])  # token expired/unsubscribed on the browser's end
        except Exception as exc:  # noqa: BLE001 - keep the request path alive
            print(f"[push] send failed for user {user_id}: {type(exc).__name__}: {exc}")
    if stale_ids:
        conn = db()
        for sid_ in stale_ids:
            conn.execute("DELETE FROM push_subscriptions WHERE id=?", (sid_,))
        conn.commit()
        conn.close()


def verify_google_token(credential):
    """Verify a Google Identity Services ID token server-side.

    Uses Google's tokeninfo endpoint (stdlib urllib only, no extra
    dependency) rather than the google-auth library, since Pydroid3 setups
    often can't easily add packages. Good enough for a small app; swap for
    google-auth's cryptographic verification if you outgrow this.
    """
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    if not client_id or not credential:
        return None
    url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + urllib.parse.quote(credential)
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            info = json.loads(resp.read().decode())
    except Exception:  # noqa: BLE001 - any network/parse failure just fails closed
        return None
    if info.get("aud") != client_id:
        return None
    if str(info.get("email_verified")).lower() != "true":
        return None
    return info


def online(user_id):
    return bool(online_users.get(user_id))


def visible_online(conn, user_id):
    row = conn.execute("SELECT show_online FROM users WHERE id=?", (user_id,)).fetchone()
    return online(user_id) and bool(row and row["show_online"])


def reciprocal_setting(conn, viewer_id, target_id, column):
    """WhatsApp-style reciprocity: a viewer who has turned a privacy setting
    off cannot see that same field on anyone else, regardless of whether the
    other person has it turned on."""
    if viewer_id == target_id:
        return True
    viewer = conn.execute(f"SELECT {column} FROM users WHERE id=?", (viewer_id,)).fetchone()
    target = conn.execute(f"SELECT {column} FROM users WHERE id=?", (target_id,)).fetchone()
    return bool(viewer and viewer[column]) and bool(target and target[column])


def visible_online_to(conn, viewer_id, target_id):
    return visible_online(conn, target_id) and reciprocal_setting(conn, viewer_id, target_id, "show_online")


def visible_last_seen_to(conn, viewer_id, target_id):
    return reciprocal_setting(conn, viewer_id, target_id, "show_last_seen")


def blocked_between(conn, first_id, second_id):
    return bool(conn.execute("""
        SELECT 1 FROM blocks
        WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)
    """, (first_id, second_id, second_id, first_id)).fetchone())


def public_profile(conn, row, viewer_id=None):
    """Return the fields another user is allowed to see on a profile."""
    if viewer_id is None:
        viewer_id = row["id"]
    result = {
        "id": row["id"],
        "username": row["username"],
        "avatar": row["avatar"],
        "country": row["country"],
        "online": visible_online_to(conn, viewer_id, row["id"]),
        "last_seen": row["last_seen"] if visible_last_seen_to(conn, viewer_id, row["id"]) else None,
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


def notify_contacts_of_status(conn, row, owner_id):
    """Push a "new status" notification to contacts who are actually
    allowed to see it, mirroring status_visible's audience rules —
    used for both fresh posts and reshares."""
    owner = conn.execute("SELECT username FROM users WHERE id=?", (owner_id,)).fetchone()
    if not owner:
        return
    viewers = conn.execute(
        "SELECT u.id,u.username FROM contacts c JOIN users u ON u.id=c.owner_id WHERE c.contact_id=?",
        (owner_id,)).fetchall()
    for viewer in viewers:
        if status_visible(conn, row, viewer["id"], viewer["username"]):
            send_push(viewer["id"], "status", owner["username"], "posted a new status", url="/stories",
                      tag="status-" + str(row["id"]))


def status_payload(conn, row, viewer_id):
    owner = conn.execute("""SELECT id,username,avatar,share_status_views,
                                   show_status_reactions
                            FROM users WHERE id=?""",
                         (row["owner_id"],)).fetchone()
    viewer_reaction = conn.execute(
        "SELECT reaction FROM status_reactions WHERE status_id=? AND viewer_id=?",
        (row["id"], viewer_id)).fetchone()
    counts = conn.execute(
        "SELECT reaction,COUNT(*) AS count FROM status_reactions WHERE status_id=? GROUP BY reaction",
        (row["id"],)).fetchall()
    reactions_visible = row["owner_id"] == viewer_id or bool(
        owner and owner["show_status_reactions"]
    )
    reaction_counts = {item["reaction"]: item["count"] for item in counts} if reactions_visible else {}
    viewers = []
    # WhatsApp-style reciprocity: an owner who has turned off status read
    # receipts can't see who viewed their own story either, and a viewer who
    # turned theirs off is left out of the list shown to the owner.
    if row["owner_id"] == viewer_id and owner and owner["share_status_views"]:
        viewers = [dict(item) for item in conn.execute("""
          SELECT u.username,u.avatar,v.viewed_at,
                 (SELECT r.reaction FROM status_reactions r
                    WHERE r.status_id=v.status_id AND r.viewer_id=v.viewer_id) AS reaction
          FROM status_views v JOIN users u ON u.id=v.viewer_id
          WHERE v.status_id=? AND (
            u.share_status_views=1
            OR EXISTS(SELECT 1 FROM status_reactions r2
                        WHERE r2.status_id=v.status_id AND r2.viewer_id=v.viewer_id)
          ) ORDER BY v.viewed_at DESC
        """, (row["id"],)).fetchall()]
    viewed_by_me = row["owner_id"] == viewer_id or bool(conn.execute(
        "SELECT 1 FROM status_views WHERE status_id=? AND viewer_id=?",
        (row["id"], viewer_id)).fetchone())
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
        "viewed_by_me": viewed_by_me,
        "view_count": conn.execute(
            "SELECT COUNT(*) FROM status_views WHERE status_id=?", (row["id"],)
        ).fetchone()[0],
        "viewers": viewers,
        "like_count": reaction_counts.get("like", 0),
        "dislike_count": reaction_counts.get("dislike", 0),
        "viewer_reaction": viewer_reaction["reaction"] if viewer_reaction else None,
        "reactions_visible": reactions_visible,
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
    email = (data.get("email") or "").strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify(error="a valid email is required to secure your account"), 400
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
    taken = conn.execute("SELECT 1 FROM users WHERE email=? AND email_verified=1", (email,)).fetchone()
    if taken:
        conn.close()
        return jsonify(error="that email is already linked to another account"), 409
    code = generate_reset_code()
    expires = (dt.datetime.utcnow() + dt.timedelta(minutes=15)).isoformat()
    try:
        conn.execute("""INSERT INTO users(
          username,password_hash,language,avatar,age,gender,country,show_age,show_gender,
          email,email_verified,reset_code_hash,reset_code_expires,reset_code_purpose
        ) VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?,'email_verify')""", (
            username, generate_password_hash(password), language,
            avatar, age, gender, country, 1 if data.get("show_age") else 0,
            1 if data.get("show_gender") else 0, email,
            generate_password_hash(code), expires))
        conn.commit()
    except DB_INTEGRITY_ERRORS:
        conn.close()
        return jsonify(error="username already taken"), 409
    conn.close()
    send_email(email, "Confirm your HwFar email",
               f"Your HwFar verification code is {code}. It expires in 15 minutes.\n\n"
               "You'll need this to secure your new account.")
    return jsonify(message="registered", email=email), 201


@app.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    conn = db()
    row = conn.execute("SELECT * FROM users WHERE username=?", ((data.get("username") or "").strip(),)).fetchone()
    conn.close()
    if not row or not check_password_hash(row["password_hash"], data.get("password") or ""):
        return jsonify(error="invalid username or password"), 401
    # Login is intentionally not gated on email_verified: the frontend's
    # signup flow logs the person in immediately after /register, then
    # shows the "secure your account" code screen as a dismissible nag
    # (see openSecureAccountModal in chatly.js), not a hard requirement.
    return jsonify(access_token=make_token(row["id"]), user_id=row["id"], username=row["username"],
                   language=row["language"] or "en", avatar=row["avatar"], country=row["country"], age=row["age"],
                   gender=row["gender"], show_age=bool(row["show_age"]),
                   show_gender=bool(row["show_gender"]))


@app.post("/verify-signup")
def verify_signup():
    """Public (no token) — confirms the code emailed at registration and
    flips email_verified on, so a freshly-registered user can pass this
    before they've ever been able to log in and get a token at all."""
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or "").strip().lower()
    code = (data.get("code") or "").strip()
    conn = db()
    row = conn.execute("""SELECT id,email,email_verified,reset_code_hash,reset_code_expires,reset_code_purpose
      FROM users WHERE lower(username)=? OR email=?""", (identifier, identifier)).fetchone()
    if not row:
        conn.close()
        return jsonify(error="account not found"), 404
    if row["email_verified"]:
        conn.close()
        return jsonify(message="email already verified")
    if row["reset_code_purpose"] != "email_verify" or not row["reset_code_hash"]:
        conn.close()
        return jsonify(error="request a new verification code"), 400
    if not row["reset_code_expires"] or dt.datetime.fromisoformat(row["reset_code_expires"]) < dt.datetime.utcnow():
        conn.close()
        return jsonify(error="that code has expired, request a new one"), 400
    if not check_password_hash(row["reset_code_hash"], code):
        conn.close()
        return jsonify(error="incorrect code"), 400
    conn.execute("""UPDATE users SET email_verified=1, reset_code_hash=NULL,
      reset_code_expires=NULL, reset_code_purpose=NULL WHERE id=?""", (row["id"],))
    conn.commit()
    conn.close()
    return jsonify(message="email verified, you can now log in")


@app.post("/resend-verification")
def resend_verification():
    """Public. Same generic-response pattern as /forgot-password so it
    can't be used to probe which usernames/emails are registered."""
    identifier = ((request.get_json(silent=True) or {}).get("identifier") or "").strip().lower()
    generic = jsonify(message="If that account needs email verification, we've sent a new code.")
    if not identifier:
        return generic, 200
    conn = db()
    row = conn.execute("""SELECT id,email,email_verified,reset_code_expires FROM users
      WHERE lower(username)=? OR email=?""", (identifier, identifier)).fetchone()
    if not row or row["email_verified"] or not row["email"]:
        conn.close()
        return generic, 200
    if row["reset_code_expires"]:
        try:
            created = dt.datetime.fromisoformat(row["reset_code_expires"]) - dt.timedelta(minutes=15)
            if dt.datetime.utcnow() - created < dt.timedelta(seconds=60):
                conn.close()
                return jsonify(error="please wait a moment before requesting another code"), 429
        except ValueError:
            pass
    code = generate_reset_code()
    expires = (dt.datetime.utcnow() + dt.timedelta(minutes=15)).isoformat()
    conn.execute("""UPDATE users SET reset_code_hash=?, reset_code_expires=?,
      reset_code_purpose='email_verify' WHERE id=?""",
                 (generate_password_hash(code), expires, row["id"]))
    conn.commit()
    conn.close()
    send_email(row["email"], "Confirm your HwFar email",
               f"Your HwFar verification code is {code}. It expires in 15 minutes.")
    return generic, 200


@app.get("/auth/google/config")
def google_config():
    """Public — a Google OAuth Client ID is meant to be visible in the
    browser, it's not a secret. Returns '' if Google sign-in isn't set up,
    so the frontend can just hide the button."""
    return jsonify(client_id=os.environ.get("GOOGLE_CLIENT_ID", ""))


@app.get("/ice-servers")
@auth
def ice_servers(user_id):
    """WebRTC ICE server config for calls. STUN alone (the previous
    hardcoded default) only helps two peers discover each other's public
    address, and fails outright when either side is behind carrier-grade
    NAT — common on Nigerian mobile networks. Add a free TURN relay (e.g.
    an Open Relay / Metered account) via TURN_URL/TURN_USERNAME/
    TURN_CREDENTIAL — TURN_URL may be a comma-separated list of urls
    sharing the same username/credential. Behind @auth (unlike the Google
    config above) since TURN credentials cost bandwidth if scraped."""
    servers = [{"urls": "stun:stun.l.google.com:19302"}]
    turn_url, turn_user, turn_cred = (os.environ.get("TURN_URL"),
        os.environ.get("TURN_USERNAME"), os.environ.get("TURN_CREDENTIAL"))
    if turn_url and turn_user and turn_cred:
        # split on commas AND newlines/whitespace — Metered's dashboard lists
        # multiple TURN urls one per line, and it's an easy paste mistake to
        # carry the line breaks into a Railway var instead of joining with
        # commas as this endpoint expects.
        for url in re.split(r"[,\n\r]+", turn_url):
            url = url.strip()
            if url:
                servers.append({"urls": url, "username": turn_user, "credential": turn_cred})
    elif turn_url or turn_user or turn_cred:
        print("[calls] TURN_URL/TURN_USERNAME/TURN_CREDENTIAL are only "
              "partially set — all three are required together, so calls "
              "are falling back to STUN-only.")
    return jsonify(iceServers=servers)


@app.get("/firebase-config")
def firebase_config():
    """Public — like the Google client ID above, Firebase's web config is
    meant to be embedded in the browser; it identifies the project, it
    isn't a secret credential. The actual secret (the service account key)
    stays server-side in FIREBASE_SERVICE_ACCOUNT_JSON and is never sent
    here. Returns empty values if Firebase isn't set up yet, so the
    frontend can just skip push setup."""
    return jsonify(
        apiKey=os.environ.get("FIREBASE_API_KEY", ""),
        authDomain=os.environ.get("FIREBASE_AUTH_DOMAIN", ""),
        projectId=os.environ.get("FIREBASE_PROJECT_ID", ""),
        storageBucket=os.environ.get("FIREBASE_STORAGE_BUCKET", ""),
        messagingSenderId=os.environ.get("FIREBASE_MESSAGING_SENDER_ID", ""),
        appId=os.environ.get("FIREBASE_APP_ID", ""),
        vapidKey=os.environ.get("FIREBASE_VAPID_KEY", ""),
    )


@app.post("/push/subscribe")
@auth
def push_subscribe(user_id):
    data = request.get_json(silent=True) or {}
    fcm_token = (data.get("token") or "").strip()
    if not fcm_token:
        return jsonify(error="a valid push token is required"), 400
    conn = db()
    conn.execute("""INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,device_id,fcm_token)
                    VALUES(?,?,?,?,?,?)
                    ON CONFLICT(endpoint) DO UPDATE SET
                      user_id=excluded.user_id, device_id=excluded.device_id,
                      fcm_token=excluded.fcm_token""",
                (user_id, fcm_token, "", "", data.get("device_id"), fcm_token))
    conn.commit()
    conn.close()
    return jsonify(ok=True), 201


@app.post("/push/unsubscribe")
@auth
def push_unsubscribe(user_id):
    fcm_token = (request.get_json(silent=True) or {}).get("token", "").strip()
    conn = db()
    conn.execute("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?", (user_id, fcm_token))
    conn.commit()
    conn.close()
    return jsonify(ok=True)


@app.post("/account/notification-prefs")
@auth
def update_notification_prefs(user_id):
    data = request.get_json(silent=True) or {}
    conn = db()
    row = conn.execute("SELECT notification_prefs FROM users WHERE id=?", (user_id,)).fetchone()
    prefs = notification_prefs(row)
    for key in DEFAULT_NOTIFICATION_PREFS:
        if key in data:
            prefs[key] = bool(data[key])
    conn.execute("UPDATE users SET notification_prefs=? WHERE id=?", (json.dumps(prefs), user_id))
    conn.commit()
    conn.close()
    return jsonify(prefs)


@app.post("/auth/google")
def google_auth():
    credential = (request.get_json(silent=True) or {}).get("credential") or ""
    info = verify_google_token(credential)
    if not info:
        return jsonify(error="could not verify Google sign-in, please try again"), 400
    sub = info.get("sub")
    email = (info.get("email") or "").strip().lower()
    conn = db()
    row = conn.execute("SELECT * FROM users WHERE google_sub=?", (sub,)).fetchone()
    conn.close()
    if row:
        return jsonify(access_token=make_token(row["id"]), user_id=row["id"], username=row["username"],
                       language=row["language"] or "en", avatar=row["avatar"], country=row["country"],
                       age=row["age"], gender=row["gender"], show_age=bool(row["show_age"]),
                       show_gender=bool(row["show_gender"]))
    # No HwFar account linked to this Google identity yet — hand back a
    # short-lived signed token proving Google verified them, and let the
    # frontend collect a HwFar username (and the same basics /register
    # asks for) before an account is actually created.
    pending = jwt.encode({
        "kind": "google-pending", "sub": sub, "email": email,
        "picture": info.get("picture") or "",
        "exp": dt.datetime.utcnow() + dt.timedelta(minutes=15),
    }, app.config["SECRET_KEY"], algorithm="HS256")
    suggested = re.sub(r"[^a-zA-Z0-9_.-]", "", email.split("@")[0] if email else "")[:24] or "user"
    return jsonify(new_user=True, pending_token=pending, email=email, suggested_username=suggested)


@app.post("/auth/google/complete")
def google_auth_complete():
    data = request.get_json(silent=True) or {}
    try:
        pending = jwt.decode(data.get("pending_token") or "", app.config["SECRET_KEY"], algorithms=["HS256"])
        if pending.get("kind") != "google-pending":
            raise jwt.InvalidTokenError("wrong kind")
    except jwt.InvalidTokenError:
        return jsonify(error="your Google sign-in expired, please try Google sign-in again"), 400
    username = (data.get("username") or "").strip()
    if not 2 <= len(username) <= 24 or not re.fullmatch(r"[a-zA-Z0-9_.-]{2,24}", username):
        return jsonify(error="username must be 2-24 letters, numbers, dots, dashes, or underscores"), 400
    country = (data.get("country") or "").strip()
    if not country or len(country) > 80:
        return jsonify(error="choose your country"), 400
    try:
        age = int(data.get("age"))
    except (TypeError, ValueError):
        age = 0
    if not 13 <= age <= 120:
        return jsonify(error="age must be between 13 and 120"), 400
    gender = (data.get("gender") or "").strip()
    if gender not in ("Female", "Male", "Non-binary", "Prefer not to say"):
        return jsonify(error="choose a gender option"), 400
    if not data.get("community_accepted"):
        return jsonify(error="accept the Community Guidelines before joining"), 400
    language = data.get("language") if data.get("language") in ("en", "fr") else "en"
    conn = db()
    if conn.execute("SELECT 1 FROM users WHERE google_sub=?", (pending["sub"],)).fetchone():
        conn.close()
        return jsonify(error="this Google account is already linked to a HwFar account"), 409
    # Google already proved this person owns the account's email, so it's
    # marked verified immediately — they can use it for password resets
    # right away, even though they never set a password themselves.
    unusable_password = generate_password_hash(secrets.token_hex(24))
    try:
        conn.execute("""INSERT INTO users(
          username,password_hash,language,avatar,age,gender,country,show_age,show_gender,
          google_sub,email,email_verified
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,1)""", (
            username, unusable_password, language, pending.get("picture") or "", age, gender, country,
            1 if data.get("show_age") else 0, 1 if data.get("show_gender") else 0,
            pending["sub"], pending.get("email") or ""))
        conn.commit()
        user_id = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()["id"]
    except DB_INTEGRITY_ERRORS:
        conn.close()
        return jsonify(error="username already taken"), 409
    conn.close()
    return jsonify(access_token=make_token(user_id), user_id=user_id, username=username, language=language,
                   avatar=pending.get("picture") or "", country=country, age=age, gender=gender,
                   show_age=bool(data.get("show_age")), show_gender=bool(data.get("show_gender"))), 201


@app.get("/account/me")
@auth
def account_me(user_id):
    conn = db()
    row = conn.execute("""SELECT id,username,language,avatar,country,age,gender,
      show_online,show_age,show_gender,discoverable,show_last_seen,share_status_views,
      show_status_reactions,welcome_animation,email,email_verified,google_sub,notification_prefs
      FROM users WHERE id=?""",
                       (user_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify(error="not found"), 404
    result = dict(row)
    # Never expose the raw Google subject id to the client — just whether
    # a Google account is linked, so settings can show an unlink option.
    result["google_linked"] = bool(result.pop("google_sub"))
    result["notification_prefs"] = notification_prefs(row)
    return jsonify(result)


@app.get("/api/app-stats")
def app_stats():
    """Public totals for the Settings > About screen. No auth required so
    it also works on the landing page before login."""
    conn = db()
    real_installs = conn.execute("SELECT COUNT(*) c FROM app_installs").fetchone()["c"]
    # Displayed count = a fixed floor plus genuine tracked installs, so the
    # number matches the "45M+ people already use HwFar" headline on the
    # landing page and keeps climbing from there as real installs land.
    installs = INSTALL_COUNT_BASELINE + real_installs
    row = conn.execute("SELECT COUNT(*) c, AVG(stars) a FROM app_ratings").fetchone()
    my_rating = None
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        uid = user_from_token(header.split(" ", 1)[1])
        if uid:
            mine = conn.execute("SELECT stars FROM app_ratings WHERE user_id=?", (uid,)).fetchone()
            my_rating = mine["stars"] if mine else None
    conn.close()
    return jsonify(
        installs=installs,
        rating_count=row["c"] or 0,
        rating_average=round(row["a"], 2) if row["a"] else None,
        my_rating=my_rating,
    )


@app.post("/api/app-install")
def app_install():
    """One row per device (client generates & persists device_id in
    localStorage), so re-opening the app never inflates the count — only a
    genuine new install/device does."""
    device_id = (request.get_json(silent=True) or {}).get("device_id", "").strip()
    if not device_id:
        return jsonify(error="device_id is required"), 400
    header = request.headers.get("Authorization", "")
    user_id = user_from_token(header.split(" ", 1)[1]) if header.startswith("Bearer ") else None
    conn = db()
    conn.execute(
        "INSERT INTO app_installs (device_id, user_id) VALUES (?, ?) "
        "ON CONFLICT (device_id) DO NOTHING",
        (device_id, user_id),
    )
    conn.commit()
    installs = conn.execute("SELECT COUNT(*) c FROM app_installs").fetchone()["c"]
    conn.close()
    return jsonify(installs=installs)


@app.post("/api/app-rate")
@auth
def app_rate(user_id):
    """One rating per user; tapping a star again just updates it (a real
    average, not a click counter that anyone could inflate by mashing)."""
    stars = (request.get_json(silent=True) or {}).get("stars")
    try:
        stars = int(stars)
    except (TypeError, ValueError):
        stars = 0
    if not 1 <= stars <= 5:
        return jsonify(error="stars must be 1-5"), 400
    conn = db()
    conn.execute(
        "INSERT INTO app_ratings (user_id, stars, rated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
        "ON CONFLICT(user_id) DO UPDATE SET stars=excluded.stars, rated_at=CURRENT_TIMESTAMP",
        (user_id, stars),
    )
    conn.commit()
    row = conn.execute("SELECT COUNT(*) c, AVG(stars) a FROM app_ratings").fetchone()
    conn.close()
    return jsonify(my_rating=stars, rating_count=row["c"], rating_average=round(row["a"], 2))


@app.post("/account/privacy")
@auth
def privacy(user_id):
    data = request.get_json(silent=True) or {}
    allowed = {
        "show_online", "show_age", "show_gender", "show_last_seen",
        "share_status_views", "show_status_reactions"
    }
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
    except DB_INTEGRITY_ERRORS:
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


@app.post("/account/avatar")
@auth_strict
def account_avatar(user_id):
    avatar = (request.get_json(silent=True) or {}).get("avatar") or ""
    if not avatar.startswith("data:image/") or len(avatar) > 2_500_000:
        return jsonify(error="profile photo must be an image smaller than 2 MB"), 400
    conn = db()
    conn.execute("UPDATE users SET avatar=? WHERE id=?", (avatar, user_id))
    conn.commit()
    conn.close()
    broadcast_presence(user_id, online(user_id))
    return jsonify(avatar=avatar)


@app.post("/account/password")
@auth_strict
def account_password(user_id):
    data = request.get_json(silent=True) or {}
    current, new_password = data.get("current_password") or "", data.get("new_password") or ""
    if len(new_password) < 6:
        return jsonify(error="new password must be at least 6 characters"), 400
    conn = db()
    row = conn.execute("SELECT password_hash FROM users WHERE id=?", (user_id,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], current):
        conn.close()
        return jsonify(error="current password is incorrect"), 401
    conn.execute("UPDATE users SET password_hash=? WHERE id=?", (generate_password_hash(new_password), user_id))
    conn.commit()
    conn.close()
    return jsonify(message="password updated")


@app.post("/account/email")
@auth_strict
def account_email(user_id):
    """Attach a recovery email to the account. Requires the current password
    so an open session can't be used to silently redirect password resets
    to an address the real owner didn't choose. The address is stored
    unverified until the code sent here is confirmed at /account/email/verify,
    and only a *verified* email can ever be used for /forgot-password."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify(error="enter a valid email address"), 400
    conn = db()
    row = conn.execute("SELECT password_hash FROM users WHERE id=?", (user_id,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        conn.close()
        return jsonify(error="confirm your current password to continue"), 401
    taken = conn.execute("SELECT 1 FROM users WHERE email=? AND email_verified=1 AND id!=?",
                          (email, user_id)).fetchone()
    if taken:
        conn.close()
        return jsonify(error="that email is already linked to another account"), 409
    code = generate_reset_code()
    expires = (dt.datetime.utcnow() + dt.timedelta(minutes=15)).isoformat()
    conn.execute("""UPDATE users SET email=?, email_verified=0, reset_code_hash=?,
      reset_code_expires=?, reset_code_purpose='email_verify' WHERE id=?""",
                 (email, generate_password_hash(code), expires, user_id))
    conn.commit()
    conn.close()
    send_email(email, "Confirm your HwFar email",
               f"Your HwFar verification code is {code}. It expires in 15 minutes.\n\n"
               "If you didn't request this, you can ignore this message.")
    return jsonify(message="verification code sent", email=email)


@app.post("/account/email/verify")
@auth_strict
def account_email_verify(user_id):
    code = ((request.get_json(silent=True) or {}).get("code") or "").strip()
    conn = db()
    row = conn.execute("""SELECT email,reset_code_hash,reset_code_expires,reset_code_purpose
      FROM users WHERE id=?""", (user_id,)).fetchone()
    if not row or row["reset_code_purpose"] != "email_verify" or not row["reset_code_hash"]:
        conn.close()
        return jsonify(error="request a new verification code"), 400
    if not row["reset_code_expires"] or dt.datetime.fromisoformat(row["reset_code_expires"]) < dt.datetime.utcnow():
        conn.close()
        return jsonify(error="that code has expired, request a new one"), 400
    if not check_password_hash(row["reset_code_hash"], code):
        conn.close()
        return jsonify(error="incorrect code"), 400
    conn.execute("""UPDATE users SET email_verified=1, reset_code_hash=NULL,
      reset_code_expires=NULL, reset_code_purpose=NULL WHERE id=?""", (user_id,))
    conn.commit()
    conn.close()
    return jsonify(message="email verified", email=row["email"])


@app.post("/account/email/delete")
@auth_strict
def account_email_delete(user_id):
    """Remove the recovery email from the account entirely. Requires the
    current password, same as adding or changing one — an open session
    alone shouldn't be enough to strip the account's only way back in."""
    password = (request.get_json(silent=True) or {}).get("password") or ""
    conn = db()
    row = conn.execute("SELECT password_hash FROM users WHERE id=?", (user_id,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        conn.close()
        return jsonify(error="confirm your current password to continue"), 401
    conn.execute("""UPDATE users SET email='', email_verified=0, reset_code_hash=NULL,
      reset_code_expires=NULL, reset_code_purpose=NULL WHERE id=?""", (user_id,))
    conn.commit()
    conn.close()
    return jsonify(message="email removed")


@app.post("/account/google/unlink")
@auth_strict
def account_google_unlink(user_id):
    """Disconnect a linked Google account. Requires the current password —
    which also naturally protects accounts created *via* Google sign-in,
    since those start with a random password nobody knows until the owner
    sets a real one (through Change password or a verified-email reset),
    so a Google-only account can't be unlinked into a dead end."""
    password = (request.get_json(silent=True) or {}).get("password") or ""
    conn = db()
    row = conn.execute("SELECT password_hash,google_sub FROM users WHERE id=?", (user_id,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        conn.close()
        return jsonify(error="confirm your current password to continue"), 401
    if not row["google_sub"]:
        conn.close()
        return jsonify(error="no Google account is linked"), 400
    conn.execute("UPDATE users SET google_sub=NULL WHERE id=?", (user_id,))
    conn.commit()
    conn.close()
    return jsonify(message="Google account unlinked")


@app.post("/forgot-password")
def forgot_password():
    """Public endpoint. Always answers with the same generic message so it
    can't be used to probe which usernames or emails exist on HwFar."""
    identifier = ((request.get_json(silent=True) or {}).get("identifier") or "").strip().lower()
    generic = jsonify(message="If that account has a verified email on file, we've sent a reset code to it.")
    if not identifier:
        return generic, 200
    conn = db()
    row = conn.execute("""SELECT id,email,email_verified,reset_code_expires FROM users
      WHERE lower(username)=? OR (email=? AND email_verified=1)""", (identifier, identifier)).fetchone()
    if not row or not row["email"] or not row["email_verified"]:
        conn.close()
        return generic, 200
    if row["reset_code_expires"]:
        try:
            created = dt.datetime.fromisoformat(row["reset_code_expires"]) - dt.timedelta(minutes=15)
            if dt.datetime.utcnow() - created < dt.timedelta(seconds=60):
                conn.close()
                return jsonify(error="please wait a moment before requesting another code"), 429
        except ValueError:
            pass
    code = generate_reset_code()
    expires = (dt.datetime.utcnow() + dt.timedelta(minutes=15)).isoformat()
    conn.execute("""UPDATE users SET reset_code_hash=?, reset_code_expires=?,
      reset_code_purpose='password_reset' WHERE id=?""",
                 (generate_password_hash(code), expires, row["id"]))
    conn.commit()
    conn.close()
    send_email(row["email"], "Your HwFar password reset code",
               f"Your HwFar password reset code is {code}. It expires in 15 minutes.\n\n"
               "If you didn't request this, ignore this message — your password stays the same.")
    return generic, 200


@app.post("/reset-password")
def reset_password():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or "").strip().lower()
    code = (data.get("code") or "").strip()
    new_password = data.get("new_password") or ""
    if len(new_password) < 6:
        return jsonify(error="new password must be at least 6 characters"), 400
    conn = db()
    row = conn.execute("""SELECT id,reset_code_hash,reset_code_expires,reset_code_purpose FROM users
      WHERE lower(username)=? OR (email=? AND email_verified=1)""", (identifier, identifier)).fetchone()
    if not row or row["reset_code_purpose"] != "password_reset" or not row["reset_code_hash"]:
        conn.close()
        return jsonify(error="request a new reset code"), 400
    if not row["reset_code_expires"] or dt.datetime.fromisoformat(row["reset_code_expires"]) < dt.datetime.utcnow():
        conn.close()
        return jsonify(error="that code has expired, request a new one"), 400
    if not check_password_hash(row["reset_code_hash"], code):
        conn.close()
        return jsonify(error="incorrect code"), 400
    conn.execute("""UPDATE users SET password_hash=?, reset_code_hash=NULL,
      reset_code_expires=NULL, reset_code_purpose=NULL WHERE id=?""",
                 (generate_password_hash(new_password), row["id"]))
    conn.commit()
    conn.close()
    return jsonify(message="password updated, you can now log in")


@app.get("/contacts")
@auth
def contacts(user_id):
    conn = db()
    purge(conn)
    conn.commit()
    rows = conn.execute("""
      SELECT * FROM (
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
          (SELECT COUNT(*) FROM messages m WHERE m.sender_id=u.id AND m.receiver_id=? AND m.read=0) unread_count,
          c.archived AS archived
        FROM contacts c JOIN users u ON u.id=c.contact_id WHERE c.owner_id=?
      ) contact_rows
      ORDER BY (last_sent_at IS NULL), last_sent_at DESC, username
    """, (user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id)).fetchall()
    result = []
    for row in rows:
        if blocked_between(conn, user_id, row["id"]):
            continue
        item = dict(row)
        item["online"] = visible_online_to(conn, user_id, row["id"])
        item["archived"] = bool(row["archived"])
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
        conn.execute("INSERT INTO contacts(owner_id,contact_id) VALUES(?,?) "
                    "ON CONFLICT (owner_id,contact_id) DO NOTHING", (owner, contact))
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
    result = [public_profile(conn, row, user_id) for row in rows]
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
    result = public_profile(conn, row, user_id)
    conn.close()
    return jsonify(result)


@app.post("/users/<name>/block")
@auth
def block_user(user_id, name):
    conn = db()
    target = conn.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()
    if not target:
        conn.close()
        return jsonify(error="no such user"), 404
    if target["id"] == user_id:
        conn.close()
        return jsonify(error="you cannot block yourself"), 400
    conn.execute("INSERT INTO blocks(blocker_id,blocked_id) VALUES(?,?) "
                "ON CONFLICT (blocker_id,blocked_id) DO NOTHING",
                 (user_id, target["id"]))
    conn.commit()
    conn.close()
    return jsonify(blocked=True, username=name)


@app.post("/users/<name>/unblock")
@auth
def unblock_user(user_id, name):
    conn = db()
    target = conn.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()
    if not target:
        conn.close()
        return jsonify(error="no such user"), 404
    conn.execute("DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?", (user_id, target["id"]))
    conn.commit()
    conn.close()
    return jsonify(blocked=False, username=name)


@app.get("/blocked")
@auth
def blocked_list(user_id):
    conn = db()
    rows = conn.execute("""
      SELECT u.username, u.avatar, b.created_at
      FROM blocks b JOIN users u ON u.id=b.blocked_id
      WHERE b.blocker_id=? ORDER BY b.created_at DESC
    """, (user_id,)).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


@app.post("/contacts/<name>/archive")
@auth
def archive_contact(user_id, name):
    data = request.get_json(silent=True) or {}
    archived = 1 if data.get("archived", True) else 0
    conn = db()
    target = conn.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()
    if not target:
        conn.close()
        return jsonify(error="no such user"), 404
    cur = conn.execute("UPDATE contacts SET archived=? WHERE owner_id=? AND contact_id=?",
                       (archived, user_id, target["id"]))
    conn.commit()
    conn.close()
    if not cur.rowcount:
        return jsonify(error="that user is not in your contacts"), 404
    return jsonify(archived=bool(archived), username=name)


@app.post("/users/<name>/report")
@auth
def report_user(user_id, name):
    data = request.get_json(silent=True) or {}
    reason = str(data.get("reason") or "").strip()[:500]
    conn = db()
    target = conn.execute("SELECT id FROM users WHERE username=?", (name,)).fetchone()
    if not target:
        conn.close()
        return jsonify(error="no such user"), 404
    if target["id"] == user_id:
        conn.close()
        return jsonify(error="you cannot report yourself"), 400
    conn.execute("INSERT INTO reports(reporter_id,reported_id,reason) VALUES(?,?,?)",
                 (user_id, target["id"], reason))
    conn.commit()
    conn.close()
    return jsonify(reported=True), 201


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
        # Viewing is recorded only when a story is actually opened (see
        # POST /statuses/<id>/view), not just because it appeared in this list.
        result.append(status_payload(conn, row, user_id))
    conn.commit()
    conn.close()
    return jsonify(result)


@app.post("/statuses/<int:status_id>/view")
@auth
def view_status(user_id, status_id):
    conn = db()
    source = conn.execute("SELECT * FROM statuses WHERE id=?", (status_id,)).fetchone()
    viewer = conn.execute("SELECT username FROM users WHERE id=?", (user_id,)).fetchone()
    if not source or not viewer or not status_visible(conn, source, user_id, viewer["username"]):
        conn.close()
        return jsonify(error="story is no longer available"), 404
    if source["owner_id"] != user_id:
        conn.execute("INSERT INTO status_views(status_id,viewer_id) VALUES(?,?) "
                    "ON CONFLICT (status_id,viewer_id) DO NOTHING",
                     (status_id, user_id))
        conn.commit()
    result = status_payload(conn, source, user_id)
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
      VALUES(?,?,?,?,?,?,?,?) RETURNING id""", (
        user_id, kind, content.strip() if kind == "text" else content, caption, audience,
        json.dumps(allowed), json.dumps(hidden), expires))
    new_id = cur.fetchone()["id"]
    conn.commit()
    row = conn.execute("SELECT * FROM statuses WHERE id=?", (new_id,)).fetchone()
    result = status_payload(conn, row, user_id)
    notify_contacts_of_status(conn, row, user_id)
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
        "reactions_visible": result["reactions_visible"],
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
    me = conn.execute("SELECT share_status_views FROM users WHERE id=?", (user_id,)).fetchone()
    if not me or not me["share_status_views"]:
        # Reciprocity: turning off status read receipts means you can't see
        # who viewed your own stories either.
        conn.close()
        return jsonify([])
    viewers = [dict(item) for item in conn.execute("""
      SELECT u.username,u.avatar,v.viewed_at,
             (SELECT r.reaction FROM status_reactions r
                WHERE r.status_id=v.status_id AND r.viewer_id=v.viewer_id) AS reaction
      FROM status_views v JOIN users u ON u.id=v.viewer_id
      WHERE v.status_id=? AND (
        u.share_status_views=1
        OR EXISTS(SELECT 1 FROM status_reactions r2
                    WHERE r2.status_id=v.status_id AND r2.viewer_id=v.viewer_id)
      ) ORDER BY v.viewed_at DESC
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
      VALUES(?,?,?,?,?,?,?,?,?) RETURNING id""", (
        user_id, source["type"], source["content"], caption, "everyone", "[]", "[]",
        source["id"], expires))
    new_id = cur.fetchone()["id"]
    conn.commit()
    row = conn.execute("SELECT * FROM statuses WHERE id=?", (new_id,)).fetchone()
    result = status_payload(conn, row, user_id)
    notify_contacts_of_status(conn, row, user_id)
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
      WHERE c.caller_id=? OR c.receiver_id=?
      ORDER BY c.id DESC LIMIT 40
    """, (user_id, user_id, user_id)).fetchall()
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


@app.get("/calls/active")
@auth
def active_call(user_id):
    conn = db()
    row = conn.execute("""
      SELECT c.*, u.username AS peer_username, u.avatar AS peer_avatar
      FROM call_logs c JOIN users u
        ON u.id=CASE WHEN c.caller_id=? THEN c.receiver_id ELSE c.caller_id END
      WHERE (c.caller_id=? OR c.receiver_id=?)
        AND c.status IN ('ringing','accepted')
      ORDER BY c.id DESC LIMIT 1
    """, (user_id, user_id, user_id)).fetchone()
    conn.close()
    if not row:
        return jsonify(active=False)
    return jsonify({
        "active": True, "call_id": row["call_id"], "username": row["peer_username"],
        "avatar": row["peer_avatar"], "mode": row["mode"], "status": row["status"],
        "direction": "outgoing" if row["caller_id"] == user_id else "incoming"
    })


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
    if receiver["id"] == user_id:
        conn.close()
        return jsonify(error="you cannot message yourself"), 400
    if blocked_between(conn, user_id, receiver["id"]):
        conn.close()
        return jsonify(error="this conversation is blocked"), 403
    conn.execute("INSERT INTO contacts(owner_id,contact_id) VALUES(?,?) "
                "ON CONFLICT (owner_id,contact_id) DO NOTHING", (user_id, receiver["id"]))
    conn.execute("INSERT INTO contacts(owner_id,contact_id) VALUES(?,?) "
                "ON CONFLICT (owner_id,contact_id) DO NOTHING", (receiver["id"], user_id))
    seconds = expiry_policy(conn, user_id, receiver["id"])
    expires = (dt.datetime.utcnow() + dt.timedelta(seconds=seconds)).strftime("%Y-%m-%d %H:%M:%S") if seconds else None
    cur = conn.execute("""INSERT INTO messages(sender_id,receiver_id,type,content,duration,delivered,expires_at)
                         VALUES(?,?,?,?,?,?,?) RETURNING id""",
                       (user_id, receiver["id"], kind, content, data.get("duration"),
                        1 if online(receiver["id"]) else 0, expires))
    new_id = cur.fetchone()["id"]
    conn.commit()
    row = conn.execute("SELECT * FROM messages WHERE id=?", (new_id,)).fetchone()
    conn.close()
    payload = {"id":row["id"],"from":"me","to":to,"type":row["type"],"content":row["content"],
               "duration":row["duration"],"sent_at":row["sent_at"],"delivered":bool(row["delivered"]),
               "read":bool(row["read"]),"expires_at":row["expires_at"],"edited":False,"deleted":False}
    incoming = dict(payload)
    incoming["from"] = sender["username"]
    socketio.emit("new_message", incoming, room=f"user_{receiver['id']}")
    if payload["delivered"]:
        socketio.emit("message_status", {"ids":[row["id"]],"status":"delivered"}, room=f"user_{user_id}")
    push_bodies = {"voice": "🎤 Voice message", "image": "📷 Photo", "video": "🎥 Video"}
    send_push(
        receiver["id"],
        "voice_notes" if row["type"] == "voice" else "messages",
        sender["username"],
        push_bodies.get(row["type"], row["content"][:120]),
        url=f"/chat?with={sender['username']}",
        tag="msg-" + sender["username"],
    )
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
    result = {
        "online": visible_online_to(conn, user_id, row["id"]),
        "last_seen": row["last_seen"] if visible_last_seen_to(conn, user_id, row["id"]) else None,
    }
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
    me = conn.execute("SELECT username,last_seen FROM users WHERE id=?", (user_id,)).fetchone()
    owners = conn.execute("SELECT owner_id FROM contacts WHERE contact_id=?", (user_id,)).fetchall()
    if not me:
        conn.close()
        return
    for row in owners:
        viewer_id = row["owner_id"]
        payload = {
            "username": me["username"],
            "online": bool(is_online) and visible_online_to(conn, viewer_id, user_id),
            "last_seen": me["last_seen"] if visible_last_seen_to(conn, viewer_id, user_id) else None,
        }
        socketio.emit("presence", payload, room=f"user_{viewer_id}")
    conn.close()


@app.get("/")
def home(): return render_template("index.html")


@app.get("/chat")
def chat_page(): return render_template("chat.html", active_username=None)


@app.get("/chat/<name>")
def chat_thread_page(name): return render_template("chat.html", active_username=name)


@app.get("/settings")
def settings_page(): return render_template("settings.html", settings_section="root")


@app.get("/settings/<section>")
def settings_section_page(section):
    valid = {"account","privacy","appearance","notifications","language","blocked","about"}
    if section not in valid: return render_template("settings.html", settings_section="root"), 404
    return render_template("settings.html", settings_section=section)


@app.get("/discover")
def discover_page(): return render_template("discover.html")


@app.get("/stories")
def stories_page(): return render_template("stories.html")


@app.get("/new-chat")
def new_chat_page(): return render_template("new_chat.html", prefill_to=request.args.get("to", ""))


@app.get("/call/<name>")
def call_page(name):
    conn = db()
    target = conn.execute("SELECT username FROM users WHERE username=?", (name,)).fetchone()
    conn.close()
    if not target:
        return render_template("call.html", call_username=name), 404
    return render_template("call.html", call_username=target["username"])


@app.get("/call")
def calls_page():
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
    if caller and ((data or {}).get("to") or "").strip() == caller["username"]:
        conn.close()
        socketio.emit("call_error", {"message":"You cannot call yourself."}, to=request.sid)
        return
    if not target or not caller:
        conn.close()
        socketio.emit("call_error", {"message":"That user could not be reached."}, to=request.sid)
        return
    if blocked_between(conn, user_id, target["id"]):
        conn.close()
        socketio.emit("call_error", {"message":"This user is blocked."}, to=request.sid)
        return
    conn.close()
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
    send_push(
        target["id"], "calls",
        caller["username"],
        f"📹 Incoming video call" if mode == "video" else "📞 Incoming voice call",
        url="/call", tag="call-" + call_id,
    )


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
        call_id = (data or {}).get("call_id", "")
        conn = db()
        conn.execute("""UPDATE call_logs SET status=CASE WHEN status='accepted' THEN 'completed' ELSE 'missed' END,
                        ended_at=CURRENT_TIMESTAMP WHERE call_id=?""", (call_id,))
        conn.commit()
        log = conn.execute("""SELECT status,caller_id,receiver_id FROM call_logs
                              WHERE call_id=?""", (call_id,)).fetchone()
        caller = conn.execute("SELECT username FROM users WHERE id=?",
                              (log["caller_id"],)).fetchone() if log else None
        conn.close()
        socketio.emit("call_end", {
            "call_id": call_id
        }, room=f"user_{target['id']}")
        if log and log["status"] == "missed" and caller:
            send_push(
                log["receiver_id"], "calls",
                caller["username"], "☎ Missed call",
                url="/call", tag="missedcall-" + call_id,
            )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"HwFar running on port {port}")
    # (Firebase and TURN env var checks now happen once at import time,
    # right after firebase-admin initializes — see near the top of the file.)
    socketio.run(app, host="0.0.0.0", port=port, debug=False)