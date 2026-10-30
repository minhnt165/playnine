/* =====================================================================
 * Cờ Tào Cáo - Giao diện + luồng ván (cần ../_kit/kit.js, i18n.js, engine.js nạp trước)
 *   - Một người (quân trắng) đấu máy (quân đen) ba mức Dễ / Vừa / Khó; trận một ván (gammon / backgammon
 *     chỉ ghi vào kết quả và thống kê). Không có doubling cube.
 *   - Bàn vẽ bằng SVG theo tọa độ "logic" (bàn nằm ngang, nhà bạn ở góc dưới phải, khay gỡ quân bên phải);
 *     màn hình đứng thì chuyển vị (x ↔ y) để quân to hơn: nhà bạn vẫn ở góc dưới phải, khay ở dưới.
 *   - Xúc xắc gieo bằng PRNG mulberry32 lấy hạt giống mới mỗi lần mở trang (không lưu hạt giống, nên
 *     không đoán trước được lần gieo sau); kết quả gieo được lưu ngay vào ván để tải lại không gieo lại được.
 *   - Chuột / chạm: chạm quân → các điểm đến hợp lệ sáng lên → chạm điểm đến (đi được cả nhiều bước
 *     một lúc bằng một quân); chạm lại quân đang chọn = đi số lớn nhất. Hoàn tác trong lượt, Xong lượt.
 *   - Bàn phím: ← → (↑ ↓) chuyển giữa các quân đi được / các điểm đến, Enter chọn / đi, Esc bỏ chọn,
 *     U (Backspace) hoàn tác, Space / D xong lượt, N ván mới.
 *   - Máy nghĩ trong Web Worker dựng từ mã nguồn engine (Blob); không có worker thì tính từng khúc.
 *   - Báo ván cho cổng (metric wins, mode = mức máy): ván mới kit.sdk.start(level), mở lại kit.sdk.start(level, true);
 *     hết ván kit.sdk.end({ mode, won, assisted: false }) (hoàn tác trong lượt không tính là trợ giúp vì xúc xắc
 *     đã biết, không lộ thêm gì); bỏ ván đã đi ít nhất một nước: won false; chưa đi nước nào thì không gửi.
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.GameEngine;
  const { HUMAN, AI, BAR, OFF, LEVELS } = E;
  const kit = PNKit.init({
    gameId: 'cotaocao',
    version: '1.0.1',
    dict: window.GAME_DICT,
    defaults: { level: 'medium', autoEnd: false },
    onSetting,
  });
  const t = kit.t;
  const $ = (id) => document.getElementById(id);
  const { keys } = kit.store;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => !!(reduced && reduced.matches);
  const MIN_THINK_MS = 450; // máy "nghĩ" ít nhất chừng này sau khi gieo
  const ROLL_MS = 560; // hiệu ứng gieo xúc xắc

  const boardEl = $('board');
  const gStatic = $('g-static');
  const gMarks = $('g-marks');
  const gCheckers = $('g-checkers');
  const gDice = $('g-dice');
  const gFx = $('g-fx');
  const gHits = $('g-hits');

  function freshSeed() {
    try {
      return crypto.getRandomValues(new Uint32Array(1))[0];
    } catch (e) {
      return (Math.random() * 4294967296) >>> 0;
    }
  }
  const diceRng = E.rng(freshSeed());

  /* ---------------- Thống kê ---------------- */
  const toInt = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  function loadStats() {
    const raw = kit.store.read(keys.stats, {}) || {};
    const st = { levels: {}, streak: toInt(raw.streak), best: toInt(raw.best), points: toInt(raw.points) };
    for (const lv of LEVELS) {
      const r = (raw.levels && raw.levels[lv]) || {};
      st.levels[lv] = { played: toInt(r.played), won: toInt(r.won), lost: toInt(r.lost), gammons: toInt(r.gammons) };
    }
    return st;
  }
  const stats = loadStats();
  const totals = () => LEVELS.reduce((a, lv) => ({ played: a.played + stats.levels[lv].played, won: a.won + stats.levels[lv].won }), { played: 0, won: 0 });

  /* ---------------- Trạng thái ---------------- */
  // cur: { level, seed (hạt giống của máy), humanTurns (số lượt bạn đã xong), ended }
  let game = null;
  let cur = null;
  let token = 0; // đổi khi chia ván mới: hủy mọi chuỗi hẹn giờ cũ
  let busy = false; // đang gieo / đang chạy hoạt cảnh: chặn thao tác
  let thinking = false;
  let aiMoving = false;
  let sel = -1; // điểm nguồn đang chọn (1..24, 25 = bar), -1 = chưa chọn
  let cursor = -1; // con trỏ bàn phím (điểm), -1 = chưa dùng
  let opening = false; // đang hiện gieo mở ván (mỗi bên một con)
  let rolling = null; // { side, faces, split } trong lúc gieo
  let lastAi = []; // các điểm máy vừa đi tới (đánh dấu tới khi bạn đi)
  let G = null; // hình học bàn đang vẽ

  const levelName = (lv) => t('level.' + lv);
  const humanTurn = () => !!game && !game.over && game.turn === HUMAN && !!game.dice;
  const canAct = () => humanTurn() && !busy && !kit.modal.current();
  const started = () => !!cur && (cur.humanTurns > 0 || (game.turn === HUMAN && game.steps.length > 0));
  const inProgress = () => !!game && !game.over && started();

  /* ---------------- Hình học bàn ----------------
   * Đơn vị = đường kính quân. Tọa độ logic: bàn nằm ngang, hàng trên là điểm 13..24 (máy ở trên),
   * hàng dưới là 12..1 (nhà bạn 1..6 ở góc dưới phải), thanh giữa, khay gỡ quân bên phải.
   * Màn hình đứng: chuyển vị (x, y) → (y, x). */
  const F = 0.42; // viền gỗ (chứa số điểm)
  const BARW = 1.15;
  const TRAYW = 1.25;
  const HALF = 5; // chiều dài một nửa sân (5 quân)
  const GAP = 1.5; // khe giữa hai nửa (chỗ đặt xúc xắc)
  const H0 = 2 * F + 2 * HALF + GAP;

  function geomFor(portrait, pw) {
    const W = 3 * F + 12 * pw + BARW + TRAYW;
    const L0 = F, L1 = F + 6 * pw, B0 = L1, B1 = L1 + BARW, R0 = B1, R1 = B1 + 6 * pw;
    const T0 = R1 + F, T1 = T0 + TRAYW;
    return { portrait, pw, W, H: H0, sw: portrait ? H0 : W, sh: portrait ? W : H0, L0, L1, B0, B1, R0, R1, T0, T1, mid: H0 / 2 };
  }
  /** Chọn hướng bàn cho quân to nhất; trục dài còn thừa thì giãn bước điểm (tối đa 1,25; bàn dọc 1,4). */
  function chooseGeom(bw, bh) {
    let best = null;
    for (const portrait of [false, true]) {
      const g1 = geomFor(portrait, 1);
      const u1 = Math.min(bw / g1.sw, bh / g1.sh);
      const longAvail = (portrait ? bh : bw) / u1;
      const pw = Math.max(1, Math.min(portrait ? 1.4 : 1.25, (longAvail - (3 * F + BARW + TRAYW)) / 12));
      const g = geomFor(portrait, pw);
      const u = Math.min(bw / g.sw, bh / g.sh);
      if (!best || u > best.u * 1.04) best = { g, u };
    }
    return best;
  }
  function pointX(k) {
    if (k <= 6) return G.R1 - (k - 0.5) * G.pw;
    if (k <= 12) return G.L1 - (k - 6.5) * G.pw;
    if (k <= 18) return G.L0 + (k - 12.5) * G.pw;
    return G.R0 + (k - 18.5) * G.pw;
  }
  const P = (x, y) => (G.portrait ? [y, x] : [x, y]);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  function rect(x, y, w, h, attrs) {
    const [a, b] = P(x, y);
    const [ww, hh] = G.portrait ? [h, w] : [w, h];
    return '<rect x="' + r3(a) + '" y="' + r3(b) + '" width="' + r3(ww) + '" height="' + r3(hh) + '" ' + (attrs || '') + '/>';
  }
  function poly(list, attrs) {
    return '<polygon points="' + list.map(([x, y]) => P(x, y).map(r3).join(',')).join(' ') + '" ' + (attrs || '') + '/>';
  }
  /** Tam giác của điểm k (đáy ở viền, mũi hướng vào giữa). */
  function triangle(k, inset) {
    const x = pointX(k);
    const top = k >= 13;
    const base = top ? F : G.H - F;
    const dir = top ? 1 : -1;
    const hw = G.pw / 2 - inset;
    return [[x - hw, base], [x + hw, base], [x, base + dir * HALF * 0.92]];
  }

  /** Tâm quân thứ i (0 = sát viền) của bên `side` ở ô `spot` (số điểm theo góc nhìn của bạn; 25 bar, 0 khay). */
  function slotXY(side, spot, i) {
    if (spot === BAR) {
      const x = (G.B0 + G.B1) / 2;
      const d = 0.95 + Math.min(i, 3);
      return [x, side === HUMAN ? G.mid + d : G.mid - d];
    }
    if (spot === OFF) {
      const x = (G.T0 + G.T1) / 2;
      const d = 0.2 + Math.min(i, 14) * 0.3;
      return [x, side === HUMAN ? G.H - F - d : F + d];
    }
    const top = spot >= 13;
    const base = top ? F : G.H - F;
    return [pointX(spot), base + (top ? 1 : -1) * (0.52 + Math.min(i, 4))];
  }
  /** Số quân của `side` ở ô `spot` (spot theo góc nhìn của bạn). */
  function countAt(g, side, spot) {
    if (spot === BAR || spot === OFF) return g.pts[side][spot];
    return g.pts[side][side === HUMAN ? spot : 25 - spot];
  }
  /** Ô theo góc nhìn của bạn từ số điểm riêng của `side`. */
  const spotOf = (side, p) => (p === BAR || p === OFF || side === HUMAN ? p : 25 - p);
  const shownMax = (spot) => (spot === BAR ? 4 : 5);

  /* ---------------- Bố cục ---------------- */
  function layout() {
    if (!game) return;
    const box = $('board-box');
    const bw = box.clientWidth, bh = box.clientHeight;
    if (bw < 10 || bh < 10) return;
    const best = chooseGeom(bw, bh);
    const g = best.g;
    const changed = !G || G.portrait !== g.portrait || Math.abs(G.pw - g.pw) > 0.005;
    G = g;
    boardEl.setAttribute('viewBox', '0 0 ' + r3(g.sw) + ' ' + r3(g.sh));
    boardEl.style.width = Math.floor(g.sw * best.u) + 'px';
    boardEl.style.height = Math.floor(g.sh * best.u) + 'px';
    boardEl.classList.toggle('portrait', g.portrait);
    if (changed) {
      drawStatic();
      drawHits();
    }
    render();
  }

  function drawStatic() {
    let s = '';
    s += rect(0, 0, G.W, G.H, 'class="frame" rx=".32"');
    s += rect(G.L0, F, 6 * G.pw, G.H - 2 * F, 'class="field"');
    s += rect(G.R0, F, 6 * G.pw, G.H - 2 * F, 'class="field"');
    s += rect(G.B0 + 0.08, 0, BARW - 0.16, G.H, 'class="bar-strip"');
    s += rect(G.T0, F, TRAYW, G.H - 2 * F, 'class="tray" rx=".12"');
    s += rect(G.T0 + 0.1, G.mid - 0.02, TRAYW - 0.2, 0.04, 'class="tray-line"');
    for (let k = 1; k <= 24; k++) {
      // Màu xen kẽ: điểm lẻ một màu, điểm chẵn một màu (điểm 1 và 24 khác màu như bàn thật)
      s += poly(triangle(k, 0.035), 'class="tri ' + (k % 2 ? 'tri-a' : 'tri-b') + '"');
      const [x, y] = [pointX(k), k >= 13 ? F / 2 : G.H - F / 2];
      const [a, b] = P(x, y);
      s += '<text class="pnum" x="' + r3(a) + '" y="' + r3(b) + '" dy=".36em">' + k + '</text>';
    }
    gStatic.innerHTML = s;
  }

  /** Vùng chạm trong suốt: mỗi điểm cả nửa cột, thanh giữa, khay. */
  function drawHits() {
    let s = '';
    for (let k = 1; k <= 24; k++) {
      const x = pointX(k) - G.pw / 2;
      const top = k >= 13;
      s += rect(x, top ? 0 : G.mid, G.pw, G.mid, 'class="hit" data-spot="' + k + '"');
    }
    s += rect(G.B0, 0, BARW, G.H, 'class="hit" data-spot="' + BAR + '"');
    s += rect(G.T0 - F / 2, 0, TRAYW + F * 1.5, G.H, 'class="hit" data-spot="' + OFF + '"');
    gHits.innerHTML = s;
  }

  /* ---------------- Vẽ quân, đánh dấu, xúc xắc ---------------- */
  function checkerSvg(side, x, y, label, cls) {
    const [a, b] = P(x, y);
    return '<g class="ck ' + (side === HUMAN ? 'h' : 'a') + (cls ? ' ' + cls : '') + '" transform="translate(' + r3(a) + ' ' + r3(b) + ')">' +
      '<circle class="ck-b" r=".47"/><circle class="ck-i" r=".3"/>' +
      (label ? '<text class="ck-n" dy=".36em">' + label + '</text>' : '') + '</g>';
  }
  function slabSvg(side, i) {
    const [x, y] = slotXY(side, OFF, i);
    return rect(x - 0.48, y - 0.13, 0.96, 0.26, 'class="slab ' + (side === HUMAN ? 'h' : 'a') + '" rx=".08"');
  }

  /** opts.hide: [{ side, spot }] ẩn quân trên cùng (quân đang bay tới). */
  function renderCheckers(opts) {
    if (!G) return;
    const hide = (opts && opts.hide) || [];
    const isHidden = (side, spot) => hide.some((h) => h.side === side && h.spot === spot);
    const steps = canAct() ? E.legalSteps(game) : [];
    const sources = new Set(steps.map((s) => s.from));
    let s = '';
    const stack = (side, spot) => {
      const n = countAt(game, side, spot);
      if (!n) return;
      if (spot === OFF) {
        for (let i = 0; i < n - (isHidden(side, spot) ? 1 : 0); i++) s += slabSvg(side, i);
        return;
      }
      const shown = Math.min(n, shownMax(spot));
      for (let i = 0; i < shown; i++) {
        const topOne = i === shown - 1;
        if (topOne && isHidden(side, spot)) continue;
        let cls = '';
        if (topOne && side === HUMAN && sources.has(spot)) cls = sel === spot ? 'sel' : sel < 0 ? 'can' : '';
        if (topOne && side === AI && lastAi.indexOf(spot) >= 0) cls = 'last';
        const [x, y] = slotXY(side, spot, i);
        s += checkerSvg(side, x, y, topOne && n > shown ? n : 0, cls);
      }
    };
    for (let k = 1; k <= 24; k++) {
      stack(HUMAN, k);
      stack(AI, k);
    }
    for (const side of [HUMAN, AI]) {
      stack(side, BAR);
      stack(side, OFF);
    }
    gCheckers.innerHTML = s;
    renderMarks();
  }

  /** Điểm đến của quân đang chọn: map điểm → chuỗi bước (một quân đi một hay nhiều bước). */
  function destsFrom(src) {
    const out = new Map();
    const hits = (path) => path.slice(0, -1).filter((s) => s.hit).length;
    const walk = (g, at, path, depth) => {
      if (depth > 4) return;
      for (const st of E.legalSteps(g)) {
        if (st.from !== at) continue;
        const p2 = path.concat([st]);
        const prev = out.get(st.to);
        if (!prev || p2.length < prev.length || (p2.length === prev.length && hits(p2) < hits(prev))) out.set(st.to, p2);
        if (st.to !== OFF) {
          const g2 = E.applyStep(g, st);
          if (g2 && !g2.over) walk(g2, st.to, p2, depth + 1);
        }
      }
    };
    walk(game, src, [], 1);
    return out;
  }

  function renderMarks() {
    let s = '';
    if (canAct() && sel >= 0) {
      const dests = destsFrom(sel);
      dests.forEach((path, spot) => {
        const far = path.length > 1 ? ' far' : '';
        if (spot === OFF) {
          s += rect(G.T0 + 0.05, G.mid + 0.08, TRAYW - 0.1, G.H - F - G.mid - 0.12, 'class="dest-tray' + far + '" rx=".12"');
          return;
        }
        s += poly(triangle(spot, 0.035), 'class="dest-tri' + far + '"');
        const hitHere = countAt(game, AI, spot) === 1;
        const [x, y] = slotXY(HUMAN, spot, hitHere ? 0 : countAt(game, HUMAN, spot));
        const [a, b] = P(x, y);
        s += '<circle class="ghost' + far + '" r=".4" cx="' + r3(a) + '" cy="' + r3(b) + '"/>';
      });
    }
    if (cursor >= 0 && canAct()) s += cursorSvg(cursor);
    gMarks.innerHTML = s;
  }
  function cursorSvg(spot) {
    if (spot === BAR) return rect(G.B0 + 0.04, F, BARW - 0.08, G.H - 2 * F, 'class="cursor" rx=".2"');
    if (spot === OFF) return rect(G.T0 - 0.06, F - 0.06, TRAYW + 0.12, G.H - 2 * F + 0.12, 'class="cursor" rx=".2"');
    const top = spot >= 13;
    return rect(pointX(spot) - G.pw / 2 + 0.02, top ? F - 0.04 : G.mid + 0.3, G.pw - 0.04, G.mid - F - 0.26, 'class="cursor" rx=".2"');
  }

  /* Xúc xắc: chấm theo mặt (tọa độ trong ô ±0,43) */
  const PIPS = {
    1: [[0, 0]],
    2: [[-1, -1], [1, 1]],
    3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  function dieSvg(side, x, y, v, cls, size) {
    const [a, b] = P(x, y);
    const h = size / 2;
    let pips = '';
    for (const [px, py] of PIPS[v]) {
      // chuyển vị chấm theo hướng bàn để mặt 6 / 2 / 3 trông như xúc xắc thật
      const [qx, qy] = G.portrait ? [py, px] : [px, py];
      pips += '<circle r="' + r3(size * 0.1) + '" cx="' + r3(qx * size * 0.25) + '" cy="' + r3(qy * size * 0.25) + '"/>';
    }
    return '<g transform="translate(' + r3(a) + ' ' + r3(b) + ')"><g class="die ' + (side === HUMAN ? 'h' : 'a') + (cls ? ' ' + cls : '') + '">' +
      '<rect x="' + r3(-h) + '" y="' + r3(-h) + '" width="' + r3(size) + '" height="' + r3(size) + '" rx="' + r3(size * 0.2) + '"/>' + pips + '</g></g>';
  }
  /** Một hàng xúc xắc ở giữa sân của `side` (bạn: sân phải, máy: sân trái). */
  function diceRow(side, values, usedFlags, cls) {
    const cx = side === HUMAN ? (G.R0 + G.R1) / 2 : (G.L0 + G.L1) / 2;
    const n = values.length;
    const size = n > 2 ? 0.8 : 0.92;
    const gap = n > 2 ? 0.98 : 1.18;
    let s = '';
    values.forEach((v, i) => {
      const x = cx + (i - (n - 1) / 2) * gap;
      s += dieSvg(side, x, G.mid, v, (usedFlags && usedFlags[i] ? 'used' : '') + (cls ? ' ' + cls : ''), size);
    });
    return s;
  }
  function renderDice() {
    if (!G || !game) return;
    let s = '';
    if (rolling) {
      if (rolling.split) {
        s += diceRow(HUMAN, [rolling.faces[0]], null, 'spin');
        s += diceRow(AI, [rolling.faces[1]], null, 'spin');
      } else s += diceRow(rolling.side, rolling.faces, null, 'spin');
    } else if (opening) {
      s += diceRow(HUMAN, [game.opening[0]], null, '');
      s += diceRow(AI, [game.opening[1]], null, '');
    } else if (game.dice && !game.over) {
      const vals = E.expand(game.dice);
      // đánh dấu con đã dùng (theo giá trị, từ trái sang)
      const used = vals.map(() => false);
      for (const st of game.steps) {
        const i = vals.findIndex((v, j) => v === st.die && !used[j]);
        if (i >= 0) used[i] = true;
      }
      const all = game.steps.length >= game.maxLen;
      s += diceRow(game.turn, vals, all ? vals.map(() => true) : used, game.maxLen === 0 ? 'dead' : '');
    }
    gDice.innerHTML = s;
  }

  function render() {
    if (!game || !G) return;
    renderCheckers();
    renderDice();
    renderBars();
  }

  /* ---------------- Thanh người chơi ---------------- */
  function chip(side) {
    return t('bar.chip', { pip: E.pip(game.pts[side]), off: game.pts[side][OFF] });
  }
  function renderBars() {
    const ai = $('bar-ai'), you = $('bar-you');
    ai.querySelector('.pname').textContent = t('bar.ai', { level: levelName(cur.level) });
    $('ai-pip').textContent = chip(AI);
    $('you-pip').textContent = chip(HUMAN);
    const aiActive = !game.over && game.turn === AI && !opening;
    const youActive = !game.over && game.turn === HUMAN && !opening;
    ai.classList.toggle('active', aiActive);
    you.classList.toggle('active', youActive);
    ai.classList.toggle('won', game.over && game.winner === AI);
    you.classList.toggle('won', game.over && game.winner === HUMAN);
    ai.classList.toggle('thinking', aiActive && thinking);
    let aiSub = t('st.wait'), youSub = t('st.wait');
    if (game.over) {
      aiSub = youSub = t(game.winner === HUMAN ? 'st.youWon' : 'st.aiWon');
    } else if (opening) {
      aiSub = youSub = t('st.opening');
    } else if (game.turn === AI) {
      aiSub = rolling ? t('st.rolling') : thinking ? t('st.thinking') : aiMoving ? t('st.moving') : t('st.aiTurn');
      youSub = t('st.aiTurn');
    } else if (rolling || !game.dice) youSub = t('st.rolling');
    else if (game.maxLen === 0) youSub = t('st.noMove');
    else if (E.turnDone(game)) youSub = t('st.done');
    else if (sel >= 0) youSub = t('st.dest');
    else youSub = t('st.pick', { n: game.maxLen - game.steps.length });
    $('ai-sub').textContent = aiSub;
    $('you-sub').textContent = youSub;
    const undo = $('btn-undo'), done = $('btn-done');
    undo.disabled = !(canAct() && game.steps.length > 0);
    done.disabled = !(canAct() && E.turnDone(game) && game.maxLen > 0);
    done.classList.toggle('ready', !done.disabled);
  }

  function announce(msg) {
    $('live').textContent = msg;
  }
  const spotName = (spot) => (spot === BAR ? t('spot.bar') : spot === OFF ? t('spot.off') : t('spot.point', { n: spot }));

  /* ---------------- Hoạt cảnh ---------------- */
  /** Một quân bay từ (x0, y0) tới (x1, y1) (tọa độ logic). */
  function fly(side, from, to, ms) {
    const [a0, b0] = P(from[0], from[1]);
    const [a1, b1] = P(to[0], to[1]);
    const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    wrap.innerHTML = checkerSvg(side, 0, 0, 0, 'flying');
    const el = wrap.firstChild;
    el.removeAttribute('transform');
    gFx.appendChild(el);
    const tr = (x, y) => 'translate(' + r3(x) + 'px, ' + r3(y) + 'px)';
    el.style.transform = tr(a1, b1);
    if (el.animate) {
      el.animate([{ transform: tr(a0, b0) }, { transform: tr((a0 + a1) / 2, (b0 + b1) / 2) + ' scale(1.12)' }, { transform: tr(a1, b1) }], { duration: ms, easing: 'ease-in-out' });
    }
    return el;
  }

  /** Đi một bước có hoạt cảnh; cb sau khi xong. */
  function animateStep(step, cb) {
    const tk = token;
    const side = game.turn;
    const fromSpot = spotOf(side, step.from);
    const toSpot = spotOf(side, step.to);
    const before = game;
    const next = E.applyStep(game, step);
    if (!next) {
      cb(false);
      return;
    }
    const from = slotXY(side, fromSpot, Math.min(countAt(before, side, fromSpot), shownMax(fromSpot)) - 1);
    const to = slotXY(side, toSpot, countAt(next, side, toSpot) - 1);
    game = next;
    announce(t('live.step', { who: t(side === HUMAN ? 'live.you' : 'live.ai'), from: spotName(fromSpot), to: spotName(toSpot), hit: step.hit ? t('live.hit') : '' }));
    kit.sfx(step.hit ? 'capture' : step.to === OFF ? 'pop' : 'move', side === AI ? { pitch: 0.85 } : undefined);
    if (calm()) {
      render();
      cb(true);
      return;
    }
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const ms = Math.round(Math.min(480, 180 + dist * 22) * (side === HUMAN ? 0.75 : 1));
    const hide = [{ side, spot: toSpot }];
    const fliers = [fly(side, from, to, ms)];
    if (step.hit) {
      const opp = 1 - side;
      hide.push({ side: opp, spot: BAR });
      fliers.push(fly(opp, slotXY(opp, toSpot, 0), slotXY(opp, BAR, countAt(next, opp, BAR) - 1), ms + 120));
    }
    renderCheckers({ hide });
    renderDice();
    renderBars();
    setTimeout(() => {
      fliers.forEach((f) => f.remove());
      if (tk !== token) return;
      render();
      cb(true);
    }, ms + (step.hit ? 130 : 10));
  }

  /** Gieo có hiệu ứng: hiện mặt ngẫu nhiên (chỉ để trang trí) rồi mặt thật. */
  function rollAnim(side, n, split, cb) {
    const tk = token;
    kit.sfx('drop');
    if (calm()) {
      renderDice();
      setTimeout(() => tk === token && cb(), 200);
      return;
    }
    const face = () => 1 + Math.floor(Math.random() * 6);
    rolling = { side, split, faces: Array.from({ length: n }, face) };
    renderDice();
    renderBars();
    const iv = setInterval(() => {
      if (!rolling) return;
      rolling.faces = rolling.faces.map(face);
      // đổi mặt không dựng lại phần tử (giữ hiệu ứng lăn)
      renderDiceFaces();
    }, 80);
    setTimeout(() => {
      clearInterval(iv);
      if (tk !== token) return;
      rolling = null;
      kit.sfx('place', { volume: 0.6 });
      renderDice();
      renderBars();
      cb();
    }, ROLL_MS);
  }
  function renderDiceFaces() {
    const dice = gDice.querySelectorAll('.die');
    dice.forEach((d, i) => {
      const v = rolling.faces[i];
      if (!v) return;
      const size = Number(d.querySelector('rect').getAttribute('width'));
      d.querySelectorAll('circle').forEach((c) => c.remove());
      for (const [px, py] of PIPS[v]) {
        const [qx, qy] = G.portrait ? [py, px] : [px, py];
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('r', r3(size * 0.1));
        c.setAttribute('cx', r3(qx * size * 0.25));
        c.setAttribute('cy', r3(qy * size * 0.25));
        d.appendChild(c);
      }
    });
  }

  /* ---------------- Lưu ---------------- */
  function saveStats() {
    kit.store.write(keys.stats, stats);
  }
  function writeSummary() {
    const tot = totals();
    const live = inProgress();
    kit.store.write(keys.summary, PNKit.buildSummary({
      played: tot.played,
      won: tot.won,
      note: tot.won ? t('summary.note', { n: tot.won }) : tot.played ? t('summary.played', { n: tot.played }) : t('summary.none'),
      stats: tot.played ? [{ value: kit.i18n.fmtNumber(tot.won), label: t('stats.won') }, { value: kit.i18n.fmtNumber(stats.points), label: t('stats.points') }] : [],
      resume: live ? { title: t('app.name'), detail: t('summary.resume', { level: levelName(cur.level), pip: E.pip(game.pts[HUMAN]) }), pct: Math.max(0, Math.min(1, 1 - E.pip(game.pts[HUMAN]) / 167)) } : null,
      now: Date.now(),
    }));
  }
  function persist() {
    if (game && !game.over && cur && !cur.ended) {
      kit.store.write(keys.save, { v: 1, level: cur.level, seed: cur.seed, humanTurns: cur.humanTurns, game: E.toJSON(game) });
    } else kit.store.remove(keys.save);
    writeSummary();
  }

  /* ---------------- Máy nghĩ trong Web Worker ---------------- */
  const Brain = {
    worker: null,
    pending: null, // { id, args, cb }
    nextId: 0,
    source() {
      return 'var G = (' + E.factory.toString() + ')();\n' +
        'self.onmessage = function (e) {\n' +
        '  var d = e.data, g = G.fromJSON(d.state);\n' +
        '  var steps = g ? G.chooseMove(g, { level: d.level, seed: d.seed }) : [];\n' +
        '  self.postMessage({ id: d.id, steps: steps });\n' +
        '};\n';
    },
    start() {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return;
      try {
        const url = URL.createObjectURL(new Blob([this.source()], { type: 'text/javascript' }));
        this.worker = new Worker(url);
        this.worker.onmessage = (e) => {
          const p = this.pending;
          if (!p || e.data.id !== p.id) return; // kết quả của yêu cầu đã hủy
          this.pending = null;
          p.cb(e.data.steps);
        };
        this.worker.onerror = (e) => { // worker hỏng: bỏ worker, tính trên luồng chính
          if (e && e.preventDefault) e.preventDefault();
          this.worker = null;
          const p = this.pending;
          if (p) {
            this.pending = null;
            this.think(p.args, p.cb);
          }
        };
      } catch (e) {
        this.worker = null;
      }
    },
    /** args: { state, level, seed } */
    think(args, cb) {
      const id = ++this.nextId;
      this.pending = { id, args, cb };
      if (this.worker) {
        this.worker.postMessage(Object.assign({ id }, args));
        return;
      }
      // Không có worker: tính từng khúc ~20 ms để giao diện không đơ
      const g = E.fromJSON(args.state);
      const plan = g ? E.planMove(g, { level: args.level, seed: args.seed }) : null;
      const step = () => {
        if (!this.pending || this.pending.id !== id) return;
        if (plan && !plan.done) {
          plan.run(performance.now() + 20, () => performance.now());
          setTimeout(step, 0);
          return;
        }
        this.pending = null;
        cb(plan ? plan.best() : []);
      };
      setTimeout(step, 20);
    },
    cancel() {
      if (!this.pending) return;
      this.pending = null;
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
        this.start();
      }
    },
  };
  Brain.start();

  /* ---------------- Luồng ván ---------------- */
  function readLevel() {
    const lv = kit.settings.get().level;
    return LEVELS.indexOf(lv) >= 0 ? lv : 'medium';
  }

  function resetFlags() {
    token++;
    Brain.cancel();
    busy = false;
    thinking = false;
    aiMoving = false;
    rolling = null;
    opening = false;
    sel = -1;
    cursor = -1;
    lastAi = [];
    gFx.textContent = '';
  }

  function newGame() {
    resetFlags();
    kit.modal.close('modal-result');
    game = E.newGame({ rng: diceRng });
    cur = { level: readLevel(), seed: freshSeed(), humanTurns: 0, ended: false };
    kit.store.remove(keys.save);
    kit.sdk.start(cur.level);
    kit.sfx('start');
    persist(); // lưu ngay: tải lại không gieo mở ván lại được
    layout();
    const tk = token;
    opening = true;
    busy = true;
    rollAnim(HUMAN, 2, true, () => {
      const [h, a] = game.opening;
      const youFirst = game.turn === HUMAN;
      announce(t('live.opening', { h, a, who: t(youFirst ? 'live.you' : 'live.ai') }));
      kit.toast(t('toast.opening', { h, a, who: t(youFirst ? 'toast.youFirst' : 'toast.aiFirst') }), 2200);
      render();
      setTimeout(() => {
        if (tk !== token) return;
        opening = false;
        busy = false;
        render();
        if (game.turn === AI) aiTurn();
        else afterHumanRoll();
      }, calm() ? 700 : 1000);
    });
  }

  /** Đầu lượt của bạn: gieo (lưu ngay) rồi chờ bạn đi. */
  function humanRoll() {
    if (game.over || game.turn !== HUMAN) return;
    if (game.dice) {
      afterHumanRoll();
      return;
    }
    game = E.setDice(game, E.rollDice(diceRng));
    persist();
    busy = true;
    rollAnim(HUMAN, game.dice[0] === game.dice[1] ? 4 : 2, false, () => {
      busy = false;
      announce(t('live.roll', { who: t('live.you'), a: game.dice[0], b: game.dice[1] }));
      afterHumanRoll();
    });
  }

  function afterHumanRoll() {
    sel = -1;
    if (game.maxLen === 0) {
      render();
      kit.toast(t('toast.noMove'), 1800);
      const tk = token;
      busy = true;
      setTimeout(() => {
        if (tk !== token) return;
        busy = false;
        endHumanTurn();
      }, 1700);
      return;
    }
    autoSelect();
    render();
  }

  /** Chỉ còn một quân đi được (thường là quân trên bar): chọn sẵn. */
  function autoSelect() {
    if (!canAct()) return;
    const src = new Set(E.legalSteps(game).map((s) => s.from));
    sel = src.size === 1 ? src.values().next().value : -1;
  }

  function select(spot) {
    sel = spot;
    if (spot >= 0) {
      kit.sfx('tap', { volume: 0.5 });
      announce(t('live.sel', { spot: spotName(spot), n: destsFrom(spot).size }));
    }
    renderCheckers();
    renderBars();
  }

  /** Chạm / Enter vào một ô. */
  function onSpot(spot) {
    if (!game || game.over || kit.modal.current()) return;
    if (!humanTurn() || busy) {
      kit.toast(t('toast.wait'));
      return;
    }
    const steps = E.legalSteps(game);
    if (!steps.length) return;
    const sources = new Set(steps.map((s) => s.from));
    if (sel >= 0) {
      if (spot === sel) {
        moveLargest(sel);
        return;
      }
      const dests = destsFrom(sel);
      if (dests.has(spot)) {
        runPath(dests.get(spot));
        return;
      }
      if (sources.has(spot)) {
        select(spot);
        return;
      }
      select(-1);
      return;
    }
    if (sources.has(spot)) {
      select(spot);
      return;
    }
    kit.sfx('error', { volume: 0.4 });
    kit.toast(t(spot !== OFF && countAt(game, HUMAN, spot) ? 'toast.stuck' : 'toast.pick'));
  }

  /** Chạm lại quân đang chọn: đi bằng con lớn nhất còn đi được. */
  function moveLargest(src) {
    const opts = E.legalSteps(game).filter((s) => s.from === src).sort((a, b) => b.die - a.die);
    if (opts.length) runPath([opts[0]]);
  }

  function runPath(path) {
    busy = true;
    sel = -1;
    cursor = -1;
    lastAi = [];
    let i = 0;
    const next = () => {
      if (i >= path.length) {
        busy = false;
        afterHumanStep();
        return;
      }
      animateStep(path[i++], (ok) => {
        if (!ok) {
          busy = false;
          render();
          return;
        }
        if (game.over) {
          busy = false;
          render();
          finish();
          return;
        }
        next();
      });
    };
    next();
  }

  function afterHumanStep() {
    persist();
    if (E.turnDone(game)) {
      render();
      if (kit.settings.get().autoEnd) {
        const tk = token;
        busy = true;
        setTimeout(() => {
          if (tk !== token) return;
          busy = false;
          endHumanTurn();
        }, 350);
      }
      return;
    }
    autoSelect();
    render();
  }

  function undo() {
    if (!canAct() || !game.steps.length) return;
    game = E.undoStep(game);
    kit.sfx('flip', { volume: 0.5 });
    sel = -1;
    cursor = -1;
    autoSelect();
    persist();
    render();
  }

  function done() {
    if (!canAct() || !E.turnDone(game)) return;
    endHumanTurn();
  }

  function endHumanTurn() {
    const n = E.endTurn(game);
    if (!n) return;
    game = n;
    cur.humanTurns++;
    sel = -1;
    cursor = -1;
    persist();
    render();
    aiTurn();
  }

  /* ---------------- Lượt máy ---------------- */
  function aiTurn() {
    if (game.over || game.turn !== AI) return;
    const tk = token;
    if (!game.dice) {
      game = E.setDice(game, E.rollDice(diceRng));
      persist(); // lưu xúc xắc của máy ngay: tải lại không gieo lại được
      busy = true;
      rollAnim(AI, game.dice[0] === game.dice[1] ? 4 : 2, false, () => {
        announce(t('live.roll', { who: t('live.ai'), a: game.dice[0], b: game.dice[1] }));
        aiThink(tk);
      });
    } else {
      if (game.steps.length) game = E.replay(game, []); // mở lại giữa lượt máy: tính lại từ đầu lượt
      busy = true;
      render();
      aiThink(tk);
    }
  }

  function aiThink(tk) {
    if (tk !== token) return;
    thinking = true;
    render();
    const t0 = Date.now();
    const seed = (cur.seed + game.turns * 2654435761) >>> 0;
    Brain.think({ state: E.toJSON(game), level: cur.level, seed }, (steps) => {
      if (tk !== token) return;
      const wait = Math.max(0, MIN_THINK_MS - (Date.now() - t0));
      setTimeout(() => {
        if (tk !== token) return;
        thinking = false;
        // phòng hờ: chuỗi không hợp lệ thì tính lại trên luồng chính bằng mức Dễ (nhanh)
        if (!Array.isArray(steps) || !E.playSequence(game, steps)) steps = E.chooseMove(game, { level: 'easy', seed });
        playAi(steps, tk);
      }, wait);
    });
  }

  function playAi(steps, tk) {
    if (!steps.length) {
      kit.toast(t('toast.aiNoMove'), 1600);
      setTimeout(() => {
        if (tk !== token) return;
        finishAiTurn();
      }, 1400);
      return;
    }
    aiMoving = true;
    const dests = [];
    let i = 0;
    const next = () => {
      if (tk !== token) return;
      if (i >= steps.length) {
        aiMoving = false;
        lastAi = dests.filter((s) => s !== OFF && countAt(game, AI, s) > 0);
        finishAiTurn();
        return;
      }
      const s = steps[i++];
      dests.push(spotOf(AI, s[1]));
      animateStep({ from: s[0], to: s[1], die: s[2] }, (ok) => {
        if (tk !== token) return;
        if (!ok || game.over) {
          aiMoving = false;
          busy = false;
          render();
          if (game.over) finish();
          return;
        }
        setTimeout(next, calm() ? 260 : 110);
      });
    };
    render();
    next();
  }

  function finishAiTurn() {
    const n = E.endTurn(game);
    if (!n) return;
    game = n;
    busy = false;
    persist();
    render();
    humanRoll();
  }

  /* ---------------- Hết ván ---------------- */
  function finish() {
    if (cur.ended) return;
    cur.ended = true;
    sel = -1;
    cursor = -1;
    const won = game.winner === HUMAN;
    const lv = stats.levels[cur.level];
    lv.played++;
    if (won) {
      lv.won++;
      if (game.result > 1) lv.gammons++;
      stats.streak++;
      stats.best = Math.max(stats.best, stats.streak);
      stats.points += game.result;
    } else {
      lv.lost++;
      stats.streak = 0;
    }
    saveStats();
    persist();
    // Trận một ván: thắng won true, thua won false (Backgammon không có hòa)
    kit.sdk.end({ mode: cur.level, won, assisted: false });
    kit.sfx(won ? 'win' : 'lose');
    if (won) kit.confetti();
    render();
    showResult();
  }

  function showResult() {
    const won = game.winner === HUMAN;
    $('result-title').textContent = t(won ? 'result.win' : 'result.lose');
    $('result-text').textContent = t((won ? ['', 'result.single', 'result.gammon', 'result.backgammon'] : ['', 'result.lostSingle', 'result.lostGammon', 'result.lostBackgammon'])[game.result]);
    const art = $('result-art');
    art.className = 'result-art ' + (won ? 'win' : 'lose');
    const mult = game.result > 1 ? '<text class="mult" x="0" y="0" dy=".36em">×' + game.result + '</text>' : '';
    art.innerHTML = '<svg viewBox="-1.2 -1.2 2.4 2.4"><g class="ck ' + (won ? 'h' : 'a') + '"><circle class="ck-b" r="1"/><circle class="ck-i" r=".64"/></g>' + mult + '</svg>';
    const tk = token;
    setTimeout(() => tk === token && kit.modal.open('modal-result'), calm() ? 300 : 1000);
  }

  /** Ván đang dở (bạn đã đi) thì hỏi trước, vì bỏ ván tính là thua. */
  function requestNew() {
    if (inProgress()) kit.modal.open('modal-confirm');
    else newGame();
  }
  function abandonAndNew() {
    kit.modal.close('modal-confirm');
    if (inProgress()) {
      const lv = stats.levels[cur.level];
      lv.played++;
      lv.lost++;
      stats.streak = 0;
      saveStats();
      kit.sdk.end({ mode: cur.level, won: false, assisted: false });
    }
    newGame();
  }

  /** Đổi mức: chưa đi nước nào (hoặc ván đã xong) thì chơi lại ngay, đang dở thì để ván sau. */
  function onSetting(key) {
    if (key !== 'level' || !game) return;
    if (game.over || !started()) newGame();
    else kit.toast(t('toast.next'));
  }

  /* ---------------- Sự kiện ---------------- */
  gHits.addEventListener('click', (e) => {
    const h = e.target.closest && e.target.closest('[data-spot]');
    if (!h) return;
    if (cursor >= 0) cursor = -1;
    onSpot(Number(h.getAttribute('data-spot')));
  });

  /** Danh sách ô bàn phím đi qua: điểm đến của quân đang chọn, hoặc các quân đi được. */
  function keyTargets() {
    if (!canAct()) return [];
    if (sel >= 0) return Array.from(destsFrom(sel).keys()).sort((a, b) => b - a);
    return Array.from(new Set(E.legalSteps(game).map((s) => s.from))).sort((a, b) => b - a);
  }
  function moveCursor(dir) {
    const list = keyTargets();
    if (!list.length) return;
    let i = list.indexOf(cursor);
    if (i < 0) i = dir > 0 ? 0 : list.length - 1;
    else i = (i + dir + list.length) % list.length;
    cursor = list[i];
    renderMarks();
    const n = countAt(game, HUMAN, cursor);
    announce(spotName(cursor) + ', ' + (n ? t('spot.white', { n }) : sel >= 0 ? t('spot.dest') : t('spot.empty')));
  }
  function enterKey() {
    if (!canAct()) return;
    if (E.turnDone(game)) {
      done();
      return;
    }
    const list = keyTargets();
    if (!list.length) return;
    if (list.indexOf(cursor) < 0) cursor = list[0];
    const spot = cursor;
    if (sel < 0) {
      select(spot);
      // con trỏ nhảy sang điểm đến đầu tiên
      const d = keyTargets();
      cursor = d.length ? d[0] : -1;
      renderMarks();
    } else {
      cursor = -1;
      onSpot(spot);
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || kit.modal.current() || !game) return;
    const k = e.key;
    const onButton = e.target && e.target.closest && e.target.closest('button, input, select, a');
    if (e.ctrlKey) {
      if (k === 'z' || k === 'Z') undo();
      else return;
    } else if (k === 'ArrowRight' || k === 'ArrowDown') moveCursor(1);
    else if (k === 'ArrowLeft' || k === 'ArrowUp') moveCursor(-1);
    else if (k === 'Enter' && !onButton) enterKey();
    else if ((k === ' ' && !onButton) || k === 'd' || k === 'D') done();
    else if (k === 'Escape' && (sel >= 0 || cursor >= 0)) {
      cursor = -1;
      select(-1);
    } else if (k === 'u' || k === 'U' || k === 'Backspace') undo();
    else if (k === 'n' || k === 'N') requestNew();
    else return;
    e.preventDefault();
  });

  $('btn-undo').addEventListener('click', undo);
  $('btn-done').addEventListener('click', done);
  $('btn-new').addEventListener('click', requestNew);
  $('btn-confirm-new').addEventListener('click', abandonAndNew);
  $('btn-again').addEventListener('click', newGame);
  $('btn-stats').addEventListener('click', renderStats);

  function renderStats() {
    const tot = totals();
    const f = kit.i18n.fmtNumber;
    $('stats-played').textContent = f(tot.played);
    $('stats-won').textContent = f(tot.won);
    $('stats-streak').textContent = f(stats.streak);
    $('stats-points').textContent = f(stats.points);
    $('stats-body').innerHTML = LEVELS.map((lv) => {
      const r = stats.levels[lv];
      const rate = r.played ? Math.round((r.won / r.played) * 100) + '%' : '–';
      return '<tr><th scope="row">' + levelName(lv) + '</th><td>' + f(r.played) + '</td><td>' + f(r.won) + '</td><td>' + f(r.gammons) + '</td><td>' + rate + '</td></tr>';
    }).join('');
  }

  kit.onLeave(persist);
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe($('board-box'));

  /* ---------------- Khởi động: mở lại ván dở nếu có ---------------- */
  const saved = kit.store.read(keys.save, null);
  const okSave = saved && saved.v === 1 && LEVELS.indexOf(saved.level) >= 0 && Number.isInteger(saved.seed) && Number.isInteger(saved.humanTurns) && saved.humanTurns >= 0;
  const restored = okSave ? E.fromJSON(saved.game) : null;
  if (restored) {
    game = restored;
    cur = { level: saved.level, seed: saved.seed >>> 0, humanTurns: saved.humanTurns, ended: false };
    kit.sdk.start(cur.level, true);
    kit.toast(t('toast.saved'));
    layout();
    writeSummary();
    if (game.turn === AI) aiTurn();
    else humanRoll();
  } else {
    newGame();
  }
  // Lần đầu mở game: hiện Cách chơi
  if (!kit.settings.get().guideSeen) {
    kit.settings.set({ guideSeen: true });
    kit.modal.open('modal-help');
  }
})();
