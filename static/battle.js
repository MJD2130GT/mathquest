/* MathQuest Jr. — Phaser 3 배틀 엔진
 * 배틀 씬(아레나)의 렌더링을 Phaser canvas(WebGL)로 처리한다.
 *  - Phaser canvas : 배경 그라데이션·몬스터·플레이어·발사체·파티클·HP바·보스 타이머·콤보·플로팅 XP·화면 흔들림
 *  - DOM 오버레이  : 상단 컨트롤(나가기/뮤트), 문제 말풍선, 보기 버튼, 힌트/해설 팝업
 * 게임 로직(문제 진행·점수·별·적응형 난이도)은 app.js의 기존 규칙을 그대로 포팅했다.
 * app.js 와는 bridge 콜백으로 연결한다(문제 생성·결과 저장·화면 전환).
 */
(function () {
  'use strict';

  var Battle = { game: null };
  window.Battle = Battle;

  var EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

  var MONSTERS = [
    { emoji: '🦑', name: '파도 크라켄' },
    { emoji: '👹', name: '용암 오우거' },
    { emoji: '🤖', name: '기어 골렘' },
    { emoji: '⛄', name: '얼음 골렘' },
    { emoji: '🐲', name: '번개 드래곤' },
    { emoji: '🐍', name: '숲의 바실리스크' },
    { emoji: '🦂', name: '사막 전갈왕' },
    { emoji: '👾', name: '달 침략자' },
    { emoji: '🧌', name: '무지개 트롤' },
    { emoji: '🐉', name: '수학 마왕' },
  ];
  var QUIZMON = { emoji: '🦉', name: '퀴즈 부엉이 현자' };

  // ----- 색 유틸 -----
  function hexInt(h) { return parseInt(String(h).replace('#', ''), 16) || 0x6d28d9; }
  function shade(c, f) {
    var r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    return ((Math.round(r * f) << 16) | (Math.round(g * f) << 8) | Math.round(b * f));
  }

  /* ============================================================
   *  Phaser Scene — 아레나 렌더링
   * ============================================================ */
  function BattleScene() { Phaser.Scene.call(this, { key: 'arena' }); }
  BattleScene.prototype = Object.create(Phaser.Scene.prototype);
  BattleScene.prototype.constructor = BattleScene;

  BattleScene.prototype.init = function (data) { this.cfg = data; };

  BattleScene.prototype.makeBar = function (color, hgt) {
    var bg = this.add.rectangle(0, 0, 10, hgt, 0x000000, 0.34).setOrigin(0.5);
    var fill = this.add.rectangle(0, 0, 10, hgt, color).setOrigin(0, 0.5);
    return { bg: bg, fill: fill, color: color, maxW: 10,
      place: function (cx, cy, w) { this.maxW = w; bg.setPosition(cx, cy).setSize(w, hgt); fill.setPosition(cx - w / 2, cy).setSize(w, hgt); },
    };
  };

  BattleScene.prototype.create = function () {
    var c = this.cfg;
    this.wc = hexInt(c.color);
    this.bg = this.add.graphics();

    // 은은하게 떠다니는 입자(분위기)
    this.motes = [];
    for (var i = 0; i < 7; i++) {
      var m = this.add.circle(0, 0, 3 + Math.random() * 4, 0xffffff, 0.10);
      this.motes.push(m);
    }

    this.enemyBar = this.makeBar(0xef4444, 10);
    this.monster = this.add.text(0, 0, c.isQuiz ? QUIZMON.emoji : (MONSTERS[c.world - 1].emoji), {
      fontFamily: EMOJI_FONT, fontSize: (c.isBoss ? 104 : 76) + 'px',
    }).setOrigin(0.5);
    this.nameText = this.add.text(0, 0, (c.isBoss ? '👑 ' : '') + (c.isQuiz ? QUIZMON.name : MONSTERS[c.world - 1].name), {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.30)', padding: { x: 8, y: 3 },
    }).setOrigin(0.5);

    this.playerBar = this.makeBar(0x22c55e, 12);
    this.comboText = this.add.text(0, 0, '', {
      fontFamily: EMOJI_FONT, fontSize: '18px', color: '#fbbf24', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.player = this.add.text(0, 0, '🦊', { fontFamily: EMOJI_FONT, fontSize: '46px' }).setOrigin(0.5);

    this.timerBar = this.makeBar(0xf97316, 8);
    this.timerBar.bg.setVisible(c.isBoss);
    this.timerBar.fill.setVisible(c.isBoss);

    this.layoutAll(this.scale.gameSize);
    this.scale.on('resize', this.layoutAll, this);
    this.startIdle();

    this.ready = true;
    if (typeof c.onReady === 'function') c.onReady(this);
  };

  BattleScene.prototype.layoutAll = function (size) {
    var W = (size && size.width) || this.scale.width;
    var H = (size && size.height) || this.scale.height;
    this.W = W; this.H = H;
    var cx = W / 2;

    // 배경 그라데이션 + 바닥 글로우
    var top = shade(this.wc, 0.55), mid = shade(this.wc, 0.22), bot = 0x0b1020;
    this.bg.clear();
    this.bg.fillGradientStyle(top, top, bot, mid, 1);
    this.bg.fillRect(0, 0, W, H);
    this.bg.fillStyle(this.wc, 0.18);
    this.bg.fillEllipse(cx, H * 0.30, W * 0.9, H * 0.34);

    for (var i = 0; i < this.motes.length; i++) {
      var m = this.motes[i];
      if (!m._tw) {
        m.setPosition(Math.random() * W, Math.random() * H);
        m._tw = this.tweens.add({ targets: m, y: '-=' + (H * 0.5), alpha: 0,
          duration: 4000 + Math.random() * 3000, repeat: -1, delay: Math.random() * 3000,
          onRepeat: function (tw, t) { t.x = Math.random() * W; t.y = H + 10; t.alpha = 0.12; } });
      }
    }

    this.timerBar.place(cx, H * 0.05, Math.min(W * 0.82, 360));
    this.enemyBar.place(cx, H * 0.12, Math.min(W * 0.52, 210));
    this.monBaseY = H * 0.28;
    this.monster.setPosition(cx, this.monBaseY);
    this.nameText.setPosition(cx, this.monBaseY + (this.cfg.isBoss ? 78 : 62));
    this.playerBar.place(cx, H * 0.455, Math.min(W * 0.6, 260));
    this.comboText.setPosition(cx, H * 0.40);
    this.pBaseY = H * 0.55;
    this.player.setPosition(W * 0.18, this.pBaseY);

    this.setEnemyHp(this._eHp == null ? 1 : this._eHp, true);
    this.setPlayerHp(this._pHp == null ? 1 : this._pHp, true);
    this.setBossTimer(this._tFrac == null ? 1 : this._tFrac, false, true);
  };

  BattleScene.prototype.startIdle = function () {
    this.stopIdle();
    this.idleTween = this.tweens.add({ targets: this.monster, y: this.monBaseY - 10,
      duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.pIdle = this.tweens.add({ targets: this.player, y: this.pBaseY - 7,
      duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  };
  BattleScene.prototype.stopIdle = function () {
    if (this.idleTween) { this.idleTween.stop(); this.idleTween = null; this.monster.y = this.monBaseY; }
    if (this.pIdle) { this.pIdle.stop(); this.pIdle = null; this.player.y = this.pBaseY; }
  };

  BattleScene.prototype.setEnemyHp = function (frac, instant) {
    this._eHp = frac = Math.max(0, Math.min(1, frac));
    var w = this.enemyBar.maxW * frac;
    if (instant) this.enemyBar.fill.scaleX = frac;
    else this.tweens.add({ targets: this.enemyBar.fill, scaleX: frac, duration: 400, ease: 'Cubic.out' });
  };
  BattleScene.prototype.setPlayerHp = function (frac, instant) {
    this._pHp = frac = Math.max(0, Math.min(1, frac));
    this.playerBar.fill.fillColor = frac <= 0.3 ? 0xfb923c : 0x22c55e;
    if (instant) this.playerBar.fill.scaleX = frac;
    else this.tweens.add({ targets: this.playerBar.fill, scaleX: frac, duration: 350, ease: 'Cubic.out' });
  };
  BattleScene.prototype.setCombo = function (n) {
    this.comboText.setText(n >= 2 ? '🔥x' + n : '');
    if (n >= 2) { this.comboText.setScale(1.4); this.tweens.add({ targets: this.comboText, scale: 1, duration: 260, ease: 'Back.out' }); }
  };
  BattleScene.prototype.setBossTimer = function (frac, danger, instant) {
    this._tFrac = frac = Math.max(0, Math.min(1, frac));
    this.timerBar.fill.scaleX = frac;
    this.timerBar.fill.fillColor = danger ? 0xef4444 : 0xf97316;
  };

  BattleScene.prototype.shoot = function (emoji, onHit) {
    var self = this;
    var p = this.add.text(this.player.x, this.player.y, emoji, { fontFamily: EMOJI_FONT, fontSize: '30px' }).setOrigin(0.5);
    this.tweens.add({ targets: p, x: this.monster.x, y: this.monster.y, scale: 1.5,
      duration: 360, ease: 'Quad.in',
      onComplete: function () { p.destroy(); if (onHit) onHit(); } });
  };

  BattleScene.prototype.monsterHit = function () {
    var self = this;
    this.burst('✨', 7);
    this.cameras.main.shake(180, 0.006);
    this.tweens.add({ targets: this.monster, scale: { from: 1.28, to: 1 }, duration: 360, ease: 'Back.out' });
    this.tweens.add({ targets: this.monster, x: this.monster.x + 14, duration: 70, yoyo: true, repeat: 2 });
    var flash = this.add.circle(this.monster.x, this.monster.y, 54, 0xffffff, 0.7);
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.6, duration: 260, onComplete: function () { flash.destroy(); } });
  };

  BattleScene.prototype.monsterAttack = function () {
    var self = this;
    this.stopIdle();
    this.cameras.main.shake(380, 0.012);
    this.tweens.add({ targets: this.monster, y: this.monBaseY + 54, scale: 1.25, duration: 230,
      yoyo: true, ease: 'Quad.inOut', onComplete: function () { self.startIdle(); } });
    this.playerOuch();
  };

  BattleScene.prototype.playerOuch = function () {
    this.tweens.add({ targets: this.player, x: this.player.x - 10, angle: -12, duration: 90, yoyo: true, repeat: 2 });
    var f = this.add.circle(this.player.x, this.player.y, 30, 0xff3b3b, 0.5);
    this.tweens.add({ targets: f, alpha: 0, scale: 1.5, duration: 320, onComplete: function () { f.destroy(); } });
  };

  BattleScene.prototype.monsterDie = function () {
    this.stopIdle();
    this.burst('💥', 14);
    this.cameras.main.shake(300, 0.01);
    this.tweens.add({ targets: this.monster, angle: 110, y: this.monBaseY + 90, scale: 0.5, alpha: 0,
      duration: 850, ease: 'Quad.in' });
  };

  BattleScene.prototype.floatXp = function (txt) {
    var t = this.add.text(this.monster.x, this.monster.y - 20, txt, {
      fontFamily: EMOJI_FONT, fontSize: '26px', color: '#fbbf24', fontStyle: 'bold',
      stroke: '#7c2d12', strokeThickness: 4,
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: t.y - 90, alpha: 0, scale: 1.1, duration: 1000, ease: 'Quad.out',
      onComplete: function () { t.destroy(); } });
  };

  BattleScene.prototype.burst = function (emoji, n) {
    for (var i = 0; i < n; i++) {
      var s = this.add.text(this.monster.x, this.monster.y, emoji, { fontFamily: EMOJI_FONT, fontSize: '22px' }).setOrigin(0.5);
      var ang = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 90;
      this.tweens.add({ targets: s,
        x: s.x + Math.cos(ang) * dist, y: s.y + Math.sin(ang) * dist - 30,
        alpha: 0, scale: { from: 1, to: 0.3 }, angle: Math.random() * 240 - 120,
        duration: 800 + Math.random() * 200, ease: 'Quad.out',
        onComplete: function (tw, ts) { ts[0].destroy(); } });
    }
  };

  /* ============================================================
   *  컨트롤러 — 배틀 로직 + DOM 오버레이
   * ============================================================ */
  var scene = null, B = null, bridge = null, dom = {};

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function buildDom(w, s) {
    var meta = bridge.worldMeta(w);
    var appEl = document.getElementById('app');
    appEl.innerHTML = '';

    var wrap = el('div'); wrap.id = 'bwrap'; wrap.style.setProperty('--wc', meta.color);
    var gameDiv = el('div'); gameDiv.id = 'bgame';
    var d = el('div', 'bx'); d.id = 'bdom';

    var top = el('div', 'bx-top');
    var back = el('button', 'back light', '✕');
    back.onclick = quit;
    var title = el('span', 'btitle', meta.emoji + ' Stage ' + s + ' · ' + ['', '', '기초 배틀', '응용 배틀', '개념 퀴즈', '보스 배틀'][s]);
    var right = el('div', 'brow-right');
    var mute = el('button', 'mutebtn', Sound.isMuted() ? '🔇' : '🔊');
    mute.onclick = function () { Sound.toggleMute(); };
    var count = el('span', 'bcount', '1 / ' + B.qTotal);
    right.appendChild(mute); right.appendChild(count);
    top.appendChild(back); top.appendChild(title); top.appendChild(right);

    var spacer = el('div', 'bx-spacer');
    var bubble = el('div', 'bubble');
    var qtext = el('div', 'qtext'); bubble.appendChild(qtext);
    var choices = el('div', 'choices');
    var ovl = el('div'); ovl.id = 'bx-overlay';

    d.appendChild(top); d.appendChild(spacer); d.appendChild(bubble); d.appendChild(choices); d.appendChild(ovl);
    wrap.appendChild(gameDiv); wrap.appendChild(d);
    appEl.appendChild(wrap);

    dom = { wrap: wrap, qtext: qtext, bubble: bubble, choices: choices, count: count, overlay: ovl };
  }

  function createGame(w, s, onReady) {
    var meta = bridge.worldMeta(w);
    Battle.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'bgame',
      backgroundColor: '#0b1020',
      scale: { mode: Phaser.Scale.RESIZE, parent: 'bgame', width: '100%', height: '100%' },
      banner: false,
      scene: new BattleScene(),
    });
    Battle.game.scene.start('arena', {
      world: w, stage: s, color: meta.color,
      isBoss: s === 5, isQuiz: s === 4, onReady: onReady,
    });
    try { Battle.game.sound.mute = Sound.isMuted(); } catch (e) {}
  }

  // ----- 배틀 시작 -----
  Battle.start = function (w, s, theBridge) {
    bridge = theBridge;
    B = {
      world: w, stage: s,
      qTotal: s === 5 ? 10 : 8,
      idx: 0, hp: 100,
      d: s === 2 ? 1 : s === 3 ? 2 : 3,
      combo: 0, consecWrong: 0, consecRight: 0,
      xp: 0, correct: 0, firstTry: 0, attempt: 0,
      start: Date.now(), timer: null, timeLeft: 0,
      quiz: s === 4 ? bridge.quizFor(w, 8) : null,
      q: null,
    };
    if (s === 4) B.d = 2;
    buildDom(w, s);
    Sound.startBgm(s === 5 ? 'boss' : 'battle', w);
    createGame(w, s, function (sc) { scene = sc; nextQ(); });
  };

  function teardown() {
    stopTimer();
    if (scene) { scene.scale.off('resize', scene.layoutAll, scene); }
    if (Battle.game) { var g = Battle.game; Battle.game = null; scene = null; try { g.destroy(true); } catch (e) {} }
    if (dom.wrap && dom.wrap.parentNode) dom.wrap.parentNode.removeChild(dom.wrap);
    Sound.startBgm('menu');
    B = null;
  }

  // ----- 타이머(보스 전용) -----
  function stopTimer() { if (B && B.timer) { clearInterval(B.timer); B.timer = null; } }
  function startTimer(sec) {
    B.timeLeft = sec;
    var lastTick = Math.ceil(sec);
    B.timer = setInterval(function () {
      if (!B) return;
      B.timeLeft -= 0.1;
      if (scene) scene.setBossTimer(Math.max(0, B.timeLeft / sec), B.timeLeft <= 5);
      var t = Math.ceil(B.timeLeft);
      if (t < lastTick && B.timeLeft > 0) { lastTick = t; if (B.timeLeft <= 5) Sound.play(B.timeLeft <= 3 ? 'tickWarn' : 'tick'); }
      if (B.timeLeft <= 0) { stopTimer(); onTimeout(); }
    }, 100);
  }

  // ----- 문제 진행 -----
  function nextQ() {
    if (!B) return;
    if (B.idx >= B.qTotal) { finishBattle(); return; }
    B.q = B.quiz ? B.quiz[B.idx] : bridge.gen(B.world, B.d);
    B.attempt = 0;
    updateQuestion();
    if (B.stage === 5) { if (scene) scene.setBossTimer(1, false); startTimer(20); }
  }
  function updateQuestion() {
    dom.qtext.innerHTML = B.q.text;
    dom.bubble.classList.remove('pop'); void dom.bubble.offsetWidth; dom.bubble.classList.add('pop');
    renderChoices();
    updateHUD();
  }
  function renderChoices() {
    dom.choices.innerHTML = '';
    B.q.choices.forEach(function (c, i) {
      var b = el('button', 'choice', c);
      b.onclick = function () { answer(i, b); };
      dom.choices.appendChild(b);
    });
  }
  function lockChoices() {
    dom.choices.querySelectorAll('.choice').forEach(function (b) { b.disabled = true; });
  }
  function updateHUD() {
    if (!scene) return;
    scene.setPlayerHp(Math.max(0, B.hp) / 100);
    scene.setCombo(B.combo);
    scene.setEnemyHp(1 - B.correct / B.qTotal);
    dom.count.textContent = Math.min(B.idx + 1, B.qTotal) + ' / ' + B.qTotal;
  }

  function popup(html, buttons) {
    var card = '<div class="ovl"><div class="ovlcard">' + html +
      buttons.map(function (b, i) { return '<button class="big ' + b.cls + '" data-i="' + i + '">' + b.label + '</button>'; }).join('') +
      '</div></div>';
    dom.overlay.innerHTML = card;
    dom.overlay.querySelectorAll('button[data-i]').forEach(function (btn) {
      btn.onclick = buttons[+btn.dataset.i].fn;
    });
  }
  function clearPopup() { dom.overlay.innerHTML = ''; }

  // ----- 정답/오답 -----
  function answer(i, btn) {
    if (!B || B.q == null) return;
    stopTimer();
    lockChoices();
    var correct = i === B.q.answer;
    if (correct) {
      if (btn) btn.classList.add('good');
      var firstTry = B.attempt === 0;
      B.correct++;
      if (firstTry) {
        B.firstTry++; B.consecRight++; B.consecWrong = 0; B.combo++;
        if (B.consecRight >= 5) { B.d = Math.min(3, B.d + 1); B.consecRight = 0; }
      } else { B.combo = 0; }
      var gain = 10 * B.d;
      if (!firstTry) gain *= 0.7;
      if (B.combo >= 3) gain *= 1.5;
      gain = Math.round(gain);
      B.xp += gain;
      B.hp = Math.min(100, B.hp + 5);
      Sound.play(B.combo >= 3 ? 'combo' : 'correct');
      if (scene) scene.shoot(bridge.worldMeta(B.world).emoji, function () {
        if (!scene) return;
        Sound.play('hit');
        scene.monsterHit();
        scene.floatXp('+' + gain + ' XP' + (B.combo >= 3 ? ' 🔥' : ''));
        updateHUD();
      });
      setTimeout(function () { if (!B) return; B.idx++; nextQ(); }, 1100);
      return;
    }
    // 오답
    if (btn) btn.classList.add('bad');
    B.combo = 0; B.consecRight = 0;
    B.hp -= 15;
    Sound.play('wrong');
    if (scene) scene.monsterAttack();
    updateHUD();
    if (B.hp <= 0) { setTimeout(failBattle, 650); return; }
    var q = B.q;
    setTimeout(function () {
      if (!B || B.q !== q) return;
      if (B.attempt === 0) {
        B.attempt = 1;
        B.consecWrong++;
        if (B.consecWrong >= 2) { B.d = Math.max(1, B.d - 1); B.consecWrong = 0; }
        popup('<div class="big-emoji">💡</div><b>아깝다! 힌트를 줄게</b><p class="hinttxt">' + q.hint + '</p>',
          [{ label: '다시 도전 💪', cls: 'primary', fn: retry },
           { label: '개념 탐구 다시 보기', cls: 'ghost', fn: backToConcept }]);
      } else {
        popup('<div class="big-emoji">📘</div><b>정답은 <span class="ansmark">' + q.choices[q.answer] + '</span></b><p class="hinttxt">' + q.explain + '</p>',
          [{ label: '다음 문제 →', cls: 'primary', fn: nextAfterWrong }]);
      }
    }, 620);
  }

  function onTimeout() {
    if (!B) return;
    Sound.play('timeout');
    lockChoices();
    B.combo = 0; B.consecRight = 0;
    B.hp -= 15;
    if (scene) scene.monsterAttack();
    updateHUD();
    if (B.hp <= 0) { setTimeout(failBattle, 650); return; }
    var q = B.q;
    setTimeout(function () {
      if (!B || B.q !== q) return;
      popup('<div class="big-emoji">⏰</div><b>시간 초과!</b><p class="hinttxt">정답은 <span class="ansmark">' + q.choices[q.answer] + '</span><br>' + q.explain + '</p>',
        [{ label: '다음 문제 →', cls: 'primary', fn: nextAfterWrong }]);
    }, 620);
  }

  function retry() {
    if (!B) return;
    clearPopup();
    renderChoices();
    if (B.stage === 5) { if (scene) scene.setBossTimer(1, false); startTimer(20); }
  }
  function nextAfterWrong() {
    if (!B) return;
    clearPopup();
    B.idx++;
    nextQ();
  }
  function backToConcept() { var w = B.world; teardown(); bridge.onConcept(w); }
  function quit() { var w = B.world; teardown(); bridge.onQuit(w); }

  function failBattle() {
    if (!B) return;
    stopTimer();
    Sound.play('fail');
    var w = B.world, s = B.stage;
    teardown();
    bridge.onLose(w, s);
  }

  function finishBattle() {
    stopTimer();
    var acc = B.correct / B.qTotal;
    var stars = acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : acc >= 0.5 ? 1 : 0;
    var w = B.world, s = B.stage;
    if (stars === 0) { failBattle(); return; }
    var xp = Math.round(B.xp), accPct = Math.round(acc * 100);
    var payload = {
      world: w, stage: s, stars: stars, score: accPct, xp: xp,
      correct: B.correct, wrong: B.qTotal - B.correct,
      seconds: Math.min(3600, Math.round((Date.now() - B.start) / 1000)),
    };
    if (scene) scene.monsterDie();
    Sound.play(s === 5 ? 'worldClear' : 'clear');
    Promise.resolve(bridge.submit(payload)).then(function () {
      setTimeout(function () { teardown(); bridge.onWin(w, s, stars, xp, accPct); }, 700);
    });
  }
})();
