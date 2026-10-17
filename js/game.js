/* ==========================================================
   BLOCK BREAKER - game code
   Everything is drawn with code. No image files needed.
   Sections: 1 Settings, 2 Levels, 3 Game logic, 4 Drawing,
             5 Sound, 6 Menus and input, 7 Start
   ========================================================== */
(function () {
  'use strict';

  var W = 540, H = 720, TOP = 60;           // game world size (the canvas scales to any screen)
  var FONT = '"Nunito","Trebuchet MS","Segoe UI",Arial,sans-serif';
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  var isTouch = ('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  /* ---------- 1. SETTINGS (change these to tune the game) ---------- */
  var COLS = 10, BW = 48, BH = 22, GAP = 4;
  var LEFT = (W - (COLS * BW + (COLS - 1) * GAP)) / 2, BTOP = 84;
  var PADDLE_Y = 668, PADDLE_H = 14, BALL_R = 8, SHIELD_Y = 692;

  // lives = starting lives, speed = ball speed (pixels per second), paddle = paddle width,
  // drop = chance a broken brick drops a power-up, add = seconds between new rows (Endless)
  var DIFFS = {
    easy:   { lives: 5, speed: 370, paddle: 116, drop: 0.18, add: 10 },
    normal: { lives: 3, speed: 430, paddle: 96,  drop: 0.15, add: 8 },
    hard:   { lives: 2, speed: 500, paddle: 80,  drop: 0.12, add: 6 }
  };
  var ROW_COLORS = ['#ff4d6d', '#ff8c42', '#ffcb3d', '#5be584', '#27d3e6', '#4d8dff', '#9b6bff', '#ff5fd2'];

  // dur = seconds the power-up lasts (0 = instant). name = text shown when you catch it.
  var POWER = {
    wide:   { c: '#4c8bf5', t: 'W',  dur: 12, name: 'Wide paddle' },
    twin:   { c: '#ff9ad5', t: '2',  dur: 0,  name: 'Twin ball' },
    multi:  { c: '#ff6bd6', t: 'M',  dur: 0,  name: 'Multi-ball' },
    slow:   { c: '#35d0e8', t: 'S',  dur: 10, name: 'Slow ball' },
    fire:   { c: '#ff8a3d', t: 'F',  dur: 8,  name: 'Fireball' },
    laser:  { c: '#ff4d5e', t: 'L',  dur: 10, name: 'Laser' },
    sticky: { c: '#6be585', t: 'C',  dur: 12, name: 'Catch ball' },
    mega:   { c: '#b07bff', t: 'G',  dur: 10, name: 'Giant ball' },
    bomb:   { c: '#ff5a36', t: 'B',  dur: 10, name: 'Bomb ball' },
    score:  { c: '#f7c948', t: 'x2', dur: 12, name: 'Double score' },
    shield: { c: '#4de0b4', t: 'N',  dur: 0,  name: 'Safety net' },
    life:   { c: '#ffd93d', t: '+',  dur: 0,  name: 'Extra life' },
    shrink: { c: '#7b7f93', t: '-',  dur: 10, name: 'Shrink (bad)' }
  };
  // what can drop (more entries = more common). The bad one (shrink) drops 1 time in 10.
  var GOOD = ['wide', 'wide', 'twin', 'twin', 'multi', 'slow', 'fire', 'laser', 'laser', 'sticky', 'mega', 'bomb', 'score', 'shield', 'shield', 'life'];

  var MODE_TEXT = {
    classic: 'Clear every brick, level after level. Lose all your balls and you lose a life.',
    endless: 'New rows of bricks keep dropping. Do not let them reach your paddle!'
  };

  /* ---------- State ---------- */
  var modeKey = 'classic', diffKey = 'normal';
  var state = 'menu';            // menu | help | play | paused | clear | over
  var G = null;                  // data of the current game
  var helpFrom = 'start';        // where the help popup was opened from (start | pause)
  var scale = 1, t = 0, shake = 0, muted = false;
  var keys = { l: 0, r: 0 };
  var touch = null;              // finger that is dragging the paddle
  var stars = [], demoBricks = [];

  try { muted = localStorage.getItem('bb_muted') === '1'; } catch (e) {}

  /* ---------- 2. LEVELS ----------
     Each level is 10 characters wide.
     . = empty   1 2 3 = brick that needs that many hits   S = steel (cannot break)   X = bomb */
  var LEVELS = [
    ['..........', '.11111111.', '.11111111.', '.22222222.', '.22222222.', '..........'],
    ['....11....', '...1111...', '..111111..', '.22222222.', '1111111111', '2222222222'],
    ['S11111111S', '.22222222.', 'S11111111S', '.33333333.', '..........', '1111111111'],
    ['1.1.1.1.1.', '.2.2.2.2.2', '1.1.1.1.1.', '.2.2.2.2.2', '3X3X3X3X3X', '1111111111'],
    ['....SS....', '...1221...', '..123321..', '.12X33X21.', '..123321..', '...1221...', '....11....'],
    ['2222222222', 'S.S.S.S.S.', '1111111111', '.S.S.S.S.S', '3X3X3X3X3X', '1111111111', '..........', '2222222222'],
    ['.22....22.', '2222..2222', '2222222222', '22222X2222', '.22222222.', '..222222..', '...2222...', '....22....'],
    ['..333333..', '.32222223.', '3221111223', '321....123', '31......13']
  ];

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var a = Math.imul(seed ^ seed >>> 15, 1 | seed);
      a = a + Math.imul(a ^ a >>> 7, 61 | a) ^ a;
      return ((a ^ a >>> 14) >>> 0) / 4294967296;
    };
  }

  // picks one brick character. r = random function, n = difficulty number, steelOk = steel allowed
  function cell(r, n, steelOk) {
    if (r() < 0.18) return '.';
    var x = r();
    if (steelOk && x < 0.07) return 'S';
    if (x < 0.15) return 'X';
    var lv = Math.min(0.6, n * 0.03), y = r();
    if (y < lv * 0.5) return '3';
    if (y < lv + 0.2) return '2';
    return '1';
  }

  // levels after the hand-made ones are made by code (same level number = same layout)
  function procLevel(n) {
    var r = rng(n * 97 + 5), rows = Math.min(10, 5 + Math.floor(n / 4)), out = [], i, c, half;
    for (i = 0; i < rows; i++) {
      half = '';
      for (c = 0; c < 5; c++) half += cell(r, n, true);
      out.push(half + half.split('').reverse().join(''));
    }
    out[rows - 1] = out[rows - 1].replace(/\./g, '1');
    return out;
  }

  function endlessRow() {
    var n = 1 + Math.floor((G ? G.elapsed : 0) / 40), s, cnt, c, ch;
    do {
      s = ''; cnt = 0;
      for (c = 0; c < COLS; c++) { ch = cell(Math.random, n, false); s += ch; if (ch !== '.') cnt++; }
    } while (cnt < 5);
    return s;
  }

  function mkBrick(ch, row, col) {
    var hp = ch === 'S' ? 99 : ch === 'X' ? 1 : parseInt(ch, 10);
    var b = {
      r: row, c: col, x: LEFT + col * (BW + GAP), y: BTOP + row * (BH + GAP), w: BW, h: BH,
      hp: hp, max: hp, type: ch === 'S' ? 'steel' : ch === 'X' ? 'bomb' : 'norm', alive: true, flash: 0
    };
    b.ty = b.y;
    return b;
  }

  function rowsToBricks(rows, r0) {
    var list = [];
    rows.forEach(function (line, i) {
      for (var c = 0; c < COLS; c++) {
        var ch = line.charAt(c);
        if (ch && ch !== '.') list.push(mkBrick(ch, i + r0, c));
      }
    });
    return list;
  }

  /* ---------- 3. GAME LOGIC ---------- */
  function bestKey() { return 'bb_best_' + modeKey + '_' + diffKey; }
  function getBest() { try { return parseInt(localStorage.getItem(bestKey()), 10) || 0; } catch (e) { return 0; } }

  function newGame() {
    var d = DIFFS[diffKey];
    G = {
      d: d, mode: modeKey, level: 1, score: 0, lives: d.lives,
      balls: [], bricks: [], pups: [], bolts: [], parts: [], texts: [],
      eff: { wide: 0, slow: 0, fire: 0, laser: 0, sticky: 0, shrink: 0, mega: 0, bomb: 0, score: 0 }, shield: false, rings: [],
      px: W / 2, pw: d.paddle, combo: 0, maxCombo: 0, broken: 0,
      elapsed: 0, addT: d.add, cool: 0, banner: null, best: getBest()
    };
    loadLevel(1);
  }

  function clearEffects() {
    for (var k in G.eff) G.eff[k] = 0;
  }

  function loadLevel(n) {
    G.level = n; G.pups = []; G.bolts = []; G.addT = G.d.add;
    clearEffects();
    if (G.mode === 'classic') {
      G.bricks = rowsToBricks(n <= LEVELS.length ? LEVELS[n - 1] : procLevel(n), 0);
      G.banner = { text: 'Level ' + n, t: 0 };
    } else {
      var rows = [], i;
      for (i = 0; i < 4; i++) rows.push(endlessRow());
      G.bricks = rowsToBricks(rows, 0);
      G.banner = { text: 'Endless', t: 0 };
    }
    resetBall();
  }

  function resetBall() {
    G.balls = [{ x: G.px, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true, off: 0, dead: false, trail: [] }];
    G.combo = 0;
  }

  function ballR() { return BALL_R * (G && G.eff.mega > 0 ? 1.7 : 1); }

  function curSpeed() {
    var f = G.mode === 'classic' ? 1 + Math.min(0.3, (G.level - 1) * 0.03) : 1 + Math.min(0.35, G.elapsed / 300);
    return G.d.speed * f * (G.eff.slow > 0 ? 0.7 : 1);
  }

  function multiplier() { return Math.min(3, 1 + Math.floor(G.combo / 5) * 0.5); }
  function addText(x, y, s, c) { G.texts.push({ x: x, y: y, s: s, c: c, t: 0 }); }

  // click / tap / Space: launches the ball, or shoots lasers
  function action() {
    if (state !== 'play' || !G) return;
    var any = false;
    G.balls.forEach(function (b) {
      if (!b.stuck) return;
      b.stuck = false; any = true;
      if (!b.vy) {
        var a = rand(-0.3, 0.3), s = curSpeed();
        b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s;
      }
      sfx('launch');
    });
    if (any) return;
    if (G.eff.laser > 0 && G.cool <= 0) {
      var left = G.px - G.pw / 2;
      G.bolts.push({ x: left + 8, y: PADDLE_Y }, { x: left + G.pw - 8, y: PADDLE_Y });
      G.cool = 0.28; sfx('laser');
    }
  }

  function spawnPower(x, y) {
    var type = Math.random() < 0.1 ? 'shrink' : GOOD[Math.floor(Math.random() * GOOD.length)];
    G.pups.push({ x: x, y: y, type: type });
  }

  // splits every ball: each angle adds one more ball per ball (max 9 balls in total)
  function splitBalls(angles) {
    var add = [];
    G.balls.forEach(function (b) {
      if (b.stuck) { b.stuck = false; b.vx = 0; b.vy = -curSpeed(); }
    });
    G.balls.slice().forEach(function (b) {
      angles.forEach(function (a) {
        if (G.balls.length + add.length >= 9) return;
        var c = Math.cos(a), sn = Math.sin(a);
        add.push({ x: b.x, y: b.y, vx: b.vx * c - b.vy * sn, vy: b.vx * sn + b.vy * c, stuck: false, off: 0, dead: false, trail: [] });
      });
    });
    G.balls = G.balls.concat(add);
  }

  function applyPower(type) {
    var P = POWER[type], e = G.eff;
    G.score += 50; sfx('power');
    addText(G.px, PADDLE_Y - 28, P.name, P.c);
    if (type === 'wide') { e.wide = P.dur; e.shrink = 0; }
    else if (type === 'shrink') { e.shrink = P.dur; e.wide = 0; }
    else if (type === 'life') G.lives = Math.min(9, G.lives + 1);
    else if (type === 'shield') G.shield = true;
    else if (type === 'multi') splitBalls([0.4, -0.4]);     // 3 balls from each ball
    else if (type === 'twin') splitBalls([0.3]);            // 2 balls from each ball
    else e[type] = P.dur;                                   // timed power-ups
  }

  // damage a brick. Returns nothing. Steel bricks only flash.
  function hitBrick(k, dmg) {
    if (!k.alive) return;
    if (k.type === 'steel') { k.flash = 1; sfx('steel'); return; }
    k.hp -= dmg; k.flash = 1;
    if (k.hp <= 0) destroyBrick(k); else sfx('hit');
  }

  function destroyBrick(k) {
    k.alive = false; G.combo++; G.broken++;
    if (G.combo > G.maxCombo) G.maxCombo = G.combo;
    var pts = Math.round((k.type === 'bomb' ? 30 : 10 * k.max) * multiplier() * (G.eff.score > 0 ? 2 : 1));
    G.score += pts;
    var col = k.type === 'bomb' ? '#ff6a2b' : ROW_COLORS[k.r % 8], i;
    for (i = 0; i < 12; i++) G.parts.push({ x: k.x + k.w / 2, y: k.y + k.h / 2, vx: rand(-170, 170), vy: rand(-230, 50), t: 0, life: rand(0.45, 0.9), c: i % 3 ? col : '#ffffff', s: rand(2, 4.5), a: rand(0, 6), w: rand(-8, 8) });
    G.rings.push({ x: k.x + k.w / 2, y: k.y + k.h / 2, t: 0, c: col });
    if (G.combo > 1 && G.combo % 5 === 0) addText(k.x + k.w / 2, k.y, 'Combo x' + multiplier(), '#ffd93d');
    sfx('break');
    if (k.type === 'bomb') { shake = 1; sfx('bomb'); explode(k); }
    if (Math.random() < G.d.drop) spawnPower(k.x + k.w / 2, k.y + k.h / 2);
  }

  function explode(k) {
    G.bricks.forEach(function (n) {
      if (n.alive && n !== k && Math.abs(n.r - k.r) <= 1 && Math.abs(n.c - k.c) <= 1) hitBrick(n, 1);
    });
  }

  function bounce(b, k) {
    var R = ballR();
    var cx = clamp(b.x, k.x, k.x + k.w), cy = clamp(b.y, k.y, k.y + k.h);
    var dx = b.x - cx, dy = b.y - cy, d = Math.sqrt(dx * dx + dy * dy), nx, ny;
    if (d > 0) {
      nx = dx / d; ny = dy / d;
      b.x = cx + nx * (R + 0.05); b.y = cy + ny * (R + 0.05);
    } else {                                   // ball centre is inside the brick
      var ox = Math.min(b.x - k.x, k.x + k.w - b.x), oy = Math.min(b.y - k.y, k.y + k.h - b.y);
      if (ox < oy) { nx = b.x < k.x + k.w / 2 ? -1 : 1; ny = 0; b.x = nx < 0 ? k.x - R : k.x + k.w + R; }
      else { ny = b.y < k.y + k.h / 2 ? -1 : 1; nx = 0; b.y = ny < 0 ? k.y - R : k.y + k.h + R; }
    }
    var dot = b.vx * nx + b.vy * ny;
    if (dot < 0) { b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; }
  }

  function brickCollide(b) {
    var R = ballR();
    var best = null, bd = 1e9, list = [], i, k, cx, cy, dx, dy, d2, steel = null;
    for (i = 0; i < G.bricks.length; i++) {
      k = G.bricks[i];
      if (!k.alive) continue;
      cx = clamp(b.x, k.x, k.x + k.w); cy = clamp(b.y, k.y, k.y + k.h);
      dx = b.x - cx; dy = b.y - cy; d2 = dx * dx + dy * dy;
      if (d2 <= R * R) {
        list.push(k);
        if (d2 < bd) { bd = d2; best = k; }
        if (k.type === 'steel' && (!steel || d2 < steel.d2)) steel = { k: k, d2: d2 };
      }
    }
    if (!best) return;
    if (G.eff.fire > 0) {                      // fireball burns through bricks (but not steel)
      list.forEach(function (n) { if (n.type !== 'steel' && n.alive) hitBrick(n, 99); });
      if (steel) { bounce(b, steel.k); hitBrick(steel.k, 1); }
      return;
    }
    bounce(b, best);
    hitBrick(best, G.eff.mega > 0 ? 2 : 1);               // giant ball hits twice as hard
    if (G.eff.bomb > 0 && best.type !== 'steel') {         // bomb ball: every hit explodes the bricks around it
      G.rings.push({ x: best.x + best.w / 2, y: best.y + best.h / 2, t: 0, c: '#ff8a3d' });
      shake = Math.max(shake, 0.4); sfx('bomb'); explode(best);
    }
  }

  function paddleCollide(b) {
    var R = ballR();
    if (b.vy <= 0) return;
    var pw = G.pw, left = G.px - pw / 2;
    if (b.y + R >= PADDLE_Y && b.y - R <= PADDLE_Y + PADDLE_H && b.x >= left - R && b.x <= left + pw + R) {
      b.y = PADDLE_Y - R;
      var rel = clamp((b.x - G.px) / (pw / 2 + R), -1, 1), a = rel * 1.1 + rand(-0.05, 0.05), s = curSpeed();   // tiny random angle so the ball never loops straight up and down
      b.vx = Math.sin(a) * s; b.vy = -Math.cos(a) * s;
      G.combo = 0; sfx('paddle');
      if (G.eff.sticky > 0) { b.stuck = true; b.off = b.x - G.px; }
    }
  }

  function stepBall(b, dt) {
    var R = ballR();
    var sp = curSpeed(), len = Math.hypot(b.vx, b.vy) || 1, vx = b.vx / len, vy = b.vy / len;
    if (Math.abs(vy) < 0.22) { vy = (vy < 0 ? -1 : 1) * 0.22; vx = (vx < 0 ? -1 : 1) * 0.9755; }   // never fly almost flat
    b.vx = vx * sp; b.vy = vy * sp;
    var n = Math.max(1, Math.ceil(sp * dt / 3)), sd = dt / n, i;
    for (i = 0; i < n; i++) {
      b.x += b.vx * sd; b.y += b.vy * sd;
      if (b.x - R < 0) { b.x = R; b.vx = Math.abs(b.vx); }
      else if (b.x + R > W) { b.x = W - R; b.vx = -Math.abs(b.vx); }
      if (b.y - R < TOP) { b.y = TOP + R; b.vy = Math.abs(b.vy); }
      paddleCollide(b);
      if (b.stuck) return;
      brickCollide(b);
      if (G.shield && b.vy > 0 && b.y + R >= SHIELD_Y) {        // safety net saves the ball once
        G.shield = false; b.y = SHIELD_Y - R; b.vy = -Math.abs(b.vy); shake = 0.6; sfx('shield');
        addText(b.x, SHIELD_Y - 24, 'Saved!', '#4de0b4');
      }
      if (b.y - R > H) { b.dead = true; return; }
    }
  }

  function loseLife() {
    G.lives--; shake = 1; sfx('lose');
    clearEffects(); G.pups = []; G.bolts = [];
    if (G.lives <= 0) { gameOver('You ran out of lives'); return; }
    resetBall();
    G.banner = { text: 'Get ready', t: 0 };
  }

  function levelClear() {
    var bonus = 500 + G.lives * 100;
    G.score += bonus;
    $('cTitle').textContent = 'Level ' + G.level + ' clear!';
    $('cBonus').textContent = 'Bonus +' + bonus;
    sfx('win');
    setState('clear');
  }

  function fmt(sec) { return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }

  function gameOver(msg) {
    var best = getBest();
    if (G.score > best) { best = G.score; try { localStorage.setItem(bestKey(), String(best)); } catch (e) {} }
    G.best = best;
    sfx('over');
    var endless = G.mode === 'endless';
    $('oTitle').textContent = 'Game over';
    $('oMsg').textContent = msg;
    $('oScore').textContent = G.score;
    $('oBest').textContent = best;
    $('oLevel').textContent = G.level;
    $('oTime').textContent = fmt(Math.floor(G.elapsed));
    $('oBricks').textContent = G.broken;
    $('oCombo').textContent = G.maxCombo;
    $('oLevelLi').classList.toggle('hidden', endless);
    $('oTimeLi').classList.toggle('hidden', !endless);
    setState('over');
  }

  function addEndlessRow() {
    G.bricks.forEach(function (k) { if (k.alive) { k.r++; k.ty = BTOP + k.r * (BH + GAP); } });
    G.bricks = G.bricks.concat(rowsToBricks([endlessRow()], 0));
    G.addT = G.d.add * Math.max(0.45, 1 - G.elapsed / 400);
  }

  function update(dt) {
    t += dt;
    shake = Math.max(0, shake - dt * 3);
    if (state !== 'play' || !G) return;

    G.elapsed += dt;
    var e = G.eff, k;
    G.cool = Math.max(0, G.cool - dt);
    for (k in e) if (e[k] > 0) {
      e[k] = Math.max(0, e[k] - dt);
      if (k === 'sticky' && e[k] === 0) G.balls.forEach(function (b) { if (b.stuck) { b.stuck = false; sfx('launch'); } });
    }

    // paddle
    var target = G.d.paddle * (e.wide > 0 ? 1.5 : e.shrink > 0 ? 0.7 : 1);
    G.pw += (target - G.pw) * Math.min(1, dt * 10);
    G.px += (keys.r - keys.l) * 560 * dt;
    G.px = clamp(G.px, G.pw / 2, W - G.pw / 2);

    // balls
    G.balls.forEach(function (b) {
      if (b.stuck) {
        if (!b.vy && !b.vx) { b.off = 0; }
        b.x = clamp(G.px + b.off, BALL_R, W - BALL_R); b.y = PADDLE_Y - ballR() - 1;
      } else stepBall(b, dt);
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 7) b.trail.shift();
    });
    G.balls = G.balls.filter(function (b) { return !b.dead; });

    // lasers
    G.bolts.forEach(function (bolt) {
      bolt.y -= 720 * dt;
      var hit = null, i, n;
      for (i = 0; i < G.bricks.length; i++) {
        n = G.bricks[i];
        if (n.alive && bolt.x >= n.x && bolt.x <= n.x + n.w && bolt.y <= n.y + n.h && bolt.y + 14 >= n.y) {
          if (!hit || n.y > hit.y) hit = n;
        }
      }
      if (hit) { hitBrick(hit, 1); bolt.dead = true; }
      else if (bolt.y < TOP) bolt.dead = true;
    });
    G.bolts = G.bolts.filter(function (b) { return !b.dead; });

    // falling power-ups
    var left = G.px - G.pw / 2;
    G.pups = G.pups.filter(function (p) {
      p.y += 160 * dt;
      if (p.y + 9 >= PADDLE_Y && p.y - 9 <= PADDLE_Y + PADDLE_H && p.x >= left - 17 && p.x <= left + G.pw + 17) { applyPower(p.type); return false; }
      return p.y < H + 20;
    });

    // bricks (smooth drop in Endless) and effects
    G.bricks.forEach(function (n) {
      if (n.alive) { n.y += (n.ty - n.y) * Math.min(1, dt * 10); n.flash = Math.max(0, n.flash - dt * 5); }
    });
    G.bricks = G.bricks.filter(function (n) { return n.alive; });
    G.parts.forEach(function (p) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; });
    G.parts = G.parts.filter(function (p) { return p.t < p.life; });
    G.rings.forEach(function (r) { r.t += dt; });
    G.rings = G.rings.filter(function (r) { return r.t < 0.35; });
    G.texts.forEach(function (x) { x.t += dt; x.y -= 34 * dt; });
    G.texts = G.texts.filter(function (x) { return x.t < 1.1; });
    if (G.banner) { G.banner.t += dt; if (G.banner.t > 2) G.banner = null; }

    var anyBreakable = G.bricks.some(function (n) { return n.type !== 'steel'; });
    if (G.mode === 'classic') {
      if (!anyBreakable) { levelClear(); return; }
    } else {
      if (!anyBreakable) G.addT = 0;
      G.addT -= dt;
      if (G.addT <= 0) addEndlessRow();
      if (G.bricks.some(function (n) { return n.ty + n.h >= PADDLE_Y - 30; })) { gameOver('The bricks reached you'); return; }
    }

    if (!G.balls.length) loseLife();
  }

  /* ---------- 4. DRAWING ---------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function label(txt, x, y, size, color, align) {
    ctx.font = 'bold ' + size + 'px ' + FONT; ctx.textAlign = align || 'left';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineJoin = 'round'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = color; ctx.fillText(txt, x, y);
  }

  function heart(x, y, sz, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y + sz * 0.8);
    ctx.bezierCurveTo(x - sz * 1.5, y - sz * 0.1, x - sz * 0.7, y - sz * 1.1, x, y - sz * 0.4);
    ctx.bezierCurveTo(x + sz * 0.7, y - sz * 1.1, x + sz * 1.5, y - sz * 0.1, x, y + sz * 0.8);
    ctx.fill();
  }

  function drawBg() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#120a35'); g.addColorStop(0.6, '#1d1050'); g.addColorStop(1, '#2d1068');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t * 0.8 + s.p));
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  // lighten (amt > 0) or darken (amt < 0) a '#rrggbb' color. Results are cached.
  var shadeCache = {};
  function shade(hex, amt) {
    var key = hex + amt, c = shadeCache[key];
    if (c) return c;
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, to = amt < 0 ? 0 : 255, a = Math.abs(amt);
    r = Math.round(r + (to - r) * a); g = Math.round(g + (to - g) * a); b = Math.round(b + (to - b) * a);
    return (shadeCache[key] = 'rgb(' + r + ',' + g + ',' + b + ')');
  }

  // glossy gem brick body
  function brickBody(x, y, w, h, base) {
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(base, 0.35)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, -0.38));
    ctx.fillStyle = g; rr(x, y, w, h, 5); ctx.fill();
    ctx.globalAlpha = 0.75; ctx.lineWidth = 1.2;
    ctx.strokeStyle = shade(base, 0.6); ctx.beginPath(); ctx.moveTo(x + 5, y + 0.8); ctx.lineTo(x + w - 5, y + 0.8); ctx.stroke();
    ctx.strokeStyle = shade(base, -0.6); ctx.beginPath(); ctx.moveTo(x + 5, y + h - 0.8); ctx.lineTo(x + w - 5, y + h - 0.8); ctx.stroke();
    ctx.globalAlpha = 1;
    var gl = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
    gl.addColorStop(0, 'rgba(255,255,255,.5)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; rr(x + 2, y + 2, w - 4, h * 0.5, 4); ctx.fill();
  }

  // a diagonal shine that slides across the bricks
  function brickShine(k) {
    var p = ((t * 70 + k.c * 24 + k.r * 40) % 420) - 60;
    if (p < -14 || p > k.w + 14) return;
    ctx.save(); rr(k.x, k.y, k.w, k.h, 5); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.38)';
    ctx.beginPath(); ctx.moveTo(k.x + p, k.y); ctx.lineTo(k.x + p + 8, k.y); ctx.lineTo(k.x + p - 4, k.y + k.h); ctx.lineTo(k.x + p - 12, k.y + k.h); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBrick(k) {
    var x = k.x, y = k.y, w = k.w, h = k.h, i, base, cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(x, y + 3, w, h, 5); ctx.fill();              // shadow
    if (k.type === 'steel') {
      var g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#eef2f8'); g.addColorStop(0.5, '#9aa4b5'); g.addColorStop(1, '#566073');
      ctx.fillStyle = g; rr(x, y, w, h, 5); ctx.fill();
      ctx.save(); rr(x, y, w, h, 5); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.beginPath();
      for (i = -h; i < w; i += 8) { ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); }
      ctx.stroke(); ctx.restore();
      ctx.strokeStyle = '#3d4554'; ctx.lineWidth = 1.5; rr(x + 0.75, y + 0.75, w - 1.5, h - 1.5, 5); ctx.stroke();
      ctx.fillStyle = '#39404e';
      [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]].forEach(function (q) { ctx.beginPath(); ctx.arc(x + q[0], y + q[1], 2, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      [[6, 5], [w - 6, 5]].forEach(function (q) { ctx.beginPath(); ctx.arc(x + q[0], y + q[1], 0.8, 0, Math.PI * 2); ctx.fill(); });
    } else if (k.type === 'bomb') {
      ctx.fillStyle = 'rgba(255,120,40,' + (0.2 + 0.12 * Math.sin(t * 6 + k.c)) + ')'; rr(x - 3, y - 3, w + 6, h + 6, 8); ctx.fill();
      brickBody(x, y, w, h, '#d6382f');
      ctx.fillStyle = '#17100e'; ctx.beginPath(); ctx.arc(cx - 2, cy + 2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(cx - 4.5, cy - 0.5, 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c9a36b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + 2, cy - 3); ctx.quadraticCurveTo(cx + 8, cy - 5, cx + 9, cy - 9); ctx.stroke();
      ctx.fillStyle = Math.sin(t * 25 + k.c) > 0 ? '#ffd93d' : '#ff8a3d';
      ctx.beginPath(); ctx.arc(cx + 9, cy - 9, 2.6, 0, Math.PI * 2); ctx.fill();
    } else {
      base = ROW_COLORS[k.r % 8];
      if (k.max > 1) {                                           // strong brick: metal frame + dots
        var fg = ctx.createLinearGradient(0, y, 0, y + h);
        fg.addColorStop(0, k.max > 2 ? '#fff3bd' : '#ffffff'); fg.addColorStop(1, k.max > 2 ? '#c99a2e' : '#8d96ad');
        ctx.fillStyle = fg; rr(x - 1, y - 1, w + 2, h + 2, 6); ctx.fill();
        brickBody(x + 3, y + 3, w - 6, h - 6, base);
        for (i = 0; i < k.hp; i++) {
          var dx = cx + (i - (k.hp - 1) / 2) * 10;
          ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.arc(dx, cy + 0.5, 3.3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(dx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        if (k.hp < k.max) {
          ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5; ctx.beginPath();
          ctx.moveTo(x + w * 0.26, y + 3); ctx.lineTo(x + w * 0.38, y + h * 0.5); ctx.lineTo(x + w * 0.29, y + h - 3);
          if (k.max - k.hp > 1) { ctx.moveTo(x + w * 0.74, y + 3); ctx.lineTo(x + w * 0.62, y + h * 0.5); ctx.lineTo(x + w * 0.71, y + h - 3); }
          ctx.stroke();
        }
      } else brickBody(x, y, w, h, base);
      brickShine(k);
    }
    if (k.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + k.flash * 0.6 + ')'; rr(x, y, w, h, 5); ctx.fill(); }
  }

  // fx = the active effects (fire, bomb, mega change how the ball looks)
  function drawBall(b, fx) {
    var R = ballR(), fire = fx && fx.fire > 0, bomb = fx && fx.bomb > 0, mega = fx && fx.mega > 0, i, p;
    var col = fire ? '255,140,50' : bomb ? '255,80,50' : mega ? '176,123,255' : '255,255,255';
    for (i = 0; i < b.trail.length; i++) {
      p = b.trail[i];
      ctx.fillStyle = 'rgba(' + col + ',' + (i / b.trail.length * 0.28) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, R * (0.4 + i / b.trail.length * 0.55), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(' + col + ',.25)';
    ctx.beginPath(); ctx.arc(b.x, b.y, R * 2, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createRadialGradient(b.x - R * 0.3, b.y - R * 0.3, 1, b.x, b.y, R);
    g.addColorStop(0, bomb ? '#ff9a7a' : '#ffffff'); g.addColorStop(1, fire ? '#ff7a1a' : bomb ? '#6a0f0f' : mega ? '#7d4bff' : '#aebbff');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
    if (bomb) { ctx.fillStyle = Math.sin(t * 25) > 0 ? '#ffd93d' : '#ff8a3d'; ctx.beginPath(); ctx.arc(b.x + R * 0.7, b.y - R * 0.9, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawPaddle(px, pw, eff) {
    var x = px - pw / 2, sticky = eff && eff.sticky > 0, col = sticky ? '#3fcf73' : '#7b5cff';
    ctx.globalAlpha = 0.25; ctx.fillStyle = col; rr(x - 4, PADDLE_Y - 3, pw + 8, PADDLE_H + 8, 11); ctx.fill(); ctx.globalAlpha = 1;
    if (eff && eff.laser > 0) {
      ctx.fillStyle = '#ff4d5e'; rr(x + 4, PADDLE_Y - 9, 8, 12, 3); ctx.fill(); rr(x + pw - 12, PADDLE_Y - 9, 8, 12, 3); ctx.fill();
    }
    var g = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, sticky ? '#a6f5bd' : '#d4cbff'); g.addColorStop(1, col);
    ctx.fillStyle = g; rr(x, PADDLE_Y, pw, PADDLE_H, 7); ctx.fill();
    ctx.fillStyle = '#35d0e8'; rr(x + 1, PADDLE_Y + 3, 10, PADDLE_H - 6, 3); ctx.fill(); rr(x + pw - 11, PADDLE_Y + 3, 10, PADDLE_H - 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x + 15, PADDLE_Y + 2, Math.max(0, pw - 30), 2.5);
  }

  function drawPills() {
    var list = [], k, i, x, P;
    for (k in G.eff) if (G.eff[k] > 0) list.push(k);
    x = W / 2 - list.length * 28;
    for (i = 0; i < list.length; i++) {
      P = POWER[list[i]];
      ctx.fillStyle = P.c; rr(x + i * 56, 698, 52, 18, 9); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = 'bold 12px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText(P.t + ' ' + Math.ceil(G.eff[list[i]]), x + i * 56 + 26, 711);
    }
  }

  function drawHUD() {
    var m = multiplier(), i;
    ctx.fillStyle = 'rgba(5,3,20,.7)'; ctx.fillRect(0, 0, W, TOP);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(0, TOP - 1, W, 1);
    label('Score ' + G.score, 14, 26, 22, '#ffffff');
    label((G.mode === 'classic' ? 'Level ' + G.level : fmt(Math.floor(G.elapsed))) + '  |  Best ' + Math.max(G.best, G.score), 14, 49, 14, '#cdbbe9');
    heart(262, 22, 8, '#ff4d6d');
    label('x' + G.lives, 276, 28, 18, '#ffffff');
    if (G.combo > 1 && m > 1) label('Combo x' + m, 262, 50, 14, '#ffd93d');
  }

  function drawGame() {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-1, 1) * shake * 6, rand(-1, 1) * shake * 6);
    G.bricks.forEach(drawBrick);
    G.pups.forEach(function (p) {
      var P = POWER[p.type], pl = 1 + 0.06 * Math.sin(t * 8 + p.x), cw = 18 * pl;
      ctx.globalAlpha = 0.28; ctx.fillStyle = P.c; rr(p.x - 23, p.y - 14, 46, 28, 14); ctx.fill(); ctx.globalAlpha = 1;
      var g = ctx.createLinearGradient(0, p.y - 10, 0, p.y + 10);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, P.c); g.addColorStop(1, shade(P.c, -0.4));
      ctx.fillStyle = g; rr(p.x - cw, p.y - 10, cw * 2, 20, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; rr(p.x - cw, p.y - 10, cw * 2, 20, 10); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = 'bold 14px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(P.t, p.x, p.y + 5);
    });
    G.bolts.forEach(function (bolt) {
      bolt.y -= 720 * dt;
      var hit = null, i, n;
      for (i = 0; i < G.bricks.length; i++) {
        n = G.bricks[i];
        if (n.alive && bolt.x >= n.x && bolt.x <= n.x + n.w && bolt.y <= n.y + n.h && bolt.y + 14 >= n.y) {
          if (!hit || n.y > hit.y) hit = n;
        }
      }
      if (hit) { hitBrick(hit, 1); bolt.dead = true; }
      else if (bolt.y < TOP) bolt.dead = true;
    });
    G.bolts = G.bolts.filter(function (b) { return !b.dead; });

    // falling power-ups
    var left = G.px - G.pw / 2;
    G.pups = G.pups.filter(function (p) {
      p.y += 160 * dt;
      if (p.y + 9 >= PADDLE_Y && p.y - 9 <= PADDLE_Y + PADDLE_H && p.x >= left - 17 && p.x <= left + G.pw + 17) { applyPower(p.type); return false; }
      return p.y < H + 20;
    });

    // bricks (smooth drop in Endless) and effects
    G.bricks.forEach(function (n) {
      if (n.alive) { n.y += (n.ty - n.y) * Math.min(1, dt * 10); n.flash = Math.max(0, n.flash - dt * 5); }
    });
    G.bricks = G.bricks.filter(function (n) { return n.alive; });
    G.parts.forEach(function (p) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; });
    G.parts = G.parts.filter(function (p) { return p.t < p.life; });
    G.rings.forEach(function (r) { r.t += dt; });
    G.rings = G.rings.filter(function (r) { return r.t < 0.35; });
    G.texts.forEach(function (x) { x.t += dt; x.y -= 34 * dt; });
    G.texts = G.texts.filter(function (x) { return x.t < 1.1; });
    if (G.banner) { G.banner.t += dt; if (G.banner.t > 2) G.banner = null; }

    var anyBreakable = G.bricks.some(function (n) { return n.type !== 'steel'; });
    if (G.mode === 'classic') {
      if (!anyBreakable) { levelClear(); return; }
    } else {
      if (!anyBreakable) G.addT = 0;
      G.addT -= dt;
      if (G.addT <= 0) addEndlessRow();
      if (G.bricks.some(function (n) { return n.ty + n.h >= PADDLE_Y - 30; })) { gameOver('The bricks reached you'); return; }
    }

    if (!G.balls.length) loseLife();
  }

  /* ---------- 4. DRAWING ---------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function label(txt, x, y, size, color, align) {
    ctx.font = 'bold ' + size + 'px ' + FONT; ctx.textAlign = align || 'left';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineJoin = 'round'; ctx.strokeText(txt, x, y);
    ctx.fillStyle = color; ctx.fillText(txt, x, y);
  }

  function heart(x, y, sz, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y + sz * 0.8);
    ctx.bezierCurveTo(x - sz * 1.5, y - sz * 0.1, x - sz * 0.7, y - sz * 1.1, x, y - sz * 0.4);
    ctx.bezierCurveTo(x + sz * 0.7, y - sz * 1.1, x + sz * 1.5, y - sz * 0.1, x, y + sz * 0.8);
    ctx.fill();
  }

  function drawBg() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#120a35'); g.addColorStop(0.6, '#1d1050'); g.addColorStop(1, '#2d1068');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t * 0.8 + s.p));
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  // lighten (amt > 0) or darken (amt < 0) a '#rrggbb' color. Results are cached.
  var shadeCache = {};
  function shade(hex, amt) {
    var key = hex + amt, c = shadeCache[key];
    if (c) return c;
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, to = amt < 0 ? 0 : 255, a = Math.abs(amt);
    r = Math.round(r + (to - r) * a); g = Math.round(g + (to - g) * a); b = Math.round(b + (to - b) * a);
    return (shadeCache[key] = 'rgb(' + r + ',' + g + ',' + b + ')');
  }

  // glossy gem brick body
  function brickBody(x, y, w, h, base) {
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(base, 0.35)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, -0.38));
    ctx.fillStyle = g; rr(x, y, w, h, 5); ctx.fill();
    ctx.globalAlpha = 0.75; ctx.lineWidth = 1.2;
    ctx.strokeStyle = shade(base, 0.6); ctx.beginPath(); ctx.moveTo(x + 5, y + 0.8); ctx.lineTo(x + w - 5, y + 0.8); ctx.stroke();
    ctx.strokeStyle = shade(base, -0.6); ctx.beginPath(); ctx.moveTo(x + 5, y + h - 0.8); ctx.lineTo(x + w - 5, y + h - 0.8); ctx.stroke();
    ctx.globalAlpha = 1;
    var gl = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
    gl.addColorStop(0, 'rgba(255,255,255,.5)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; rr(x + 2, y + 2, w - 4, h * 0.5, 4); ctx.fill();
  }

  // a diagonal shine that slides across the bricks
  function brickShine(k) {
    var p = ((t * 70 + k.c * 24 + k.r * 40) % 420) - 60;
    if (p < -14 || p > k.w + 14) return;
    ctx.save(); rr(k.x, k.y, k.w, k.h, 5); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.38)';
    ctx.beginPath(); ctx.moveTo(k.x + p, k.y); ctx.lineTo(k.x + p + 8, k.y); ctx.lineTo(k.x + p - 4, k.y + k.h); ctx.lineTo(k.x + p - 12, k.y + k.h); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBrick(k) {
    var x = k.x, y = k.y, w = k.w, h = k.h, i, base, cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(x, y + 3, w, h, 5); ctx.fill();              // shadow
    if (k.type === 'steel') {
      var g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#eef2f8'); g.addColorStop(0.5, '#9aa4b5'); g.addColorStop(1, '#566073');
      ctx.fillStyle = g; rr(x, y, w, h, 5); ctx.fill();
      ctx.save(); rr(x, y, w, h, 5); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.beginPath();
      for (i = -h; i < w; i += 8) { ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); }
      ctx.stroke(); ctx.restore();
      ctx.strokeStyle = '#3d4554'; ctx.lineWidth = 1.5; rr(x + 0.75, y + 0.75, w - 1.5, h - 1.5, 5); ctx.stroke();
      ctx.fillStyle = '#39404e';
      [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]].forEach(function (q) { ctx.beginPath(); ctx.arc(x + q[0], y + q[1], 2, 0, Math.PI * 2); ctx.fill(); });
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      [[6, 5], [w - 6, 5]].forEach(function (q) { ctx.beginPath(); ctx.arc(x + q[0], y + q[1], 0.8, 0, Math.PI * 2); ctx.fill(); });
    } else if (k.type === 'bomb') {
      ctx.fillStyle = 'rgba(255,120,40,' + (0.2 + 0.12 * Math.sin(t * 6 + k.c)) + ')'; rr(x - 3, y - 3, w + 6, h + 6, 8); ctx.fill();
      brickBody(x, y, w, h, '#d6382f');
      ctx.fillStyle = '#17100e'; ctx.beginPath(); ctx.arc(cx - 2, cy + 2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(cx - 4.5, cy - 0.5, 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c9a36b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx + 2, cy - 3); ctx.quadraticCurveTo(cx + 8, cy - 5, cx + 9, cy - 9); ctx.stroke();
      ctx.fillStyle = Math.sin(t * 25 + k.c) > 0 ? '#ffd93d' : '#ff8a3d';
      ctx.beginPath(); ctx.arc(cx + 9, cy - 9, 2.6, 0, Math.PI * 2); ctx.fill();
    } else {
      base = ROW_COLORS[k.r % 8];
      if (k.max > 1) {                                           // strong brick: metal frame + dots
        var fg = ctx.createLinearGradient(0, y, 0, y + h);
        fg.addColorStop(0, k.max > 2 ? '#fff3bd' : '#ffffff'); fg.addColorStop(1, k.max > 2 ? '#c99a2e' : '#8d96ad');
        ctx.fillStyle = fg; rr(x - 1, y - 1, w + 2, h + 2, 6); ctx.fill();
        brickBody(x + 3, y + 3, w - 6, h - 6, base);
        for (i = 0; i < k.hp; i++) {
          var dx = cx + (i - (k.hp - 1) / 2) * 10;
          ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.arc(dx, cy + 0.5, 3.3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(dx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        if (k.hp < k.max) {
          ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.5; ctx.beginPath();
          ctx.moveTo(x + w * 0.26, y + 3); ctx.lineTo(x + w * 0.38, y + h * 0.5); ctx.lineTo(x + w * 0.29, y + h - 3);
          if (k.max - k.hp > 1) { ctx.moveTo(x + w * 0.74, y + 3); ctx.lineTo(x + w * 0.62, y + h * 0.5); ctx.lineTo(x + w * 0.71, y + h - 3); }
          ctx.stroke();
        }
      } else brickBody(x, y, w, h, base);
      brickShine(k);
    }
    if (k.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + k.flash * 0.6 + ')'; rr(x, y, w, h, 5); ctx.fill(); }
  }

  // fx = the active effects (fire, bomb, mega change how the ball looks)
  function drawBall(b, fx) {
    var R = ballR(), fire = fx && fx.fire > 0, bomb = fx && fx.bomb > 0, mega = fx && fx.mega > 0, i, p;
    var col = fire ? '255,140,50' : bomb ? '255,80,50' : mega ? '176,123,255' : '255,255,255';
    for (i = 0; i < b.trail.length; i++) {
      p = b.trail[i];
      ctx.fillStyle = 'rgba(' + col + ',' + (i / b.trail.length * 0.28) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, R * (0.4 + i / b.trail.length * 0.55), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(' + col + ',.25)';
    ctx.beginPath(); ctx.arc(b.x, b.y, R * 2, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createRadialGradient(b.x - R * 0.3, b.y - R * 0.3, 1, b.x, b.y, R);
    g.addColorStop(0, bomb ? '#ff9a7a' : '#ffffff'); g.addColorStop(1, fire ? '#ff7a1a' : bomb ? '#6a0f0f' : mega ? '#7d4bff' : '#aebbff');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
    if (bomb) { ctx.fillStyle = Math.sin(t * 25) > 0 ? '#ffd93d' : '#ff8a3d'; ctx.beginPath(); ctx.arc(b.x + R * 0.7, b.y - R * 0.9, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawPaddle(px, pw, eff) {
    var x = px - pw / 2, sticky = eff && eff.sticky > 0, col = sticky ? '#3fcf73' : '#7b5cff';
    ctx.globalAlpha = 0.25; ctx.fillStyle = col; rr(x - 4, PADDLE_Y - 3, pw + 8, PADDLE_H + 8, 11); ctx.fill(); ctx.globalAlpha = 1;
    if (eff && eff.laser > 0) {
      ctx.fillStyle = '#ff4d5e'; rr(x + 4, PADDLE_Y - 9, 8, 12, 3); ctx.fill(); rr(x + pw - 12, PADDLE_Y - 9, 8, 12, 3); ctx.fill();
    }
    var g = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, sticky ? '#a6f5bd' : '#d4cbff'); g.addColorStop(1, col);
    ctx.fillStyle = g; rr(x, PADDLE_Y, pw, PADDLE_H, 7); ctx.fill();
    ctx.fillStyle = '#35d0e8'; rr(x + 1, PADDLE_Y + 3, 10, PADDLE_H - 6, 3); ctx.fill(); rr(x + pw - 11, PADDLE_Y + 3, 10, PADDLE_H - 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x + 15, PADDLE_Y + 2, Math.max(0, pw - 30), 2.5);
  }

  function drawPills() {
    var list = [], k, i, x, P;
    for (k in G.eff) if (G.eff[k] > 0) list.push(k);
    x = W / 2 - list.length * 28;
    for (i = 0; i < list.length; i++) {
      P = POWER[list[i]];
      ctx.fillStyle = P.c; rr(x + i * 56, 698, 52, 18, 9); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = 'bold 12px ' + FONT; ctx.textAlign = 'center';
      ctx.fillText(P.t + ' ' + Math.ceil(G.eff[list[i]]), x + i * 56 + 26, 711);
    }
  }

  function drawHUD() {
    var m = multiplier(), i;
    ctx.fillStyle = 'rgba(5,3,20,.7)'; ctx.fillRect(0, 0, W, TOP);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(0, TOP - 1, W, 1);
    label('Score ' + G.score, 14, 26, 22, '#ffffff');
    label((G.mode === 'classic' ? 'Level ' + G.level : fmt(Math.floor(G.elapsed))) + '  |  Best ' + Math.max(G.best, G.score), 14, 49, 14, '#cdbbe9');
    heart(262, 22, 8, '#ff4d6d');
    label('x' + G.lives, 276, 28, 18, '#ffffff');
    if (G.combo > 1 && m > 1) label('Combo x' + m, 262, 50, 14, '#ffd93d');
  }

  function drawGame() {
    ctx.save();
    if (shake > 0) ctx.translate(rand(-1, 1) * shake * 6, rand(-1, 1) * shake * 6);
    G.bricks.forEach(drawBrick);
    G.pups.forEach(function (p) {
      var P = POWER[p.type];
      ctx.fillStyle = P.c; rr(p.x - 17, p.y - 9, 34, 18, 9); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; rr(p.x - 17, p.y - 9, 34, 18, 9); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = 'bold 15px ' + FONT; ctx.textAlign = 'center'; ctx.fillText(P.t, p.x, p.y + 5.5);
    });
    G.bolts.forEach(function (b) { ctx.fillStyle = '#ff6b7a'; ctx.fillRect(b.x - 2, b.y, 4, 14); });
    G.balls.forEach(function (b) { drawBall(b, G.eff); });
    if (G.shield) {                                              // safety net
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#4de0b4'; ctx.fillRect(0, SHIELD_Y - 6, W, 12);
      ctx.globalAlpha = 0.7 + 0.2 * Math.sin(t * 6); ctx.fillRect(0, SHIELD_Y - 2, W, 4); ctx.globalAlpha = 1;
    }
    drawPaddle(G.px, G.pw, G.eff);
    G.parts.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.c;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a + p.t * p.w); ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); ctx.restore();
    });
    G.rings.forEach(function (r) {
      ctx.globalAlpha = Math.max(0, 1 - r.t / 0.35); ctx.strokeStyle = r.c; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, 6 + r.t * 90, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    G.texts.forEach(function (x) {
      ctx.globalAlpha = Math.max(0, 1 - x.t / 1.1); label(x.s, x.x, x.y, 17, x.c, 'center');
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    drawHUD();
    drawPills();
    if (state === 'play' && G.balls.some(function (b) { return b.stuck; })) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
      label(isTouch ? 'Tap to launch' : 'Click or press Space to launch', W / 2, PADDLE_Y - 60, 18, '#ffffff', 'center');
      ctx.globalAlpha = 1;
    }
    if (G.banner) {
      var bt = G.banner.t;
      ctx.globalAlpha = bt < 0.3 ? bt / 0.3 : bt > 1.6 ? Math.max(0, (2 - bt) / 0.4) : 1;
      label(G.banner.text, W / 2, H * 0.58, 38, '#ffd93d', 'center');
      ctx.globalAlpha = 1;
    }
  }

  function drawDemo() {
    var x = W / 2 + Math.sin(t * 1.3) * 190, y = 430 + Math.sin(t * 2.1) * 120;
    ctx.globalAlpha = 0.45;
    demoBricks.forEach(drawBrick);
    drawPaddle(clamp(x, 60, W - 60), 96, null);
    drawBall({ x: x, y: y, trail: [] }, null);
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawBg();
    if (!G || state === 'menu') drawDemo(); else drawGame();
  }

  /* ---------- 5. SOUND (made with code, no files) ---------- */
  var AC = null;
  function audio() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (AC && AC.state === 'suspended') AC.resume();
  }
  function tone(f1, f2, dur, type, vol, delay) {
    if (!AC || muted) return;
    var o = AC.createOscillator(), g = AC.createGain(), n = AC.currentTime + (delay || 0);
    o.type = type;
    o.frequency.setValueAtTime(f1, n); o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), n + dur);
    g.gain.setValueAtTime(vol, n); g.gain.exponentialRampToValueAtTime(0.001, n + dur);
    o.connect(g); g.connect(AC.destination); o.start(n); o.stop(n + dur);
  }
  function noise(dur, vol) {
    if (!AC || muted) return;
    var len = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0), i;
    for (i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var s = AC.createBufferSource(), g = AC.createGain();
    s.buffer = buf; g.gain.value = vol; s.connect(g); g.connect(AC.destination); s.start();
  }
  function sfx(name) {
    if (name === 'paddle') tone(260, 200, 0.07, 'square', 0.12);
    else if (name === 'launch') tone(300, 600, 0.1, 'square', 0.1);
    else if (name === 'hit') tone(420, 300, 0.06, 'square', 0.1);
    else if (name === 'steel') tone(900, 700, 0.06, 'triangle', 0.12);
    else if (name === 'break') tone(380 + Math.min(G ? G.combo : 0, 20) * 30, 700, 0.09, 'square', 0.12);
    else if (name === 'bomb') { noise(0.3, 0.4); tone(160, 40, 0.3, 'sawtooth', 0.25); }
    else if (name === 'power') { tone(500, 900, 0.1, 'square', 0.12); tone(700, 1200, 0.12, 'square', 0.12, 0.08); }
    else if (name === 'laser') tone(1000, 300, 0.12, 'sawtooth', 0.1);
    else if (name === 'lose') tone(300, 80, 0.4, 'sawtooth', 0.25);
    else if (name === 'win') { tone(500, 500, 0.12, 'square', 0.12); tone(650, 650, 0.12, 'square', 0.12, 0.12); tone(800, 800, 0.2, 'square', 0.12, 0.24); }
    else if (name === 'shield') { tone(500, 900, 0.15, 'triangle', 0.15); }
    else if (name === 'over') { tone(400, 100, 0.6, 'sawtooth', 0.25); }
  }

  /* ---------- 6. MENUS AND INPUT ---------- */
  var screens = { menu: $('menu'), help: $('help'), pause: $('pause'), clear: $('clear'), over: $('over') };

  function setState(s) {
    state = s;
    var map = { menu: 'menu', help: 'help', paused: 'pause', clear: 'clear', over: 'over', play: null };
    for (var k in screens) screens[k].classList.toggle('hidden', k !== map[s]);
    $('hudBtns').classList.toggle('hidden', s !== 'play');
    canvas.classList.toggle('playing', s === 'play');
    keys.l = keys.r = 0; touch = null;
  }

  function openHelp(from) {
    helpFrom = from;
    var items = isTouch
      ? ['<b>Drag</b> anywhere on the game to move the paddle.',
         '<b>Tap</b> to launch the ball (and to shoot lasers).',
         'Use the pause button (top right) to pause.']
      : ['Move the <b>mouse</b> (or use <b>arrow keys</b> / <b>A D</b>) to move the paddle.',
         '<b>Click</b> or press <b>Space</b> to launch the ball (and to shoot lasers).',
         'Press <b>P</b> or <b>Esc</b> to pause.'];
    items.push(modeKey === 'classic' ? 'Break <b>every brick</b> to clear the level. Steel bricks cannot be broken.'
                                     : 'Break bricks fast. If they reach your paddle, <b>game over</b>.');
    items.push('Catch the falling <b>capsules</b> for power-ups (list below).');
    items.push('Bomb bricks <b>explode</b>. Bricks with dots need more hits.');
    items.push('Break bricks in a row without touching the paddle for a <b>combo</b> and more points.');
    $('helpList').innerHTML = '<li>' + items.join('</li><li>') + '</li>';
    setState('help');
  }

  function startGame() {
    audio();
    newGame();
    openHelp('start');
  }

  function pauseGame() { if (state === 'play') setState('paused'); }
  function resumeGame() { if (state === 'paused') setState('play'); }

  function toMenu() { G = null; setState('menu'); updateMenuBest(); }

  // menu buttons
  function setSeg(id, attr, val) {
    var b = $(id).querySelectorAll('button'), i;
    for (i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].getAttribute(attr) === val);
  }
  Array.prototype.forEach.call($('modeSeg').querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () {
      modeKey = b.getAttribute('data-mode'); setSeg('modeSeg', 'data-mode', modeKey);
      $('modeDesc').textContent = MODE_TEXT[modeKey]; saveSettings(); updateMenuBest();
    });
  });
  Array.prototype.forEach.call($('diffSeg').querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () { diffKey = b.getAttribute('data-diff'); setSeg('diffSeg', 'data-diff', diffKey); saveSettings(); updateMenuBest(); });
  });
  function saveSettings() { try { localStorage.setItem('bb_mode', modeKey); localStorage.setItem('bb_diff', diffKey); } catch (e) {} }
  function updateMenuBest() {
    var b = getBest();
    $('menuBest').textContent = b ? 'Your best score: ' + b : 'No score yet. Set the first one!';
  }
  try {                                        // remember the last mode and difficulty
    var sm = localStorage.getItem('bb_mode'), sd = localStorage.getItem('bb_diff');
    if (sm === 'classic' || sm === 'endless') modeKey = sm;
    if (DIFFS[sd]) diffKey = sd;
  } catch (e) {}
  setSeg('modeSeg', 'data-mode', modeKey); setSeg('diffSeg', 'data-diff', diffKey);
  $('modeDesc').textContent = MODE_TEXT[modeKey];
  updateMenuBest();

  // full screen button (hidden on devices that cannot do it, like iPhone)
  var wrap = $('wrap'), fsOn = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
  if (!fsOn) $('fsBtn').classList.add('hidden');
  $('fsBtn').addEventListener('click', function () {
    var inFs = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (inFs) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
      else (wrap.requestFullscreen || wrap.webkitRequestFullscreen).call(wrap);
    } catch (e) {}
  });

  $('playBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', startGame);
  $('oMenuBtn').addEventListener('click', toMenu);
  $('pMenuBtn').addEventListener('click', toMenu);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('pHelpBtn').addEventListener('click', function () { openHelp('pause'); });
  $('helpBtn').addEventListener('click', function () { if (helpFrom === 'pause') setState('paused'); else setState('play'); });
  $('nextBtn').addEventListener('click', function () { audio(); loadLevel(G.level + 1); setState('play'); });
  $('pauseBtn').addEventListener('click', pauseGame);
  $('muteBtn').addEventListener('click', function () {
    muted = !muted; this.classList.toggle('muted', muted);
    try { localStorage.setItem('bb_muted', muted ? '1' : '0'); } catch (e) {}
  });
  $('muteBtn').classList.toggle('muted', muted);

  // pointer: mouse moves the paddle directly. Touch: drag moves it, a quick tap launches / shoots.
  function worldX(e) {
    var r = canvas.getBoundingClientRect();
    return (e.clientX - r.left) * W / r.width;
  }
  canvas.addEventListener('pointerdown', function (e) {
    audio();
    if (state !== 'play') return;
    var x = worldX(e);
    if (e.pointerType === 'mouse') {
      if (e.button === 0) { G.px = clamp(x, G.pw / 2, W - G.pw / 2); action(); }
    } else {
      touch = { id: e.pointerId, sx: x, spx: G.px, t: performance.now(), moved: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (state !== 'play') return;
    var x = worldX(e);
    if (e.pointerType === 'mouse') G.px = clamp(x, G.pw / 2, W - G.pw / 2);
    else if (touch && touch.id === e.pointerId) {
      if (Math.abs(x - touch.sx) > 12) touch.moved = true;
      G.px = clamp(touch.spx + (x - touch.sx), G.pw / 2, W - G.pw / 2);
    }
  });
  function endTouch(e) {
    if (!touch || touch.id !== e.pointerId) return;
    var tap = !touch.moved && performance.now() - touch.t < 350;
    touch = null;
    if (tap && e.type === 'pointerup') action();
  }
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.l = 1; if (state === 'play') e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.r = 1; if (state === 'play') e.preventDefault(); }
    else if (k === ' ' || k === 'Spacebar') { if (state === 'play') { e.preventDefault(); action(); } }
    else if (k === 'p' || k === 'P' || k === 'Escape') {
      if (state === 'play') pauseGame(); else if (state === 'paused') resumeGame();
    }
  });
  window.addEventListener('keyup', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.l = 0;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.r = 0;
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseGame(); });
  window.addEventListener('blur', pauseGame);

  /* ---------- 7. START ---------- */
  function resize() {
    var r = canvas.getBoundingClientRect();
    if (!r.width) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.min(r.width * dpr, 1400) / W;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 150); });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

  var i;
  for (i = 0; i < 50; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 1.5, p: Math.random() * 6 });
  demoBricks = rowsToBricks(LEVELS[1], 0);
  resize();

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt); draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
