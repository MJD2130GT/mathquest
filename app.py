# -*- coding: utf-8 -*-
"""MathQuest Jr. — 로컬 실행용 정적 서버

게임은 이제 서버 없이 브라우저 안에서 완결됩니다(기록은 localStorage에 저장).
실제 배포는 GitHub Pages가 `static/` 폴더를 그대로 서비스합니다 — README 참고.

이 파일은 집에서 테스트할 때 `static/`을 띄워 주기만 합니다.
파이썬 표준 라이브러리만 쓰므로 pip 설치가 필요 없습니다.

    python app.py            # http://localhost:5000
    python app.py --port 8000

(예전 Flask + SQLite 서버 버전은 git 히스토리에 남아 있습니다.
 그때 쌓인 mathquest.db 기록은 `python migrate_db_to_json.py`로 옮길 수 있습니다.)
"""
import argparse
import os
import socket
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # 파일을 고쳐도 바로 반영되도록 캐시를 끕니다 (로컬 테스트 전용)
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 요청 로그는 조용히


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 5000)))
    args = ap.parse_args()

    if not os.path.isdir(STATIC):
        raise SystemExit(f"static 폴더를 찾을 수 없습니다: {STATIC}")

    handler = partial(Handler, directory=STATIC)
    httpd = ThreadingHTTPServer(("0.0.0.0", args.port), handler)

    print()
    print("=" * 52)
    print("  MathQuest Jr. (로컬 테스트 서버)")
    print(f"  @PC    : http://localhost:{args.port}")
    print(f"  @Mobile: http://{lan_ip()}:{args.port}  (같은 Wi-Fi에 연결된 경우)")
    print("=" * 52)
    print("  종료하려면 Ctrl+C")
    print()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료했습니다.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
