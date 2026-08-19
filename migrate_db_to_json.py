# -*- coding: utf-8 -*-
"""mathquest.db(SQLite) → 브라우저용 백업 JSON 변환기

Flask 서버 시절에 쌓인 기록을 정적 버전(GitHub Pages)으로 옮길 때 한 번만 쓰는 도구입니다.
만들어진 JSON 파일을 게임의 [나의 모험 기록 → 백업 파일 불러오기]에서 선택하면 복원됩니다.

    python migrate_db_to_json.py                    # 사용자마다 새 비밀번호를 물어봄
    python migrate_db_to_json.py --password pw1234  # 모든 사용자에게 같은 비밀번호 지정
    python migrate_db_to_json.py --out backup.json

비밀번호만 새로 정하는 이유: 기존 해시는 werkzeug(pbkdf2) 방식이라 브라우저에서 검증할 수
없습니다. XP·진도·별·지갑 등 나머지 기록은 그대로 옮겨집니다.
"""
import argparse
import hashlib
import json
import os
import secrets
import sqlite3
import sys
from datetime import date

BASE = os.path.dirname(os.path.abspath(__file__))


def hash_password(password: str) -> str:
    """local-api.js의 hashPassword()와 동일한 형식: s256$<salt>$<sha256(salt + ":" + pw)>"""
    salt = secrets.token_hex(8)
    digest = hashlib.sha256((salt + ":" + password).encode("utf-8")).hexdigest()
    return f"s256${salt}${digest}"


def rows(conn, sql):
    return [dict(r) for r in conn.execute(sql).fetchall()]


def main():
    # 콘솔 인코딩(cp949 등)이 못 그리는 글자가 있어도 죽지 않도록
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass

    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(BASE, "mathquest.db"))
    ap.add_argument("--out", default=os.path.join(BASE, f"mathquest-backup-{date.today().isoformat()}.json"))
    ap.add_argument("--password", help="모든 사용자에게 적용할 새 비밀번호 (미지정 시 한 명씩 물어봅니다)")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        sys.exit(f"DB 파일을 찾을 수 없습니다: {args.db}")

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    users = rows(conn, "SELECT id, username, nickname, xp, spent, created_at FROM users ORDER BY id")
    if not users:
        sys.exit("옮길 사용자가 없습니다.")

    print(f"사용자 {len(users)}명을 찾았습니다.\n")
    for u in users:
        if args.password:
            pw = args.password
        else:
            pw = input(f"  [{u['username']} / {u['nickname']}] 새 비밀번호 (4자 이상, 빈칸이면 건너뜀): ").strip()
            if not pw:
                u["_skip"] = True
                continue
        if len(pw) < 4:
            sys.exit("비밀번호는 4자 이상이어야 합니다.")
        u["password_hash"] = hash_password(pw)

    users = [u for u in users if not u.get("_skip")]
    if not users:
        sys.exit("옮길 사용자를 한 명도 고르지 않았습니다.")
    keep = {u["id"] for u in users}
    for u in users:
        u.setdefault("created_at", date.today().isoformat())

    def mine(table, sql):
        return [r for r in rows(conn, sql) if r["user_id"] in keep]

    wallet = mine("wallet",
                  "SELECT id, user_id, item_id, cost, status, bought_at, redeemed_at, voucher FROM wallet")

    data = {
        "version": 1,
        "next_user_id": max(u["id"] for u in users) + 1,
        "next_wallet_id": (max((w["id"] for w in wallet), default=0)) + 1,
        "users": users,
        "progress": mine("progress",
                         "SELECT user_id, world, stage, stars, best_score, attempts, completed_at FROM progress"),
        "stats": mine("stats", "SELECT user_id, world, correct, wrong FROM stats"),
        "playlog": mine("playlog", "SELECT user_id, day, seconds FROM playlog"),
        "wallet": wallet,
        "daily_stat": mine("daily_stat",
                           "SELECT user_id, day, correct, max_combo, stages_cleared FROM daily_stat"),
        "daily_claim": mine("daily_claim", "SELECT user_id, day, slot FROM daily_claim"),
    }
    conn.close()

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n완료: {args.out}")
    print(f"  사용자 {len(data['users'])} · 진도 {len(data['progress'])} · 지갑 {len(data['wallet'])}"
          f" · 플레이로그 {len(data['playlog'])}")
    print("\n게임에서 [나의 모험 기록 -> 백업 파일 불러오기]로 이 파일을 선택하세요.")


if __name__ == "__main__":
    main()
