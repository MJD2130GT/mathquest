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
    # 기존 DB 마이그레이션: users.spent 컬럼이 없으면 추가
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
    {"id": 3, "name": "문구·학업 용품", "emoji": "✏️", "desc": "실용적이고 디자인도 예쁜 학습 아이템"},
    {"id": 4, "name": "생활·엔터테인먼트", "emoji": "🎮", "desc": "방 꾸미기와 일상에 유용한 소품"},
]

CATALOG = [
    {"id": "01", "cat": 1, "name": "카카오톡 이모티콘 구매권", "cost": 5000, "emoji": "💬",
     "desc": "카톡을 더 귀엽게! 좋아하는 이모티콘을 직접 골라 받을 수 있어요."},
    {"id": "02", "cat": 1, "name": "네이버페이 포인트 쿠폰 (5,000원권)", "cost": 10000, "emoji": "💳",
     "desc": "네이버페이로 어디서나 현금처럼 쓸 수 있는 5,000원 포인트.", "real": 5000},
    {"id": "03", "cat": 1, "name": "구글 기프트코드 (15,000원권)", "cost": 30000, "emoji": "🎟️",
     "desc": "앱·게임·구독 결제에 쓰는 구글 기프트코드.", "real": 15000},
    {"id": "04", "cat": 1, "name": "문화상품권 (20,000원권)", "cost": 40000, "emoji": "🎫",
     "desc": "온·오프라인 어디서나 통하는 만능 문화상품권.", "real": 20000},
    {"id": "05", "cat": 1, "name": "도서문화상품권 (50,000원권)", "cost": 100000, "emoji": "📚",
     "desc": "읽고 싶은 책을 마음껏! 서점에서 쓰는 도서상품권.", "real": 50000},
    {"id": "21", "cat": 1, "name": "다이소 모바일 상품권 (5,000원권)", "cost": 10000, "emoji": "🛍️",
     "desc": "하교 후 가장 자주 들르는 다이소에서 귀여운 인형·문구·간식을 살 수 있어요.", "real": 5000},
    {"id": "22", "cat": 1, "name": "올리브영 기프트카드 (10,000원권)", "cost": 20000, "emoji": "💄",
     "desc": "뷰티 관심 폭발 청소년기 선호도 1위! 립밤·팩·간식류까지 구매 가능.", "real": 10000},
    {"id": "06", "cat": 2, "name": "편의점 모바일 금액권 (1,000원권)", "cost": 2000, "emoji": "🏪",
     "desc": "편의점에서 바로 쓰는 1,000원 모바일 금액권.", "real": 1000},
    {"id": "07", "cat": 2, "name": "편의점 모바일 금액권 (3,000원권)", "cost": 6000, "emoji": "🏪",
     "desc": "간식 한가득! 편의점 3,000원 모바일 금액권.", "real": 3000},
    {"id": "08", "cat": 2, "name": "배스킨라빈스 싱글킹", "cost": 8600, "emoji": "🍦",
     "desc": "계절을 타지 않는 스테디셀러 디저트, 싱글킹 아이스크림.", "real": 4300},
    {"id": "23", "cat": 2, "name": "GS25 모바일 금액권 (2,000원권)", "cost": 4000, "emoji": "🏪",
     "desc": "가장 빠르게 얻는 보상! GS25에서 껌·츄파춥스·작은 스낵을 교환하기 좋아요.", "real": 2000},
    {"id": "24", "cat": 2, "name": "세븐일레븐 모바일 금액권 (3,000원권)", "cost": 6000, "emoji": "🍙",
     "desc": "삼각김밥과 음료수까지, 든든한 방과 후 간식 조합을 살 수 있어요.", "real": 3000},
    {"id": "25", "cat": 2, "name": "빽다방 5,000원 금액권", "cost": 10000, "emoji": "☕",
     "desc": "가성비 좋은 빽다방에서 바닐라라떼·빽스치노 등을 사 먹을 수 있어요.", "real": 5000},
    {"id": "10", "cat": 2, "name": "죠스떡볶이 1인 세트", "cost": 13000, "emoji": "🍢",
     "desc": "학원 가기 전 출출함을 달래는 매콤한 분식 세트."},
    {"id": "11", "cat": 2, "name": "맘스터치 싸이버거 세트", "cost": 13800, "emoji": "🍔",
     "desc": "든든한 한 끼! 청소년 선호도 높은 싸이버거 세트."},
    {"id": "12", "cat": 2, "name": "BHC 뿌링클 + 콜라 세트", "cost": 46000, "emoji": "🍗",
     "desc": "주말에 온 가족이 함께! 부모님께 대접하는 뿌듯한 치킨 세트."},
    {"id": "13", "cat": 3, "name": "고기능성 스터디 플래너", "cost": 10000, "emoji": "📔",
     "desc": "스스로 학습 계획을 세우는 중1 시기에 딱 맞는 플래너."},
    {"id": "14", "cat": 3, "name": "프리미엄 필기구 세트", "cost": 20000, "emoji": "🖊️",
     "desc": "캐릭터 협업 디자인의 소장 가치 높은 고급 샤프·펜 세트."},
    {"id": "15", "cat": 3, "name": "각도 조절 디자인 독서대", "cost": 24000, "emoji": "📖",
     "desc": "인강·독서 시 거북목을 막아주는 실용 독서대.", "real": 12000},
    {"id": "16", "cat": 3, "name": "스터디 텀블러 (보온·보냉)", "cost": 40000, "emoji": "🥤",
     "desc": "책상 위에 두고 쓰는 깔끔한 디자인의 개인 텀블러.", "real": 20000},
    {"id": "17", "cat": 4, "name": "인기 캐릭터 그립톡·파우치", "cost": 30000, "emoji": "🩷",
     "desc": "스마트폰을 나만의 개성으로! 취향 저격 꾸미기 아이템."},
    {"id": "18", "cat": 4, "name": "무선 무소음 마우스", "cost": 30000, "emoji": "🖱️",
     "desc": "과제·인강에 유용한, 독서실에서도 조용한 무소음 마우스."},
    {"id": "19", "cat": 4, "name": "인기 보드게임", "cost": 50000, "emoji": "🎲",
     "desc": "화면 밖에서 친구·가족과 즐기는 두뇌 보드게임 (루미큐브 등)."},
    {"id": "20", "cat": 4, "name": "블루투스 무선 이어폰", "cost": 100000, "emoji": "🎧",
     "desc": "영어 듣기·음악 감상까지, 중학생 필수 무선 이어폰."},
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
    conn.commit()

    xp = conn.execute("SELECT xp FROM users WHERE id=?", (uid,)).fetchone()["xp"]
    return jsonify({"ok": True, "xp": xp})


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
