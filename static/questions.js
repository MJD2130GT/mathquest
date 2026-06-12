/* MathQuest Jr. — 문제 생성기 & 학습 콘텐츠 */
(function () {
  "use strict";

  // ===== 공용 유틸 =====
  const SUPS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const M = "−"; // 수학용 마이너스
  const sup = (n) => String(n).split("").map((c) => SUPS[+c]).join("");
  const rint = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[rint(0, arr.length - 1)];
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rint(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; };
  function isPrime(n) {
    if (n < 2) return false;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
    return true;
  }
  const fmt = (n) => (n < 0 ? M + Math.abs(n) : String(n));        // −7
  const par = (n) => (n < 0 ? `(${M}${Math.abs(n)})` : String(n)); // (−7) / 5

  // 보기 4개 만들기: 정답 + 오답 후보들 → 섞고 정답 인덱스 반환
  function build(text, ans, dists, hint, explain) {
    const ansStr = String(ans);
    const opts = [ansStr];
    for (const d of dists) {
      const s = String(d);
      if (opts.length < 4 && !opts.includes(s)) opts.push(s);
    }
    let off = 1; // 후보가 모자라면 숫자 변형으로 채움
    while (opts.length < 4 && off < 30) {
      const base = parseInt(ansStr, 10);
      const s = String((isNaN(base) ? off : base) + (off % 2 ? off : -off));
      if (!opts.includes(s)) opts.push(s);
      off++;
    }
    shuffle(opts);
    return { text, choices: opts, answer: opts.indexOf(ansStr), hint, explain };
  }
  const numDists = (ans) =>
    shuffle([ans + 1, ans - 1, -ans, ans + 2, ans - 2, ans + 10, ans * 2].filter((x) => x !== ans));

  // ===== 분수 유틸 =====
  function frRed(n, d) {
    if (d < 0) { d = -d; n = -n; }
    const g = gcd(n, d);
    return [n / g, d / g];
  }
  function frStr([n, d]) {
    if (d === 1) return fmt(n);
    return (n < 0 ? M : "") + Math.abs(n) + "/" + d;
  }
  const frVal = ([n, d]) => n / d;
  function frDisp(n, d, after) {
    // 연산자 뒤에 오는 음수 분수는 괄호로
    const s = d === 1 ? fmt(n) : (n < 0 ? M : "") + Math.abs(n) + "/" + d;
    return after && n < 0 ? `(${s})` : s;
  }

  // ===== 단항식/다항식 유틸 =====
  function mono(c, e) {
    // c·x^e 표기
    if (e === 0) return fmt(c);
    const xs = e === 1 ? "x" : "x" + sup(e);
    if (c === 1) return xs;
    if (c === -1) return M + xs;
    return fmt(c) + xs;
  }
  function poly(coeffs) {
    // [a, b] → ax+b / [a, b, c] → ax²+bx+c
    const deg = coeffs.length - 1;
    let out = "";
    coeffs.forEach((c, i) => {
      if (c === 0) return;
      const e = deg - i;
      const term = mono(Math.abs(c) === 1 && e > 0 ? Math.sign(c) : c, e);
      if (out === "") out = term;
      else out += c > 0 ? " + " + term : " " + M + " " + mono(Math.abs(c) === 1 && e > 0 ? 1 : Math.abs(c), e);
    });
    return out === "" ? "0" : out;
  }

  // ===== 월드 메타 =====
  const WORLDS = [
    { id: 1, name: "소수와 합성수의 섬", emoji: "🌊", color: "#38bdf8" },
    { id: 2, name: "소인수분해 화산", emoji: "🔥", color: "#f97316" },
    { id: 3, name: "최대공약수·최소공배수 기어 던전", emoji: "⚙️", color: "#94a3b8" },
    { id: 4, name: "정수의 덧셈·뺄셈 얼음 성", emoji: "❄️", color: "#67e8f9" },
    { id: 5, name: "정수의 곱셈·나눗셈 번개 탑", emoji: "⚡", color: "#facc15" },
    { id: 6, name: "유리수의 사칙연산 숲", emoji: "🌿", color: "#4ade80" },
    { id: 7, name: "거듭제곱 & 지수 사막", emoji: "🏜️", color: "#fbbf24" },
    { id: 8, name: "단항식의 연산 달 기지", emoji: "🌙", color: "#c4b5fd" },
    { id: 9, name: "다항식의 덧셈·뺄셈 무지개 다리", emoji: "🌈", color: "#f472b6" },
    { id: 10, name: "연산 통합 보스 성", emoji: "🏆", color: "#fb7185" },
  ];
  const STAGES = [
    { name: "개념 탐구", icon: "📖" },
    { name: "기초 배틀", icon: "⚔️" },
    { name: "응용 배틀", icon: "🛡️" },
    { name: "개념 퀴즈", icon: "🧠" },
    { name: "보스 배틀", icon: "👑" },
  ];

  // ===== 문제 생성기 (월드별, d = 난이도 1~3) =====
  const GENS = {};

  // World 1: 소수와 합성수
  GENS[1] = function (d) {
    const max = [0, 30, 60, 100][d];
    const t = rint(1, d >= 2 ? 3 : 2);
    if (t === 1) {
      let p; do { p = rint(2, max); } while (!isPrime(p));
      const comps = [];
      let guard = 0;
      while (comps.length < 3 && guard++ < 200) {
        const c = rint(4, max);
        if (!isPrime(c) && !comps.includes(c)) comps.push(c);
      }
      return build("다음 중 소수는 어느 것일까?", p, comps,
        "소수는 약수가 1과 자기 자신, 딱 2개뿐인 수야. 2, 3, 5, 7로 나눠지는지 확인해 봐!",
        `${p}의 약수는 1과 ${p}뿐이야. 그래서 소수!`);
    }
    if (t === 2) {
      const n = rint(2, max);
      const ans = isPrime(n) ? "소수" : "합성수";
      let why;
      if (isPrime(n)) why = `${n}의 약수는 1과 ${n}뿐이야.`;
      else { let f = 2; while (n % f) f++; why = `${n} = ${f} × ${n / f} 처럼 더 쪼갤 수 있어.`; }
      return build(`${n}은(는) 소수일까, 합성수일까?`, ans,
        ["소수", "합성수", "둘 다 아니다", "알 수 없다"].filter((x) => x !== ans),
        "1과 자기 자신 말고 다른 약수가 있는지 찾아봐. 있으면 합성수!", why);
    }
    let n; do { n = rint(4, max); } while (isPrime(n));
    let f = 2; while (n % f) f++;
    return build(`${n}의 가장 작은 소인수는?`, f,
      [2, 3, 5, 7, f + 1].filter((x) => x !== f),
      "가장 작은 소수 2부터 차례로 나눠 봐. 처음으로 나누어떨어지는 소수가 정답!",
      `${n} ÷ ${f} = ${n / f} → 가장 작은 소인수는 ${f}`);
  };

  // World 2: 소인수분해
  GENS[2] = function (d) {
    const primes = d < 3 ? [2, 3, 5] : [2, 3, 5, 7];
    function makeFac() {
      const k = d === 1 ? 2 : rint(2, 3);
      const ps = shuffle(primes.slice()).slice(0, k).sort((a, b) => a - b);
      const f = {};
      ps.forEach((p) => { f[p] = 1; });
      let sum = ps.length;
      const target = d + rint(1, 2);
      while (sum < target) { f[pick(ps)]++; sum++; }
      return f;
    }
    const val = (f) => Object.keys(f).reduce((v, p) => v * Math.pow(+p, f[p]), 1);
    const fstr = (f) => Object.keys(f).map(Number).sort((a, b) => a - b)
      .map((p) => (f[p] === 1 ? String(p) : p + sup(f[p]))).join("×");

    let f = makeFac(), guard = 0;
    while (val(f) > 400 && guard++ < 50) f = makeFac();
    const n = val(f);

    if (rint(0, 1) === 0) {
      // 분해형
      const dists = [];
      const t1 = { ...f }; t1[pick(Object.keys(t1))]++; dists.push(fstr(t1));
      const t2 = { ...f };
      const big = Object.keys(t2).find((p) => t2[p] >= 2);
      if (big) { t2[big]--; dists.push(fstr(t2)); }
      const t3 = { ...f };
      const missing = primes.find((p) => !(p in t3));
      if (missing) { const t = { ...t3 }; t[missing] = 1; dists.push(fstr(t)); }
      const t4 = { ...f }; t4[pick(Object.keys(t4))] += 2; dists.push(fstr(t4));
      return build(`${n}을(를) 소인수분해하면?`, fstr(f), dists,
        "가장 작은 소수 2부터 차례로 나눠 봐. 더 이상 나눠지지 않을 때까지!",
        `${n} = ${fstr(f)}`);
    }
    // 계산형
    return build(`${fstr(f)} 은(는) 얼마일까?`, n, numDists(n),
      "거듭제곱을 먼저 계산한 다음 서로 곱해 봐!",
      `${fstr(f)} = ${n}`);
  };

  // World 3: 최대공약수·최소공배수
  GENS[3] = function (d) {
    const g = rint(2, [0, 4, 8, 12][d]);
    let m = rint(2, 4 + d), n;
    let guard = 0;
    do { n = rint(2, 4 + d); } while ((gcd(m, n) !== 1 || n === m) && guard++ < 100);
    if (gcd(m, n) !== 1 || n === m) { m = 2; n = 3; }
    const a = g * m, b = g * n;
    if (rint(0, 1) === 0) {
      return build(`${a}와 ${b}의 최대공약수는?`, g,
        [g * m * n, g * 2, Math.min(a, b), g + 1].filter((x) => x !== g),
        "두 수를 모두 나누어떨어뜨리는 가장 큰 수를 찾는 거야. 소인수분해해서 공통 부분만 곱해 봐!",
        `${a} = ${g}×${m}, ${b} = ${g}×${n} → 공통 부분은 ${g}`);
    }
    const l = g * m * n;
    return build(`${a}와 ${b}의 최소공배수는?`, l,
      [g, a * b, g * m, g * n].filter((x) => x !== l),
      "두 수의 공통 배수 중 가장 작은 수! 최대공약수 × 남은 수들을 곱하면 돼.",
      `최소공배수 = ${g} × ${m} × ${n} = ${l}`);
  };

  // World 4: 정수의 덧셈·뺄셈
  GENS[4] = function (d) {
    const r = [0, 10, 20, 50][d];
    let a = rint(-r, r), b = rint(-r, r);
    if (a === 0) a = 1;
    if (b === 0) b = -2;
    if (d === 1 && a > 0 && b > 0) b = -b; // 1단계에도 음수는 등장
    const isAdd = d === 1 ? true : rint(0, 1) === 0;
    if (isAdd) {
      const ans = a + b;
      return build(`${par(a)} + ${par(b)} = ?`, ans,
        [a - b, -(a + b), Math.abs(a) + Math.abs(b), ans + 1].filter((x) => x !== ans),
        "수직선을 떠올려 봐! 양수는 오른쪽 ➡️, 음수는 왼쪽 ⬅️ 으로 움직이는 거야.",
        `${par(a)}에서 ${b > 0 ? "오른쪽" : "왼쪽"}으로 ${Math.abs(b)}칸 → ${fmt(ans)}`);
    }
    const ans = a - b;
    return build(`${par(a)} ${M} ${par(b)} = ?`, ans,
      [a + b, -(a - b), b - a, ans - 1].filter((x) => x !== ans),
      "빼기는 '반대 부호를 더하기'로 바꿀 수 있어! a − (−b) = a + b",
      `${par(a)} ${M} ${par(b)} = ${par(a)} + ${par(-b)} = ${fmt(ans)}`);
  };

  // World 5: 정수의 곱셈·나눗셈
  GENS[5] = function (d) {
    const t = d === 1 ? rint(1, 2) : rint(1, 3);
    const rmax = [0, 6, 9, 12][d];
    const sgn = () => (rint(0, 1) ? 1 : -1);
    if (t === 1) {
      const a = rint(2, rmax) * sgn(), b = rint(2, rmax) * sgn();
      const ans = a * b;
      return build(`${par(a)} × ${par(b)} = ?`, ans,
        [-ans, Math.abs(ans), a * b + a, ans + 2].filter((x) => x !== ans),
        "부호 먼저! 같은 부호끼리 곱하면 +, 다른 부호끼리 곱하면 −. 음수 곱하기는 방향 뒤집기야!",
        `부호: ${a < 0 === b < 0 ? "(같은 부호) → +" : "(다른 부호) → −"}, 크기: ${Math.abs(a)}×${Math.abs(b)}=${Math.abs(ans)}`);
    }
    if (t === 2) {
      const b = rint(2, rmax) * sgn(), q = rint(2, rmax) * sgn();
      const a = b * q;
      return build(`${par(a)} ÷ ${par(b)} = ?`, q,
        [-q, a * b, q + 1, Math.abs(q)].filter((x) => x !== q),
        "나눗셈도 부호 규칙은 곱셈과 똑같아. 같은 부호 → +, 다른 부호 → −",
        `크기: ${Math.abs(a)}÷${Math.abs(b)}=${Math.abs(q)}, 부호: ${a < 0 === b < 0 ? "+" : M}`);
    }
    const a = rint(2, 4) * sgn(), b = rint(2, 4) * sgn(), c = rint(2, 3) * sgn();
    const ans = a * b * c;
    return build(`${par(a)} × ${par(b)} × ${par(c)} = ?`, ans,
      [-ans, ans + a, Math.abs(ans)].filter((x) => x !== ans),
      "음수가 몇 개인지 세어 봐! 홀수 개면 −, 짝수 개면 + 야.",
      `음수가 ${[a, b, c].filter((x) => x < 0).length}개 → 부호는 ${ans >= 0 ? "+" : M}`);
  };

  // World 6: 유리수의 사칙연산
  GENS[6] = function (d) {
    const neg = d >= 2;
    const den = () => rint(2, d === 1 ? 6 : 9);
    const s = () => (neg && rint(0, 2) === 0 ? -1 : 1);
    const d1 = den(), d2 = den();
    const n1 = rint(1, d1 + (d >= 2 ? 3 : 0)) * s();
    const n2 = rint(1, d2 + (d >= 2 ? 3 : 0)) * s();
    const op = d === 1 ? pick(["+", "-"]) : pick(["+", "-", "×", "÷"]);
    let ans;
    if (op === "+") ans = frRed(n1 * d2 + n2 * d1, d1 * d2);
    else if (op === "-") ans = frRed(n1 * d2 - n2 * d1, d1 * d2);
    else if (op === "×") ans = frRed(n1 * n2, d1 * d2);
    else ans = frRed(n1 * d2, d1 * n2);

    const cands = [
      frRed(n1 + n2, d1 + d2),                 // 분모끼리 더하는 실수
      frRed(ans[0] + 1, ans[1]),
      frRed(ans[0] - 1, ans[1]),
      frRed(-ans[0], ans[1]),
      frRed(ans[0], ans[1] + 1),
    ];
    const dists = [];
    for (const c of cands) {
      if (Math.abs(frVal(c) - frVal(ans)) > 1e-9 && !dists.some((x) => x === frStr(c))) dists.push(frStr(c));
    }
    const opName = { "+": "더하기", "-": "빼기", "×": "곱하기", "÷": "나누기" }[op];
    const hint = op === "÷"
      ? "나눗셈은 나누는 수를 '역수'로 뒤집어서 곱하면 돼!"
      : op === "×"
        ? "분자끼리 곱하고, 분모끼리 곱한 다음 약분!"
        : "분모가 다르면 먼저 통분(분모 맞추기)! 그다음 분자끼리 계산해.";
    const text = `${frDisp(n1, d1, false)} ${op === "-" ? M : op} ${frDisp(n2, d2, true)} = ?`;
    return build(text, frStr(ans), dists, hint,
      `${opName} 결과를 약분하면 ${frStr(ans)}`);
  };

  // World 7: 거듭제곱과 지수
  GENS[7] = function (d) {
    const t = d === 1 ? 1 : d === 2 ? rint(1, 2) : rint(1, 4);
    if (t === 1) {
      const a = pick([2, 3, 4, 5]);
      const maxN = a === 2 ? 4 + (d >= 2 ? 2 : 0) : a === 3 ? 4 : 3;
      const n = rint(2, maxN);
      const ans = Math.pow(a, n);
      return build(`${a}${sup(n)} 은 얼마일까?`, ans,
        [a * n, Math.pow(a, n - 1), Math.pow(a, n + 1), ans + a].filter((x) => x !== ans),
        `${a}${sup(n)}은 ${a}를 ${n}번 곱하라는 뜻이야. ${a}×${a}×… 차근차근!`,
        `${a}를 ${n}번 곱하면 ${ans}`);
    }
    const a = pick([2, 3, 5]);
    if (t === 2) {
      const m = rint(2, 4), n = rint(2, 4);
      const ans = `${a}${sup(m + n)}`;
      return build(`${a}${sup(m)} × ${a}${sup(n)} = ?`, ans,
        [`${a}${sup(m * n)}`, `${a}${sup(m + n + 1)}`, `${a * a}${sup(m + n)}`],
        "같은 수의 거듭제곱을 곱할 때는 지수끼리 더하면 돼! aᵐ × aⁿ = aᵐ⁺ⁿ",
        `지수: ${m} + ${n} = ${m + n} → ${ans}`);
    }
    if (t === 3) {
      const m = rint(2, 3), n = rint(2, 3);
      const ans = `${a}${sup(m * n)}`;
      return build(`(${a}${sup(m)})${sup(n)} = ?`, ans,
        [`${a}${sup(m + n)}`, `${a}${sup(m * n + 1)}`, `${a}${sup(Math.abs(m - n) || 5)}`],
        "거듭제곱의 거듭제곱은 지수끼리 곱하기! (aᵐ)ⁿ = aᵐⁿ",
        `지수: ${m} × ${n} = ${m * n} → ${ans}`);
    }
    const n2 = rint(2, 3), m2 = n2 + rint(1, 3);
    const ans = `${a}${sup(m2 - n2)}`;
    return build(`${a}${sup(m2)} ÷ ${a}${sup(n2)} = ?`, ans,
      [`${a}${sup(m2 + n2)}`, `${a}${sup(Math.floor(m2 / n2))}`, `${a}${sup(m2 - n2 + 1)}`],
      "같은 수의 거듭제곱을 나눌 때는 지수끼리 빼면 돼! aᵐ ÷ aⁿ = aᵐ⁻ⁿ",
      `지수: ${m2} ${M} ${n2} = ${m2 - n2} → ${ans}`);
  };

  // World 8: 단항식의 연산
  GENS[8] = function (d) {
    const t = d === 1 ? 1 : rint(1, 3);
    if (t === 1) {
      const a = rint(2, 5), b = rint(2, 5);
      const m = rint(1, d + 1), n = rint(1, 2);
      const ans = mono(a * b, m + n);
      return build(`${mono(a, m)} × ${mono(b, n)} = ?`, ans,
        [mono(a * b, m * n === m + n ? m + n + 1 : m * n), mono(a + b, m + n), mono(a * b, m + n + 1)],
        "계수는 계수끼리 곱하고, 문자는 지수끼리 더해! (3x² × 4x = 12x³)",
        `계수: ${a}×${b}=${a * b}, 지수: ${m}+${n}=${m + n} → ${ans}`);
    }
    if (t === 2) {
      const b = rint(2, 4), k = rint(2, 5);
      const a = b * k;
      const n = rint(1, 2), m = n + rint(1, 2);
      const ans = mono(k, m - n);
      return build(`${mono(a, m)} ÷ ${mono(b, n)} = ?`, ans,
        [mono(k, m + n), mono(a - b, m - n), mono(k, m - n + 1)],
        "계수는 계수끼리 나누고, 문자는 지수끼리 빼! (8x⁵ ÷ 2x² = 4x³)",
        `계수: ${a}÷${b}=${k}, 지수: ${m}${M}${n}=${m - n} → ${ans}`);
    }
    const a = rint(2, 3), m = rint(1, 2), n = rint(2, 3);
    const ans = mono(Math.pow(a, n), m * n);
    return build(`(${mono(a, m)})${sup(n)} = ?`, ans,
      [mono(a * n, m * n), mono(Math.pow(a, n), m + n), mono(Math.pow(a, n), m * n + 1)],
      "괄호의 거듭제곱은 안의 모든 것에! 계수도 거듭제곱, 지수는 곱하기.",
      `계수: ${a}${sup(n)}=${Math.pow(a, n)}, 지수: ${m}×${n}=${m * n} → ${ans}`);
  };

  // World 9: 다항식의 덧셈·뺄셈
  GENS[9] = function (d) {
    const nz = (r) => { let v = 0; while (v === 0) v = rint(-r, r); return v; };
    if (d < 3) {
      let a, b, c, e, isAdd, res;
      let guard = 0;
      do {
        a = nz(5); c = nz(5); b = nz(9); e = nz(9);
        isAdd = rint(0, 1) === 0;
        res = isAdd ? [a + c, b + e] : [a - c, b - e];
      } while (res[0] === 0 && res[1] === 0 && guard++ < 50);
      const ans = poly(res);
      const wrong1 = poly(isAdd ? [a + c, b - e] : [a - c, b + e]); // 상수항 부호 실수
      const wrong2 = poly(isAdd ? [a - c, b + e] : [a + c, b - e]); // x항 부호 실수
      const wrong3 = poly([res[0] + 1, res[1]]);
      return build(
        `(${poly([a, b])}) ${isAdd ? "+" : M} (${poly([c, e])}) = ?`,
        ans, [wrong1, wrong2, wrong3],
        isAdd ? "동류항끼리 모아 봐! x항은 x항끼리, 상수항은 상수항끼리."
          : "빼기 괄호를 풀 때는 안의 모든 부호가 반대로 바뀌어! −(2x−3) = −2x+3",
        `x항: ${fmt(a)}${isAdd ? "+" : M}${par(c)}=${fmt(res[0])}, 상수항: ${fmt(b)}${isAdd ? "+" : M}${par(e)}=${fmt(res[1])}`);
    }
    let p, q, isAdd, res;
    let guard = 0;
    do {
      p = [nz(3), nz(5), nz(7)];
      q = [nz(3), nz(5), nz(7)];
      isAdd = rint(0, 1) === 0;
      res = p.map((v, i) => (isAdd ? v + q[i] : v - q[i]));
    } while (res.every((v) => v === 0) && guard++ < 50);
    const ans = poly(res);
    const w1 = poly(res.map((v, i) => (i === 2 ? (isAdd ? p[2] - q[2] : p[2] + q[2]) : v)));
    const w2 = poly(res.map((v, i) => (i === 1 ? (isAdd ? p[1] - q[1] : p[1] + q[1]) : v)));
    const w3 = poly([res[0], res[1], res[2] + 1]);
    return build(
      `(${poly(p)}) ${isAdd ? "+" : M} (${poly(q)}) = ?`,
      ans, [w1, w2, w3],
      "차수가 같은 항끼리만 계산! 빼기라면 뒤 괄호의 모든 부호를 먼저 뒤집어.",
      `결과: ${ans}`);
  };

  function gen(world, d) {
    d = Math.max(1, Math.min(3, d));
    const w = world === 10 ? rint(1, 9) : world;
    const q = GENS[w](d);
    q.world = w;
    return q;
  }

  // ===== 개념 퀴즈 풀 (Stage 4 — "왜 그렇게 될까?") =====
  const QUIZ = {
    1: [
      { text: "1이 소수가 아닌 이유는 뭘까?", ans: "약수가 1개뿐이어서 (소수는 약수가 2개)", dists: ["가장 작은 수여서", "홀수가 아니어서", "합성수여서"], explain: "소수는 약수가 정확히 2개! 1은 약수가 자기 자신 하나뿐이야." },
      { text: "약수가 정확히 2개인 자연수를 뭐라고 할까?", ans: "소수", dists: ["합성수", "배수", "거듭제곱"], explain: "1과 자기 자신만 약수로 가지면 소수!" },
      { text: "다음 중 옳은 설명은?", ans: "2는 유일한 짝수 소수다", dists: ["모든 홀수는 소수다", "소수는 모두 홀수다", "9는 소수다"], explain: "2보다 큰 짝수는 모두 2로 나눠지니까 합성수. 2만 특별해!" },
      { text: "합성수란 어떤 수일까?", ans: "약수가 3개 이상인 자연수", dists: ["약수가 2개인 자연수", "2로 나눠지는 수", "10보다 큰 수"], explain: "1과 자기 자신 말고도 약수가 더 있으면 합성수!" },
    ],
    2: [
      { text: "소인수분해란 무엇일까?", ans: "자연수를 소수들만의 곱으로 나타내는 것", dists: ["자연수를 두 수의 곱으로 나누는 것", "가장 큰 약수를 찾는 것", "수를 반으로 쪼개는 것"], explain: "더 이상 쪼개지지 않는 소수들의 곱으로 표현하는 게 소인수분해!" },
      { text: "소인수분해 결과가 2² × 3² 인 수는?", ans: "36", dists: ["12", "24", "72"], explain: "4 × 9 = 36" },
      { text: "다음 중 소인수분해가 '끝난' 모습은?", ans: "2 × 3 × 7", dists: ["4 × 9", "6 × 6", "2 × 18"], explain: "4, 9, 6, 18은 아직 더 쪼갤 수 있는 합성수야!" },
    ],
    3: [
      { text: "최대공약수가 1인 두 수를 뭐라고 할까?", ans: "서로소", dists: ["공배수", "소인수", "합성수"], explain: "공통 약수가 1뿐이면 '서로소'!" },
      { text: "12와 18의 공약수가 아닌 것은?", ans: "4", dists: ["1", "2", "6"], explain: "12와 18의 공약수는 1, 2, 3, 6. 4는 18을 못 나눠!" },
      { text: "두 수의 곱 = 최대공약수 × □ 일 때 □는?", ans: "최소공배수", dists: ["두 수의 합", "최대공약수", "서로소"], explain: "a × b = GCD × LCM. 정말 유용한 성질이야!" },
    ],
    4: [
      { text: "(−5) + (−3)의 부호가 −인 이유는?", ans: "둘 다 왼쪽(−) 방향으로 움직여서", dists: ["음수가 더 커서", "뺄셈이기 때문에", "절댓값이 작아서"], explain: "수직선에서 왼쪽으로 5칸, 또 왼쪽으로 3칸 → 왼쪽으로 8칸!" },
      { text: "5 − 8을 수직선으로 생각하면?", ans: "5에서 왼쪽으로 8칸 이동", dists: ["5에서 오른쪽으로 8칸 이동", "8에서 왼쪽으로 5칸 이동", "0에서 오른쪽으로 3칸 이동"], explain: "빼기는 왼쪽 이동! 5에서 왼쪽으로 8칸 가면 −3." },
      { text: "절댓값이란 무엇일까?", ans: "수직선에서 0까지의 거리", dists: ["수의 부호", "가장 큰 약수", "반대 부호의 수"], explain: "거리니까 항상 0 이상! |−7| = 7" },
      { text: "a − (−b)와 같은 것은?", ans: "a + b", dists: ["a − b", "−a + b", "−a − b"], explain: "음수를 빼는 것 = 양수를 더하는 것!" },
    ],
    5: [
      { text: "(−) × (−)가 +인 이유로 가장 알맞은 것은?", ans: "방향이 두 번 뒤집혀 원래 방향이 되어서", dists: ["음수는 곱하면 사라져서", "큰 수가 이기기 때문에", "약속이라 이유가 없어서"], explain: "×(−1)은 방향 뒤집기! 두 번 뒤집으면 처음 방향(+)으로 돌아와." },
      { text: "음수를 '홀수 번' 곱하면 부호는?", ans: "−", dists: ["+", "0", "알 수 없다"], explain: "뒤집기를 홀수 번 하면 반대 방향(−)에서 끝나!" },
      { text: "(−12) ÷ (−3)의 부호가 +인 이유는?", ans: "같은 부호끼리의 나눗셈이라서", dists: ["나눗셈은 항상 +라서", "12가 3보다 커서", "음수는 나눌 수 없어서"], explain: "나눗셈도 곱셈과 같은 부호 규칙! 같은 부호 → +" },
    ],
    6: [
      { text: "분수의 나눗셈은 어떻게 계산할까?", ans: "나누는 수의 역수를 곱한다", dists: ["분모끼리 나눈다", "분자끼리 더한다", "통분해서 뺀다"], explain: "÷(2/3) = ×(3/2). 역수로 뒤집어 곱하기!" },
      { text: "통분이란 무엇일까?", ans: "분모를 같게 만드는 것", dists: ["분자를 같게 만드는 것", "분수를 소수로 바꾸는 것", "약분의 반대말"], explain: "분모가 같아야 분자끼리 더하고 뺄 수 있어!" },
      { text: "−3/4의 역수는?", ans: "−4/3", dists: ["4/3", "3/4", "−3/4"], explain: "역수는 분자·분모 뒤집기. 부호는 그대로! (−3/4)×(−4/3)=1" },
    ],
    7: [
      { text: "2⁵에서 5를 뭐라고 부를까?", ans: "지수", dists: ["밑", "계수", "차수"], explain: "아래 큰 수(2)가 '밑', 위 작은 수(5)가 '지수'!" },
      { text: "같은 수의 거듭제곱을 곱하면 지수는?", ans: "서로 더한다", dists: ["서로 곱한다", "서로 뺀다", "그대로 둔다"], explain: "2³×2⁴ = (2×2×2)×(2×2×2×2) = 2⁷. 3+4=7!" },
      { text: "(aᵐ)ⁿ 의 지수는?", ans: "m × n", dists: ["m + n", "m − n", "mⁿ"], explain: "aᵐ을 n번 곱하니까 m이 n번 더해져서 m×n!" },
    ],
    8: [
      { text: "단항식 −3x²의 계수는?", ans: "−3", dists: ["3", "2", "x²"], explain: "문자 앞에 곱해진 수가 계수. 부호까지 포함해서 −3!" },
      { text: "x² × x³ = x⁵ 인 이유는?", ans: "x를 모두 5번 곱한 것이라서", dists: ["2×3=6이 아니라서", "x가 2개라서", "지수는 항상 더해야 한다는 법칙 때문(이유 없음)"], explain: "(x·x)×(x·x·x) → x가 총 5번!" },
      { text: "6x⁴ ÷ 2x² 의 결과는?", ans: "3x²", dists: ["3x⁶", "4x²", "12x²"], explain: "계수 6÷2=3, 지수 4−2=2 → 3x²" },
    ],
    9: [
      { text: "동류항이란?", ans: "문자와 차수가 같은 항", dists: ["계수가 같은 항", "부호가 같은 항", "숫자만 있는 항"], explain: "3x와 −5x는 동류항! 3x와 3x²는 차수가 달라서 아니야." },
      { text: "다음 중 3x와 동류항인 것은?", ans: "−5x", dists: ["3x²", "3y", "3"], explain: "문자 x, 차수 1로 똑같은 건 −5x뿐!" },
      { text: "−(2x − 5)를 괄호 풀면?", ans: "−2x + 5", dists: ["−2x − 5", "2x − 5", "2x + 5"], explain: "− 괄호를 풀면 안의 부호가 전부 반대로!" },
    ],
  };
  QUIZ[10] = [].concat(...Object.keys(QUIZ).filter((k) => +k <= 9).map((k) => QUIZ[k]));

  function quizFor(world, count) {
    const pool = shuffle((QUIZ[world] || []).slice());
    const out = pool.slice(0, Math.min(pool.length, Math.ceil(count / 2)))
      .map((q) => build(q.text, q.ans, q.dists, "차분히 개념을 떠올려 봐!", q.explain));
    while (out.length < count) out.push(gen(world, 2));
    return shuffle(out);
  }

  // ===== 개념 탐구 씬 (Stage 1) =====
  const SCENES = {
    1: [
      { t: "수의 원자, 소수", b: "모든 자연수는 더 작은 수들의 곱으로 쪼갤 수 있어.<div class='viz'>12 = 3 × 4 = 3 × 2 × 2</div>그런데… 더 이상 쪼개지지 않는 수가 있어!<div class='viz'>2, 3, 5, 7, 11, 13 …</div>이 수들이 바로 <b>소수</b> — 수의 세계의 '원자'야. ⚛️" },
      { t: "약수의 개수로 구분하기", b: "<div class='viz'>7의 약수: 1, 7 → 2개 → <b>소수</b> ✅<br>12의 약수: 1, 2, 3, 4, 6, 12 → <b>합성수</b></div>그럼 1은? 약수가 <b>1개</b>뿐이라 소수도 합성수도 아니야! 🙅" },
      { t: "체로 걸러내기", b: "고대 수학자 에라토스테네스의 방법! 🏺<div class='viz'>2 3 <s>4</s> 5 <s>6</s> 7 <s>8</s> <s>9</s> <s>10</s> 11 <s>12</s> 13</div>2의 배수, 3의 배수…를 차례로 지우면 <b>소수만 남아</b>. 이제 섬을 탐험하며 소수를 찾아보자!" },
    ],
    2: [
      { t: "돌덩이를 쪼개자", b: "화산의 용암 돌덩이(합성수)를 두드리면 더 작은 조각으로 갈라져! 🪨🔨<div class='viz'>72 → 8 × 9 → (2×2×2) × (3×3)</div>더 이상 안 쪼개지는 조각 = <b>소수</b>!" },
      { t: "소인수분해", b: "자연수를 <b>소수들만의 곱</b>으로 나타내는 것이 소인수분해야.<div class='viz'>72 = 2 × 2 × 2 × 3 × 3</div>어떤 순서로 쪼개도 결과는 항상 똑같아. 신기하지? ✨" },
      { t: "거듭제곱으로 깔끔하게", b: "같은 소수가 여러 번 나오면 거듭제곱으로 모아 써!<div class='viz'>72 = 2³ × 3²</div>가장 작은 소수 2부터 차례로 나누는 게 요령이야. 🔥" },
    ],
    3: [
      { t: "톱니바퀴가 맞물리려면", b: "두 톱니바퀴가 함께 도는 던전! ⚙️⚙️<div class='viz'>12의 약수: 1 2 3 4 <b>6</b> 12<br>18의 약수: 1 2 3 <b>6</b> 9 18</div>공통 약수 중 가장 큰 <b>6</b>이 <b>최대공약수(GCD)</b>!" },
      { t: "다시 만나는 순간", b: "두 바퀴가 동시에 출발점에 돌아오는 때는 언제일까?<div class='viz'>12의 배수: 12 24 <b>36</b> 48…<br>18의 배수: 18 <b>36</b> 54…</div>처음으로 같아지는 <b>36</b>이 <b>최소공배수(LCM)</b>!" },
      { t: "소인수분해로 한 번에", b: "<div class='viz'>12 = 2² × 3<br>18 = 2 × 3²</div>GCD = 공통 부분만 → 2 × 3 = 6<br>LCM = 전부 합쳐서 → 2² × 3² = 36<br>이게 기어 던전의 비밀 열쇠야! 🗝️" },
    ],
    4: [
      { t: "수직선 위의 얼음 길", b: "얼음 성의 복도는 수직선이야! 🧊<div class='viz'>⬅️ −3 −2 −1 0 +1 +2 +3 ➡️</div>양수는 <b>오른쪽</b>, 음수는 <b>왼쪽</b>. 더하기는 그 방향으로 미끄러지는 것!" },
      { t: "같은 부호끼리 더하기", b: "<div class='viz'>(−2) + (−3) → ⬅️⬅️ 그리고 ⬅️⬅️⬅️ → −5</div>같은 방향으로 두 번 미끄러지니까, 거리는 더해지고 방향(부호)은 그대로!" },
      { t: "빼기는 반대로 더하기", b: "빼기가 어렵다면 이렇게 바꿔 봐!<div class='viz'>5 − (−3) = 5 + (+3) = 8</div>음수를 빼는 건 <b>양수를 더하는 것</b>과 같아. 부호를 뒤집고 더하면 끝! ❄️" },
    ],
    5: [
      { t: "화살표의 방향", b: "번개 탑의 마법: 수는 화살표야! ⚡<div class='viz'>+3 = ➡️➡️➡️ &nbsp;&nbsp; −3 = ⬅️⬅️⬅️</div>양수는 오른쪽, 음수는 왼쪽을 향해." },
      { t: "음수를 곱하면 = 뒤집기", b: "<b>×(−1)</b>은 화살표를 통째로 뒤집는 마법!<div class='viz'>(+3) × (−1) → ➡️➡️➡️가 ⬅️⬅️⬅️로!</div>그래서 (+) × (−) = (−) 가 되는 거야." },
      { t: "두 번 뒤집으면 제자리", b: "<div class='viz'>(−3) × (−2)<br>⬅️⬅️⬅️ 를 뒤집고 2배 → ➡️➡️➡️➡️➡️➡️ = +6</div>방향이 <b>두 번</b> 뒤집히면 원래 방향! 그래서 <b>(−)×(−) = (+)</b>. 외우지 않아도 이제 알겠지? 😎 나눗셈도 부호 규칙은 똑같아!" },
    ],
    6: [
      { t: "유리수란?", b: "숲의 모든 수는 분수 모양으로 나타낼 수 있어! 🌿<div class='viz'>0.5 = 1/2 &nbsp;&nbsp; −3 = −3/1 &nbsp;&nbsp; 2/7</div>이런 수들을 <b>유리수</b>라고 해. (분모 ≠ 0!)" },
      { t: "통분 — 단위 맞추기", b: "1/2 + 1/3은 바로 못 더해. 조각 크기가 다르거든! 🍕<div class='viz'>1/2 = 3/6, &nbsp; 1/3 = 2/6<br>3/6 + 2/6 = 5/6</div>분모를 같게 만드는 <b>통분</b>이 먼저야." },
      { t: "나눗셈은 역수 곱하기", b: "<div class='viz'>2/3 ÷ 4/5 = 2/3 × 5/4 = 10/12 = 5/6</div>나누는 수를 <b>뒤집어서(역수)</b> 곱하면 돼. 부호 규칙은 정수와 똑같아! 🌳" },
    ],
    7: [
      { t: "사막의 모래알 세기", b: "2를 10번 곱하면? 2×2×2×… 너무 길어! 🏜️<div class='viz'>2×2×2×2×2×2×2×2×2×2 = 2¹⁰</div>같은 수를 거듭 곱하는 것을 <b>거듭제곱</b>으로 짧게 써. 아래는 <b>밑</b>, 위는 <b>지수</b>!" },
      { t: "곱하면 지수는 더하기", b: "<div class='viz'>2³ × 2⁴ = (2·2·2) × (2·2·2·2) = 2⁷</div>2가 모두 3+4 = 7번! 그래서 <b>aᵐ × aⁿ = aᵐ⁺ⁿ</b>" },
      { t: "거듭제곱의 거듭제곱", b: "<div class='viz'>(2³)² = 2³ × 2³ = 2⁶</div>3이 2번 더해지니 3×2! <b>(aᵐ)ⁿ = aᵐⁿ</b><br>나눌 때는 지수를 빼: <b>aᵐ ÷ aⁿ = aᵐ⁻ⁿ</b> 🐪" },
    ],
    8: [
      { t: "달 기지의 부품", b: "단항식은 수와 문자의 곱으로 된 한 덩어리 부품이야! 🌙<div class='viz'>3x² → 계수 3, 문자 x, 차수 2</div>계수·문자·차수만 알면 조립 준비 끝!" },
      { t: "곱셈 — 끼리끼리", b: "<div class='viz'>3x² × 4x = (3×4) × (x²×x) = 12x³</div><b>계수는 계수끼리 곱하고</b>, 문자는 <b>지수를 더해</b>. 지수 법칙이 그대로 쓰여!" },
      { t: "나눗셈과 거듭제곱", b: "<div class='viz'>8x⁵ ÷ 2x² = 4x³<br>(2x²)³ = 2³ × x⁶ = 8x⁶</div>나눌 땐 계수는 나누고 지수는 빼기. 괄호의 거듭제곱은 <b>안의 모든 것</b>에 적용! 🚀" },
    ],
    9: [
      { t: "무지개 다리의 조각", b: "다항식은 단항식(항)들이 +,−로 이어진 것! 🌈<div class='viz'>3x² + 2x − 5 → 항 3개</div>그중 <b>문자와 차수가 같은 항</b>을 <b>동류항</b>이라고 해." },
      { t: "동류항끼리만 더한다", b: "사과는 사과끼리, 바나나는 바나나끼리! 🍎🍌<div class='viz'>(3x + 2) + (x − 5)<br>= (3x + x) + (2 − 5) = 4x − 3</div>x항은 x항끼리, 상수항은 상수항끼리!" },
      { t: "빼기 괄호 조심!", b: "− 괄호를 풀면 안의 <b>모든 부호가 반대</b>로!<div class='viz'>(3x + 2) − (x − 5)<br>= 3x + 2 − x <b>+ 5</b> = 2x + 7</div>−5가 +5로 바뀌는 것, 놓치지 마! 이게 다리를 무사히 건너는 비결이야. ✨" },
    ],
    10: [
      { t: "최후의 성 앞에서", b: "드디어 마지막 성! 🏰 지금까지 모은 힘을 정리해 보자.<div class='viz'>① 소수 = 약수 2개 &nbsp; ② 소인수분해 = 소수의 곱<br>③ GCD 공통만 · LCM 전부</div>" },
      { t: "부호의 법칙", b: "<div class='viz'>④ 덧셈: 수직선 이동 ⬅️➡️<br>⑤ 곱셈·나눗셈: (−)가 짝수 개면 +, 홀수 개면 −<br>⑥ 분수 나눗셈 = 역수 곱하기</div>" },
      { t: "문자와 지수", b: "<div class='viz'>⑦ aᵐ×aⁿ=aᵐ⁺ⁿ, (aᵐ)ⁿ=aᵐⁿ<br>⑧ 단항식: 계수끼리·지수끼리<br>⑨ 다항식: 동류항끼리, −괄호는 부호 반전!</div>모든 월드의 보스가 한꺼번에 덤벼들 거야. 행운을 빌어! 👑" },
    ],
  };

  window.MQ = { WORLDS, STAGES, gen, quizFor, SCENES, sup, rint };
})();
