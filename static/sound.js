/* MathQuest Jr. — Web Audio 사운드 엔진 v2
 * 외부 오디오 파일 없이 전부 합성(synthesis) — 오프라인 LAN 배포에 최적.
 * 개선 목록:
 *   1. 콤보 피치 상승 — 연속 정답마다 +1 반음 (최대 7콤보, 완전5도)
 *   2. FEVER BGM 가속 — 콤보 8+ 시 BPM ×1.20, highshelf +8 dB
 *   3. 보스 분노 BGM   — HP 30% 이하 시 +2 반음 전조, BPM ×1.15
 *   4. BGM 크로스페이드 — 모드 전환 시 320ms 페이드아웃 → 380ms 페이드인
 *   5. BGM/SFX 볼륨 분리 슬라이더 (localStorage 저장)
 *   6. 드럼 레이어 — 배틀·보스 BGM에 킥+스네어 합성 리듬 추가
 *   7. 오답 효과음 강화 — sawtooth + lowpass 타격감
 *   8. 스테이지별 효과음 — correctBoss(보스), wrongBoss(보스)
 */
var Sound = (function () {
  'use strict';

  var ctx = null;
  var master = null, sfxBus = null, bgmBus = null, feverFilter = null;
  var muted = (localStorage.getItem('mq_muted') === '1');
  var _bgmVol = parseFloat(localStorage.getItem('mq_bgm_vol') || '0.55');
  var _sfxVol = parseFloat(localStorage.getItem('mq_sfx_vol') || '1.0');
  var _combo = 0;
  var _snareBuffer = null;

  /* ===== AudioContext 초기화 ===== */
  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }

      master = ctx.createGain();
      master.gain.value = muted ? 0.0001 : 1;
      master.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = _sfxVol;
      sfxBus.connect(master);

      // BGM 체인: bgmBus → feverFilter(highshelf) → master
      feverFilter = ctx.createBiquadFilter();
      feverFilter.type = 'highshelf';
      feverFilter.frequency.value = 2800;
      feverFilter.gain.value = 0;
      feverFilter.connect(master);

      bgmBus = ctx.createGain();
      bgmBus.gain.value = _bgmVol;
      bgmBus.connect(feverFilter);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
    return ctx;
  }

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // 콤보 피치 비율: 1콤보 = +1 반음, 최대 7 (완전5도 = ×1.498)
  function comboPitch() { return Math.pow(2, Math.min(_combo, 7) / 12); }

  /* ===== 기본 음 합성 (SFX) ===== */
  function note(freq, type, t0, dur, vol, endFreq) {
    var c = ac();
    if (!c || muted) return;
    var now = c.currentTime;
    var osc = c.createOscillator();
    var g = c.createGain();
    osc.connect(g); g.connect(sfxBus);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + t0 + dur * 0.85);
    g.gain.setValueAtTime(0.001, now + t0);
    g.gain.linearRampToValueAtTime(vol, now + t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, now + t0 + dur);
    osc.start(now + t0);
    osc.stop(now + t0 + dur + 0.04);
  }

  /* ===== 드럼: 킥 합성 ===== */
  function kick(t, vol) {
    if (!ctx || muted) return;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.09);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    osc.connect(g); g.connect(bgmBus);
    osc.start(t); osc.stop(t + 0.42);
  }

  /* ===== 드럼: 스네어 합성 (노이즈 버퍼 캐시) ===== */
  function getSnareBuffer() {
    if (!_snareBuffer && ctx) {
      _snareBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.14), ctx.sampleRate);
      var d = _snareBuffer.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return _snareBuffer;
  }
  function snare(t, vol) {
    if (!ctx || muted) return;
    var buf = getSnareBuffer();
    if (!buf) return;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 2800; filt.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(filt); filt.connect(g); g.connect(bgmBus);
    src.start(t); src.stop(t + 0.15);
    // 스네어 바디 톤
    var osc = ctx.createOscillator();
    var g2 = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.05);
    g2.gain.setValueAtTime(vol * 0.55, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(g2); g2.connect(bgmBus);
    osc.start(t); osc.stop(t + 0.08);
  }

  /* ===== 효과음 정의 ===== */
  var S = {
    click: function () {
      note(880,  'sine', 0,    0.11,  0.15);  // A5 — 메인 벨 톤
      note(1320, 'sine', 0,    0.055, 0.07);  // E6 — 5도 배음 shimmer
      note(440,  'sine', 0,    0.07,  0.06);  // A4 — 저음 따뜻함
    },

    // 정답 — 콤보에 따라 피치 상승
    correct: function () {
      var p = comboPitch();
      note(523 * p, 'sine', 0,    0.13, 0.28);
      note(659 * p, 'sine', 0.09, 0.13, 0.28);
      note(784 * p, 'sine', 0.18, 0.26, 0.32);
    },

    // 보스전 정답 — 더 강하고 임팩트 있게 (피치 상승 포함)
    correctBoss: function () {
      var p = comboPitch();
      note(392 * p,  'sine',     0,    0.06, 0.20);
      note(523 * p,  'sine',     0.05, 0.12, 0.38);
      note(784 * p,  'sine',     0.13, 0.12, 0.38);
      note(1047 * p, 'sine',     0.23, 0.40, 0.45);
      note(1319 * p, 'triangle', 0.32, 0.22, 0.28);
    },

    // 오답 — sawtooth + lowpass 필터로 묵직한 타격감
    wrong: function () {
      var c = ac(); if (!c || muted) return;
      var now = c.currentTime;
      var osc = ctx.createOscillator();
      var filt = ctx.createBiquadFilter();
      var g = ctx.createGain();
      osc.type = 'sawtooth';
      filt.type = 'lowpass'; filt.frequency.value = 450;
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.28);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.25, now + 0.014);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(filt); filt.connect(g); g.connect(sfxBus);
      osc.start(now); osc.stop(now + 0.42);
      note(380, 'square', 0, 0.06, 0.09, 200);
    },

    // 보스전 오답 — 더 무거운 충격
    wrongBoss: function () {
      var c = ac(); if (!c || muted) return;
      var now = c.currentTime;
      var osc = ctx.createOscillator();
      var filt = ctx.createBiquadFilter();
      var g = ctx.createGain();
      osc.type = 'sawtooth';
      filt.type = 'lowpass'; filt.frequency.value = 350;
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.40);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.38, now + 0.014);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.54);
      osc.connect(filt); filt.connect(g); g.connect(sfxBus);
      osc.start(now); osc.stop(now + 0.58);
      note(220, 'square',   0,    0.09, 0.14, 90);
      note(180, 'triangle', 0.05, 0.36, 0.07, 48);
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
    hit: function () {
      note(180, 'square',   0, 0.08, 0.16, 90);
      note(520, 'triangle', 0, 0.05, 0.10);
    },
    tick:     function () { note(660, 'square', 0, 0.038, 0.06); },
    tickWarn: function () { note(880, 'square', 0, 0.048, 0.12); },
  };

  function play(name) {
    if (muted) return;
    try { if (S[name]) S[name](); } catch (e) {}
  }

  /* ===== BGM (합성 루프) ===== */
  var bgm = {
    mode: 'off', world: 1, timer: null, step: 0,
    nextTime: 0, cfg: null, stepDur: 0,
    fever: false, rage: false,
  };
  var WORLD_KEY = [0, 2, 5, 7, -2, 4, 9, -4, 3, 0];

  function bgmConfig(mode, world) {
    var key = WORLD_KEY[(world - 1) % WORLD_KEY.length] || 0;
    if (mode === 'menu') {
      return {
        bpm: 84, stepsPerChord: 4, transpose: 0, baseTranspose: 0,
        padVol: 0.045, pluckVol: 0.05, bassVol: 0.05,
        kickVol: 0, snareVol: 0,
        padType: 'sine', pluckType: 'triangle', bassType: 'sine',
        prog: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
      };
    }
    if (mode === 'boss') {
      return {
        bpm: 126, stepsPerChord: 4, transpose: key, baseTranspose: key,
        padVol: 0.05, pluckVol: 0.06, bassVol: 0.075,
        kickVol: 0.08, snareVol: 0.055,
        padType: 'sawtooth', pluckType: 'square', bassType: 'sawtooth',
        prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
      };
    }
    // battle
    return {
      bpm: 108, stepsPerChord: 4, transpose: key, baseTranspose: key,
      padVol: 0.045, pluckVol: 0.058, bassVol: 0.065,
      kickVol: 0.065, snareVol: 0.044,
      padType: 'triangle', pluckType: 'triangle', bassType: 'sine',
      prog: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],
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
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function bgmStep(step, t) {
    var cfg = bgm.cfg;
    var spc = cfg.stepsPerChord;
    var chordIdx = Math.floor(step / spc) % cfg.prog.length;
    var inStep = step % spc;
    var chord = cfg.prog[chordIdx].map(function (m) { return m + cfg.transpose; });
    var chordDur = spc * bgm.stepDur;

    if (inStep === 0) {
      chord.forEach(function (m) { bgmNote(m, cfg.padType, t, chordDur * 0.96, cfg.padVol); });
      bgmNote(chord[0] - 12, cfg.bassType, t, chordDur * 0.9, cfg.bassVol);
    }
    // 아르페지오
    var tone = chord[inStep % chord.length] + (inStep >= chord.length ? 12 : 0);
    bgmNote(tone, cfg.pluckType, t, bgm.stepDur * 0.85, cfg.pluckVol);

    // 드럼 리듬 (배틀·보스 전용) — 4/4박자 킥·스네어
    // step % 8: 0=킥(beat1), 2=스네어(beat2), 4=킥(beat3), 6=스네어(beat4)
    if (cfg.kickVol > 0) {
      var gs = step % 8;
      if (gs === 0 || gs === 4) kick(t, cfg.kickVol);
      if (gs === 2 || gs === 6) snare(t, cfg.snareVol);
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
    var c = ac(); if (!c) return;
    bgm.nextTime = c.currentTime + 0.1;
    bgmTick();
    bgm.timer = setInterval(bgmTick, 40);
  }
  function bgmHalt() { if (bgm.timer) { clearInterval(bgm.timer); bgm.timer = null; } }

  function startBgm(mode, world) {
    world = world || 1;
    if (bgm.mode === mode && bgm.world === world && bgm.timer) return;

    var c = ac();
    var isFirst = (bgm.mode === 'off');

    // 크로스페이드 아웃
    if (!isFirst && c && bgmBus) {
      bgmBus.gain.cancelScheduledValues(c.currentTime);
      bgmBus.gain.setValueAtTime(bgmBus.gain.value, c.currentTime);
      bgmBus.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.30);
    }

    setTimeout(function () {
      bgmHalt();
      bgm.mode = mode; bgm.world = world;
      bgm.fever = false; bgm.rage = false; bgm.step = 0;
      bgm.cfg = bgmConfig(mode, world);
      bgm.stepDur = 60 / bgm.cfg.bpm / 2;
      // fever 필터 리셋
      if (feverFilter && ctx) {
        feverFilter.gain.cancelScheduledValues(ctx.currentTime);
        feverFilter.gain.value = 0;
      }
      if (!muted) {
        var c2 = ac(); if (!c2) return;
        bgmBus.gain.cancelScheduledValues(c2.currentTime);
        bgmBus.gain.setValueAtTime(0.0001, c2.currentTime);
        bgmBus.gain.linearRampToValueAtTime(_bgmVol, c2.currentTime + 0.38);
        bgmRun();
      }
    }, isFirst ? 0 : 320);
  }

  function stopBgm() { bgm.mode = 'off'; bgmHalt(); }

  /* ===== FEVER 모드 (콤보 8+) ===== */
  function setFever(on) {
    if (bgm.fever === on || !bgm.cfg) return;
    bgm.fever = on;
    var c = ac(); if (!c) return;
    if (on) {
      bgm.stepDur = 60 / (bgm.cfg.bpm * 1.20) / 2;
      if (feverFilter) {
        feverFilter.gain.cancelScheduledValues(c.currentTime);
        feverFilter.gain.linearRampToValueAtTime(8, c.currentTime + 0.28);
      }
    } else {
      var baseBpm = bgm.cfg.bpm * (bgm.rage ? 1.15 : 1.0);
      bgm.stepDur = 60 / baseBpm / 2;
      if (feverFilter) {
        feverFilter.gain.cancelScheduledValues(c.currentTime);
        feverFilter.gain.linearRampToValueAtTime(bgm.rage ? 3 : 0, c.currentTime + 0.38);
      }
    }
  }

  /* ===== 보스 분노 모드 (HP ≤ 30%) ===== */
  function setBossRage(on) {
    if (bgm.rage === on || !bgm.cfg) return;
    bgm.rage = on;
    var c = ac(); if (!c) return;
    if (on) {
      bgm.cfg.transpose = bgm.cfg.baseTranspose + 2;
      bgm.stepDur = 60 / (bgm.cfg.bpm * (bgm.fever ? 1.20 : 1.15)) / 2;
      if (feverFilter && !bgm.fever) {
        feverFilter.gain.cancelScheduledValues(c.currentTime);
        feverFilter.gain.linearRampToValueAtTime(3, c.currentTime + 0.45);
      }
    } else {
      bgm.cfg.transpose = bgm.cfg.baseTranspose;
      bgm.stepDur = 60 / (bgm.cfg.bpm * (bgm.fever ? 1.20 : 1.0)) / 2;
      if (feverFilter && !bgm.fever) {
        feverFilter.gain.cancelScheduledValues(c.currentTime);
        feverFilter.gain.linearRampToValueAtTime(0, c.currentTime + 0.40);
      }
    }
  }

  /* ===== 콤보 피치 설정 ===== */
  function setCombo(n) { _combo = n; }

  /* ===== BGM / SFX 볼륨 분리 ===== */
  function setBgmVol(v) {
    _bgmVol = Math.max(0, Math.min(1, v));
    localStorage.setItem('mq_bgm_vol', String(_bgmVol));
    var c = ac();
    if (c && bgmBus && !muted) {
      bgmBus.gain.cancelScheduledValues(c.currentTime);
      bgmBus.gain.setValueAtTime(bgmBus.gain.value, c.currentTime);
      bgmBus.gain.linearRampToValueAtTime(_bgmVol, c.currentTime + 0.05);
    }
  }
  function setSfxVol(v) {
    _sfxVol = Math.max(0, Math.min(1, v));
    localStorage.setItem('mq_sfx_vol', String(_sfxVol));
    var c = ac();
    if (c && sfxBus && !muted) {
      sfxBus.gain.cancelScheduledValues(c.currentTime);
      sfxBus.gain.setValueAtTime(sfxBus.gain.value, c.currentTime);
      sfxBus.gain.linearRampToValueAtTime(_sfxVol, c.currentTime + 0.05);
    }
  }
  function getBgmVol() { return _bgmVol; }
  function getSfxVol() { return _sfxVol; }

  /* ===== 뮤트 토글 ===== */
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

  function unlock() {
    ac();
    if (!muted && bgm.mode !== 'off') bgmRun();
  }

  return {
    play        : play,
    toggleMute  : toggleMute,
    isMuted     : function () { return muted; },
    unlock      : unlock,
    startBgm    : startBgm,
    stopBgm     : stopBgm,
    setCombo    : setCombo,
    setFever    : setFever,
    setBossRage : setBossRage,
    setBgmVol   : setBgmVol,
    setSfxVol   : setSfxVol,
    getBgmVol   : getBgmVol,
    getSfxVol   : getSfxVol,
  };
}());
