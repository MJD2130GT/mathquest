/* MathQuest Jr. — Web Audio 사운드 엔진
 * 외부 오디오 파일 없이 전부 합성(synthesis) — 오프라인 LAN 배포에 최적.
 * 구조: ctx → master(gain) → destination
 *        ├─ sfxBus  : 효과음
 *        └─ bgmBus  : 배경음악(BGM 루프)
 *   mute 는 master 게인 한 곳에서 통합 제어한다. (메뉴·배틀 공용)
 */
var Sound = (function () {
  'use strict';

  var ctx = null;
  var master = null, sfxBus = null, bgmBus = null;
  var muted = (localStorage.getItem('mq_muted') === '1');

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = muted ? 0.0001 : 1;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1;   sfxBus.connect(master);
      bgmBus = ctx.createGain(); bgmBus.gain.value = 0.55; bgmBus.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }

  // MIDI 음 번호 → 주파수
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* ===== 효과음 합성 (단일 음) ===== */
  function note(freq, type, t0, dur, vol, endFreq) {
    var c = ac();
    if (!c || muted) return;
    var now = c.currentTime;
    var osc = c.createOscillator();
    var g   = c.createGain();
    osc.connect(g);
    g.connect(sfxBus);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + t0);
    if (endFreq) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + t0 + dur * 0.85);
    }
    g.gain.setValueAtTime(0.001, now + t0);
    g.gain.linearRampToValueAtTime(vol, now + t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, now + t0 + dur);
    osc.start(now + t0);
    osc.stop(now + t0 + dur + 0.04);
  }

  // ===== 효과음 정의 =====
  var S = {
    click: function () { note(900, 'square', 0, 0.035, 0.07); },

    correct: function () {
      note(523, 'sine', 0,    0.13, 0.28);
      note(659, 'sine', 0.09, 0.13, 0.28);
      note(784, 'sine', 0.18, 0.26, 0.32);
    },
    wrong: function () {
      note(330, 'triangle', 0,    0.16, 0.14);
      note(247, 'triangle', 0.13, 0.30, 0.09);
    },
    hint: function () {
      note(440, 'sine', 0,    0.10, 0.17);
      note(554, 'sine', 0.09, 0.18, 0.19);
    },
    combo: function () {
      note(523,  'sine', 0,    0.07, 0.32);
      note(659,  'sine', 0.06, 0.07, 0.32);
      note(784,  'sine', 0.12, 0.07, 0.32);
      note(1047, 'sine', 0.18, 0.32, 0.40);
    },
    clear: function () {
      note(523,  'sine', 0,    0.14, 0.28);
      note(659,  'sine', 0.12, 0.14, 0.28);
      note(784,  'sine', 0.24, 0.14, 0.28);
      note(1047, 'sine', 0.36, 0.58, 0.34);
    },
    worldClear: function () {
      var melody = [523, 659, 784, 1047, 784, 1047, 1319];
      melody.forEach(function (f, i) { note(f, 'sine', i * 0.10, 0.19, 0.36); });
    },
    fail: function () {
      note(392, 'triangle', 0,    0.22, 0.20);
      note(330, 'triangle', 0.19, 0.22, 0.16);
      note(262, 'triangle', 0.38, 0.28, 0.12);
      note(196, 'triangle', 0.58, 0.50, 0.07);
    },
    timeout: function () {
      note(440, 'sawtooth', 0,    0.13, 0.18);
      note(349, 'sawtooth', 0.11, 0.13, 0.13);
      note(262, 'sawtooth', 0.22, 0.28, 0.09);
    },
    // 발사체가 몬스터에 명중 — 짧은 임팩트
    hit: function () {
      note(180, 'square', 0, 0.08, 0.16, 90);
      note(520, 'triangle', 0, 0.05, 0.10);
    },
    tick:     function () { note(660, 'square', 0, 0.038, 0.06); },
    tickWarn: function () { note(880, 'square', 0, 0.048, 0.12); },
  };

  function play(name) {
    if (muted) return;
    try { if (S[name]) S[name](); } catch (e) {}
  }

  /* ===== 배경음악 (BGM) — 합성 루프 ===== *
   * 부드러운 패드 + 아르페지오 + 베이스로 구성한 가벼운 루프.
   * mode: 'menu' | 'battle' | 'boss' | 'off'                               */
  var bgm = { mode: 'off', world: 1, timer: null, step: 0, nextTime: 0, cfg: null };

  // 월드별 조성(調) 살짝 변화 — 같은 진행도 분위기가 달라진다
  var WORLD_KEY = [0, 2, 5, 7, -2, 4, 9, -4, 3, 0];

  function bgmConfig(mode, world) {
    var key = WORLD_KEY[(world - 1) % WORLD_KEY.length] || 0;
    if (mode === 'menu') {
      return {
        bpm: 84, stepsPerChord: 4, transpose: 0,
        padVol: 0.045, pluckVol: 0.05, bassVol: 0.05,
        padType: 'sine', pluckType: 'triangle', bassType: 'sine',
        prog: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]], // C Am F G
      };
    }
    if (mode === 'boss') {
      return {
        bpm: 126, stepsPerChord: 4, transpose: key,
        padVol: 0.05, pluckVol: 0.06, bassVol: 0.075,
        padType: 'sawtooth', pluckType: 'square', bassType: 'sawtooth',
        prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G (단조 느낌)
      };
    }
    // battle
    return {
      bpm: 108, stepsPerChord: 4, transpose: key,
      padVol: 0.045, pluckVol: 0.058, bassVol: 0.065,
      padType: 'triangle', pluckType: 'triangle', bassType: 'sine',
      prog: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F
    };
  }

  function bgmNote(midi, type, t, dur, vol) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = mtof(midi);
    osc.connect(g); g.connect(bgmBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function bgmStep(step, t) {
    var cfg = bgm.cfg;
    var spc = cfg.stepsPerChord;
    var chordIdx = Math.floor(step / spc) % cfg.prog.length;
    var inStep = step % spc;
    var chord = cfg.prog[chordIdx].map(function (m) { return m + cfg.transpose; });
    var chordDur = spc * bgm.stepDur;

    if (inStep === 0) {
      // 패드(코드 유지) + 베이스(근음 한 옥타브 아래)
      chord.forEach(function (m) { bgmNote(m, cfg.padType, t, chordDur * 0.96, cfg.padVol); });
      bgmNote(chord[0] - 12, cfg.bassType, t, chordDur * 0.9, cfg.bassVol);
    }
    if (cfg.transpose !== undefined && (inStep < spc)) {
      // 아르페지오 — 코드 톤을 차례로
      var tone = chord[inStep % chord.length] + (inStep >= chord.length ? 12 : 0);
      bgmNote(tone, cfg.pluckType, t, bgm.stepDur * 0.85, cfg.pluckVol);
    }
  }

  function bgmTick() {
    var c = ac();
    if (!c || muted || bgm.mode === 'off' || !bgm.cfg) return;
    var loopLen = bgm.cfg.prog.length * bgm.cfg.stepsPerChord;
    while (bgm.nextTime < c.currentTime + 0.18) {
      bgmStep(bgm.step, bgm.nextTime);
      bgm.step = (bgm.step + 1) % loopLen;
      bgm.nextTime += bgm.stepDur;
    }
  }

  function bgmRun() {
    if (bgm.timer || muted || bgm.mode === 'off') return;
    var c = ac();
    if (!c) return;
    bgm.nextTime = c.currentTime + 0.1;
    bgmTick();
    bgm.timer = setInterval(bgmTick, 40);
  }
  function bgmHalt() { if (bgm.timer) { clearInterval(bgm.timer); bgm.timer = null; } }

  function startBgm(mode, world) {
    world = world || 1;
    if (bgm.mode === mode && bgm.world === world && bgm.timer) return;
    bgm.mode = mode; bgm.world = world;
    bgm.cfg = bgmConfig(mode, world);
    bgm.stepDur = 60 / bgm.cfg.bpm / 2; // 8분음표
    bgm.step = 0;
    bgmHalt();
    bgmRun();
  }
  function stopBgm() { bgm.mode = 'off'; bgmHalt(); }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem('mq_muted', muted ? '1' : '0');
    var c = ac();
    if (c && master) {
      master.gain.cancelScheduledValues(c.currentTime);
      master.gain.linearRampToValueAtTime(muted ? 0.0001 : 1, c.currentTime + 0.08);
    }
    if (muted) bgmHalt();
    else if (bgm.mode !== 'off') bgmRun();
    // Phaser SoundManager(존재 시)에도 뮤트 상태 반영
    try {
      if (window.Battle && window.Battle.game && window.Battle.game.sound) {
        window.Battle.game.sound.mute = muted;
      }
    } catch (e) {}
    document.querySelectorAll('.mutebtn').forEach(function (el) {
      el.textContent = muted ? '🔇' : '🔊';
    });
    return muted;
  }

  // 첫 사용자 제스처 이후 AudioContext 활성화 + (예약된) BGM 시작
  function unlock() {
    ac();
    if (!muted && bgm.mode !== 'off') bgmRun();
  }

  return {
    play       : play,
    toggleMute : toggleMute,
    isMuted    : function () { return muted; },
    unlock     : unlock,
    startBgm   : startBgm,
    stopBgm    : stopBgm,
  };
}());
