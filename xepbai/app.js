/* =====================================================================
 * Xếp Bài - Game (chỉ chạy trong trình duyệt, cần engine.js nạp trước)
 *   1. Lưu trữ: cài đặt, thống kê, ván đang chơi, tóm tắt cho cổng PlayNine
 *   2. Điều khiển ván: đi bài, đi lại, gợi ý, tự xếp, ván mới, thắng ván
 *   3. Bố cục bàn: cỡ lá theo khung, xòe cột tự co để không phải cuộn
 *   4. Render 52 lá cố định, di chuyển bằng transform + transition
 *   5. Chạm / kéo thả (pointer events), bàn phím, modal, hướng dẫn có hình
 * ===================================================================== */
(() => {
  'use strict';

  // Phiên bản app: tăng khi phát hành, đồng bộ với ?v= ở index.html
  const APP_VERSION = '1.0.1';
  const KEYS = {
    settings: 'playnine-xepbai-settings-v1',
    save: 'playnine-xepbai-save-v1',
    stats: 'playnine-xepbai-stats-v1',
    summary: 'playnine-xepbai-summary-v1',
  };
  const X = window.XepBai;
  const I18N = window.I18N;
  const t = I18N.t;
  // Chữ tĩnh trong trang theo ngôn ngữ đã chọn, trước khi vẽ nội dung động
  I18N.apply();
  // Thời gian một lá bay tới chỗ mới (ms) và nhịp mỗi nước khi tự xếp
  const SPEED = { slow: 340, medium: 210, fast: 120, off: 0 };
  const AUTO_STEP = { slow: 190, medium: 120, fast: 65, off: 0 };
  const DRAG_START = 6; // px: kéo xa hơn mức này mới coi là kéo thả, không phải chạm
  const DOUBLE_TAP_MS = 380;
  const AUTOSAVE_MS = 5000;
  const MAX_CW = 104; // bề rộng lá lớn nhất (px)
  const BUCKETS = ['draw1', 'draw3', 'daily'];
  const bucketLabel = (k) => t('bucket.' + k);
  const drawText = (n) => t('draw.n', { n });

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /* ================= 1. Lưu trữ ================= */
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* bỏ qua: hết dung lượng hoặc bị chặn */ }
  }
  function removeKey(key) {
    try { localStorage.removeItem(key); } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- Tiện ích thời gian ---------------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  const dateKeyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayKey = () => dateKeyOf(new Date());
  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
  }
  function formatDate(key) {
    const [y, m, d] = key.split('-');
    // vi: 20/10 như cũ; en: Oct 20
    if (I18N.lang === 'vi') return `${d}/${m}`;
    return I18N.fmtDate(new Date(+y, m - 1, +d), { month: 'short', day: 'numeric' });
  }
  /** Tên lá đọc cho trình đọc màn hình theo ngôn ngữ (vi: Át bích, en: Ace of spades). */
  const cardName = (c) => t('card', { rank: t('rank.' + X.rankOf(c)), suit: t('suit.' + X.suitOf(c)) });

  /* ---------------- Cài đặt ---------------- */
  const DEFAULT_SETTINGS = { theme: 'auto', draw: 1, tap: 'auto', speed: 'medium', guideSeen: false };
  let settings = loadSettings();

  function loadSettings() {
    const s = { ...DEFAULT_SETTINGS };
    const raw = readJSON(KEYS.settings) || {};
    if (['auto', 'light', 'dark'].includes(raw.theme)) s.theme = raw.theme;
    if (raw.draw === 1 || raw.draw === 3) s.draw = raw.draw;
    if (raw.tap === 'auto' || raw.tap === 'select') s.tap = raw.tap;
    if (SPEED[raw.speed] != null) s.speed = raw.speed;
    s.guideSeen = raw.guideSeen === true;
    return s;
  }
  function saveSettings() { writeJSON(KEYS.settings, settings); }

  /* ---------------- Thống kê ---------------- */
  // { modes: { draw1|draw3|daily: { played, won, bestTime, bestScore } }, daily: { completed: { 'YYYY-MM-DD': giây } },
  //   streak: chuỗi thắng hiện tại, bestStreak: chuỗi dài nhất }
  function emptyBucket() { return { played: 0, won: 0, bestTime: null, bestScore: null }; }
  function emptyStats() {
    const modes = {};
    BUCKETS.forEach((k) => { modes[k] = emptyBucket(); });
    return { modes, daily: { completed: {} }, streak: 0, bestStreak: 0 };
  }
  const toInt = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const toNum = (v) => (Number.isFinite(v) && v >= 0 ? v : null);
  function loadStats() {
    const st = emptyStats();
    const raw = readJSON(KEYS.stats);
    if (!raw || typeof raw !== 'object') return st;
    BUCKETS.forEach((k) => {
      const b = raw.modes && raw.modes[k];
      if (!b) return;
      st.modes[k] = { played: toInt(b.played), won: toInt(b.won), bestTime: toNum(b.bestTime), bestScore: toNum(b.bestScore) };
    });
    const done = raw.daily && raw.daily.completed;
    if (done && typeof done === 'object') {
      Object.keys(done).forEach((k) => { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && toNum(done[k]) !== null) st.daily.completed[k] = done[k]; });
    }
    st.streak = toInt(raw.streak);
    st.bestStreak = Math.max(toInt(raw.bestStreak), st.streak);
    return st;
  }
  let stats = loadStats();
  function saveStats() { writeJSON(KEYS.stats, stats); }

  function totals() {
    let played = 0, won = 0, bestTime = null, bestScore = null;
    BUCKETS.forEach((k) => {
      const b = stats.modes[k];
      played += b.played;
      won += b.won;
      if (b.bestTime !== null && (bestTime === null || b.bestTime < bestTime)) bestTime = b.bestTime;
      if (b.bestScore !== null && (bestScore === null || b.bestScore > bestScore)) bestScore = b.bestScore;
    });
    return { played, won, bestTime, bestScore };
  }

  /** Thời gian thắng ván hằng ngày của ngày key (giây), hoặc null nếu chưa thắng. */
  function dailyTime(key) {
    const v = stats.daily.completed[key];
    return typeof v === 'number' ? v : null;
  }
  /** Số ngày liên tiếp đã thắng ván hằng ngày (tính tới hôm nay hoặc hôm qua). */
  function dailyStreak() {
    const d = new Date();
    if (dailyTime(dateKeyOf(d)) === null) d.setDate(d.getDate() - 1);
    let n = 0;
    while (dailyTime(dateKeyOf(d)) !== null) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  /* ================= 2. Điều khiển ván ================= */
  // session: { kind: 'random'|'daily', daily: 'YYYY-MM-DD'|null, draw, deck, moves: [], state, elapsed: ms, counted, won }
  let session = null;
  let clockStart = null; // performance.now() khi đồng hồ đang chạy
  let lastSaveAt = 0;
  let held = null; // lá đang cầm (bàn phím / chọn rồi đặt): { from, n }
  let lastTap = null; // lần chạm-để-đi gần nhất, để chạm lại thì đổi đích
  let autoAvail = false;
  let stuckShownAt = -1;
  const auto = { busy: false, timer: 0 };
  let winFx = null; // { anims, timer, result } từ lúc thắng tới khi hiện bảng kết quả

  const bucketOf = (sess) => (sess.kind === 'daily' ? 'daily' : 'draw' + sess.draw);
  const isPlaying = () => session && !session.won;
  const moveMs = () => (reduceMotion.matches ? 0 : SPEED[settings.speed]);

  function elapsedMs() {
    if (!session) return 0;
    return session.elapsed + (clockStart !== null ? performance.now() - clockStart : 0);
  }
  function startClock() {
    if (clockStart === null && session && session.counted && !session.won) clockStart = performance.now();
  }
  function stopClock() {
    if (clockStart !== null) {
      session.elapsed += performance.now() - clockStart;
      clockStart = null;
    }
  }

  function createSession(kind, opts) {
    const daily = kind === 'daily' ? (opts && opts.date) || todayKey() : null;
    const deck = kind === 'daily' ? X.dailyDeck(daily) : (opts && opts.deck) || X.shuffledDeck();
    const draw = kind === 'daily' ? X.DAILY_DRAW : (opts && opts.draw) || settings.draw;
    return { kind, daily, draw, deck, moves: [], state: X.deal(deck, draw), elapsed: 0, counted: false, won: false };
  }

  /** Bỏ ván đang chơi dở (đã đi ít nhất một nước, chưa thắng): mất chuỗi thắng. */
  function abandonCurrent() {
    if (session && session.counted && !session.won && stats.streak) {
      stats.streak = 0;
      saveStats();
    }
  }

  function startGame(kind, opts) {
    abandonCurrent();
    stopClock();
    cancelAuto();
    stopWinFx();
    closeModal('modal-result');
    session = createSession(kind, opts);
    held = null;
    lastTap = null;
    stuckShownAt = -1;
    autoAvail = false;
    shownSec = -1;
    persist();
    writeSummary();
    renderDeal();
  }

  function restartSame() {
    if (!session) return;
    startGame(session.kind, { date: session.daily, deck: session.deck.slice(), draw: session.draw });
  }

  /** Ván vừa có nước đi đầu tiên: tính là đã chơi, chạy đồng hồ. */
  function onFirstMove() {
    session.counted = true;
    stats.modes[bucketOf(session)].played++;
    saveStats();
  }

  /** Đi một nước. Trả về true nếu hợp lệ. opts.quiet: không đọc thông báo (tự xếp). */
  function doMove(m, opts) {
    if (!isPlaying()) return false;
    const s = session.state;
    const desc = m.t === 'move' ? describeMove(s, m) : '';
    const res = X.apply(s, m);
    if (!res) return false;
    session.moves.push(m);
    if (!session.counted) onFirstMove();
    startClock();
    if (res.points) bump('score');
    if (!(opts && opts.quiet)) {
      if (m.t === 'draw') announce(res.redeal ? t('say.redeal') : t('say.drew', { n: res.drawn, card: cardName(s.waste[s.waste.length - 1]) }));
      else announce(desc + (res.flipped ? t('say.flipped') : ''));
    }
    held = null;
    render();
    if (X.isWon(s)) {
      onWin();
      return true;
    }
    persist();
    writeSummary();
    if (!auto.busy) checkAfterMove();
    return true;
  }

  function describeMove(s, m) {
    const src = X.pile(s, m.from);
    const card = src[src.length - m.n];
    return t('move.desc', { card: cardName(card), count: m.n > 1 ? t('move.count', { n: m.n }) : '', to: pileName(m.to) });
  }
  function pileName(id) {
    if (id === 'stock') return t('pile.stock');
    if (id === 'waste') return t('pile.waste');
    if (id[0] === 'f') return t('pile.found', { n: +id[1] + 1 });
    return t('pile.col', { n: +id[1] + 1 });
  }

  function drawCard() {
    if (!isPlaying() || auto.busy) return;
    lastTap = null;
    if (!X.isLegal(session.state, { t: 'draw' })) {
      toast(t('toast.empty'));
      return;
    }
    doMove({ t: 'draw' });
  }

  /** Bỏ nước cuối, dựng lại ván từ đầu (đi lại luôn khớp luật). */
  function popMove() {
    session.moves.pop();
    session.state = X.replay(session.deck, session.draw, session.moves);
  }

  function canUndo() {
    return isPlaying() && !auto.busy && session.moves.length > 0;
  }
  function undo() {
    if (!canUndo()) return;
    popMove();
    held = null;
    lastTap = null;
    clearHint();
    render();
    persist();
    writeSummary();
    announce(t('say.undone'));
    checkAfterMove();
  }

  /** Sau mỗi nước: báo khi có thể tự xếp, hoặc khi không còn nước có ích. */
  function checkAfterMove() {
    const s = session.state;
    const wasAvail = autoAvail;
    autoAvail = X.canAutoComplete(s);
    renderControls();
    if (autoAvail && !wasAvail) {
      toast(t('toast.autoReady'));
      return;
    }
    if (!autoAvail && !X.hint(s) && stuckShownAt !== session.moves.length) {
      stuckShownAt = session.moves.length;
      toast(t('toast.stuck'));
    }
  }

  /* ---------------- Tự xếp nốt ---------------- */
  function runAuto() {
    if (!isPlaying() || auto.busy || !autoAvail) return;
    const moves = X.autoCompleteMoves(session.state);
    if (!moves) return;
    held = null;
    lastTap = null;
    clearHint();
    const step = reduceMotion.matches ? 0 : AUTO_STEP[settings.speed];
    if (!step) {
      // Không hiệu ứng: đi hết các nước một lượt
      auto.busy = true;
      for (const m of moves) {
        X.apply(session.state, m);
        session.moves.push(m);
      }
      auto.busy = false;
      render();
      onWin();
      return;
    }
    auto.busy = true;
    renderControls();
    let i = 0;
    const next = () => {
      if (!auto.busy || !isPlaying()) return;
      if (i >= moves.length) { auto.busy = false; return; }
      const m = moves[i++];
      const isLast = i >= moves.length;
      if (isLast) auto.busy = false; // để doMove ghi nhận thắng như bình thường
      doMove(m, { quiet: true });
      if (!isLast) auto.timer = setTimeout(next, m.t === 'draw' ? step * 0.7 : step);
    };
    next();
  }
  function cancelAuto() {
    clearTimeout(auto.timer);
    auto.busy = false;
  }

  /* ---------------- Thắng ván ---------------- */
  function onWin() {
    cancelAuto();
    stopClock();
    session.won = true;
    held = null;
    const sec = Math.max(1, Math.round(elapsedMs() / 1000));
    const score = session.state.score;
    const b = stats.modes[bucketOf(session)];
    const recordTime = b.bestTime === null || sec < b.bestTime;
    const recordScore = b.bestScore === null || score > b.bestScore;
    b.won++;
    if (recordTime) b.bestTime = sec;
    if (recordScore) b.bestScore = score;
    stats.streak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    if (session.kind === 'daily') {
      const prev = dailyTime(session.daily);
      stats.daily.completed[session.daily] = prev === null ? sec : Math.min(prev, sec);
    }
    saveStats();
    persist();
    writeSummary();
    render();
    announce(t('say.win'));
    stopWinFx();
    const delay = celebrate();
    winFx.result = { sec, score, record: recordTime && b.won > 1 };
    winFx.timer = setTimeout(() => {
      winFx.timer = 0;
      showResult(winFx.result);
    }, delay);
  }

  /* ---------------- Tóm tắt cho cổng PlayNine ---------------- */
  function writeSummary() {
    const { played, won, bestTime } = totals();
    const streak = dailyStreak();
    const today = todayKey();
    let note;
    if (!played) note = t('sum.none');
    else if (!won) note = t('sum.noWin', { n: played });
    else note = t('sum.won', { n: won, time: formatTime(bestTime) });

    const headline = [];
    if (played) {
      headline.push({ value: String(won), label: t('sum.wins') });
      headline.push({ value: Math.round((won / played) * 100) + '%', label: t('sum.rate') });
      if (bestTime !== null) headline.push({ value: formatTime(bestTime), label: t('sum.fastest') });
      else if (streak) headline.push({ value: String(streak), label: t('sum.dailyStreak') });
    }

    let resume = null;
    if (session && session.counted && !session.won) {
      const n = X.foundCount(session.state);
      resume = {
        title: session.kind === 'daily' ? t('sum.resumeDaily') : t('sum.resumeRandom', { draw: drawText(session.draw) }),
        detail: t('sum.detail', { n, score: session.state.score, time: formatTime(elapsedMs() / 1000) }),
        pct: Math.round((n / 52) * 1000) / 1000,
      };
    }

    writeJSON(KEYS.summary, {
      v: 1,
      updatedAt: Date.now(),
      played,
      won,
      note,
      stats: headline,
      resume,
      daily: {
        date: today,
        title: t('sum.dailyTitle', { draw: drawText(X.DAILY_DRAW) }),
        done: dailyTime(today) !== null,
        streak,
      },
    });
  }

  /* ---------------- Lưu / khôi phục ván ---------------- */
  function persist() {
    lastSaveAt = Date.now();
    if (!session || session.won) {
      removeKey(KEYS.save);
      return;
    }
    writeJSON(KEYS.save, {
      v: 1,
      kind: session.kind,
      daily: session.daily,
      draw: session.draw,
      deck: session.deck,
      moves: session.moves,
      elapsed: Math.round(elapsedMs()),
      counted: session.counted,
      savedAt: Date.now(),
    });
  }

  function restoreSession() {
    const raw = readJSON(KEYS.save);
    if (!raw || raw.v !== 1 || !Array.isArray(raw.moves)) return null;
    if (raw.kind !== 'random' && raw.kind !== 'daily') return null;
    const draw = raw.draw === 3 ? 3 : 1;
    if (raw.kind === 'daily') {
      // Ván hằng ngày: bộ bài phải đúng bộ của ngày đó
      if (typeof raw.daily !== 'string' || draw !== X.DAILY_DRAW) return null;
      if (JSON.stringify(raw.deck) !== JSON.stringify(X.dailyDeck(raw.daily))) return null;
    }
    const moves = raw.moves.map(X.normalizeMove);
    if (moves.some((m) => !m)) return null;
    const state = X.replay(raw.deck, draw, moves);
    if (!state || X.isWon(state)) return null;
    return {
      kind: raw.kind,
      daily: raw.kind === 'daily' ? raw.daily : null,
      draw,
      deck: raw.deck.slice(),
      moves,
      state,
      elapsed: typeof raw.elapsed === 'number' && raw.elapsed > 0 ? raw.elapsed : 0,
      counted: raw.counted === true && moves.length > 0,
      won: false,
    };
  }

  /* ================= 3. Bố cục bàn ================= */
  const wrapEl = $('table-wrap');
  const tableEl = $('table');
  let lay = null; // { W, H, cw, ch, gap, x0, tabY, fx }
  let pos = []; // vị trí từng lá sau lần render gần nhất: { x, y, z, up, pile, idx }

  const colX = (c) => lay.x0 + c * (lay.cw + lay.gap);
  // Cột hiển thị của các chồng hàng trên: chồng rút 0, chồng thải 1, ô đích 3..6
  const TOP_COL = { stock: 0, waste: 1, f0: 3, f1: 4, f2: 5, f3: 6 };

  function layout() {
    const W = wrapEl.clientWidth;
    const H = wrapEl.clientHeight;
    if (!W || !H) return false;
    const gap = Math.max(3, Math.min(14, Math.round(W * 0.012)));
    let cw = Math.floor((W - 6 * gap) / 7);
    cw = Math.min(cw, Math.floor(H / (1.4 * 3.1)), MAX_CW);
    cw = Math.max(cw, 24);
    const ch = Math.round(cw * 1.4);
    const x0 = Math.max(0, Math.floor((W - (7 * cw + 6 * gap)) / 2));
    const tabY = ch + Math.max(8, Math.round(ch * 0.15));
    const fx = Math.min(Math.round(cw * 0.4), Math.floor((cw + gap) / 2)); // độ xòe chồng thải khi rút 3
    lay = { W, H, cw, ch, gap, x0, tabY, fx };
    tableEl.style.setProperty('--cw', cw + 'px');
    tableEl.style.setProperty('--ch', ch + 'px');
    for (const id in slotEls) {
      const p = slotPos(id);
      slotEls[id].style.transform = `translate(${p.x}px, ${p.y}px)`;
    }
    return true;
  }

  function slotPos(id) {
    if (id[0] === 't') return { x: colX(+id[1]), y: lay.tabY };
    return { x: colX(TOP_COL[id]), y: 0 };
  }

  /**
   * Độ lệch giữa các lá trong cột: tự co khi cột dài hơn khoảng trống còn lại.
   * Ép phần lá úp trước (tới tối thiểu 3 px) để dải bậc / chất của lá ngửa còn đọc được lâu nhất.
   */
  function columnOffsets(t, down) {
    let od = lay.ch * 0.11;
    let ou = lay.ch * 0.28;
    const n = t.length;
    if (n > 1) {
      const nd = Math.min(down, n - 1); // số khoảng sau lá úp
      const nu = Math.max(0, n - 1 - down); // số khoảng sau lá ngửa
      const avail = Math.max(0, lay.H - lay.tabY - lay.ch - 2);
      if (nd * od + nu * ou > avail) {
        const odMin = Math.min(od, 3);
        if (nd * odMin + nu * ou <= avail) {
          od = (avail - nu * ou) / nd;
        } else {
          od = odMin;
          ou = nu ? Math.max(0, (avail - nd * odMin) / nu) : ou;
          if (nd * od > avail) od = nd ? avail / nd : od;
        }
      }
    }
    return { od, ou };
  }

  function computePositions(s) {
    const out = new Array(52);
    s.stock.forEach((c, i) => { out[c] = { x: colX(0), y: 0, z: 10 + i, up: false, pile: 'stock', idx: i }; });
    // Rút 3: xòe tối đa 3 lá trên cùng của chồng thải (số lá của lần rút gần nhất còn lại)
    const vis = s.waste.length ? (s.draw === 3 ? Math.min(3, Math.max(1, s.fan), s.waste.length) : 1) : 0;
    s.waste.forEach((c, i) => {
      const k = i - (s.waste.length - vis);
      out[c] = { x: colX(1) + (k > 0 ? k * lay.fx : 0), y: 0, z: 100 + i, up: true, pile: 'waste', idx: i };
    });
    s.found.forEach((F, f) => F.forEach((c, i) => {
      out[c] = { x: colX(3 + f), y: 0, z: 100 + i, up: true, pile: 'f' + f, idx: i };
    }));
    s.tab.forEach((t, col) => {
      const { od, ou } = columnOffsets(t, s.down[col]);
      let y = lay.tabY;
      t.forEach((c, i) => {
        out[c] = { x: colX(col), y: Math.round(y), z: 100 + i, up: i >= s.down[col], pile: 't' + col, idx: i };
        y += i < s.down[col] ? od : ou;
      });
    });
    return out;
  }

  /* ================= 4. Render ================= */
  const cardEls = [];
  const slotEls = {};
  let stockCountEl = null;
  let cursorEl = null;
  const liftTimers = [];

  function cardHTML(c) {
    const r = X.rankOf(c);
    const suit = X.suitOf(c);
    const use = `<use href="#suit-${suit}"/>`;
    const court = r >= 11 ? '<span class="pip-frame"></span>' : '';
    return `<div class="face${r >= 11 ? ' court' : ''}"><span class="rk${r === 10 ? ' ten' : ''}">${X.RANK_TEXT[r]}</span>` +
      `<svg class="sm" viewBox="0 0 24 24" aria-hidden="true">${use}</svg>${court}` +
      `<svg class="pip" viewBox="0 0 24 24" aria-hidden="true">${use}</svg></div><div class="back"></div>`;
  }

  const REDEAL_ICON = '<svg class="redeal" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19.5 4.5v4h-4"/></svg>';

  function buildTable() {
    const frag = document.createDocumentFragment();
    ['stock', 'waste', 'f0', 'f1', 'f2', 'f3'].concat(X.TAB).forEach((id) => {
      const el = document.createElement('div');
      el.className = 'slot ' + (id[0] === 'f' ? 'found' : id[0] === 't' ? 'tab' : id);
      el.dataset.pile = id;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      if (id === 'stock') el.innerHTML = REDEAL_ICON;
      else if (id[0] === 'f') el.textContent = 'A';
      else if (id[0] === 't') el.textContent = 'K';
      slotEls[id] = el;
      frag.appendChild(el);
    });
    for (let c = 0; c < 52; c++) {
      const el = document.createElement('div');
      el.className = 'card' + (X.isRed(c) ? ' red' : '');
      el.dataset.c = c;
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = cardHTML(c);
      el._up = false;
      el._x = -1;
      el._y = -1;
      cardEls[c] = el;
      frag.appendChild(el);
    }
    stockCountEl = document.createElement('div');
    stockCountEl.className = 'stock-count';
    stockCountEl.setAttribute('aria-hidden', 'true');
    frag.appendChild(stockCountEl);
    cursorEl = document.createElement('div');
    cursorEl.className = 'kcursor';
    cursorEl.hidden = true;
    frag.appendChild(cursorEl);
    tableEl.appendChild(frag);
  }

  /**
   * Đặt 52 lá vào đúng chỗ. instant: không hiệu ứng (đổi cỡ khung, khôi phục ván).
   * noLift: không nâng lá đang bay lên trên cùng (lúc chia bài).
   */
  function render(instant, noLift) {
    if (!session || !lay) return;
    const s = session.state;
    pos = computePositions(s);
    const ms = instant ? 0 : moveMs();
    tableEl.style.setProperty('--move-ms', ms + 'ms');
    const heldSet = new Set(heldCards());
    for (let c = 0; c < 52; c++) {
      const p = pos[c];
      const el = cardEls[c];
      if (el.classList.contains('dragging')) el.classList.remove('dragging');
      const moved = el._x !== p.x || el._y !== p.y;
      if (moved) {
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        el._x = p.x;
        el._y = p.y;
      }
      // Lá đang bay được nâng lên trên các lá khác, hết hiệu ứng thì trả về đúng tầng
      el._z = p.z;
      clearTimeout(liftTimers[c]);
      if (moved && ms && !noLift) {
        el.style.zIndex = 500 + p.z;
        liftTimers[c] = setTimeout(() => { el.style.zIndex = el._z; }, ms + 40);
      } else {
        el.style.zIndex = p.z;
      }
      if (p.up !== el._up) {
        el._up = p.up;
        el.classList.toggle('up', p.up);
        if (p.up && ms) {
          el.classList.remove('flip');
          void el.offsetWidth; // khởi động lại hiệu ứng lật
          el.classList.add('flip');
        }
      }
      el.classList.toggle('can', p.up && canPick(s, p));
      el.classList.toggle('held', heldSet.has(c));
    }
    renderSlots();
    renderHud();
    renderControls();
    updateCursor();
  }

  /** Lá ở vị trí p có thể bốc lên (một mình hoặc kèm các lá phía trên) không. */
  function canPick(s, p) {
    if (p.pile === 'waste') return p.idx === s.waste.length - 1;
    if (p.pile[0] === 'f') return p.idx === s.found[+p.pile[1]].length - 1;
    if (p.pile[0] === 't') return X.isRun(s, +p.pile[1], s.tab[+p.pile[1]].length - p.idx);
    return false;
  }

  function heldCards() {
    if (!held || !session) return [];
    const p = X.pile(session.state, held.from);
    return p ? p.slice(p.length - held.n) : [];
  }

  function renderSlots() {
    const s = session.state;
    const st = slotEls.stock;
    st.classList.toggle('can-redeal', !s.stock.length && s.waste.length > 0);
    st.setAttribute('aria-label', s.stock.length
      ? t('slot.stock', { n: s.stock.length, d: s.draw })
      : s.waste.length ? t('slot.stockRedeal', { n: s.waste.length }) : t('slot.stockEmpty'));
    stockCountEl.hidden = !s.stock.length;
    stockCountEl.textContent = s.stock.length;
    stockCountEl.style.transform = `translate(${colX(0)}px, 0)`;
    const wTop = s.waste[s.waste.length - 1];
    slotEls.waste.setAttribute('aria-label', s.waste.length ? t('slot.waste', { card: cardName(wTop), n: s.waste.length }) : t('slot.wasteEmpty'));
    X.FOUND.forEach((id, f) => {
      const F = s.found[f];
      slotEls[id].setAttribute('aria-label', F.length ? t('slot.found', { f: f + 1, card: cardName(F[F.length - 1]) }) : t('slot.foundEmpty', { f: f + 1 }));
    });
    X.TAB.forEach((id, c) => {
      const col = s.tab[c];
      let label;
      if (!col.length) label = t('slot.colEmpty', { c: c + 1 });
      else {
        const cards = col.slice(s.down[c]).map(cardName).join(', ');
        label = s.down[c] ? t('slot.colDown', { c: c + 1, down: s.down[c], cards }) : t('slot.col', { c: c + 1, cards });
      }
      slotEls[id].setAttribute('aria-label', label);
    });
  }

  let shownSec = -1;
  function renderTimer() {
    const sec = Math.floor(elapsedMs() / 1000);
    if (sec === shownSec) return;
    shownSec = sec;
    $('timer').textContent = formatTime(sec);
  }
  function renderHud() {
    const s = session.state;
    $('score').textContent = s.score;
    $('moves').textContent = s.moveCount;
    renderTimer();
    $('mode-label').textContent = (session.kind === 'daily' ? t('mode.daily', { date: formatDate(session.daily) }) : t('mode.random')) + ' · ' + drawText(session.draw);
  }
  function bump(id) {
    const el = $(id);
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }
  function renderControls() {
    const playing = isPlaying();
    $('btn-undo').disabled = !canUndo();
    $('btn-hint').disabled = !playing || auto.busy;
    const showAuto = playing && autoAvail;
    $('btn-auto').hidden = !showAuto;
    $('btn-auto').disabled = auto.busy;
    document.querySelector('.controls').classList.toggle('four', showAuto);
  }

  /** Chia bài có hiệu ứng: các lá bay từ chồng rút ra 7 cột theo đúng thứ tự chia. */
  function renderDeal() {
    if (!lay && !layout()) return;
    const s = session.state;
    const ms = moveMs();
    if (!ms) { render(true); return; }
    const order = [];
    for (let r = 0; r < 7; r++) for (let c = r; c < 7; c++) order.push(s.tab[c][r]);
    // Mọi lá về chồng rút, úp
    tableEl.classList.add('no-anim');
    for (let c = 0; c < 52; c++) {
      const el = cardEls[c];
      el.style.transform = `translate(${colX(0)}px, 0px)`;
      el._x = colX(0);
      el._y = 0;
      el._up = false;
      el.classList.remove('up', 'held', 'hint', 'flip');
    }
    void tableEl.offsetWidth;
    tableEl.classList.remove('no-anim');
    const stepMs = Math.max(12, Math.round(ms / 9));
    order.forEach((c, k) => { cardEls[c].style.transitionDelay = k * stepMs + 'ms'; });
    render(false, true);
    setTimeout(() => order.forEach((c) => { cardEls[c].style.transitionDelay = ''; }), order.length * stepMs + ms + 60);
  }

  /* ---------------- Gợi ý ---------------- */
  let hintTimer = 0;
  function clearHint() {
    clearTimeout(hintTimer);
    tableEl.querySelectorAll('.hint').forEach((el) => el.classList.remove('hint'));
  }
  function showHint() {
    if (!isPlaying() || auto.busy) return;
    clearHint();
    const s = session.state;
    const m = X.hint(s);
    if (!m) {
      toast(t('toast.stuck'));
      return;
    }
    const mark = (el) => { el.classList.remove('hint'); void el.offsetWidth; el.classList.add('hint'); };
    if (m.t === 'draw') {
      if (s.stock.length) mark(cardEls[s.stock[s.stock.length - 1]]);
      else mark(slotEls.stock);
      toast(s.stock.length ? t('hint.draw') : t('hint.redeal'));
    } else {
      const src = X.pile(s, m.from);
      src.slice(src.length - m.n).forEach((c) => mark(cardEls[c]));
      const dst = X.pile(s, m.to);
      mark(dst.length ? cardEls[dst[dst.length - 1]] : slotEls[m.to]);
      toast(t('hint.move', { move: describeMove(s, m) }));
    }
    hintTimer = setTimeout(clearHint, 2200);
  }

  /* ---------------- Hiệu ứng ---------------- */
  function nope(cards) {
    if (reduceMotion.matches) return;
    cards.forEach((c) => {
      const el = cardEls[c];
      el.classList.remove('nope');
      void el.offsetWidth;
      el.classList.add('nope');
      setTimeout(() => el.classList.remove('nope'), 360);
    });
  }

  /** Thắng: các lá trên ô đích lần lượt nảy xuống bàn (kiểu Solitaire cổ điển). Trả về thời gian chờ trước khi hiện kết quả. */
  function celebrate() {
    winFx = { anims: [], timer: 0, result: null };
    if (reduceMotion.matches || settings.speed === 'off' || !document.body.animate) return 400;
    const s = session.state;
    const anims = [];
    const floorY = Math.max(lay.tabY, lay.H - lay.ch);
    let i = 0;
    for (let r = 12; r >= 0; r--) {
      for (let f = 0; f < 4; f++) {
        const c = s.found[f][r];
        const el = cardEls[c];
        const p = pos[c];
        let x = p.x;
        let y = p.y;
        let vx = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.45) * lay.cw;
        let vy = -Math.random() * lay.ch * 0.3;
        const g = lay.ch * 0.11;
        const frames = [{ transform: `translate(${x}px, ${y}px)` }];
        for (let k = 0; k < 28; k++) {
          vy += g;
          x += vx;
          y += vy;
          if (y > floorY) { y = floorY; vy = -vy * 0.72; }
          frames.push({ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)`, opacity: k > 22 ? (28 - k) / 6 : 1 });
        }
        el.style.zIndex = 700 + i;
        anims.push(el.animate(frames, { duration: 1300, delay: i * 28, easing: 'linear', fill: 'backwards' }));
        i++;
      }
    }
    winFx.anims = anims;
    anims[anims.length - 1].onfinish = () => { if (winFx && winFx.anims === anims) render(true); };
    return 1900;
  }
  function stopWinFx() {
    if (!winFx) return;
    clearTimeout(winFx.timer);
    winFx.anims.forEach((a) => a.cancel());
    winFx = null;
  }
  /** Chạm / nhấn phím trong lúc hiệu ứng thắng: bỏ qua hiệu ứng, hiện kết quả ngay. */
  const winFxPending = () => !!(winFx && winFx.timer);
  function finishWinFx() {
    if (!winFxPending()) return;
    clearTimeout(winFx.timer);
    winFx.timer = 0;
    winFx.anims.forEach((a) => a.cancel());
    render(true);
    showResult(winFx.result);
  }

  /* ================= 5. Chạm, kéo thả, bàn phím ================= */
  let press = null; // { id, x, y, c, pile, n, slot, drag, base: [{c, x, y}] }
  let lastTapAt = 0;
  let lastTapCard = -1;

  /** Từ lá c đang chạm, tính chồng nguồn và số lá bốc lên (lá thải / đích: lấy lá trên cùng). */
  function pickFrom(c) {
    const s = session.state;
    const p = pos[c];
    if (!p || !p.up) return null;
    if (p.pile === 'waste') return { from: 'waste', n: 1, c: s.waste[s.waste.length - 1] };
    if (p.pile[0] === 'f') {
      const F = s.found[+p.pile[1]];
      return { from: p.pile, n: 1, c: F[F.length - 1] };
    }
    if (p.pile[0] === 't') {
      const t = s.tab[+p.pile[1]];
      return { from: p.pile, n: t.length - p.idx, c };
    }
    return null;
  }

  tableEl.addEventListener('pointerdown', (e) => {
    if (winFxPending()) { finishWinFx(); return; }
    if (!session || auto.busy) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    tableEl.classList.remove('kbd');
    cursorEl.hidden = true;
    const cardEl = e.target.closest('.card');
    const slotEl = e.target.closest('.slot');
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, c: -1, slot: null, drag: false, pick: null };
    if (cardEl) {
      press.c = +cardEl.dataset.c;
      const pk = pos[press.c] && pos[press.c].pile !== 'stock' ? pickFrom(press.c) : null;
      if (pk && X.movable(session.state, pk.from, pk.n)) press.pick = pk;
    } else if (slotEl) {
      press.slot = slotEl.dataset.pile;
    } else {
      press = null;
      return;
    }
    try { tableEl.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
  });

  tableEl.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (!press.drag) {
      if (!press.pick || !isPlaying() || Math.hypot(dx, dy) < DRAG_START) return;
      startDrag();
    }
    for (const b of press.base) {
      cardEls[b.c].style.transform = `translate(${b.x + dx}px, ${b.y + dy}px)`;
    }
  });

  function startDrag() {
    const s = session.state;
    const src = X.pile(s, press.pick.from);
    const cards = src.slice(src.length - press.pick.n);
    press.drag = true;
    clearHint();
    press.base = cards.map((c, i) => {
      const el = cardEls[c];
      clearTimeout(liftTimers[c]);
      el.classList.add('dragging');
      el.style.zIndex = 1000 + i;
      return { c, x: pos[c].x, y: pos[c].y };
    });
  }

  tableEl.addEventListener('pointerup', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    if (p.drag) {
      dropDrag(p, e.clientX - p.x, e.clientY - p.y);
      return;
    }
    if (p.c >= 0) tapCard(p.c);
    else if (p.slot) tapSlot(p.slot);
  });
  tableEl.addEventListener('pointercancel', () => {
    if (press && press.drag) render();
    press = null;
  });
  tableEl.addEventListener('contextmenu', (e) => e.preventDefault());
  tableEl.addEventListener('dragstart', (e) => e.preventDefault());

  /** Thả lá đang kéo: chọn chồng hợp lệ chồng lấn nhiều nhất với lá đang kéo, không có thì trả về chỗ cũ. */
  function dropDrag(p, dx, dy) {
    const s = session.state;
    const r = { x: p.base[0].x + dx, y: p.base[0].y + dy, w: lay.cw, h: lay.ch };
    let best = null;
    let bestArea = 0;
    for (const to of X.FOUND.concat(X.TAB)) {
      if (!X.canMove(s, p.pick.from, p.pick.n, to)) continue;
      const sp = slotPos(to);
      let h = lay.ch;
      if (to[0] === 't') {
        const t = s.tab[+to[1]];
        if (t.length) h = pos[t[t.length - 1]].y + lay.ch - lay.tabY;
        h += lay.ch * 0.5; // vùng thả rộng hơn một chút phía dưới cột
      }
      const ox = Math.min(r.x + r.w, sp.x + lay.cw) - Math.max(r.x, sp.x);
      const oy = Math.min(r.y + r.h, sp.y + h) - Math.max(r.y, sp.y);
      const area = ox > 0 && oy > 0 ? ox * oy : 0;
      if (area > bestArea) { bestArea = area; best = to; }
    }
    lastTap = null;
    if (best) doMove({ t: 'move', from: p.pick.from, n: p.pick.n, to: best });
    else render();
  }

  function tapSlot(id) {
    if (!isPlaying()) return;
    if (id === 'stock') { held = null; drawCard(); return; }
    if (held) placeHeld(id);
  }

  function tapCard(c) {
    if (!isPlaying()) return;
    const p = pos[c];
    if (p.pile === 'stock') { held = null; drawCard(); return; }
    const now = Date.now();
    const dbl = c === lastTapCard && now - lastTapAt < DOUBLE_TAP_MS;
    lastTapAt = now;
    lastTapCard = c;
    if (settings.tap === 'select' || held) selectTap(c, dbl);
    else autoTap(c, dbl);
  }

  /** Chạm để đi: lá tự tới đích tốt nhất (ô đích trước), chạm lại thì đổi sang đích kế tiếp. */
  function autoTap(c, dbl) {
    const s = session.state;
    const pk = pickFrom(c);
    if (!pk || !X.movable(s, pk.from, pk.n)) {
      if (pos[c].up) nope([c]);
      lastTap = null;
      return;
    }
    const again = lastTap && lastTap.card === pk.c && lastTap.moveLen === session.moves.length;
    if (again) {
      // Chạm đúp khi lá vừa lên ô đích: giữ nguyên trên đích
      if (dbl && lastTap.dests[lastTap.i][0] === 'f') return;
      if (lastTap.dests.length < 2) { nope([pk.c]); return; }
      popMove();
      const i = (lastTap.i + 1) % lastTap.dests.length;
      lastTap.i = i;
      doMove({ t: 'move', from: lastTap.from, n: lastTap.n, to: lastTap.dests[i] });
      lastTap.moveLen = session.moves.length;
      return;
    }
    const dests = X.destinations(s, pk.from, pk.n);
    if (!dests.length) {
      const src = X.pile(s, pk.from);
      nope(src.slice(src.length - pk.n));
      lastTap = null;
      return;
    }
    doMove({ t: 'move', from: pk.from, n: pk.n, to: dests[0] });
    lastTap = { card: pk.c, from: pk.from, n: pk.n, dests, i: 0, moveLen: session.moves.length };
  }

  /** Chọn rồi đặt: chạm lá để cầm, chạm chỗ khác để đặt; chạm đúp đưa lá lên ô đích. */
  function selectTap(c, dbl) {
    const s = session.state;
    const p = pos[c];
    if (held) {
      if (p.pile === held.from) {
        if (dbl && held.n === 1) {
          const to = X.FOUND.find((f) => X.canMove(s, held.from, 1, f));
          if (to) { doMove({ t: 'move', from: held.from, n: 1, to }); return; }
        }
        held = null;
        render();
        return;
      }
      if (X.canMove(s, held.from, held.n, p.pile)) { placeHeld(p.pile); return; }
    }
    const pk = pickFrom(c);
    if (!pk || !X.movable(s, pk.from, pk.n)) {
      if (held) nope(heldCards());
      held = null;
      render();
      return;
    }
    held = { from: pk.from, n: pk.n };
    render();
    announce(t('say.held', { card: cardName(pk.c) }) + (pk.n > 1 ? t('say.heldMore', { n: pk.n - 1 }) : ''));
  }

  function placeHeld(to) {
    if (!held) return;
    const s = session.state;
    if (to === held.from) { held = null; render(); return; }
    if (X.canMove(s, held.from, held.n, to)) {
      const m = { t: 'move', from: held.from, n: held.n, to };
      held = null;
      lastTap = null;
      doMove(m);
      return;
    }
    nope(heldCards());
    toast(t('toast.cantPlace'));
  }

  /* ---------------- Bàn phím trên bàn ---------------- */
  const kbd = { pile: 't0', depth: 1 };
  const TOP_ROW = ['stock', 'waste', null, 'f0', 'f1', 'f2', 'f3'];

  function focusPile(id) {
    kbd.pile = id;
    kbd.depth = 1;
    slotEls[id].focus();
    updateCursor();
  }

  function maxDepth(id) {
    if (id[0] !== 't') return 1;
    return Math.max(1, X.faceUpCount(session.state, +id[1]));
  }

  function navigate(id, key) {
    if (id[0] !== 't') {
      const col = TOP_COL[id];
      if (key === 'ArrowDown') { focusPile('t' + col); return; }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const d = key === 'ArrowLeft' ? -1 : 1;
        let k = col + d;
        if (TOP_ROW[k] === null) k += d;
        if (k >= 0 && k < 7) focusPile(TOP_ROW[k]);
      }
      return;
    }
    const col = +id[1];
    if (key === 'ArrowLeft' && col > 0) focusPile('t' + (col - 1));
    else if (key === 'ArrowRight' && col < 6) focusPile('t' + (col + 1));
    else if (key === 'ArrowUp') {
      // Lên: chọn thêm lá trong dãy ngửa, hết dãy thì lên hàng trên
      if (!held && kbd.depth < maxDepth(id)) {
        kbd.depth++;
        updateCursor();
        const tc = session.state.tab[col];
        announce(t('say.select', { n: kbd.depth, card: cardName(tc[tc.length - kbd.depth]) }));
      } else {
        focusPile(TOP_ROW[col] || 'waste');
      }
    } else if (key === 'ArrowDown' && kbd.depth > 1) {
      kbd.depth--;
      updateCursor();
      const tc = session.state.tab[col];
      announce(t('say.select', { n: kbd.depth, card: cardName(tc[tc.length - kbd.depth]) }));
    }
  }

  function kbdEnter(id) {
    if (!isPlaying() || auto.busy) return;
    if (id === 'stock') { held = null; drawCard(); return; }
    if (held) { placeHeld(id); return; }
    const s = session.state;
    const n = id[0] === 't' ? kbd.depth : 1;
    if (!X.movable(s, id, n)) {
      const src = X.pile(s, id);
      if (src.length) nope([src[src.length - 1]]);
      announce(t('say.cantPick'));
      return;
    }
    held = { from: id, n };
    render();
    const src = X.pile(s, id);
    announce(t('say.held', { card: cardName(src[src.length - n]) }) + (n > 1 ? t('say.heldMore', { n: n - 1 }) : '') + t('say.heldPlace'));
  }

  /** Vẽ khung con trỏ quanh vùng đang chọn (chỉ khi đang điều khiển bằng bàn phím). */
  function updateCursor() {
    if (!cursorEl || !lay || !session) return;
    const active = document.activeElement;
    const on = tableEl.classList.contains('kbd') && active && active.classList && active.classList.contains('slot');
    cursorEl.hidden = !on;
    if (!on) return;
    const id = active.dataset.pile;
    kbd.pile = id;
    kbd.depth = Math.min(kbd.depth, maxDepth(id));
    const s = session.state;
    const src = X.pile(s, id);
    const sp = slotPos(id);
    let x = sp.x, y = sp.y, h = lay.ch, w = lay.cw;
    if (src.length && id !== 'stock') {
      const top = src[src.length - 1];
      if (id[0] === 't') {
        const first = src[src.length - kbd.depth];
        y = pos[first].y;
        h = pos[top].y + lay.ch - y;
      } else {
        x = pos[top].x;
        y = pos[top].y;
      }
    }
    const pad = 4;
    cursorEl.style.transform = `translate(${x - pad}px, ${y - pad}px)`;
    cursorEl.style.width = w + pad * 2 + 'px';
    cursorEl.style.height = h + pad * 2 + 'px';
    cursorEl.classList.toggle('holding', !!held);
  }

  tableEl.addEventListener('keydown', (e) => {
    const slot = e.target.closest && e.target.closest('.slot');
    if (!slot || !session || e.altKey || e.ctrlKey || e.metaKey) return;
    const id = slot.dataset.pile;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      tableEl.classList.add('kbd');
      navigate(id, k);
    } else if (k === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      tableEl.classList.add('kbd');
      kbdEnter(id);
    }
  });
  tableEl.addEventListener('focusin', (e) => {
    const slot = e.target.closest && e.target.closest('.slot');
    if (!slot) return;
    if (slot.dataset.pile !== kbd.pile) kbd.depth = 1;
    kbd.pile = slot.dataset.pile;
    updateCursor();
  });
  tableEl.addEventListener('focusout', () => setTimeout(updateCursor, 0));
  // Tab vào bàn bằng bàn phím thì hiện khung con trỏ
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') tableEl.classList.add('kbd'); }, true);

  /* ---------------- Thông báo ---------------- */
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }
  function announce(msg) {
    $('announce').textContent = msg;
  }

  /* ---------------- Modal ---------------- */
  const modalStack = [];
  const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function openModal(id, focusSel) {
    const el = $(id);
    if (!el.hidden) return;
    modalStack.push({ id, back: document.activeElement });
    el.hidden = false;
    const visible = (x) => x.offsetParent !== null;
    const target = (focusSel && el.querySelector(focusSel)) ||
      [...el.querySelectorAll('.btn-primary')].find(visible) || [...el.querySelectorAll(FOCUSABLE)].find(visible);
    if (target) target.focus();
  }
  function closeModal(id) {
    const el = $(id);
    if (!el || el.hidden) return;
    el.hidden = true;
    const i = modalStack.findIndex((x) => x.id === id);
    const entry = i >= 0 ? modalStack.splice(i, 1)[0] : null;
    if (id === 'modal-help') onHelpClosed();
    if (entry && entry.back && document.contains(entry.back) && entry.back.focus) entry.back.focus();
  }
  const topModal = () => (modalStack.length ? modalStack[modalStack.length - 1].id : null);

  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-close]');
    if (t) closeModal(t.dataset.close);
  });

  document.addEventListener('keydown', (e) => {
    const top = topModal();
    if (top) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(top); return; }
      if (e.key === 'Tab') { // giữ tiêu điểm trong modal
        const items = [...$(top).querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (top === 'modal-help' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.target.closest('.segmented')) {
        e.preventDefault();
        showHelp(helpIdx + (e.key === 'ArrowRight' ? 1 : -1));
      }
      return;
    }
    if (e.altKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (winFxPending() && (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); finishWinFx(); return; }
    const k = e.key.toLowerCase();
    if (e.ctrlKey) {
      if (k === 'z') { e.preventDefault(); undo(); }
      return;
    }
    if (e.key === 'Escape' && held) { e.preventDefault(); held = null; render(); announce(t('say.released')); return; }
    // Space: rút bài (trừ khi tiêu điểm đang ở một nút ngoài bàn)
    if (e.key === ' ') {
      const btn = e.target.closest && e.target.closest('button');
      if (btn) return;
      e.preventDefault();
      held = null;
      drawCard();
      return;
    }
    if (k === 'z' || k === 'u') { e.preventDefault(); undo(); }
    else if (k === 'g') { e.preventDefault(); showHint(); }
    else if (k === 'a') { e.preventDefault(); runAuto(); }
    else if (k === 'n') { e.preventDefault(); openNewGame(); }
    else if (k === 'h' || k === '?') { e.preventDefault(); openHelp(); }
  });

  /* ---------------- Nút chọn dạng segmented ---------------- */
  function setSegmented(group, value) {
    for (const b of group.querySelectorAll('[role="radio"]')) {
      const on = b.dataset.value === String(value);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    }
  }
  function bindSegmented(group, onPick) {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('[role="radio"]');
      if (!b) return;
      setSegmented(group, b.dataset.value);
      onPick(b.dataset.value);
    });
    group.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const items = [...group.querySelectorAll('[role="radio"]')];
      const i = items.findIndex((x) => x.getAttribute('aria-checked') === 'true');
      const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const next = items[(i + d + items.length) % items.length];
      setSegmented(group, next.dataset.value);
      next.focus();
      onPick(next.dataset.value);
    });
  }

  /* ---------------- Ván mới ---------------- */
  const OPTION_ICONS = {
    daily: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zM5 9h14v11H5V9zm2 2v2h2v-2H7zm4 0v2h2v-2h-2zm4 0v2h2v-2h-2z"/></svg>',
    random: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>',
    restart: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>',
  };

  function newOption(cls, name, desc, badge, badgeDone, icon, onPick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-option' + (cls ? ' ' + cls : '');
    btn.innerHTML = `<span class="level-icon">${icon}</span>` +
      '<span class="level-text"><span class="level-name"></span><span class="level-desc"></span></span>' +
      (badge ? `<span class="level-badge${badgeDone ? ' done' : ''}"></span>` : '');
    btn.querySelector('.level-name').textContent = name;
    btn.querySelector('.level-desc').textContent = desc;
    if (badge) btn.querySelector('.level-badge').textContent = badge;
    btn.addEventListener('click', () => { closeModal('modal-new'); onPick(); });
    return btn;
  }

  function fillNewOptions() {
    const list = $('level-list');
    list.textContent = '';
    const today = todayKey();
    const done = dailyTime(today);
    const streak = dailyStreak();
    const daily = newOption(
      'daily' + (session && session.kind === 'daily' && session.daily === today && !session.won ? ' current' : ''),
      t('new.daily'),
      t('new.dailyDesc', { date: formatDate(today), draw: drawText(X.DAILY_DRAW) }) + (streak ? t('new.dailyStreak', { n: streak }) : ''),
      done !== null ? '✓ ' + formatTime(done) : t('new.badgeNew'),
      done !== null,
      OPTION_ICONS.daily,
      () => startGame('daily', { date: todayKey() }),
    );
    list.appendChild(daily);
    list.appendChild(newOption('', t('new.random'), t('new.randomDesc', { draw: drawText(settings.draw) }), '', false, OPTION_ICONS.random,
      () => startGame('random', { draw: settings.draw })));
    if (session && session.moves.length) {
      list.appendChild(newOption('', t('new.restart'), t('new.restartDesc', { draw: drawText(session.draw) }), '', false, OPTION_ICONS.restart, restartSame));
    }
  }

  function openNewGame() {
    if (topModal() === 'modal-new') return;
    closeModal('modal-result');
    fillNewOptions();
    setSegmented(document.querySelector('#modal-new [data-field="draw"]'), settings.draw);
    $('new-warning').hidden = !(session && session.counted && !session.won);
    openModal('modal-new', '.level-option');
  }
  bindSegmented(document.querySelector('#modal-new [data-field="draw"]'), (v) => {
    settings.draw = +v;
    saveSettings();
    fillNewOptions();
  });

  /* ---------------- Kết quả ---------------- */
  function showResult(r) {
    if (!session || !session.won || !r || topModal()) return;
    const { sec, score, record } = r;
    const daily = session.kind === 'daily';
    $('result-title').textContent = record ? t('result.record') : t('result.win');
    $('result-sub').textContent = daily ? t('result.subDaily', { date: formatDate(session.daily) }) : t('result.sub', { draw: drawText(session.draw) });
    $('result-time').textContent = formatTime(sec);
    $('result-score').textContent = score;
    $('result-moves').textContent = session.state.moveCount;
    const tot = totals();
    $('result-line').innerHTML = daily
      ? t('result.lineDaily', { n: dailyStreak() })
      : t('result.line', { s: stats.streak, w: tot.won, p: tot.played });
    $('btn-result-new').textContent = daily ? t('new.random') : t('btn.new');
    const conf = $('confetti');
    conf.innerHTML = '';
    if (!reduceMotion.matches) {
      const colors = ['var(--accent)', 'var(--red)', 'var(--text)', '#e0b964'];
      for (let i = 0; i < 28; i++) {
        const p = document.createElement('i');
        p.style.left = (Math.random() * 100).toFixed(1) + '%';
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = (Math.random() * 0.5).toFixed(2) + 's';
        conf.appendChild(p);
      }
    }
    openModal('modal-result', '#btn-result-new');
  }
  $('btn-result-new').addEventListener('click', () => {
    closeModal('modal-result');
    startGame('random', { draw: settings.draw });
  });

  /* ---------------- Thống kê ---------------- */
  function renderStats() {
    const tot = totals();
    $('stats-played').textContent = tot.played;
    $('stats-won').textContent = tot.won;
    $('stats-rate').textContent = tot.played ? Math.round((tot.won / tot.played) * 100) + '%' : '—';
    $('stats-time').textContent = tot.bestTime !== null ? formatTime(tot.bestTime) : '—';
    $('stats-score').textContent = tot.bestScore !== null ? tot.bestScore : '—';
    $('stats-daily').textContent = dailyStreak();
    $('stats-streak').textContent = stats.streak;
    $('stats-best-streak').textContent = stats.bestStreak;
    $('stats-daily-total').textContent = Object.keys(stats.daily.completed).length;
    $('stats-body').innerHTML = BUCKETS.map((k) => {
      const b = stats.modes[k];
      return `<tr><td>${bucketLabel(k)}</td><td>${b.played}</td><td>${b.won}</td>` +
        `<td>${b.bestTime !== null ? formatTime(b.bestTime) : '—'}</td><td>${b.bestScore !== null ? b.bestScore : '—'}</td></tr>`;
    }).join('');
    resetConfirm(false);
  }
  let resetTimer = 0;
  function resetConfirm(on) {
    const btn = $('btn-stats-reset');
    btn.classList.toggle('confirm', on);
    btn.textContent = on ? t('stats.resetConfirm') : t('stats.reset');
    clearTimeout(resetTimer);
    if (on) resetTimer = setTimeout(() => resetConfirm(false), 3500);
  }
  $('btn-stats').addEventListener('click', () => { renderStats(); openModal('modal-stats'); });
  $('btn-stats-reset').addEventListener('click', () => {
    if (!$('btn-stats-reset').classList.contains('confirm')) { resetConfirm(true); return; }
    stats = emptyStats();
    // Ván đang chơi dở vẫn tính là đã chơi
    if (session && session.counted && !session.won) stats.modes[bucketOf(session)].played = 1;
    saveStats();
    writeSummary();
    renderStats();
    toast(t('toast.statsReset'));
  });

  /* ---------------- Cài đặt + giao diện ---------------- */
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'light' || settings.theme === 'dark') root.setAttribute('data-theme', settings.theme);
    else root.removeAttribute('data-theme');
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    if (bg) $('theme-color').setAttribute('content', bg);
  }
  const TAP_DESC = {
    auto: t('settings.tapAutoDesc'),
    select: t('settings.tapSelectDesc'),
  };
  const settingGroup = (name) => document.querySelector(`#modal-settings [data-setting="${name}"]`);
  bindSegmented(settingGroup('theme'), (v) => { settings.theme = v; saveSettings(); applyTheme(); });
  bindSegmented(settingGroup('tap'), (v) => {
    settings.tap = v;
    saveSettings();
    $('tap-desc').textContent = TAP_DESC[v];
    held = null;
    lastTap = null;
    render(true);
  });
  bindSegmented(settingGroup('speed'), (v) => { settings.speed = v; saveSettings(); });
  bindSegmented(settingGroup('draw'), (v) => {
    settings.draw = +v;
    saveSettings();
    // Ván ngẫu nhiên chưa đi nước nào thì áp ngay (giữ nguyên bộ bài)
    if (session && session.kind === 'random' && !session.moves.length && session.draw !== settings.draw) {
      session.draw = settings.draw;
      session.state = X.deal(session.deck, session.draw);
      persist();
      render(true);
      toast(t('toast.appliedNow'));
    } else if (session && session.draw !== settings.draw) {
      toast(t('toast.appliedNext'));
    }
  });
  // Ngôn ngữ: lưu ván rồi tải lại trang theo ngôn ngữ mới
  bindSegmented(settingGroup('lang'), (v) => I18N.set(v));
  I18N.onBeforeReload = () => {
    if (!session) return;
    persist();
    writeSummary();
  };
  $('btn-settings').addEventListener('click', () => {
    setSegmented(settingGroup('theme'), settings.theme);
    setSegmented(settingGroup('tap'), settings.tap);
    setSegmented(settingGroup('speed'), settings.speed);
    setSegmented(settingGroup('draw'), settings.draw);
    setSegmented(settingGroup('lang'), I18N.lang);
    $('tap-desc').textContent = TAP_DESC[settings.tap];
    openModal('modal-settings');
  });
  $('btn-settings-help').addEventListener('click', () => { closeModal('modal-settings'); openHelp(); });
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (settings.theme === 'auto') applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------------- Cách chơi (có hình minh họa) ---------------- */
  // Hình vẽ trong khung 148 x 70; lá bài 16 x 22.4 (tỉ lệ 1 : 1.4 như lá thật)
  const FW = 16, FH = 22.4;
  let figId = 0;
  const SUIT_CODE = { s: 0, h: 1, d: 2, c: 3 };
  function fCard(x, y, name, cls) {
    if (name === '#') {
      return `<rect class="d-back" x="${x}" y="${y}" width="${FW}" height="${FH}" rx="1.8"/>` +
        `<rect class="d-back-in" x="${x + 1.6}" y="${y + 1.6}" width="${FW - 3.2}" height="${FH - 3.2}" rx="1.1"/>`;
    }
    const suit = SUIT_CODE[name.slice(-1)];
    const red = suit === 1 || suit === 2 ? ' red' : '';
    let s = `<rect class="d-card" x="${x}" y="${y}" width="${FW}" height="${FH}" rx="1.8"/>`;
    s += `<text class="d-rank${red}" x="${x + 1.2}" y="${y + 6}">${name.slice(0, -1)}</text>`;
    s += `<use class="d-suit${red}" href="#suit-${suit}" x="${x + FW - 5.8}" y="${y + 1.3}" width="4.6" height="4.6"/>`;
    s += `<use class="d-suit${red}" href="#suit-${suit}" x="${x + FW / 2 - 4.6}" y="${y + FH - 11.6}" width="9.2" height="9.2"/>`;
    if (cls) s += `<rect class="${cls}" x="${x - 1.2}" y="${y - 1.2}" width="${FW + 2.4}" height="${FH + 2.4}" rx="2.6"/>`;
    return s;
  }
  const fSlot = (x, y, label) => `<rect class="d-slot" x="${x}" y="${y}" width="${FW}" height="${FH}" rx="1.8"/>` +
    (label ? `<text class="d-tag" x="${x + FW / 2}" y="${y + FH / 2 + 2}" style="opacity:.45">${label}</text>` : '');
  function fArrow(uid, pts) {
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) d += pts[i].length === 4 ? `Q${pts[i][0]} ${pts[i][1]} ${pts[i][2]} ${pts[i][3]}` : `L${pts[i][0]} ${pts[i][1]}`;
    return `<path class="d-arrow" d="${d}" marker-end="url(#ah${uid})"/>`;
  }
  const fTag = (x, y, text, cls) => `<text class="d-tag${cls ? ' ' + cls : ''}" x="${x}" y="${y}">${text}</text>`;
  function figure(alt, body) {
    const uid = ++figId;
    return `<svg viewBox="0 0 148 70" role="img" aria-label="${alt}">` +
      `<defs><marker id="ah${uid}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path class="d-arrow-head" d="M0 0L10 5L0 10z"/></marker></defs>` +
      body(uid) + '</svg>';
  }
  // Cột lá xòe dọc: names từ dưới lên, '#' là lá úp
  function fColumn(x, y, names, step, cls) {
    let s = '';
    let yy = y;
    names.forEach((n, i) => {
      s += fCard(x, yy, n, cls && cls[i]);
      yy += n === '#' ? 3.4 : step;
    });
    return s;
  }

  const HELP = [
    {
      title: t('help.1.title'),
      text: t('help.1.text'),
      fig: () => figure(t('help.1.alt'), (u) =>
        fCard(22, 6, '3s') + fCard(46, 6, 'Ah') + fSlot(70, 6, 'A') + fCard(94, 6, '2c') +
        fCard(52, 42, '2h', 'd-hl') + fArrow(u, [[60, 41], [55, 34]]) + fTag(84, 52, t('help.1.tagUp')) +
        fTag(66, 3, t('help.1.tagFour'))),
    },
    {
      title: t('help.2.title'),
      text: t('help.2.text'),
      fig: () => figure(t('help.2.alt'), (u) =>
        fColumn(24, 4, ['Ks', 'Qh', 'Jc', '10d'], 7) +
        fCard(72, 28, '9s', 'd-hl') + fArrow(u, [[71, 36], [56, 38], [43, 33]]) + fTag(80, 58, t('help.2.tagOk')) +
        fCard(110, 28, '9h', 'd-bad') + fTag(118, 58, t('help.2.tagBad'), 'bad')),
    },
    {
      title: t('help.3.title'),
      text: t('help.3.text'),
      fig: () => figure(t('help.3.alt'), (u) =>
        fColumn(10, 4, ['#', '#', '7h', '6c'], 7, [null, null, 'd-hl', 'd-hl']) +
        fCard(44, 4, '8s') + fArrow(u, [[27, 20], [36, 22], [44, 18]]) + fTag(26, 46, t('help.3.tagFlip')) +
        fSlot(96, 12, 'K') + fCard(124, 40, 'Kd', 'd-hl') + fArrow(u, [[123, 46], [116, 40], [112, 35]]) + fTag(104, 64, t('help.3.tagK'))),
    },
    {
      title: t('help.4.title'),
      text: t('help.4.text'),
      fig: () => figure(t('help.4.alt'), (u) =>
        fCard(16, 18, '#') + fCard(18, 16, '#') + fCard(20, 14, '#') +
        fArrow(u, [[38, 25], [48, 25], [54, 25]]) +
        fCard(58, 14, '4c') + fCard(66, 14, 'Jd') + fCard(74, 14, '5h', 'd-hl') +
        fTag(28, 48, t('help.4.tagDraw')) + fTag(82, 48, t('help.4.tagUse')) + fCard(112, 14, '#') + fTag(120, 48, t('help.4.tagRedeal'))),
    },
    {
      title: t('help.5.title'),
      text: t('help.5.text'),
      fig: () => figure(t('help.5.alt'), (u) =>
        fSlot(100, 4, 'A') + fColumn(30, 8, ['#', '9d', 'As'], 7, [null, null, 'd-hl']) +
        `<circle cx="38" cy="38" r="5" fill="none" stroke="var(--accent)" stroke-width="1.2"/><circle cx="38" cy="38" r="9" fill="none" stroke="var(--accent)" stroke-width="0.8" opacity="0.5"/>` +
        fArrow(u, [[50, 22], [74, 4, 98, 14]]) + fTag(38, 64, t('help.5.tagTap')) + fTag(108, 40, t('help.5.tagUp'))),
    },
    {
      title: t('help.6.title'),
      text: t('help.6.text'),
      fig: () => figure(t('help.6.alt'), (u) =>
        fCard(14, 8, '6h') + fArrow(u, [[31, 19], [42, 19]]) + fCard(46, 8, '7c') + `<text class="d-plus" x="38" y="44">+5</text>` +
        fCard(66, 8, '2s') + fArrow(u, [[83, 19], [94, 19]]) + fCard(98, 8, 'As') + `<text class="d-plus" x="90" y="44">+10</text>` +
        fCard(122, 8, '#') + `<text class="d-plus" x="130" y="44">+5</text>` +
        fTag(30, 60, t('help.6.tagWaste')) + fTag(82, 60, t('help.6.tagUp')) + fTag(130, 60, t('help.6.tagFlip'))),
    },
  ];
  let helpIdx = 0;

  function showHelp(i) {
    helpIdx = Math.max(0, Math.min(HELP.length - 1, i));
    const h = HELP[helpIdx];
    $('help-body').innerHTML =
      `<div class="help-figure">${h.fig()}</div>` +
      `<p class="help-step">${t('help.step', { i: helpIdx + 1, n: HELP.length })}</p>` +
      `<h3>${h.title}</h3><p>${h.text}</p>`;
    const dots = $('help-dots');
    if (!dots.children.length) {
      HELP.forEach((_, k) => {
        const d = document.createElement('button');
        d.type = 'button';
        d.setAttribute('role', 'tab');
        d.setAttribute('aria-label', t('help.dot', { i: k + 1 }));
        d.addEventListener('click', () => showHelp(k));
        dots.appendChild(d);
      });
    }
    [...dots.children].forEach((d, k) => {
      d.setAttribute('aria-selected', k === helpIdx ? 'true' : 'false');
      d.tabIndex = k === helpIdx ? 0 : -1;
    });
    $('btn-help-prev').disabled = helpIdx === 0;
    $('btn-help-next').textContent = helpIdx === HELP.length - 1 ? t('help.play') : t('help.next');
  }
  function openHelp() {
    if (topModal() === 'modal-help') return;
    showHelp(0);
    openModal('modal-help', '#btn-help-next');
  }
  function onHelpClosed() {
    if (!settings.guideSeen) { settings.guideSeen = true; saveSettings(); }
  }
  $('btn-help').addEventListener('click', openHelp);
  $('btn-help-prev').addEventListener('click', () => showHelp(helpIdx - 1));
  $('btn-help-next').addEventListener('click', () => {
    if (helpIdx >= HELP.length - 1) closeModal('modal-help');
    else showHelp(helpIdx + 1);
  });

  /* ---------------- Nút điều khiển ---------------- */
  $('btn-undo').addEventListener('click', undo);
  $('btn-hint').addEventListener('click', showHint);
  $('btn-auto').addEventListener('click', runAuto);
  $('btn-new').addEventListener('click', openNewGame);

  /* ---------------- Đồng hồ, ẩn tab, lưu định kỳ ---------------- */
  setInterval(() => {
    if (!session) return;
    renderTimer();
    if (isPlaying() && clockStart !== null && Date.now() - lastSaveAt >= AUTOSAVE_MS) {
      persist();
      writeSummary();
    }
  }, 250);

  document.addEventListener('visibilitychange', () => {
    if (!session) return;
    if (document.hidden) {
      stopClock();
      persist();
      writeSummary();
    } else {
      startClock();
    }
  });
  window.addEventListener('pagehide', () => {
    if (!session) return;
    persist();
    writeSummary();
  });

  // Đổi cỡ khung: tính lại cỡ lá, đặt lại vị trí không hiệu ứng
  const onResize = () => {
    if (!layout()) return;
    if (press && press.drag) press = null;
    render(true);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(wrapEl);
  else window.addEventListener('resize', onResize);

  /* ================= Khởi động ================= */
  $('app-version').textContent = APP_VERSION;
  applyTheme();
  buildTable();
  layout();
  const restored = restoreSession();
  if (restored) {
    session = restored;
    render(true);
    autoAvail = X.canAutoComplete(session.state);
    renderControls();
    if (!document.hidden) startClock();
    writeSummary();
  } else {
    startGame('random', { draw: settings.draw });
  }
  // Lần đầu vào game: tự mở hướng dẫn (đánh dấu đã xem ngay để chỉ hiện một lần)
  if (!settings.guideSeen) {
    settings.guideSeen = true;
    saveSettings();
    openHelp();
  }
})();
