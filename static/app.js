/* MathQuest Jr. — 게임 UI & 엔진 */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const app = () => $("#app");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const S = { user: null, progress: {}, stats: {} };
  let B = null;
  let conceptT0 = 0;
  let pendingLevelUp = null;

  // ---------- 칭호 ----------
  const TITLES = [
    [50, "수학 마왕 👑"],
    [30, "수학 현자 🔮"],
    [20, "방정식 기사 🛡️"],
    [10, "연산 탐험가 ⚔️"],
    [1,  "수학 새싹 🌱"],
  ];
  const titleOf = (lv) => (TITLES.find(([min]) => lv >= min) || TITLES[TITLES.length - 1])[1];

  // ---------- API ----------
  async function api(path, body) {
    const res = await fetch("/api/" + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = {};
    try { j = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) { const e = new Error(j.error || "오류가 발생했어요."); e.status = res.status; throw e; }
    return j;
  }
  async function loadState() {
    const j = await api("state");
    S.user = j.user;
    S.progress = {};
    j.progress.forEach((p) => { S.progress[p.world + "-" + p.stage] = p; });
    S.stats = {};
    j.stats.forEach((s) => { S.stats[s.world] = s; });
  }

  // ---------- 진행/레벨 ----------
  const levelOf = (xp) => Math.min(50, Math.floor(xp / 150) + 1);
  const xpInLevel = (xp) => (levelOf(xp) >= 50 ? 150 : xp % 150);
  const starsOf = (w, s) => (S.progress[w + "-" + s] ? S.progress[w + "-" + s].stars : 0);
  const stageCleared = (w, s) => starsOf(w, s) > 0;
  const worldUnlocked = (w) => w === 1 || stageCleared(w - 1, 5);
  const stageUnlocked = (w, s) => (s === 1 ? worldUnlocked(w) : stageCleared(w, s - 1));
  const worldStars = (w) => [1, 2, 3, 4, 5].reduce((t, s) => t + starsOf(w, s), 0);

  // ---------- 이펙트 헬퍼 ----------
  function spawnParts(target, emoji, n) {
    if (!target) return;
    const r = target.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const sp = document.createElement("span");
      sp.className = "part";
      sp.textContent = emoji;
      sp.style.left = (r.left + r.width / 2) + "px";
      sp.style.top = (r.top + r.height / 2) + "px";
      sp.style.setProperty("--px", (Math.random() * 170 - 85) + "px");
      sp.style.setProperty("--py", (Math.random() * -150 - 25) + "px");
      document.body.appendChild(sp);
      setTimeout(() => sp.remove(), 900);
    }
  }
  function toastAt(target, msg) {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const t = document.createElement("div");
    t.className = "ftoast";
    t.textContent = msg;
    t.style.left = (r.left + r.width / 2) + "px";
    t.style.top = (r.top - 6) + "px";
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1100);
  }
  function floatXp(target, msg) {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const t = document.createElement("div");
    t.className = "floatxp";
    t.textContent = msg;
    t.style.left = (r.left + r.width / 2) + "px";
    t.style.top = (r.top + r.height / 2) + "px";
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1000);
  }

  // ---------- 공용 UI ----------
  function nav(active) {
    const items = [
      ["map", "🗺️", "모험"],
      ["shop", "🎁", "상점"],
      ["wallet", "👛", "지갑"],
      ["dash", "📊", "기록"],
      ["report", "👨‍👩‍👧", "학부모"],
    ];
    return `<nav class="bottomnav">` + items.map(([id, ic, label]) =>
      `<button class="navbtn ${active === id ? "on" : ""}" onclick="UI.go('${id}')">
        <span class="nico">${ic}</span>${label}</button>`).join("") + `</nav>`;
  }
  const spendable = () => Math.max(0, (S.user.xp || 0) - (S.user.spent || 0));
  const won = (n) => n.toLocaleString("ko-KR");
  function header() {
    const u = S.user;
    const lv = levelOf(u.xp), cur = xpInLevel(u.xp);
    return `<header class="topbar">
      <div class="who"><span class="avatar">🦊</span>
        <div><b>${esc(u.nickname)}</b><div class="lv">Lv.${lv} · ${titleOf(lv)}</div></div></div>
      <div class="xpwrap"><div class="xpbar"><i style="width:${Math.min(100, (cur / 150) * 100)}%"></i></div>
        <span class="xptxt">${cur} / 150 XP · 💰 ${won(spendable())}</span></div>
      <button class="mutebtn" onclick="UI.toggleMute()" title="사운드 ON/OFF">${Sound.isMuted() ? '🔇' : '🔊'}</button>
    </header>`;
  }
  const starStr = (n) => "★".repeat(n) + "☆".repeat(3 - n);
  const muteBtn = () => `<button class="mutebtn" onclick="UI.toggleMute()">${Sound.isMuted() ? '🔇' : '🔊'}</button>`;

  // ---------- 화면: 로그인/가입 ----------
  function renderAuth(mode, msg) {
    mode = mode || "login";
    app().innerHTML = `
    <div class="auth">
      <div class="logo">🗺️</div>
      <h1>MathQuest <span>Jr.</span></h1>
      <p class="tag">수학의 대륙을 탐험하자!</p>
      <div class="tabs">
        <button class="${mode === "login" ? "on" : ""}" onclick="UI.auth('login')">로그인</button>
        <button class="${mode === "register" ? "on" : ""}" onclick="UI.auth('register')">처음이에요</button>
      </div>
      <form id="authform" onsubmit="event.preventDefault(); UI.submitAuth('${mode}')">
        <input id="f-user" placeholder="아이디 (영문/숫자)" autocomplete="username" maxlength="20" required>
        <input id="f-pass" type="password" placeholder="비밀번호" autocomplete="current-password" maxlength="40" required>
        ${mode === "register" ? `<input id="f-nick" placeholder="닉네임 (게임에서 부를 이름)" maxlength="12">` : ""}
        <div class="autherr" id="autherr">${msg ? esc(msg) : ""}</div>
        <button class="big primary" type="submit">${mode === "login" ? "모험 계속하기 ▶" : "모험 시작하기 ✨"}</button>
      </form>
      <p class="hint">가족용 게임이라 간단한 아이디·비밀번호만 있으면 돼요.<br>형제·자매는 각자 아이디를 만들면 기록이 따로 저장돼요.</p>
    </div>`;
  }
  async function submitAuth(mode) {
    const body = {
      username: $("#f-user").value.trim(),
      password: $("#f-pass").value,
    };
    if (mode === "register") body.nickname = ($("#f-nick").value || "").trim();
    try {
      await api(mode, body);
      await loadState();
      renderMap();
    } catch (e) {
      $("#autherr").textContent = e.message;
    }
    return false;
  }

  // ---------- 화면: 월드 맵 ----------
  function renderMap() {
    const cards = MQ.WORLDS.map((w) => {
      const open = worldUnlocked(w.id);
      const st = worldStars(w.id);
      return `<button class="world ${open ? "" : "locked"}" style="--wc:${w.color}"
        onclick="${open ? `UI.stages(${w.id})` : ""}">
        <span class="wemoji">${open ? w.emoji : "🔒"}</span>
        <span class="wname">World ${w.id}<br><b>${w.name}</b></span>
        <span class="wstars">${open ? "★ " + st + "/15" : "이전 월드의 보스를 이겨봐!"}</span>
      </button>`;
    }).join("");
    app().innerHTML = `${header()}
      <main class="scroll">
        <div id="dailyarea"></div>
        <h2 class="sect">🗺️ 수학의 대륙</h2>
        <div class="worlds">${cards}</div>
      </main>${nav("map")}`;
    loadDailyQuests();
  }

  async function loadDailyQuests() {
    const area = document.getElementById("dailyarea");
    if (!area) return;
    try {
      const data = await api("daily");
      const allClaimed = data.quests.every((q) => q.claimed);
      const rows = data.quests.map((q) => {
        const state = q.claimed ? "claimed" : q.done ? "ready" : "locked";
        const btn = q.claimed
          ? `<span class="dq-done">✅ 완료</span>`
          : q.done
            ? `<button class="dq-btn primary" onclick="UI.claimQuest(${q.slot})">+${q.reward} XP</button>`
            : `<span class="dq-lock">미달성</span>`;
        return `<div class="dq-row ${state}">
          <span class="dq-icon">${q.icon}</span>
          <div class="dq-info"><b>${esc(q.title)}</b><span>${esc(q.desc)}</span></div>
          ${btn}
        </div>`;
      }).join("");
      area.innerHTML = `
        <div class="daily-card ${allClaimed ? "all-done" : ""}">
          <div class="daily-head">📅 오늘의 도전${allClaimed ? " <span class='dq-alldone'>모두 완료! 🎉</span>" : ""}</div>
          ${rows}
        </div>`;
    } catch (e) { /* 오프라인이면 숨김 */ }
  }

  async function claimQuest(slot) {
    try {
      const res = await api("daily/claim", { slot });
      S.user.xp = res.xp;
      Sound.play("combo");
      spawnParts(document.getElementById("dailyarea"), "⭐", 10);
      await loadDailyQuests();
    } catch (e) {
      modal(`<div class="big-emoji">😅</div><b>${esc(e.message)}</b>`,
        [{ label: "확인", cls: "ghost", fn: (b) => closeModal(b) }]);
    }
  }

  // ---------- 화면: 스테이지 선택 ----------
  function renderStages(w) {
    const meta = MQ.WORLDS[w - 1];
    const rows = MQ.STAGES.map((st, i) => {
      const s = i + 1;
      const open = stageUnlocked(w, s);
      const stars = starsOf(w, s);
      return `<button class="stage ${open ? "" : "locked"}"
        onclick="${open ? `UI.play(${w},${s})` : ""}">
        <span class="sico">${open ? st.icon : "🔒"}</span>
        <div class="sinfo"><b>Stage ${s} · ${st.name}</b>
          <span class="sstars">${open ? starStr(stars) : "이전 스테이지를 먼저 클리어!"}</span></div>
        <span class="go">${open ? "▶" : ""}</span>
      </button>`;
    }).join("");
    app().innerHTML = `${header()}
      <main class="scroll">
        <button class="back" onclick="UI.go('map')">← 월드 맵</button>
        <div class="worldhead" style="--wc:${meta.color}">
          <span class="bigemoji">${meta.emoji}</span>
          <h2>World ${w}<br>${meta.name}</h2>
        </div>
        <div class="stages">${rows}</div>
      </main>${nav("map")}`;
  }

  function play(w, s) {
    if (s === 1) startConcept(w);
    else startBattle(w, s);
  }

  // ---------- 화면: 개념 탐구 (Stage 1) — 전 월드 인터랙티브 ----------
  let SC = null; // 활성 인터랙티브 씬 상태
  function startConcept(w) {
    conceptT0 = Date.now();
    const scenes = {
      1: renderSieveScene, 2: renderRockScene, 3: renderGearScene,
      4: renderIceScene, 5: renderArrowScene, 6: renderForestScene,
      7: renderDesertScene, 8: renderMoonScene, 9: renderRainbowScene,
      10: renderCastleScene,
    };
    scenes[w]();
  }
  // 공용 씬 골격
  function interShell(w, color, title, subtitle, body, footer) {
    app().innerHTML = `
    <main class="concept inter" style="--wc:${color}">
      <div class="chead">
        <button class="back light" onclick="UI.stages(${w})">✕ 나가기</button>
        ${muteBtn()}
      </div>
      <div class="interhead"><h2>${title}</h2><p>${subtitle}</p></div>
      ${body}
      ${footer || ""}
    </main>`;
  }
  // 수직선 눈금 (W4/W5 공용)
  function nlineTicks() {
    let t = "";
    for (let v = -6; v <= 6; v++) {
      t += `<i class="ntick" style="left:calc(50% + ${v * 7}%)"></i>`;
      if (v % 2 === 0) t += `<span class="nlabel ${v === 0 ? "nzero" : ""}" style="left:calc(50% + ${v * 7}%)">${v > 0 ? "+" + v : v}</span>`;
    }
    return t;
  }
  async function finishConcept(w) {
    const seconds = Math.round((Date.now() - conceptT0) / 1000);
    try {
      await api("result", { world: w, stage: 1, stars: 3, score: 100, xp: 30, correct: 0, wrong: 0, seconds });
      await loadState();
    } catch (e) { /* 오프라인 등 — 그냥 진행 */ }
    Sound.play('clear');
    renderResult(w, 1, 3, 30, null);
  }

  // ===== World 2 인터랙티브: 용암 돌덩이 쪼개기 =====
  // 분해 트리: 72 → 8×9 → (2,2,2)×(3,3)
  const ROCK_SPLITS = { 72: [8, 9], 8: [2, 4], 4: [2, 2], 9: [3, 3] };
  const isPrimePiece = (n) => [2, 3, 5, 7].includes(n);

  function renderRockScene() {
    app().innerHTML = `
    <main class="concept inter" style="--wc:#f97316">
      <div class="chead">
        <button class="back light" onclick="UI.stages(2)">✕ 나가기</button>
        ${muteBtn()}
      </div>
      <div class="interhead">
        <h2>🌋 용암 돌덩이를 쪼개라!</h2>
        <p>돌덩이를 <b>두드려서</b> 더 이상 쪼개지지 않는<br><b>소수 조각 💎</b>으로 만들어 봐!</p>
      </div>
      <div class="rockzone" id="rockzone"></div>
      <div class="formula" id="formula">72 = ?</div>
      <button class="big primary hiddenbtn" id="rockdone" onclick="UI.finishConcept(2)">탐구 완료! ✨</button>
    </main>`;
    rockAdd(72);
  }
  function rockAdd(v) {
    const zone = $("#rockzone");
    if (!zone) return;
    const el = document.createElement("button");
    const prime = isPrimePiece(v);
    el.className = "rock" + (prime ? " prime" : "");
    el.innerHTML = `<span class="remoji">${prime ? "💎" : "🪨"}</span><b>${v}</b>`;
    el.onclick = () => rockTap(el, v);
    zone.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  }
  function rockTap(el, v) {
    if (isPrimePiece(v)) {
      el.classList.remove("wig"); void el.offsetWidth; el.classList.add("wig");
      toastAt(el, `${v}는 소수! 더는 안 쪼개져 ✨`);
      Sound.play('hint');
      return;
    }
    el.classList.add("crack");
    Sound.play('wrong');
    setTimeout(() => {
      const zone = $("#rockzone");
      if (!zone) return;
      spawnParts(el, "🔥", 6);
      const [a, b] = ROCK_SPLITS[v];
      el.remove();
      rockAdd(a); rockAdd(b);
      const pieces = [...zone.querySelectorAll(".rock b")].map((x) => +x.textContent).sort((x, y) => x - y);
      const formula = $("#formula");
      if (!zone.querySelector(".rock:not(.prime)")) {
        formula.innerHTML = "72 = 2 × 2 × 2 × 3 × 3 = <b>2³ × 3²</b>";
        formula.classList.add("glow");
        $("#rockdone").classList.remove("hiddenbtn");
        Sound.play('clear');
        setTimeout(() => spawnParts(formula, "🎉", 12), 200);
      } else {
        formula.textContent = "72 = " + pieces.join(" × ");
        Sound.play('correct');
      }
    }, 380);
  }

  // ===== World 5 인터랙티브: 화살표 뒤집기 마법 =====
  let AS = null;
  const ARROW_STEPS = [
    { val: 3,  text: "<b>+3</b>은 오른쪽으로 3칸 가는 화살표야! ➡️", btn: "⚡ ×(−1) 곱해 보자!" },
    { val: -3, text: "방향이 <b>뒤집혔어!</b><br>(+3) × (−1) = <b>−3</b>", btn: "한 번 더 ×(−1)!" },
    { val: 3,  text: "두 번 뒤집으면 <b>제자리!</b> (−3) × (−1) = <b>+3</b><br>그래서 <b>(−)×(−) = (+)</b> 인 거야! 😎", btn: "다음 도전: (−2) × (−3) 🔥" },
    { val: -2, text: "<b>(−2)</b>는 왼쪽으로 2칸 화살표. ⬅️<br>여기에 (−3)을 곱하면 어떻게 될까?", btn: "⚡ ×(−3) — 뒤집고 3배!" },
    { val: 6,  text: "뒤집고(×−1), 3배로 쭉 늘리면 → <b>+6</b>!<br>(−2) × (−3) = <b>+6</b> 🎉", btn: "탐구 완료! ✨", done: true },
  ];
  function renderArrowScene() {
    AS = { i: 0 };
    let ticks = "";
    for (let v = -6; v <= 6; v++) {
      ticks += `<i class="ntick" style="left:calc(50% + ${v * 7}%)"></i>`;
      if (v % 2 === 0) ticks += `<span class="nlabel ${v === 0 ? "nzero" : ""}" style="left:calc(50% + ${v * 7}%)">${v > 0 ? "+" + v : v}</span>`;
    }
    app().innerHTML = `
    <main class="concept inter" style="--wc:#facc15">
      <div class="chead">
        <button class="back light" onclick="UI.stages(5)">✕ 나가기</button>
        ${muteBtn()}
      </div>
      <div class="interhead">
        <h2>⚡ 화살표 뒤집기 마법</h2>
        <p>음수를 곱하는 건 <b>방향 뒤집기</b>!<br>버튼을 눌러 직접 마법을 써 보자.</p>
      </div>
      <div class="nline">
        <div class="nbase"></div>
        ${ticks}
        <div class="varrow" id="varrow"></div>
      </div>
      <div class="ariatext" id="atext"></div>
      <button class="big primary" id="abtn" onclick="UI.arrowNext()"></button>
    </main>`;
    arrowApply(false);
  }
  function arrowApply(animate) {
    const st = ARROW_STEPS[AS.i];
    const ar = $("#varrow");
    if (!ar) return;
    ar.style.width = (Math.abs(st.val) * 7) + "%";
    ar.style.transform = `scaleX(${st.val < 0 ? -1 : 1})`;
    $("#atext").innerHTML = st.text;
    $("#abtn").textContent = st.btn;
    if (animate) {
      Sound.play('combo');
      setTimeout(() => spawnParts(ar, "⚡", 6), 350);
    }
  }
  function arrowNext() {
    if (!AS) return;
    const cur = ARROW_STEPS[AS.i];
    if (cur.done) { AS = null; finishConcept(5); return; }
    AS.i++;
    arrowApply(true);
  }

  // ===== World 1 인터랙티브: 에라토스테네스의 체 =====
  function renderSieveScene() {
    SC = { step: 0 };
    let cells = "";
    for (let n = 2; n <= 30; n++) cells += `<button class="sv" id="sv${n}" onclick="UI.sieveTap(${n})">${n}</button>`;
    interShell(1, "#38bdf8", "🌊 소수의 섬 — 체로 거르기",
      "배수를 바다에 던지고 나면, 남는 수가 진짜 보물 <b>소수</b>!",
      `<div class="svgrid">${cells}</div>
       <div class="ariatext" id="atext">맨 처음 보물은 <b>2</b>! 2는 남기고, <b>2의 배수</b>를 모두 바다에 던지자.</div>`,
      `<button class="big primary" id="ibtn" onclick="UI.sieveNext()">🌊 2의 배수 던지기!</button>`);
  }
  function sieveNext() {
    if (!SC) return;
    const plan = [2, 3, 5];
    if (SC.step < 3) {
      const p = plan[SC.step];
      const pe = $("#sv" + p);
      if (pe) pe.classList.add("svprime");
      let delay = 0;
      for (let n = p * 2; n <= 30; n += p) {
        const el = $("#sv" + n);
        if (el && !el.classList.contains("sunk")) {
          setTimeout(() => el.classList.add("sunk"), delay += 70);
        }
      }
      Sound.play('correct');
      SC.step++;
      if (SC.step < 3) {
        const np = plan[SC.step];
        $("#atext").innerHTML = `이번 보물은 <b>${np}</b>! 남아 있는 <b>${np}의 배수</b>를 던져 버리자.`;
        $("#ibtn").textContent = `🌊 ${np}의 배수 던지기!`;
      } else {
        $("#atext").innerHTML = `바다에 다 던졌어! 이제 남은 수를 봐 — <b>전부 소수</b>야! ✨`;
        $("#ibtn").textContent = "남은 보물 확인! 💎";
      }
    } else if (SC.step === 3) {
      let delay = 0;
      document.querySelectorAll(".sv:not(.sunk)").forEach((el) => {
        setTimeout(() => el.classList.add("svprime"), delay += 90);
      });
      Sound.play('clear');
      $("#atext").innerHTML = `<b>2, 3, 5, 7, 11, 13, 17, 19, 23, 29</b><br>약수가 1과 자기 자신뿐인 보물들이야!`;
      $("#ibtn").textContent = "탐구 완료! ✨";
      SC.step++;
    } else { SC = null; finishConcept(1); }
  }
  function sieveTap(n) {
    const el = $("#sv" + n);
    if (!el || el.classList.contains("sunk")) return;
    let f = 0;
    for (let i = 2; i < n; i++) if (n % i === 0) { f = i; break; }
    toastAt(el, f ? `${n} = ${f} × ${n / f} → 합성수!` : `${n}은 소수! 💎`);
    Sound.play('hint');
  }

  // ===== World 3 인터랙티브: 기어 던전 (약수/배수 톱니) =====
  const GA = [1, 2, 3, 4, 6, 12], GB = [1, 2, 3, 6, 9, 18], GCOM = [1, 2, 3, 6];
  function renderGearScene() {
    SC = { step: 0 };
    interShell(3, "#94a3b8", "⚙️ 기어 던전 — 톱니 맞추기",
      "12와 18, 두 톱니바퀴의 비밀을 파헤치자!",
      `<div class="interbody" id="ibody"></div>
       <div class="ariatext" id="atext"></div>`,
      `<button class="big primary" id="ibtn" onclick="UI.gearNext()"></button>`);
    gearRender();
  }
  function gearRender() {
    const s = SC.step;
    const mk = (arr) => arr.map((v) => {
      let cls = "chip pop";
      if (s >= 2) cls += GCOM.includes(v) ? " cglow" : " cdim";
      if (s >= 3 && v === 6) cls += " cbig";
      return `<span class="${cls}">${v}</span>`;
    }).join("");
    if (s <= 3) {
      $("#ibody").innerHTML =
        `<div class="chiprow"><b>12의 약수</b><div class="chips">${mk(GA)}</div></div>` +
        (s >= 1 ? `<div class="chiprow"><b>18의 약수</b><div class="chips">${mk(GB)}</div></div>` : "") +
        (s >= 3 ? `<div class="gbadge pop">⚙️ 최대공약수(GCD) = 6</div>` : "");
    } else {
      const mm = (arr) => arr.map((v) =>
        `<span class="chip pop ${v === 36 ? "cglow cbig" : ""}">${v}</span>`).join("");
      $("#ibody").innerHTML =
        `<div class="chiprow"><b>12의 배수</b><div class="chips">${mm([12, 24, 36, 48])}</div></div>
         <div class="chiprow"><b>18의 배수</b><div class="chips">${mm([18, 36, 54])}</div></div>
         <div class="gbadge pop">⚙️ 최소공배수(LCM) = 36</div>`;
    }
    const T = [
      ["12를 나누어떨어뜨리는 수, <b>약수</b>들이야!", "18의 약수도 꺼내기 ⚙️"],
      ["18의 약수도 나왔어. 뭔가 <b>겹치는 수</b>가 보이지?", "공통 약수 찾기! 🔍"],
      ["<b>1, 2, 3, 6</b> — 양쪽 모두에 있는 <b>공약수</b>! 이 중 가장 큰 건?", "가장 큰 공약수 확인!"],
      ["<b>최대공약수 = 6</b>!<br>두 수를 모두 나누는 가장 큰 톱니야.", "이번엔 배수의 세계로 →"],
      ["배수를 늘어놓으니 <b>36</b>에서 처음 만나!<br>이게 <b>최소공배수</b> — 톱니가 다시 만나는 순간이야.", "탐구 완료! ✨"],
    ];
    $("#atext").innerHTML = T[s][0];
    $("#ibtn").textContent = T[s][1];
  }
  function gearNext() {
    if (!SC) return;
    SC.step++;
    if (SC.step > 4) { SC = null; finishConcept(3); return; }
    Sound.play(SC.step >= 3 ? 'combo' : 'correct');
    gearRender();
  }

  // ===== World 4 인터랙티브: 얼음 성 수직선 미끄럼틀 =====
  const ICE_STEPS = [
    { pos: 0, text: "여우는 지금 <b>0</b>에 서 있어. 먼저 <b>(−2) + (−3)</b>!", btn: "❄️ −2만큼 미끄러지기!" },
    { pos: -2, text: "왼쪽으로 2칸! 지금 위치는 <b>−2</b>.", btn: "❄️ 이어서 −3만큼!" },
    { pos: -5, text: "(−2) + (−3) = <b>−5</b>!<br>같은 부호는 같은 방향 — 거리만 더해져!", btn: "다음 문제: 5 − 8" },
    { pos: 5, text: "이번엔 <b>5</b>에서 출발! 8을 빼면 왼쪽으로 8칸이야.", btn: "❄️ −8만큼 미끄러지기!" },
    { pos: -3, text: "0을 지나서 슝~ 5 − 8 = <b>−3</b>!", btn: "마지막: 2 − (−4) ✨" },
    { pos: 2, text: "<b>2</b>에서 출발. <b>−(−4)</b>는… 부호를 뒤집어 <b>+4를 더하는 것</b>!", btn: "❄️ 오른쪽으로 4칸!" },
    { pos: 6, text: "2 − (−4) = 2 + 4 = <b>+6</b>! 🎉<br>음수 빼기 = 양수 더하기!", btn: "탐구 완료! ✨", done: true },
  ];
  function renderIceScene() {
    SC = { i: 0 };
    interShell(4, "#67e8f9", "❄️ 얼음 성 — 수직선 미끄럼틀",
      "여우가 수직선 위를 미끄러져! 더하기·빼기는 <b>이동</b>이야.",
      `<div class="nline"><div class="nbase"></div>${nlineTicks()}<div class="nchar" id="nchar">🦊</div></div>
       <div class="ariatext" id="atext"></div>`,
      `<button class="big primary" id="ibtn" onclick="UI.iceNext()"></button>`);
    iceApply(false);
  }
  function iceApply(anim) {
    const st = ICE_STEPS[SC.i];
    const ch = $("#nchar");
    if (!ch) return;
    ch.style.left = `calc(50% + ${st.pos * 7}%)`;
    $("#atext").innerHTML = st.text;
    $("#ibtn").textContent = st.btn;
    if (anim) {
      Sound.play('correct');
      ch.classList.remove("hop"); void ch.offsetWidth; ch.classList.add("hop");
      setTimeout(() => spawnParts(ch, "❄️", 5), 400);
    }
  }
  function iceNext() {
    if (!SC) return;
    const cur = ICE_STEPS[SC.i];
    if (cur.done) { SC = null; finishConcept(4); return; }
    SC.i++;
    iceApply(true);
  }

  // ===== World 6 인터랙티브: 숲의 피자 통분 =====
  function pieHtml(n, d, color) {
    const ang = (n / d * 360).toFixed(1);
    const seg = (360 / d).toFixed(2);
    return `<div class="pie pop" style="background-image:
      repeating-conic-gradient(rgba(0,0,0,.16) 0deg 1.6deg, transparent 1.6deg ${seg}deg),
      conic-gradient(${color} 0deg ${ang}deg, #e2e8f0 ${ang}deg 360deg)">
      <span>${n}/${d}</span></div>`;
  }
  function renderForestScene() {
    SC = { step: 0 };
    interShell(6, "#4ade80", "🌿 숲의 피자 나누기",
      "1/2 + 1/3 — 크기가 다른 조각, 어떻게 더할까?",
      `<div class="pierow" id="ibody"></div>
       <div class="ariatext" id="atext"></div>`,
      `<button class="big primary" id="ibtn" onclick="UI.forestNext()"></button>`);
    forestRender();
  }
  function forestRender() {
    const s = SC.step;
    if (s === 0) {
      $("#ibody").innerHTML = pieHtml(1, 2, "#4ade80") + `<span class="pieplus">+</span>` + pieHtml(1, 3, "#fbbf24");
      $("#atext").innerHTML = "반쪽 피자와 ⅓쪽 피자… <b>조각 크기가 달라서</b> 바로 못 더해!";
      $("#ibtn").textContent = "🌿 통분 마법! 분모를 6으로";
    } else if (s === 1) {
      $("#ibody").innerHTML = pieHtml(3, 6, "#4ade80") + `<span class="pieplus">+</span>` + pieHtml(2, 6, "#fbbf24");
      $("#atext").innerHTML = "1/2 = <b>3/6</b>, 1/3 = <b>2/6</b><br>이제 조각 크기가 똑같아!";
      $("#ibtn").textContent = "조각 합치기! ✨";
    } else {
      $("#ibody").innerHTML = pieHtml(5, 6, "#4ade80") + `<div class="gbadge pop">1/2 + 1/3 = 3/6 + 2/6 = <b>5/6</b></div>`;
      $("#atext").innerHTML = "분모가 같으면 <b>분자끼리</b> 더하면 끝!<br>통분 = 조각 크기 맞추기 🍕";
      $("#ibtn").textContent = "탐구 완료! ✨";
    }
  }
  function forestNext() {
    if (!SC) return;
    SC.step++;
    if (SC.step > 2) { SC = null; finishConcept(6); return; }
    Sound.play(SC.step === 2 ? 'combo' : 'correct');
    forestRender();
    spawnParts($("#ibody"), "🍕", 6);
  }

  // ===== World 7 인터랙티브: 사막의 두 배 마법 =====
  function renderDesertScene() {
    SC = { e: 1, phase: 0 };
    interShell(7, "#fbbf24", "🏜️ 사막의 두 배 마법",
      "×2를 누를 때마다 선인장이 두 배로! <b>거듭제곱</b>의 힘이야.",
      `<div class="interbody dzone" id="ibody"></div>
       <div class="ariatext" id="atext"></div>`,
      `<button class="big primary" id="ibtn" onclick="UI.desertNext()"></button>`);
    desertRender();
  }
  function desertRender() {
    if (SC.phase === 0) {
      const cnt = Math.pow(2, SC.e);
      $("#ibody").innerHTML = `<div class="dgrid">${"<span class='dcell pop'>🌵</span>".repeat(cnt)}</div>
        <div class="gbadge">2${MQ.sup(SC.e)} = ${cnt}</div>`;
      $("#atext").innerHTML = SC.e === 1
        ? "지금 선인장 <b>2그루</b>. 이걸 2¹이라고 써!"
        : `2를 <b>${SC.e}번</b> 곱했어! 2${MQ.sup(SC.e)} = <b>${cnt}</b><br>위에 작게 쓴 ${SC.e}가 <b>지수</b> — 곱한 횟수야.`;
      $("#ibtn").textContent = SC.e < 5 ? "🔥 ×2 (두 배!)" : "지수의 법칙 보기 →";
    } else {
      const c = (n, cls) => Array.from({ length: n }, () => `<span class="chip pop ${cls || ""}">2</span>`).join("");
      $("#ibody").innerHTML = `
        <div class="chiprow"><b>2²</b><div class="chips">${c(2)}</div></div>
        <div class="chiprow"><b>× 2³</b><div class="chips">${c(3)}</div></div>
        <div class="chiprow"><b>= 2⁵</b><div class="chips">${c(5, "cglow")}</div></div>`;
      $("#atext").innerHTML = "곱하면 2가 모두 <b>2 + 3 = 5번</b>!<br>그래서 2² × 2³ = <b>2⁵</b> — 지수는 더하기!";
      $("#ibtn").textContent = "탐구 완료! ✨";
    }
  }
  function desertNext() {
    if (!SC) return;
    if (SC.phase === 0 && SC.e < 5) {
      SC.e++;
      Sound.play('correct');
      desertRender();
      spawnParts($("#ibody"), "✨", 6);
    } else if (SC.phase === 0) {
      SC.phase = 1;
      Sound.play('combo');
      desertRender();
    } else { SC = null; finishConcept(7); }
  }

  // ===== World 8 인터랙티브: 달 기지 부품 조립 =====
  function renderMoonScene() {
    SC = { step: 0 };
    interShell(8, "#c4b5fd", "🌙 달 기지 — 부품 조립소",
      "단항식을 부품으로 분해해서 <b>끼리끼리</b> 조립하자!",
      `<div class="interbody" id="ibody"></div>
       <div class="ariatext" id="atext"></div>`,
      `<button class="big primary" id="ibtn" onclick="UI.moonNext()"></button>`);
    moonRender();
  }
  function moonRender() {
    const tile = (t, cls) => `<span class="chip pop ${cls || ""}">${t}</span>`;
    if (SC.step === 0) {
      $("#ibody").innerHTML = `
        <div class="chiprow"><b>3x²</b><div class="chips">${tile(3)}${tile("x")}${tile("x")}</div></div>
        <div class="chiprow"><b>× 4x</b><div class="chips">${tile(4)}${tile("x")}</div></div>`;
      $("#atext").innerHTML = "3x² × 4x — 부품을 전부 펼쳤어!<br><b>숫자는 숫자끼리, x는 x끼리</b> 모으자.";
      $("#ibtn").textContent = "🌙 합체!";
    } else if (SC.step === 1) {
      $("#ibody").innerHTML = `
        <div class="chiprow"><b>계수</b><div class="chips">${tile("3 × 4 = 12", "cglow")}</div></div>
        <div class="chiprow"><b>문자</b><div class="chips">${tile("x·x·x = x³", "cglow")}</div></div>
        <div class="gbadge pop">3x² × 4x = <b>12x³</b></div>`;
      $("#atext").innerHTML = "계수 3×4 = <b>12</b>, x는 2+1 = <b>3번</b> → <b>12x³</b>!";
      $("#ibtn").textContent = "나눗셈도 보기 →";
    } else {
      $("#ibody").innerHTML = `
        <div class="chiprow"><b>8x⁵</b><div class="chips">${tile(8)}${tile("x", "xout")}${tile("x", "xout")}${tile("x")}${tile("x")}${tile("x")}</div></div>
        <div class="chiprow"><b>÷ 2x²</b><div class="chips">${tile(2)}${tile("x", "xout")}${tile("x", "xout")}</div></div>
        <div class="gbadge pop">8x⁵ ÷ 2x² = <b>4x³</b></div>`;
      $("#atext").innerHTML = "위아래 x가 <b>짝지어 지워져!</b><br>계수 8÷2 = <b>4</b>, x는 5−2 = <b>3개</b> 남아 → <b>4x³</b>";
      $("#ibtn").textContent = "탐구 완료! ✨";
    }
  }
  function moonNext() {
    if (!SC) return;
    SC.step++;
    if (SC.step > 2) { SC = null; finishConcept(8); return; }
    Sound.play(SC.step === 1 ? 'combo' : 'correct');
    moonRender();
  }

  // ===== World 9 인터랙티브: 무지개 다리 동류항 모으기 =====
  function renderRainbowScene() {
    SC = { left: 4, combined: false };
    const rchip = (t, k) => `<button class="chip rterm pop" data-k="${k}" onclick="UI.rainbowTap(this)">${t}</button>`;
    interShell(9, "#f472b6", "🌈 무지개 다리 — 동류항 모으기",
      "(3x + 2) + (x − 5) … 항을 눌러서 <b>같은 종류끼리</b> 모아 줘!",
      `<div class="rterms" id="rterms">
         ${rchip("3x", "x")}${rchip("+2", "c")}${rchip("+x", "x")}${rchip("−5", "c")}
       </div>
       <div class="buckets">
         <div class="bucket"><b>x 항</b><div class="bslot" id="bx"></div></div>
         <div class="bucket"><b>상수항</b><div class="bslot" id="bc"></div></div>
       </div>
       <div class="formula hiddenbtn" id="rres"></div>
       <div class="ariatext" id="atext">위의 항을 눌러 알맞은 바구니로 보내자!</div>`,
      `<button class="big primary hiddenbtn" id="ibtn" onclick="UI.rainbowCombine()">동류항 합치기! ✨</button>`);
  }
  function rainbowTap(el) {
    if (!SC || SC.combined) return;
    const dest = $(el.dataset.k === "x" ? "#bx" : "#bc");
    if (!dest) return;
    el.disabled = true;
    el.classList.remove("pop");
    dest.appendChild(el);
    el.classList.add("cglow");
    void el.offsetWidth;
    el.classList.add("pop");
    Sound.play('correct');
    spawnParts(el, "🌈", 4);
    SC.left--;
    if (SC.left === 0) {
      $("#atext").innerHTML = "다 모았어! 이제 <b>같은 바구니끼리</b> 계산하자.";
      $("#ibtn").classList.remove("hiddenbtn");
    }
  }
  function rainbowCombine() {
    if (!SC) return;
    if (SC.combined) { SC = null; finishConcept(9); return; }
    SC.combined = true;
    $("#bx").innerHTML = `<span class="chip cglow cbig pop">3x + x = 4x</span>`;
    $("#bc").innerHTML = `<span class="chip cglow cbig pop">2 − 5 = −3</span>`;
    const f = $("#rres");
    f.classList.remove("hiddenbtn");
    f.innerHTML = "(3x + 2) + (x − 5) = <b>4x − 3</b>";
    f.classList.add("glow");
    $("#atext").innerHTML = "동류항끼리만 더할 수 있어 — 사과는 사과끼리! 🍎";
    $("#ibtn").textContent = "탐구 완료! ✨";
    Sound.play('clear');
    spawnParts(f, "🎉", 10);
  }

  // ===== World 10 인터랙티브: 보스 성 세 개의 자물쇠 =====
  const GATE_QS = [
    { q: "(−) × (−) 의 부호는?", opts: ["+", "−"], a: 0, why: "방향을 두 번 뒤집으면 원래대로!" },
    { q: "2³ × 2² = ?", opts: ["2⁵", "2⁶"], a: 0, why: "같은 밑의 곱셈은 지수끼리 더하기! 3+2=5" },
    { q: "−(x − 4) = ?", opts: ["−x + 4", "−x − 4"], a: 0, why: "− 괄호를 풀면 모든 부호가 반대로!" },
  ];
  function renderCastleScene() {
    SC = { lock: 0 };
    interShell(10, "#fb7185", "🏆 보스 성 — 세 개의 자물쇠",
      "마지막 성문! 자물쇠 세 개를 열어야 들어갈 수 있어.",
      `<div class="castle" id="castle">🏰</div>
       <div class="locks">${[0, 1, 2].map((i) => `<span class="lock" id="lk${i}">🔒</span>`).join("")}</div>
       <div class="ariatext" id="atext"></div>
       <div class="gateopts" id="gopts"></div>`,
      `<button class="big primary hiddenbtn" id="ibtn" onclick="UI.finishConcept(10)">성문 입장! 👑</button>`);
    castleAsk();
  }
  function castleAsk() {
    const g = GATE_QS[SC.lock];
    $("#atext").innerHTML = `<b>자물쇠 ${SC.lock + 1}</b> — ${g.q}`;
    $("#gopts").innerHTML = g.opts.map((o, i) =>
      `<button class="choice" onclick="UI.castlePick(${i})">${o}</button>`).join("");
  }
  function castlePick(i) {
    if (!SC) return;
    const g = GATE_QS[SC.lock];
    if (i !== g.a) {
      Sound.play('wrong');
      const go = $("#gopts");
      go.classList.add("shakeit");
      setTimeout(() => go && go.classList.remove("shakeit"), 500);
      toastAt(go, "💡 " + g.why);
      return;
    }
    const lk = $("#lk" + SC.lock);
    lk.textContent = "🔓";
    lk.classList.add("pop");
    spawnParts(lk, "✨", 6);
    Sound.play('correct');
    SC.lock++;
    if (SC.lock < 3) { castleAsk(); }
    else {
      $("#gopts").innerHTML = "";
      $("#atext").innerHTML = "<b>성문이 열렸다!</b> 모든 연산의 힘이 네 안에 있어. 👑";
      const c = $("#castle");
      c.classList.add("open");
      spawnParts(c, "🎉", 14);
      Sound.play('worldClear');
      $("#ibtn").classList.remove("hiddenbtn");
    }
  }

  // ---------- 배틀: Phaser 엔진(battle.js)에 위임 ----------
  const battleBridge = {
    gen: (world, d) => MQ.gen(world, d),
    quizFor: (world, n) => MQ.quizFor(world, n),
    worldMeta: (w) => MQ.WORLDS[w - 1],
    submit: async (payload) => {
      try {
        const oldLv = levelOf(S.user.xp);
        await api("result", payload);
        await loadState();
        const newLv = levelOf(S.user.xp);
        if (newLv > oldLv) pendingLevelUp = newLv;
      } catch (e) { /* 오프라인 등 — 그냥 진행 */ }
    },
    onWin: (w, s, stars, xp, accPct) => {
      renderResult(w, s, stars, xp, accPct);
      if (pendingLevelUp != null) {
        const lv = pendingLevelUp;
        pendingLevelUp = null;
        setTimeout(() => showLevelUpModal(lv), 1600);
      }
    },
    onLose: (w, s) => failBattle(w, s),
    onQuit: (w) => renderStages(w),
    onConcept: (w) => startConcept(w),
  };
  function startBattle(w, stage) { Battle.start(w, stage, battleBridge); }

  function failBattle(w, s) {
    app().innerHTML = `
    <main class="battle fail">
      <div class="failcard">
        <div class="big-emoji">😵</div>
        <h2>HP가 다 떨어졌어!</h2>
        <p>괜찮아, 탐험가는 넘어져도 다시 일어나!<br>개념을 한 번 더 보고 오면 훨씬 쉬울 거야.</p>
        <button class="big primary" onclick="UI.play(${w},${s})">다시 도전 💪</button>
        <button class="big ghost" onclick="UI.play(${w},1)">개념 탐구 보기 📖</button>
        <button class="big ghost" onclick="UI.stages(${w})">스테이지 목록</button>
      </div>
    </main>`;
  }

  // ---------- 화면: 결과 ----------
  function renderResult(w, s, stars, xp, accPct) {
    const meta = MQ.WORLDS[w - 1];
    const hasNext = s < 5;
    const nextOpen = hasNext && stageUnlocked(w, s + 1);
    const worldDone = s === 5;
    app().innerHTML = `
    <main class="result" style="--wc:${meta.color}">
      <div class="rescard">
        <div class="resstars" id="resstars">${[1, 2, 3].map((i) =>
          `<span class="rstar ${i <= stars ? "on" : ""}" style="animation-delay:${i * 0.25}s">★</span>`).join("")}</div>
        <h2>${worldDone ? `World ${w} 정복! 🏆` : "스테이지 클리어!"}</h2>
        ${accPct !== null ? `<p class="resacc">정답률 ${accPct}%</p>` : `<p class="resacc">개념 탐구 완료!</p>`}
        <p class="resxp">+${xp} XP</p>
        ${worldDone && w < 10 ? `<p class="unlock">🔓 World ${w + 1} ${MQ.WORLDS[w].name} 잠금 해제!</p>` : ""}
        ${worldDone && w === 10 ? `<p class="unlock">👑 수학의 대륙을 모두 정복했어! 넌 진짜 전설이야!</p>` : ""}
        ${nextOpen ? `<button class="big primary" onclick="UI.play(${w},${s + 1})">다음 스테이지 ▶</button>` : ""}
        ${worldDone && w < 10 && worldUnlocked(w + 1) ? `<button class="big primary" onclick="UI.stages(${w + 1})">World ${w + 1}로 출발 🚀</button>` : ""}
        <button class="big ghost" onclick="UI.stages(${w})">스테이지 목록</button>
        <button class="big ghost" onclick="UI.go('map')">월드 맵</button>
      </div>
    </main>`;
    setTimeout(() => spawnParts($("#resstars"), "🎉", stars >= 3 ? 14 : 8), 350);
  }

  // ---------- 화면: 학생 대시보드 ----------
  function renderDash() {
    const u = S.user;
    const lv = levelOf(u.xp);
    const totalStars = MQ.WORLDS.reduce((t, w) => t + worldStars(w.id), 0);
    const rows = MQ.WORLDS.map((w) => {
      const st = S.stats[w.id];
      const total = st ? st.correct + st.wrong : 0;
      const acc = total ? Math.round((st.correct / total) * 100) : null;
      const stars = worldStars(w.id);
      return `<div class="wrow">
        <span class="wrico">${w.emoji}</span>
        <div class="wrbody">
          <b>W${w.id} ${w.name}</b>
          <div class="bar"><i style="width:${(stars / 15) * 100}%;background:${w.color}"></i></div>
        </div>
        <div class="wrnum">★${stars}/15${acc !== null ? `<br><span class="${acc < 60 ? "weak" : ""}">${acc}%</span>` : ""}</div>
      </div>`;
    }).join("");
    const badges = computeBadges(totalStars, lv);
    app().innerHTML = `${header()}
      <main class="scroll">
        <h2 class="sect">📊 나의 모험 기록</h2>
        <div class="cards3">
          <div class="mini"><b>Lv.${lv}</b><span>레벨</span></div>
          <div class="mini"><b>${u.xp}</b><span>총 XP</span></div>
          <div class="mini"><b>★${totalStars}</b><span>모은 별</span></div>
        </div>
        <h3 class="sect2">단원별 진도</h3>
        <div class="wrows">${rows}</div>
        <h3 class="sect2">🏅 배지</h3>
        <div class="badges">${badges.map((b) =>
          `<span class="badge ${b.got ? "got" : ""}" title="${b.desc}">${b.icon}<br>${b.name}</span>`).join("")}</div>
        <button class="big ghost logout" onclick="UI.logout()">로그아웃</button>
      </main>${nav("dash")}`;
  }
  function computeBadges(totalStars, lv) {
    const anyClear = Object.keys(S.progress).length > 0;
    const worldsDone = MQ.WORLDS.filter((w) => stageCleared(w.id, 5)).length;
    const perfectBoss = MQ.WORLDS.some((w) => starsOf(w.id, 5) === 3);
    return [
      { icon: "👣", name: "첫 걸음", desc: "첫 스테이지 클리어", got: anyClear },
      { icon: "🌊", name: "섬 정복", desc: "World 1 완료", got: stageCleared(1, 5) },
      { icon: "⚡", name: "번개 마스터", desc: "World 5 완료", got: stageCleared(5, 5) },
      { icon: "🔥", name: "5개 월드", desc: "월드 5개 정복", got: worldsDone >= 5 },
      { icon: "👑", name: "대륙 정복", desc: "10개 월드 모두 정복", got: worldsDone >= 10 },
      { icon: "💎", name: "퍼펙트 보스", desc: "보스전 3★ 클리어", got: perfectBoss },
      { icon: "⭐", name: "별 수집가", desc: "별 50개 모으기", got: totalStars >= 50 },
      { icon: "🚀", name: "레벨 10", desc: "레벨 10 달성", got: lv >= 10 },
    ];
  }

  // ---------- 화면: 학부모 리포트 ----------
  async function renderReport() {
    let r;
    try { r = await api("report"); } catch (e) { renderAuth("login", e.message); return; }
    const maxSec = Math.max(600, ...r.week.map((d) => d.seconds));
    const dayName = ["일", "월", "화", "수", "목", "금", "토"];
    const weekBars = r.week.map((d) => {
      const dt = new Date(d.day + "T00:00:00");
      const h = Math.round((d.seconds / maxSec) * 100);
      return `<div class="vb"><div class="vbar"><i style="height:${h}%"></i></div>
        <span>${dayName[dt.getDay()]}</span></div>`;
    }).join("");
    const mins = Math.round(r.week_seconds / 60);
    const weak = [];
    const rows = r.worlds.map((wd) => {
      const meta = MQ.WORLDS[wd.world - 1];
      const total = wd.correct + wd.wrong;
      const acc = total ? Math.round((wd.correct / total) * 100) : null;
      if (acc !== null && acc < 60 && total >= 5) weak.push(meta);
      return `<div class="wrow">
        <span class="wrico">${meta.emoji}</span>
        <div class="wrbody"><b>W${wd.world} ${meta.name}</b>
          <div class="bar"><i style="width:${acc === null ? 0 : acc}%;background:${acc !== null && acc < 60 ? "#fda4af" : meta.color}"></i></div>
        </div>
        <div class="wrnum">${acc === null ? "─" : acc + "%"}<br><span>★${wd.stars}</span></div>
      </div>`;
    }).join("");
    app().innerHTML = `${header()}
      <main class="scroll">
        <h2 class="sect">👨‍👩‍👧 학부모 리포트</h2>
        <div class="repcard">
          <h3>이번 주 학습 시간 <b>${mins}분</b></h3>
          <div class="vbars">${weekBars}</div>
        </div>
        <div class="repcard">
          <h3>단원별 정답률</h3>
          ${rows}
        </div>
        <div class="repcard">
          <h3>💬 한눈에 보기</h3>
          <p class="repmsg">${
            weak.length
              ? `<b>${weak.map((m) => m.name).join(", ")}</b> 단원이 아직 어려운 것 같아요. 해당 월드의 '개념 탐구'를 다시 함께 보면 좋아요.`
              : mins > 0
                ? "지금까지 플레이한 단원의 정답률이 안정적이에요. 잘하고 있어요! 👏"
                : "아직 플레이 기록이 없어요. 첫 모험을 함께 시작해 보세요!"
          }</p>
        </div>
      </main>${nav("report")}`;
  }

  // ---------- 공용 모달 ----------
  function modal(html, buttons) {
    const back = document.createElement("div");
    back.className = "ovl modalovl";
    back.innerHTML = `<div class="ovlcard">${html}${buttons.map((b, i) =>
      `<button class="big ${b.cls}" data-i="${i}">${b.label}</button>`).join("")}</div>`;
    document.body.appendChild(back);
    back.querySelectorAll("button[data-i]").forEach((btn) => {
      btn.onclick = () => buttons[+btn.dataset.i].fn(back);
    });
    return back;
  }
  function closeModal(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  function showLevelUpModal(lv) {
    Sound.play("worldClear");
    const title = titleOf(lv);
    const m = modal(
      `<div class="lvup-badge">🎉</div>
       <div class="lvup-title">레벨 업!</div>
       <div class="lvup-lv">Lv. ${lv}</div>
       <div class="lvup-rank">${title}</div>`,
      [{ label: "계속 모험하기 ✨", cls: "primary", fn: (b) => closeModal(b) }]
    );
    m.classList.add("lvup-ovl");
  }

  // ---------- 화면: 리워드 상점 ----------
  function itemCard(it, bal, owned) {
    const afford = bal >= it.cost;
    return `<div class="shopitem ${afford ? "" : "cant"}">
      <div class="shopimg cat${it.cat}">${it.emoji}</div>
      <div class="shopbody">
        <b class="shopname">${esc(it.name)}</b>
        <p class="shopdesc">${esc(it.desc)}</p>
      </div>
      <div class="shopmeta">
        <span class="shopcost">💰 ${won(it.cost)} XP</span>
        ${it.real ? `<span class="shopreal">실제가 ${won(it.real)}원</span>` : ""}
      </div>
      ${owned ? `<span class="ownedtag">🎒 보유 ${owned}</span>` : ""}
      <button class="buybtn ${afford ? "primary" : ""}" ${afford ? "" : "disabled"} onclick="UI.buy('${it.id}')">
        ${afford ? "구매하기" : "XP 부족"}</button>
    </div>`;
  }
  async function renderShop() {
    let data;
    try { data = await api("shop"); }
    catch (e) { if (e.status === 401) { renderAuth("login"); return; }
      app().innerHTML = `${header()}<main class="scroll"><p class="repmsg">${esc(e.message)}</p></main>${nav("shop")}`; return; }
    S.user.xp = data.xp; S.user.spent = data.spent;
    S.catalog = {}; data.items.forEach((it) => { S.catalog[it.id] = it; });
    const bal = data.spendable;
    const cats = data.categories.map((cat) => {
      const items = data.items.filter((it) => it.cat === cat.id)
        .map((it) => itemCard(it, bal, data.owned[it.id] || 0)).join("");
      return `<div class="shopcat">
          <div class="shopcat-h"><span class="shopcat-ic cat${cat.id}">${cat.emoji}</span>
            <div><b>${esc(cat.name)}</b><span>${esc(cat.desc)}</span></div></div>
          <div class="shopgrid">${items}</div>
        </div>`;
    }).join("");
    app().innerHTML = `${header()}
      <main class="scroll">
        <div class="balcard">
          <span class="ballabel">💰 사용 가능 XP</span>
          <b class="balnum">${won(bal)}</b>
          <span class="balsub">총 ${won(data.xp)} 획득 · ${won(data.spent)} 사용</span>
        </div>
        <h2 class="sect">🎁 리워드 상점</h2>
        ${cats}
      </main>${nav("shop")}`;
  }
  function buy(id) {
    const it = S.catalog && S.catalog[id];
    if (!it) return;
    const after = spendable() - it.cost;
    modal(
      `<div class="shopimg cat${it.cat} big">${it.emoji}</div>
       <b>${esc(it.name)}</b>
       <p class="hinttxt">${won(it.cost)} XP를 사용해 구매할까요?<br>구매 후 사용 가능 XP: <b>${won(after)}</b></p>`,
      [{ label: `💰 ${won(it.cost)} XP로 구매`, cls: "primary", fn: async (back) => {
          try {
            const res = await api("buy", { item_id: id });
            S.user.spent = res.spent;
            Sound.play("clear");
            closeModal(back);
            modal(`<div class="big-emoji">🎉</div><b>지갑에 담았어요!</b>
              <p class="hinttxt">${esc(it.name)}<br>지갑에서 언제든 교환할 수 있어요.</p>`,
              [{ label: "지갑으로 가기 👛", cls: "primary", fn: (b2) => { closeModal(b2); renderWallet(); } },
               { label: "계속 쇼핑", cls: "ghost", fn: (b2) => { closeModal(b2); renderShop(); } }]);
          } catch (e) {
            closeModal(back);
            modal(`<div class="big-emoji">😅</div><b>구매하지 못했어요</b><p class="hinttxt">${esc(e.message)}</p>`,
              [{ label: "확인", cls: "ghost", fn: (b2) => { closeModal(b2); renderShop(); } }]);
          }
        } },
        { label: "취소", cls: "ghost", fn: (back) => closeModal(back) }]);
  }

  // ---------- 화면: 지갑(워렛) ----------
  function walletCard(w) {
    const done = w.status === "redeemed";
    return `<div class="walletitem ${done ? "redeemed" : ""}">
      <div class="shopimg small cat0">${w.emoji}</div>
      <div class="wbody">
        <b>${esc(w.name)}</b>
        <span class="wdate">구매 ${w.bought_at} · 💰 ${won(w.cost)} XP</span>
        ${done ? `<span class="voucher">교환코드 <b>${esc(w.voucher)}</b></span>` : ""}
      </div>
      ${done
        ? `<span class="wstatus">✅ 교환완료</span>`
        : `<button class="wredeem" onclick="UI.redeem(${w.id})">교환하기</button>`}
    </div>`;
  }
  async function renderWallet() {
    let data;
    try { data = await api("wallet"); }
    catch (e) { if (e.status === 401) { renderAuth("login"); return; }
      app().innerHTML = `${header()}<main class="scroll"><p class="repmsg">${esc(e.message)}</p></main>${nav("wallet")}`; return; }
    S.user.xp = data.xp; S.user.spent = data.spent;
    const list = data.items.length
      ? data.items.map(walletCard).join("")
      : `<div class="walletempty"><div class="big-emoji">👛</div>
          <p>아직 담은 보상이 없어요.<br>상점에서 XP로 멋진 보상을 받아보세요!</p>
          <button class="big primary" onclick="UI.go('shop')">상점 구경하기 🎁</button></div>`;
    app().innerHTML = `${header()}
      <main class="scroll">
        <div class="balcard">
          <span class="ballabel">💰 사용 가능 XP</span>
          <b class="balnum">${won(data.spendable)}</b>
          <span class="balsub">보유 보상 ${data.items.length}개</span>
        </div>
        <h2 class="sect">👛 내 지갑</h2>
        <div class="walletlist">${list}</div>
      </main>${nav("wallet")}`;
  }
  function redeem(id) {
    modal(`<div class="big-emoji">🎟️</div><b>이 보상을 교환할까요?</b>
      <p class="hinttxt">교환 코드가 발급돼요.<br>부모님께 코드를 보여드리면 실제 보상으로 받을 수 있어요.</p>`,
      [{ label: "교환하기 🎁", cls: "primary", fn: async (back) => {
          try {
            const res = await api("redeem", { id });
            Sound.play("worldClear");
            closeModal(back);
            modal(`<div class="big-emoji">🎉</div><b>교환 완료!</b>
              <p class="hinttxt">부모님께 아래 코드를 보여주세요.</p>
              <div class="vouchercode">${esc(res.voucher)}</div>`,
              [{ label: "확인", cls: "primary", fn: (b2) => { closeModal(b2); renderWallet(); } }]);
          } catch (e) {
            closeModal(back);
            modal(`<div class="big-emoji">😅</div><b>교환하지 못했어요</b><p class="hinttxt">${esc(e.message)}</p>`,
              [{ label: "확인", cls: "ghost", fn: (b2) => { closeModal(b2); renderWallet(); } }]);
          }
        } },
        { label: "취소", cls: "ghost", fn: (back) => closeModal(back) }]);
  }

  // ---------- 기타 ----------
  async function logout() {
    try { await api("logout", {}); } catch (e) { /* ignore */ }
    S.user = null;
    renderAuth("login");
  }
  function go(id) {
    if (id === "map") renderMap();
    else if (id === "shop") renderShop();
    else if (id === "wallet") renderWallet();
    else if (id === "dash") renderDash();
    else if (id === "report") renderReport();
  }

  // ---------- 전역 노출 & 부팅 ----------
  // 버튼 클릭 사운드 — 자체 사운드가 있는 버튼(.choice, .rock)은 제외
  document.addEventListener('click', (e) => {
    Sound.unlock();
    const btn = e.target.closest('button');
    if (btn && !['choice', 'rock', 'sv', 'rterm'].some((c) => btn.classList.contains(c))) Sound.play('click');
  }, true);

  window.UI = {
    go, auth: renderAuth, submitAuth, stages: renderStages, play,
    finishConcept, logout, buy, redeem, claimQuest,
    arrowNext, sieveNext, sieveTap, gearNext, iceNext, forestNext,
    desertNext, moonNext, rainbowTap, rainbowCombine, castlePick,
    toggleMute: () => Sound.toggleMute(),
  };
  (async function boot() {
    Sound.startBgm('menu');  // 첫 사용자 제스처(클릭) 후 실제 재생 시작
    try { await loadState(); renderMap(); }
    catch (e) { renderAuth("login"); }
  })();
})();
