"""Minimal local account store for Academic Research Hub.

Uses only the Python standard library.  Deploy this application behind HTTPS
before exposing it to the internet.
"""

import hashlib
import hmac
import os
import secrets
import sqlite3
import time


class AuthStore:
    def __init__(self, database_path: str) -> None:
        self.database_path = database_path
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                );
                CREATE TABLE IF NOT EXISTS user_data (
                    user_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                );
            """)

    @staticmethod
    def _password_hash(password: str, salt: bytes | None = None) -> str:
        salt = salt or secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
        return salt.hex() + "$" + digest.hex()

    @staticmethod
    def _matches(password: str, encoded: str) -> bool:
        try:
            salt_hex, digest_hex = encoded.split("$", 1)
            candidate = AuthStore._password_hash(password, bytes.fromhex(salt_hex)).split("$", 1)[1]
            return hmac.compare_digest(candidate, digest_hex)
        except (TypeError, ValueError):
            return False

    def register(self, email: str, password: str) -> dict:
        email = email.strip().lower()
        if len(email) > 254 or "@" not in email or email.startswith("@"):
            raise ValueError("请输入有效的邮箱地址")
        if len(password) < 10:
            raise ValueError("密码至少需要 10 个字符")
        user = {"id": secrets.token_urlsafe(18), "email": email}
        try:
            with self._connect() as db:
                db.execute(
                    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                    (user["id"], email, self._password_hash(password), int(time.time())),
                )
        except sqlite3.IntegrityError as error:
            raise ValueError("该邮箱已经注册，请直接登录") from error
        return user

    def authenticate(self, email: str, password: str) -> dict | None:
        with self._connect() as db:
            row = db.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
        if row is None or not self._matches(password, row["password_hash"]):
            return None
        return {"id": row["id"], "email": row["email"]}

    def create_session(self, user_id: str, lifetime_days: int = 30) -> str:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with self._connect() as db:
            db.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
            db.execute("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                       (token_hash, user_id, int(time.time()) + lifetime_days * 86400))
        return token

    def user_for_session(self, token: str | None) -> dict | None:
        if not token:
            return None
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with self._connect() as db:
            row = db.execute("""
                SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = ? AND sessions.expires_at >= ?
            """, (token_hash, int(time.time()))).fetchone()
        return {"id": row["id"], "email": row["email"]} if row else None

    def revoke_session(self, token: str | None) -> None:
        if token:
            with self._connect() as db:
                db.execute("DELETE FROM sessions WHERE token_hash = ?", (hashlib.sha256(token.encode("utf-8")).hexdigest(),))

    def load_data(self, user_id: str) -> dict:
        with self._connect() as db:
            row = db.execute("SELECT payload FROM user_data WHERE user_id = ?", (user_id,)).fetchone()
        if row is None:
            return {}
        import json
        try:
            return json.loads(row["payload"])
        except (TypeError, ValueError):
            return {}

    def save_data(self, user_id: str, payload: dict) -> None:
        import json
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        with self._connect() as db:
            db.execute("""
                INSERT INTO user_data (user_id, payload, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
            """, (user_id, encoded, int(time.time())))
