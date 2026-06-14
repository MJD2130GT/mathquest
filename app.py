# -*- coding: utf-8 -*-
"""MathQuest Jr. — 가정용 중등연산 교육 게임 서버 (Flask + SQLite)"""
import os
import secrets
import sqlite3
from datetime import date, timedelta

from flask import Flask, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "mathquest.db")
KEY_PATH = os.path.join(BASE, ".secret_key")


def _load_secret_key():
    env_key = os.environ.get("SECRET_KEY")
    if env_key:
        return env_key
    if os.path.exists(KEY_PATH):
        with open(KEY_PATH, "r", encoding="utf-8") as f:
            return f.read().strip()
    key = secrets.token_hex(32)
    with open(KEY_PATH, "w", encoding="utf-8") as f:
        f.write(key)
    return key


app = Flask(__name__, static_url_path="")
app.secret_key = _load_secret_key()
app.permanent_session_lifetime = timedelta(days=30)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    spent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (date('now','localtime'))
);
CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL,
    world INTEGER NOT NULL,
    stage INTEGER NOT NULL,
    stars INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    PRIMARY KEY (user_id, world, stage)
);
CREATE TABLE IF NOT EXISTS stats (
    user_id INTEGER NOT NULL,
    world INTEGER NOT NULL,
    correct INTEGER NOT NULL DEFAULT 0,
    wrong INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, world)
);
CREATE TABLE IF NOT EXISTS playlog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    seconds INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_id TEXT NOT NULL,
    cost INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'owned',
    bought_at TEXT NOT NULL,
    redeemed_at TEXT,
    voucher TEXT
);
CREATE TABLE IF NOT EXISTS daily_stat (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    correct INTEGER NOT NULL DEFAULT 0,
    max_combo INTEGER NOT NULL DEFAULT 0,
    stages_cleared INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS daily_claim (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    slot INTEGER NOT NULL,
    PRIMARY KEY (user_id, day, slot)
);
"""


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if "spent" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN spent INTEGER NOT NULL DEFAULT 0")
    conn.commit()
    conn.close()


init_db()


def current_uid():
    return session.get("uid")


def err(msg, code=400):
    return jsonify({"error": msg}), code


# ---------- 리워드 상점 카탈로그 (서버가 가격의 단일 진실원천) ----------
CATEGORIES = [
    {"id": 1, "name": "모바일 포인트·상품권", "emoji": "📱", "desc": "바로 쓸 수 있는 모바일 포인트와 상품권"},
    {"id": 2, "name": "간식·먹거리", "emoji": "🍔", "desc": "학교 끝나고 친구들과 즐기는 즉각 보상"},
    {"id": 3, "name": "특별 보상", "emoji": "⭐", "desc": "열심히 공부한 나에게 주는 특별한 선물"},
]

CATALOG = [
    # ── cat 1: 모바일 포인트·상품권 (가격 오름차순) ──────────────────────
    {"id": "21", "cat": 1, "name": "다이소 모바일 상품권 (5,000원권)", "cost": 5000, "emoji": "🛍️",
     "desc": "하교 후 가장 자주 들르는 다이소에서 귀여운 인형·문구·간식을 살 수 있어요.", "real": 5000},
    {"id": "26", "cat": 1, "name": "인형뽑기 10,000원권", "cost": 10000, "emoji": "🧸",
     "desc": "친구들과 함께 두근두근 인형뽑기! 10,000원권으로 원하는 뽑기방에서 사용하세요."},
    {"id": "22", "cat": 1, "name": "올리브영 기프트카드 (10,000원권)", "cost": 10000, "emoji": "💄",
     "desc": "뷰티 관심 폭발 청소년기 선호도 1위! 립밤·팩·간식류까지 구매 가능.", "real": 10000},

    # ── cat 2: 간식·먹거리 (가격 오름차순) ──────────────────────────────
    {"id": "06", "cat": 2, "name": "편의점 모바일 금액권 (1,000원권)", "cost": 1000, "emoji": "🏪",
     "desc": "편의점에서 바로 쓰는 1,000원 모바일 금액권.", "real": 1000},
    {"id": "23", "cat": 2, "name": "GS25 모바일 금액권 (2,000원권)", "cost": 2000, "emoji": "🏪",
     "desc": "가장 빠르게 얻는 보상! GS25에서 껌·츄파춥스·작은 스낵을 교환하기 좋아요.", "real": 2000},
    {"id": "07", "cat": 2, "name": "편의점 모바일 금액권 (3,000원권)", "cost": 3000, "emoji": "🏪",
     "desc": "간식 한가득! 편의점 3,000원 모바일 금액권.", "real": 3000},
    {"id": "24", "cat": 2, "name": "세븐일레븐 모바일 금액권 (3,000원권)", "cost": 3000, "emoji": "🍙",
     "desc": "삼각김밥과 음료수까지, 든든한 방과 후 간식 조합을 살 수 있어요.", "real": 3000},
    {"id": "08", "cat": 2, "name": "배스킨라빈스 싱글킹", "cost": 4300, "emoji": "🍦",
     "desc": "계절을 타지 않는 스테디셀러 디저트, 싱글킹 아이스크림.", "real": 4300},
    {"id": "25", "cat": 2, "name": "빽다방 5,000원 금액권", "cost": 5000, "emoji": "☕",
     "desc": "가성비 좋은 빽다방에서 바닐라라떼·빽스치노 등을 사 먹을 수 있어요.", "real": 5000},
    {"id": "12", "cat": 2, "name": "BHC 뿌링클 + 콜라 세트", "cost": 23000, "emoji": "🍗",
     "desc": "주말에 온 가족이 함께! 부모님께 대접하는 뿌듯한 치킨 세트."},

    # ── cat 3: 특별 보상 (가격 오름차순) ────────────────────────────────
    {"id": "27", "cat": 3, "name": "자유시간 2시간", "cost": 20000, "emoji": "⏰",
     "desc": "수학 열심히 한 나에게 주는 특별 보상! 2시간 동안 하고 싶은 걸 마음껏 즐기세요."},
]
CATALOG_BY_ID = {it["id"]: it for it in CATALOG}


@app.get("/")
def index():
    return app.send_static_file("index.html")


# ---------- 인증 (가정용: 아이디 + 비밀번호만) ----------

@app.post("/api/register")
def register():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    nickname = (data.get("nickname") or "").strip() or username

    if not (2 <= len(username) <= 20) or not username.isalnum():
        return err("아이디는 영문/숫자 2~20자로 만들어 주세요.")
    if len(password) < 4:
        return err("비밀번호는 4자 이상으로 해주세요.")
    if len(nickname) > 12:
        return err("닉네임은 12자 이하로 해주세요.")

    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, nickname) VALUES (?,?,?)",
            (username, generate_password_hash(password), nickname),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return err("이미 사용 중인 아이디예요. 다른 아이디를 골라 주세요.")

    session.permanent = True
    session["uid"] = cur.lastrowid
    return jsonify({"ok": True})


@app.post("/api/login")
def login():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    row = db().execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return err("아이디 또는 비밀번호가 맞지 않아요.", 401)
    session.permanent = True
    session["uid"] = row["id"]
    return jsonify({"ok": True})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


# ---------- 게임 상태 ----------

@app.get("/api/state")
def state():
    uid = current_uid()
    if uid is None:
        return err("로그인이 필요해요.", 401)
    conn = db()
    user = conn.execute("SELECT username, nickname, xp, spent FROM users WHERE id=?", (uid,)).fetchone()
    if user is None:
        session.clear()
        return err("로그인이 필요해요.", 401)
    progress = conn.execute(
        "SELECT world, stage, stars, best_score, attempts FROM progress WHERE user_id=?", (uid,)
    ).fetchall()
    stats = conn.execute(
        "SELECT world, correct, wrong FROM stats WHERE user_id=?", (uid,)
    ).fetchall()
    return jsonify({
        "user": dict(user),
        "progress": [dict(r) for r in progress],
        "stats": [dict(r) for r in stats],
    })


@app.post("/api/result")
def result():
    uid = current_uid()
    if uid is None:
        return err("로그인이 필요해요.", 401)
    data = request.get_json(force=True, silent=True) or {}
    try:
        world = int(data["world"])
        stage = int(data["stage"])
        stars = max(0, min(3, int(data["stars"])))
        score = max(0, min(100, int(data.get("score", 0))))
        xp_gain = max(0, min(2000, int(data.get("xp", 0))))
        correct = max(0, min(100, int(data.get("correct", 0))))
        wrong = max(0, min(100, int(data.get("wrong", 0))))
        seconds = max(0, min(3600, int(data.get("seconds", 0))))
        max_combo = max(0, min(50, int(data.get("max_combo", 0))))
    except (KeyError, ValueError, TypeError):
        return err("잘못된 요청이에요.")
    if not (1 <= world <= 10 and 1 <= stage <= 5):
        return err("잘못된 요청이에요.")

    conn = db()
    row = conn.execute(
        "SELECT stars, best_score, attempts FROM progress WHERE user_id=? AND world=? AND stage=?",
        (uid, world, stage),
    ).fetchone()
    today = date.today().isoformat()
    if row is None:
        conn.execute(
            "INSERT INTO progress (user_id, world, stage, stars, best_score, attempts, completed_at)"
            " VALUES (?,?,?,?,?,1,?)",
            (uid, world, stage, stars, score, today if stars > 0 else None),
        )
    else:
        conn.execute(
            "UPDATE progress SET stars=MAX(stars,?), best_score=MAX(best_score,?),"
            " attempts=attempts+1, completed_at=COALESCE(completed_at, ?)"
            " WHERE user_id=? AND world=? AND stage=?",
            (stars, score, today if stars > 0 else None, uid, world, stage),
        )

    if correct or wrong:
        conn.execute(
            "INSERT INTO stats (user_id, world, correct, wrong) VALUES (?,?,?,?)"
            " ON CONFLICT(user_id, world) DO UPDATE SET correct=correct+?, wrong=wrong+?",
            (uid, world, correct, wrong, correct, wrong),
        )

    conn.execute("UPDATE users SET xp=xp+? WHERE id=?", (xp_gain, uid))
    if seconds > 0:
        conn.execute("INSERT INTO playlog (user_id, day, seconds) VALUES (?,?,?)", (uid, today, seconds))

    # 일일 통계 업데이트
    cleared = 1 if stars > 0 else 0
    conn.execute(
        "INSERT INTO daily_stat (user_id, day, correct, max_combo, stages_cleared) VALUES (?,?,?,?,?)"
        " ON CONFLICT(user_id, day) DO UPDATE SET"
        " correct=correct+?, max_combo=MAX(max_combo,?), stages_cleared=stages_cleared+?",
        (uid, today, correct, max_combo, cleared, correct, max_combo, cleared),
    )
    conn.commit()

    xp = conn.execute("SELECT xp FROM users WHERE id=?", (uid,)).fetchone()["xp"]
    return jsonify({"ok": True, "xp": xp})


# ---------- 일일 도전 ----------

DAILY_QUESTS = [
    {"slot": 1, "icon": "⚔️", "title": "오늘의 배틀", "desc": "배틀 스테이지 1회 완료", "reward": 50},
    {"slot": 2, "icon": "⏱️", "title": "꾸준한 탐험가", "desc": "오늘 5분 이상 플레이", "reward": 30},
    {"slot": 3, "icon": "🔥", "title": "콤보 마스터", "desc": "최대 콤보 🔥3 이상 달성", "reward": 40},
]


def _check_quest(conn, uid, today, slot):
    ds = conn.execute(
        "SELECT correct, max_combo, stages_cleared FROM daily_stat WHERE user_id=? AND day=?",
        (uid, today),
    ).fetchone()
    if slot == 1:
        return ds is not None and ds["stages_cleared"] >= 1
    if slot == 2:
        row = conn.execute(
            "SELECT COALESCE(SUM(seconds),0) AS s FROM playlog WHERE user_id=? AND day=?",
            (uid, today),
        ).fetchone()
        return row["s"] >= 300
    if slot == 3:
        return ds is not None and ds["max_combo"] >= 3
    return False


@app.get("/api/daily")
def daily():
    uid = current_uid()
    if uid is None:
        return err("로그인이 필요해요.", 401)
    conn = db()
    today = date.today().isoformat()
    claimed = {r["slot"] for r in conn.execute(
        "SELECT slot FROM daily_claim WHERE user_id=? AND day=?", (uid, today)
    ).fetchall()}
    quests = []
    for q in DAILY_QUESTS:
        done = _check_quest(conn, uid, today, q["slot"])
        quests.append({**q, "done": done, "claimed": q["slot"] in claimed})
    return jsonify({"quests": quests})


@app.post("/api/daily/claim")
def daily_claim():
    uid = current_uid()
    if uid is None:
        return err("로그인이 필요해요.", 401)
    data = request.get_json(force=True, silent=True) or {}
    try:
        slot = int(data["slot"])
    except (KeyError, ValueError, TypeError):
        return err("잘못된 요청이에요.")
    quest = next((q for q in DAILY_QUESTS if q["slot"] == slot), None)
    if quest is None:
        return err("존재하지 않는 도전이에요.")
    conn = db()
    today = date.today().isoformat()
    already = conn.execute(
        "SELECT 1 FROM daily_claim WHERE user_id=? AND day=? AND slot=?", (uid, today, slot)
    ).fetchone()
    if already:
        return err("이미 보상을 받았어요.")
    if not _check_quest(conn, uid, today, slot):
        return err("아직 달성하지 못했어요.")
    conn.execute(
        "INSERT INTO daily_claim (user_id, day, slot) VALUES (?,?,?)", (uid, today, slot)
    )
    conn.execute("UPDATE users SET xp=xp+? WHERE id=?", (quest["reward"], uid))
    conn.commit()
    xp = conn.execute("SELECT xp FROM users WHERE id=?", (uid,)).fetchone()["xp"]
    return jsonify({"ok": True, "xp": xp, "reward": quest["reward"]})


# ---------- 리워드 상점 / 지갑(워렛) ----------

def _balance(conn, uid):
    row = conn.execute("SELECT xp, spent FROM users WHERE id=?", (uid,)).fetchone()
    if row is None:
        return None
    return {"xp": row["xp"], "spent": row["spent"], "spendable": row["xp"] - row["spent"]}


@app.get("/api/shop")
def shop():
    uid = current_uid()
    if uid is None:
        return err("로그인이 필요해요.", 401)
    conn = db()
    bal = _balance(conn, uid)
    if bal is None:
        session.clear()
        return err("로그인이 필요해요.", 401)
    owned = {r["item_id"]: r["c"] for r in conn.execute(
        "SELECT item_id, COUNT(*) AS c FROM wallet WHERE user_id=? GROUP BY item_id", (uid,)
    ).fetchall()}
    return jsonify({
        "categories": CATEGORIES,
        "items": CATALOG,
        "owned": owned,
        "xp": bal["xp"], "spent": bal["spent"], "spendable": bal["spendable"],
    })


@app.post("/api/buy")
def buy():
    uid = current_uid()
    if uid is None:
        return err("로그인이 필요해요.", 401)
    data = request.get_json(force=True, silent=True) or {}
    item = CATALOG_BY_ID.get(str(data.get("item_id") or ""))
    if item is None:
        return err("존재하지 않는 상품이에요.")
    conn = db()
    bal = _balance(conn, uid)
    if bal is None:
        session.clear()
        return err("로그인이 필요해요.", 401)
    if bal["spendable"] < item["cost"]:
        return err("사용 가능한 XP가 부족해요.")
    conn.execute("UPDATE users SET spent = spent + ? WHERE id=?", (item["cost"], uid))
    today = date.today().isoformat()
    cur = conn.execute(
        "INSERT INTO wallet (user_id, item_id, cost, status, bought_at) VALUES (?,?,?, 'owned', ?)",
        (uid, item["id"], item["cost"], today),
    )
    conn.commit()
    new_spent = bal["spent"] + item["cost"]
    return jsonify({
        "ok": True, "wallet_id": cur.lastrowid,
        "spent": new_spent, "spendable": bal["xp"] - new_spent,
    })


@app.get("/api/wallet")
def wallet():
    uid = current_uid()
    if uid is None:
        return err("로그인이 필요해요.", 401)
    conn = db()
    bal = _balance(conn, uid)
    if bal is None:
        session.clear()
        return err("로그인이 필요해요.", 401)
    rows = conn.execute(
        "SELECT id, item_id, cost, status, bought_at, redeemed_at, voucher"
        " FROM wallet WHERE user_id=? ORDER BY id DESC", (uid,)
    ).fetchall()
    items = []
    for r in rows:
        it = CATALOG_BY_ID.get(r["item_id"], {})
        items.append({
            "id": r["id"], "item_id": r["item_id"],
            "name": it.get("name", "상품"), "emoji": it.get("emoji", "🎁"),
            "cost": r["cost"], "status": r["status"],
            "bought_at": r["bought_at"], "redeemed_at": r["redeemed_at"], "voucher": r["voucher"],
        })
    return jsonify({
        "items": items,
        "xp": bal["xp"], "spent": bal["spent"], "spendable": bal["spendable"],
    })


@app.post("/api/redeem")
def redeem():
    uid = current_uid()
    if uid is None:
        return err("로그인이 필요해요.", 401)
    data = request.get_json(force=True, silent=True) or {}
    try:
        wid = int(data["id"])
    except (KeyError, ValueError, TypeError):
        return err("잘못된 요청이에요.")
    conn = db()
    row = conn.execute("SELECT * FROM wallet WHERE id=? AND user_id=?", (wid, uid)).fetchone()
    if row is None:
        return err("지갑에서 찾을 수 없는 상품이에요.", 404)
    if row["status"] == "redeemed":
        return jsonify({"ok": True, "status": "redeemed",
                        "voucher": row["voucher"], "redeemed_at": row["redeemed_at"]})
    voucher = "MQ-" + secrets.token_hex(4).upper()
    today = date.today().isoformat()
    conn.execute(
        "UPDATE wallet SET status='redeemed', redeemed_at=?, voucher=? WHERE id=?",
        (today, voucher, wid),
    )
    conn.commit()
    return jsonify({"ok": True, "status": "redeemed", "voucher": voucher, "redeemed_at": today})


# ---------- 랭킹 ----------

@app.get("/api/ranking")
def ranking():
    uid = current_uid()
    if uid is None:
        return err("로그인이 필요해요.", 401)
    conn = db()
    rows = conn.execute(
        """SELECT u.id, u.nickname, u.xp,
                  COALESCE(SUM(p.stars), 0) AS total_stars
           FROM users u
           LEFT JOIN progress p ON p.user_id = u.id
           GROUP BY u.id
           ORDER BY u.xp DESC, u.id ASC
           LIMIT 50"""
    ).fetchall()
    result = []
    for i, r in enumerate(rows):
        result.append({
            "rank": i + 1,
            "nickname": r["nickname"],
            "xp": r["xp"],
            "total_stars": int(r["total_stars"]),
            "is_me": r["id"] == uid,
        })
    # 본인이 50위 밖이면 별도로 추가
    me_in_top = any(r["is_me"] for r in result)
    my_rank = None
    if not me_in_top:
        row = conn.execute(
            """SELECT COUNT(*) + 1 AS rank_pos,
                      (SELECT nickname FROM users WHERE id=?) AS nickname,
                      (SELECT xp FROM users WHERE id=?) AS xp,
                      COALESCE((SELECT SUM(stars) FROM progress WHERE user_id=?), 0) AS total_stars
               FROM users WHERE xp > (SELECT xp FROM users WHERE id=?)""",
            (uid, uid, uid, uid),
        ).fetchone()
        if row:
            my_rank = {
                "rank": row["rank_pos"],
                "nickname": row["nickname"],
                "xp": row["xp"],
                "total_stars": int(row["total_stars"]),
                "is_me": True,
            }
    return jsonify({"ranking": result, "my_rank": my_rank})


# ---------- 학부모 리포트 ----------

@app.get("/api/report")
def report():
    uid = current_uid()
    if uid is None:
        return err("로그인이 필요해요.", 401)
    conn = db()

    stats = {r["world"]: dict(r) for r in conn.execute(
        "SELECT world, correct, wrong FROM stats WHERE user_id=?", (uid,)
    ).fetchall()}
    star_rows = conn.execute(
        "SELECT world, SUM(stars) AS stars, COUNT(*) AS stages FROM progress"
        " WHERE user_id=? GROUP BY world", (uid,)
    ).fetchall()
    stars = {r["world"]: dict(r) for r in star_rows}

    worlds = []
    for w in range(1, 11):
        s = stats.get(w, {"correct": 0, "wrong": 0})
        st = stars.get(w, {"stars": 0, "stages": 0})
        worlds.append({
            "world": w,
            "correct": s["correct"], "wrong": s["wrong"],
            "stars": st["stars"] or 0, "stages": st["stages"] or 0,
        })

    week = []
    for i in range(6, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        row = conn.execute(
            "SELECT COALESCE(SUM(seconds),0) AS s FROM playlog WHERE user_id=? AND day=?",
            (uid, d),
        ).fetchone()
        week.append({"day": d, "seconds": row["s"]})

    total = conn.execute(
        "SELECT COALESCE(SUM(seconds),0) AS s FROM playlog WHERE user_id=? AND day>=?",
        (uid, (date.today() - timedelta(days=6)).isoformat()),
    ).fetchone()["s"]

    return jsonify({"worlds": worlds, "week": week, "week_seconds": total})


if __name__ == "__main__":
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except OSError:
        lan_ip = "127.0.0.1"
    print()
    print("=" * 52)
    print("  MathQuest Jr. Sever has started!")
    print(f"  @PC   : http://localhost:5000")
    print(f"  @Mobile: http://{lan_ip}:5000  (같은 Wi-Fi에 연결된 경우)")
    print("=" * 52)
    print()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
