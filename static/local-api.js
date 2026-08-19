/* MathQuest Jr. — 로컬 API
 *
 * 기존 Flask 서버(app.py)의 /api/* 엔드포인트를 브라우저 안에서 그대로 재현합니다.
 * 데이터는 localStorage에 저장되므로 서버 없이 GitHub Pages 같은 정적 호스팅에서 동작합니다.
 *
 *   window.LocalAPI(path, body)  → app.js의 api() 헬퍼가 호출
 *   window.MQStore               → 백업 내보내기 / 불러오기 / 초기화
 *
 * 주의: 데이터는 이 브라우저에만 저장됩니다. 다른 기기·다른 브라우저와 공유되지 않고,
 *       브라우저 저장소를 지우면 사라집니다. 가끔 "백업 내보내기"를 권장합니다.
 */
(function () {
  "use strict";

  const DATA_KEY = "mathquest.data.v1";
  const SESSION_KEY = "mathquest.session.v1";

  // ---------- 상점 카탈로그 (app.py의 CATEGORIES / CATALOG와 동일) ----------
  const CATEGORIES = [
    { id: 1, name: "모바일 포인트·상품권", emoji: "📱", desc: "바로 쓸 수 있는 모바일 포인트와 상품권" },
    { id: 2, name: "간식·먹거리", emoji: "🍔", desc: "학교 끝나고 친구들과 즐기는 즉각 보상" },
    { id: 3, name: "특별 보상", emoji: "⭐", desc: "열심히 공부한 나에게 주는 특별한 선물" },
  ];

  const CATALOG = [
    // ── cat 1: 모바일 포인트·상품권 (가격 오름차순) ──────────────────────
    { id: "21", cat: 1, name: "다이소 모바일 상품권 (5,000원권)", cost: 5000, emoji: "🛍️",
      desc: "하교 후 가장 자주 들르는 다이소에서 귀여운 인형·문구·간식을 살 수 있어요.", real: 5000 },
    { id: "26", cat: 1, name: "인형뽑기 10,000원권", cost: 10000, emoji: "🧸",
      desc: "친구들과 함께 두근두근 인형뽑기! 10,000원권으로 원하는 뽑기방에서 사용하세요." },
    { id: "22", cat: 1, name: "올리브영 기프트카드 (10,000원권)", cost: 10000, emoji: "💄",
      desc: "뷰티 관심 폭발 청소년기 선호도 1위! 립밤·팩·간식류까지 구매 가능.", real: 10000 },

    // ── cat 2: 간식·먹거리 (가격 오름차순) ──────────────────────────────
    { id: "06", cat: 2, name: "CU 모바일 금액권 (2,000원권)", cost: 2000, emoji: "🏪",
      desc: "CU 편의점에서 바로 쓰는 2,000원 모바일 금액권.", real: 2000 },
    { id: "23", cat: 2, name: "GS25 모바일 금액권 (2,000원권)", cost: 2000, emoji: "🏪",
      desc: "가장 빠르게 얻는 보상! GS25에서 껌·츄파춥스·작은 스낵을 교환하기 좋아요.", real: 2000 },
    { id: "24", cat: 2, name: "세븐일레븐 모바일 금액권 (3,000원권)", cost: 3000, emoji: "🍙",
      desc: "삼각김밥과 음료수까지, 든든한 방과 후 간식 조합을 살 수 있어요.", real: 3000 },
    { id: "08", cat: 2, name: "배스킨라빈스 싱글킹", cost: 4300, emoji: "🍦",
      desc: "계절을 타지 않는 스테디셀러 디저트, 싱글킹 아이스크림.", real: 4300 },
    { id: "25", cat: 2, name: "빽다방 5,000원 금액권", cost: 5000, emoji: "☕",
      desc: "가성비 좋은 빽다방에서 바닐라라떼·빽스치노 등을 사 먹을 수 있어요.", real: 5000 },
    { id: "28", cat: 2, name: "컴포즈 5,000원 금액권", cost: 5000, emoji: "🧋",
      desc: "가성비 1위 컴포즈커피에서 달콤한 음료 한 잔!", real: 5000 },
    { id: "12", cat: 2, name: "BHC 뿌링클 + 콜라 세트", cost: 23000, emoji: "🍗",
      desc: "주말에 온 가족이 함께! 부모님께 대접하는 뿌듯한 치킨 세트." },

    // ── cat 3: 특별 보상 (가격 오름차순) ────────────────────────────────
    { id: "27", cat: 3, name: "자유시간 2시간", cost: 20000, emoji: "⏰",
      desc: "수학 열심히 한 나에게 주는 특별 보상! 2시간 동안 하고 싶은 걸 마음껏 즐기세요." },
  ];

  const CATALOG_BY_ID = {};
  CATALOG.forEach((it) => { CATALOG_BY_ID[it.id] = it; });

  const DAILY_QUESTS = [
    { slot: 1, icon: "⚔️", title: "오늘의 배틀", desc: "배틀 스테이지 1회 완료", reward: 50 },
    { slot: 2, icon: "⏱️", title: "꾸준한 탐험가", desc: "오늘 5분 이상 플레이", reward: 30 },
    { slot: 3, icon: "🔥", title: "콤보 마스터", desc: "최대 콤보 🔥3 이상 달성", reward: 40 },
  ];

  // ---------- 유틸 ----------
  function ApiError(msg, status) {
    const e = new Error(msg);
    e.status = status || 400;
    return e;
  }

  /** 로컬 시간대 기준 YYYY-MM-DD (파이썬 date.today().isoformat()와 동일한 의미) */
  function todayStr(offsetDays) {
    const d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function toInt(v, fallback) {
    const n = typeof v === "number" ? Math.trunc(v) : parseInt(v, 10);
    if (Number.isNaN(n)) {
      if (fallback === undefined) throw ApiError("잘못된 요청이에요.");
      return fallback;
    }
    return n;
  }

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // ---------- 비밀번호 해시 ----------
  // https(GitHub Pages)와 localhost에서는 SHA-256을 사용합니다.
  // crypto.subtle을 못 쓰는 환경(file:// 등)에서는 약한 대체 해시로 내려가되,
  // 어떤 방식으로 저장했는지 문자열에 남겨 두어 검증이 어긋나지 않게 합니다.
  const hasSubtle = !!(window.crypto && window.crypto.subtle && window.crypto.subtle.digest);

  function weakHash(str) {
    // FNV-1a 32bit ×2 (서로 다른 오프셋) — 암호학적으로 안전하지 않음
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ (c + i), 0x811c9dc5) >>> 0;
    }
    return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }

  async function digest(scheme, salt, password) {
    const msg = salt + ":" + password;
    if (scheme === "s256") {
      const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return weakHash(msg);
  }

  async function hashPassword(password) {
    const scheme = hasSubtle ? "s256" : "weak";
    const salt = randomHex(8);
    return `${scheme}$${salt}$${await digest(scheme, salt, password)}`;
  }

  async function checkPassword(stored, password) {
    const parts = String(stored || "").split("$");
    if (parts.length !== 3) return false;
    const [scheme, salt, expected] = parts;
    if (scheme === "s256" && !hasSubtle) return false;
    return (await digest(scheme, salt, password)) === expected;
  }

  // ---------- 저장소 ----------
  function emptyDB() {
    return {
      version: 1,
      next_user_id: 1,
      next_wallet_id: 1,
      users: [],        // {id, username, password_hash, nickname, xp, spent, created_at}
      progress: [],     // {user_id, world, stage, stars, best_score, attempts, completed_at}
      stats: [],        // {user_id, world, correct, wrong}
      playlog: [],      // {user_id, day, seconds}
      wallet: [],       // {id, user_id, item_id, cost, status, bought_at, redeemed_at, voucher}
      daily_stat: [],   // {user_id, day, correct, max_combo, stages_cleared}
      daily_claim: [],  // {user_id, day, slot}
    };
  }

  let cache = null;

  function load() {
    if (cache) return cache;
    let raw = null;
    try { raw = localStorage.getItem(DATA_KEY); } catch (e) { /* 저장소 접근 불가 */ }
    if (!raw) { cache = emptyDB(); return cache; }
    try {
      const parsed = JSON.parse(raw);
      cache = Object.assign(emptyDB(), parsed);
    } catch (e) {
      cache = emptyDB();
    }
    return cache;
  }

  function save() {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(cache));
    } catch (e) {
      throw ApiError("저장 공간이 부족해서 기록을 저장하지 못했어요.", 507);
    }
  }

  function getSessionUid() {
    try {
      const v = localStorage.getItem(SESSION_KEY);
      return v === null ? null : toInt(v, null);
    } catch (e) { return null; }
  }

  function setSessionUid(uid) {
    try {
      if (uid === null) localStorage.removeItem(SESSION_KEY);
      else localStorage.setItem(SESSION_KEY, String(uid));
    } catch (e) { /* 무시 */ }
  }

  /** 로그인한 사용자 레코드. 없으면 401을 던집니다. */
  function requireUser() {
    const uid = getSessionUid();
    if (uid === null) throw ApiError("로그인이 필요해요.", 401);
    const db = load();
    const user = db.users.find((u) => u.id === uid);
    if (!user) {
      setSessionUid(null);
      throw ApiError("로그인이 필요해요.", 401);
    }
    return user;
  }

  const balanceOf = (u) => ({ xp: u.xp, spent: u.spent, spendable: u.xp - u.spent });

  // ---------- 엔드포인트 ----------
  const routes = {};

  // POST /api/register
  routes["register"] = async function (body) {
    const db = load();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const nickname = String(body.nickname || "").trim() || username;

    // 파이썬 str.isalnum()과 같은 의미 — 한글·영문·숫자 허용, 공백/기호 불가
    const alnum = /^[\p{L}\p{N}]+$/u;
    if (username.length < 2 || username.length > 20 || !alnum.test(username)) {
      throw ApiError("아이디는 영문/숫자 2~20자로 만들어 주세요.");
    }
    if (password.length < 4) throw ApiError("비밀번호는 4자 이상으로 해주세요.");
    if (nickname.length > 12) throw ApiError("닉네임은 12자 이하로 해주세요.");
    if (db.users.some((u) => u.username === username)) {
      throw ApiError("이미 사용 중인 아이디예요. 다른 아이디를 골라 주세요.");
    }

    const user = {
      id: db.next_user_id++,
      username,
      password_hash: await hashPassword(password),
      nickname,
      xp: 0,
      spent: 0,
      created_at: todayStr(),
    };
    db.users.push(user);
    save();
    setSessionUid(user.id);
    return { ok: true };
  };

  // POST /api/login
  routes["login"] = async function (body) {
    const db = load();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const user = db.users.find((u) => u.username === username);
    if (!user || !(await checkPassword(user.password_hash, password))) {
      throw ApiError("아이디 또는 비밀번호가 맞지 않아요.", 401);
    }
    setSessionUid(user.id);
    return { ok: true };
  };

  // POST /api/logout
  routes["logout"] = async function () {
    setSessionUid(null);
    return { ok: true };
  };

  // GET /api/state
  routes["state"] = async function () {
    const user = requireUser();
    const db = load();
    return {
      user: { username: user.username, nickname: user.nickname, xp: user.xp, spent: user.spent },
      progress: db.progress
        .filter((p) => p.user_id === user.id)
        .map((p) => ({
          world: p.world, stage: p.stage, stars: p.stars,
          best_score: p.best_score, attempts: p.attempts,
        })),
      stats: db.stats
        .filter((s) => s.user_id === user.id)
        .map((s) => ({ world: s.world, correct: s.correct, wrong: s.wrong })),
    };
  };

  // POST /api/result
  routes["result"] = async function (body) {
    const user = requireUser();
    const db = load();

    if (body.world === undefined || body.stage === undefined || body.stars === undefined) {
      throw ApiError("잘못된 요청이에요.");
    }
    const world = toInt(body.world);
    const stage = toInt(body.stage);
    const stars = clamp(toInt(body.stars), 0, 3);
    const score = clamp(toInt(body.score, 0), 0, 100);
    const xpGain = clamp(toInt(body.xp, 0), 0, 2000);
    const correct = clamp(toInt(body.correct, 0), 0, 100);
    const wrong = clamp(toInt(body.wrong, 0), 0, 100);
    const seconds = clamp(toInt(body.seconds, 0), 0, 3600);
    const maxCombo = clamp(toInt(body.max_combo, 0), 0, 50);
    if (!(world >= 1 && world <= 10 && stage >= 1 && stage <= 5)) throw ApiError("잘못된 요청이에요.");

    const today = todayStr();

    let row = db.progress.find((p) => p.user_id === user.id && p.world === world && p.stage === stage);
    if (!row) {
      db.progress.push({
        user_id: user.id, world, stage, stars, best_score: score, attempts: 1,
        completed_at: stars > 0 ? today : null,
      });
    } else {
      row.stars = Math.max(row.stars, stars);
      row.best_score = Math.max(row.best_score, score);
      row.attempts += 1;
      if (row.completed_at == null && stars > 0) row.completed_at = today;
    }

    if (correct || wrong) {
      let st = db.stats.find((s) => s.user_id === user.id && s.world === world);
      if (!st) {
        db.stats.push({ user_id: user.id, world, correct, wrong });
      } else {
        st.correct += correct;
        st.wrong += wrong;
      }
    }

    user.xp += xpGain;
    if (seconds > 0) db.playlog.push({ user_id: user.id, day: today, seconds });

    const cleared = stars > 0 ? 1 : 0;
    let ds = db.daily_stat.find((d) => d.user_id === user.id && d.day === today);
    if (!ds) {
      db.daily_stat.push({
        user_id: user.id, day: today, correct, max_combo: maxCombo, stages_cleared: cleared,
      });
    } else {
      ds.correct += correct;
      ds.max_combo = Math.max(ds.max_combo, maxCombo);
      ds.stages_cleared += cleared;
    }

    save();
    return { ok: true, xp: user.xp };
  };

  // ---------- 일일 도전 ----------
  function checkQuest(db, uid, today, slot) {
    const ds = db.daily_stat.find((d) => d.user_id === uid && d.day === today);
    if (slot === 1) return !!ds && ds.stages_cleared >= 1;
    if (slot === 2) {
      const s = db.playlog
        .filter((p) => p.user_id === uid && p.day === today)
        .reduce((t, p) => t + p.seconds, 0);
      return s >= 300;
    }
    if (slot === 3) return !!ds && ds.max_combo >= 3;
    return false;
  }

  // GET /api/daily
  routes["daily"] = async function () {
    const user = requireUser();
    const db = load();
    const today = todayStr();
    const claimed = new Set(
      db.daily_claim.filter((c) => c.user_id === user.id && c.day === today).map((c) => c.slot)
    );
    return {
      quests: DAILY_QUESTS.map((q) => Object.assign({}, q, {
        done: checkQuest(db, user.id, today, q.slot),
        claimed: claimed.has(q.slot),
      })),
    };
  };

  // POST /api/daily/claim
  routes["daily/claim"] = async function (body) {
    const user = requireUser();
    const db = load();
    const slot = toInt(body.slot);
    const quest = DAILY_QUESTS.find((q) => q.slot === slot);
    if (!quest) throw ApiError("존재하지 않는 도전이에요.");

    const today = todayStr();
    const already = db.daily_claim.some(
      (c) => c.user_id === user.id && c.day === today && c.slot === slot
    );
    if (already) throw ApiError("이미 보상을 받았어요.");
    if (!checkQuest(db, user.id, today, slot)) throw ApiError("아직 달성하지 못했어요.");

    db.daily_claim.push({ user_id: user.id, day: today, slot });
    user.xp += quest.reward;
    save();
    return { ok: true, xp: user.xp, reward: quest.reward };
  };

  // ---------- 리워드 상점 / 지갑 ----------

  // GET /api/shop
  routes["shop"] = async function () {
    const user = requireUser();
    const db = load();
    const owned = {};
    db.wallet.filter((w) => w.user_id === user.id).forEach((w) => {
      owned[w.item_id] = (owned[w.item_id] || 0) + 1;
    });
    const bal = balanceOf(user);
    return {
      categories: CATEGORIES,
      items: CATALOG,
      owned,
      xp: bal.xp, spent: bal.spent, spendable: bal.spendable,
    };
  };

  // POST /api/buy
  routes["buy"] = async function (body) {
    const user = requireUser();
    const db = load();
    const item = CATALOG_BY_ID[String(body.item_id || "")];
    if (!item) throw ApiError("존재하지 않는 상품이에요.");

    const bal = balanceOf(user);
    if (bal.spendable < item.cost) throw ApiError("사용 가능한 XP가 부족해요.");

    user.spent += item.cost;
    const walletId = db.next_wallet_id++;
    db.wallet.push({
      id: walletId, user_id: user.id, item_id: item.id, cost: item.cost,
      status: "owned", bought_at: todayStr(), redeemed_at: null, voucher: null,
    });
    save();
    return { ok: true, wallet_id: walletId, spent: user.spent, spendable: user.xp - user.spent };
  };

  // GET /api/wallet
  routes["wallet"] = async function () {
    const user = requireUser();
    const db = load();
    const bal = balanceOf(user);
    const items = db.wallet
      .filter((w) => w.user_id === user.id)
      .slice()
      .sort((a, b) => b.id - a.id)
      .map((w) => {
        const it = CATALOG_BY_ID[w.item_id] || {};
        return {
          id: w.id, item_id: w.item_id,
          name: it.name || "상품", emoji: it.emoji || "🎁",
          cost: w.cost, status: w.status,
          bought_at: w.bought_at, redeemed_at: w.redeemed_at, voucher: w.voucher,
        };
      });
    return { items, xp: bal.xp, spent: bal.spent, spendable: bal.spendable };
  };

  // POST /api/redeem
  routes["redeem"] = async function (body) {
    const user = requireUser();
    const db = load();
    const wid = toInt(body.id);
    const row = db.wallet.find((w) => w.id === wid && w.user_id === user.id);
    if (!row) throw ApiError("지갑에서 찾을 수 없는 상품이에요.", 404);
    if (row.status === "redeemed") {
      return { ok: true, status: "redeemed", voucher: row.voucher, redeemed_at: row.redeemed_at };
    }
    const voucher = "MQ-" + randomHex(4).toUpperCase();
    const today = todayStr();
    row.status = "redeemed";
    row.redeemed_at = today;
    row.voucher = voucher;
    save();
    return { ok: true, status: "redeemed", voucher, redeemed_at: today };
  };

  // GET /api/ranking — 이 기기에 만들어진 프로필끼리 겨룹니다
  routes["ranking"] = async function () {
    const user = requireUser();
    const db = load();

    const starsByUser = {};
    db.progress.forEach((p) => {
      starsByUser[p.user_id] = (starsByUser[p.user_id] || 0) + p.stars;
    });

    const sorted = db.users.slice().sort((a, b) => (b.xp - a.xp) || (a.id - b.id));
    const ranking = sorted.slice(0, 50).map((u, i) => ({
      rank: i + 1,
      nickname: u.nickname,
      xp: u.xp,
      total_stars: starsByUser[u.id] || 0,
      is_me: u.id === user.id,
    }));

    let my_rank = null;
    if (!ranking.some((r) => r.is_me)) {
      my_rank = {
        rank: db.users.filter((u) => u.xp > user.xp).length + 1,
        nickname: user.nickname,
        xp: user.xp,
        total_stars: starsByUser[user.id] || 0,
        is_me: true,
      };
    }
    return { ranking, my_rank };
  };

  // GET /api/report
  routes["report"] = async function () {
    const user = requireUser();
    const db = load();

    const worlds = [];
    for (let w = 1; w <= 10; w++) {
      const st = db.stats.find((s) => s.user_id === user.id && s.world === w);
      const rows = db.progress.filter((p) => p.user_id === user.id && p.world === w);
      worlds.push({
        world: w,
        correct: st ? st.correct : 0,
        wrong: st ? st.wrong : 0,
        stars: rows.reduce((t, p) => t + p.stars, 0),
        stages: rows.length,
      });
    }

    const mine = db.playlog.filter((p) => p.user_id === user.id);
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = todayStr(-i);
      week.push({
        day: d,
        seconds: mine.filter((p) => p.day === d).reduce((t, p) => t + p.seconds, 0),
      });
    }
    const week_seconds = week.reduce((t, d) => t + d.seconds, 0);

    return { worlds, week, week_seconds };
  };

  // ---------- 디스패처 ----------
  window.LocalAPI = async function (path, body) {
    const handler = routes[path];
    if (!handler) throw ApiError("알 수 없는 요청이에요: " + path, 404);
    return handler(body || {});
  };

  // ---------- 백업 ----------
  window.MQStore = {
    /** 현재 저장된 모든 기록을 JSON 문자열로 반환 */
    exportJSON() {
      return JSON.stringify(load(), null, 2);
    },
    /** 백업 파일을 내려받습니다 */
    download() {
      const blob = new Blob([this.exportJSON()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mathquest-backup-${todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    /** 백업 JSON으로 현재 기록을 통째로 교체합니다 */
    importJSON(text) {
      let parsed;
      try { parsed = JSON.parse(text); }
      catch (e) { throw ApiError("백업 파일을 읽을 수 없어요. 올바른 파일인지 확인해 주세요."); }
      if (!parsed || !Array.isArray(parsed.users)) {
        throw ApiError("MathQuest 백업 파일이 아닌 것 같아요.");
      }
      cache = Object.assign(emptyDB(), parsed);
      // 저장된 id 카운터가 실제 데이터보다 낮으면 새 항목이 기존 것을 덮어씁니다 — 보정
      cache.next_user_id = Math.max(cache.next_user_id, ...cache.users.map((u) => u.id + 1), 1);
      cache.next_wallet_id = Math.max(cache.next_wallet_id, ...cache.wallet.map((w) => w.id + 1), 1);
      save();
      setSessionUid(null);
    },
    /** 이 기기의 모든 기록을 지웁니다 */
    reset() {
      cache = emptyDB();
      save();
      setSessionUid(null);
    },
  };
})();
