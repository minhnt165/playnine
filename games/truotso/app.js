/* =====================================================================
 * Trượt Số - Logic giao diện (cần engine.js nạp trước)
 *   - Render theo số trên ô: mỗi ô giữ một phần tử, trượt bằng transform
 *   - Chạm / bấm ô (trượt cả đoạn về phía ô trống), vuốt, bàn phím (mũi tên, WASD)
 *   - Đồng hồ chạy từ nước đi đầu tiên, dừng khi ẩn tab; ghi điểm theo thời gian (time_low)
 *   - Lưu ván, cài đặt, thống kê vào localStorage; ghi tóm tắt cho cổng PlayNine
 *   - Chữ hiển thị đi qua I18N.t (i18n.js nạp trước)
 * ===================================================================== */
(function () {
  'use strict';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'truotso' });

  // Âm thanh / pháo giấy của SDK: SDK cũ hoặc chạy không có SDK thì im lặng, không lỗi
  const SFX = PN && PN.sfx ? PN.sfx : null;
  const sfx = (name, opts) => {
    try {
      SFX && SFX.play(name, opts);
    } catch (e) {}
  };
  const confetti = () => {
    try {
      PN && PN.fx && PN.fx.confetti();
    } catch (e) {}
  };

  const APP_VERSION = '1.0.0';
  const E = window.TruotSo;
  const t = I18N.t;

  // Điền chữ tĩnh theo ngôn ngữ trước khi vẽ phần động
  I18N.apply();

  // Mọi khóa localStorage đều có tiền tố playnine-truotso- (cổng đồng bộ các khóa này lên tài khoản)
  const KEYS = {
    settings: 'playnine-truotso-settings-v1',
    save: 'playnine-truotso-save-v1',
    stats: 'playnine-truotso-stats-v1',
    summary: 'playnine-truotso-summary-v1',
  };
  const SWIPE_MIN = 24; // px, quãng vuốt tối thiểu
  const SLIDE_MS = 90; // khớp với --slide trong style.css
  const AUTOSAVE_MS = 5000; // lưu lại đồng hồ định kỳ khi đang chơi
  const MAX_ELAPSED = 24 * 3600 * 1000; // đồng hồ lưu quá 24 giờ thì coi như hỏng
  const THEMES = ['auto', 'light', 'dark'];

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const slideMs = () => (reduceMotion.matches ? 0 : SLIDE_MS);
  const fmt = (n) => I18N.fmtNumber(n);

  /**
   * Định dạng thời gian. precise: thêm phần trăm giây (0:42.13), dùng cho kết quả và kỷ lục;
   * không precise: m:ss cho đồng hồ đang chạy. Từ 1 giờ trở lên: h:mm:ss.
   */
  function formatTime(ms, precise) {
    const total = Math.max(0, Math.floor(ms));
    const sec = Math.floor(total / 1000);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (x) => String(x).padStart(2, '0');
    let out = h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
    if (precise) out += I18N.decimal + pad(Math.floor((total % 1000) / 10));
    return out;
  }

  /* ---------------- localStorage (mọi truy cập đều bọc try/catch) ---------------- */
  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }
  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  /* ---------------- Cài đặt ---------------- */
  function loadSettings() {
    const s = readJSON(KEYS.settings) || {};
    return {
      theme: THEMES.includes(s.theme) ? s.theme : 'auto',
      mode: E.MODES.includes(s.mode) ? s.mode : E.modeOf(E.DEFAULT_SIZE),
    };
  }
  const settings = loadSettings();
  const saveSettings = () => writeJSON(KEYS.settings, settings);

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    const meta = $('theme-color');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f3f4fb';
  }

  /* ---------------- Thống kê ---------------- */
  // Mỗi kích thước: số ván, số lần giải, thời gian tốt nhất (ms, 0 = chưa có) và số nước của lần đó
  function emptyStats() {
    const modes = {};
    E.MODES.forEach((m) => (modes[m] = { played: 0, solved: 0, bestMs: 0, bestMoves: 0 }));
    return { played: 0, solved: 0, modes };
  }
  function loadStats() {
    const s = readJSON(KEYS.stats);
    const out = emptyStats();
    if (!s || typeof s !== 'object') return out;
    const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    out.played = int(s.played);
    out.solved = int(s.solved);
    if (s.modes && typeof s.modes === 'object') {
      E.MODES.forEach((m) => {
        const x = s.modes[m];
        if (!x || typeof x !== 'object') return;
        const o = out.modes[m];
        o.played = int(x.played);
        o.solved = int(x.solved);
        o.bestMs = int(x.bestMs);
        o.bestMoves = o.bestMs ? int(x.bestMoves) : 0;
      });
    }
    return out;
  }
  let stats = loadStats();
  const saveStats = () => writeJSON(KEYS.stats, stats);

  /* ---------------- Ván đang chơi ---------------- */
  // session: { game, elapsed (ms, chưa tính đoạn đang chạy), counted (đã tính vào thống kê), done, newBest }
  let session = null;
  let clockStart = null; // performance.now() khi đồng hồ đang chạy
  let lastSaveAt = 0;

  const game = () => session.game;
  const modeOf = () => E.modeOf(game().size);
  const started = () => game().moves > 0;

  function elapsedMs() {
    if (!session) return 0;
    return session.elapsed + (clockStart !== null ? performance.now() - clockStart : 0);
  }
  function startClock() {
    if (clockStart === null && session && !session.done && started()) clockStart = performance.now();
  }
  function stopClock() {
    if (clockStart !== null) {
      session.elapsed += performance.now() - clockStart;
      clockStart = null;
    }
  }

  /** Lưu ván dở; ván đã giải xong thì xóa (mở lại trang sẽ ra bàn mới). */
  function persist() {
    lastSaveAt = Date.now();
    if (!session || session.done) {
      removeKey(KEYS.save);
      return;
    }
    writeJSON(KEYS.save, {
      v: 1,
      game: game(),
      elapsed: Math.round(elapsedMs()),
      counted: session.counted,
      savedAt: Date.now(),
    });
  }

  function restoreSession() {
    const raw = readJSON(KEYS.save);
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
    const g = E.restore(raw.game);
    if (!g) return null;
    const el = typeof raw.elapsed === 'number' && Number.isFinite(raw.elapsed) && raw.elapsed >= 0 ? raw.elapsed : 0;
    if (el > MAX_ELAPSED) return null;
    const fresh = g.moves === 0;
    return { game: g, elapsed: fresh ? 0 : el, counted: !fresh && raw.counted === true, done: false, newBest: false };
  }

  /* ---------------- Tóm tắt cho cổng PlayNine ---------------- */
  /** Kỷ lục để hiện trên thẻ game: ưu tiên kích thước đang chọn, sau đó bàn lớn nhất đã giải. */
  function headlineBest() {
    const order = [settings.mode].concat(E.MODES.slice().reverse());
    for (const m of order) if (stats.modes[m].bestMs) return { mode: m, ms: stats.modes[m].bestMs };
    return null;
  }

  function writeSummary() {
    const best = headlineBest();
    const list = [];
    if (best) list.push({ value: formatTime(best.ms, true), label: t('summary.bestTime', { mode: best.mode }) });
    if (stats.solved > 0) list.push({ value: fmt(stats.solved), label: t('stats.solved') });

    let note = t('summary.note');
    if (best) note = t('summary.noteBest', { mode: best.mode, time: formatTime(best.ms, true) });

    let resume = null;
    if (session && !session.done && started()) {
      const g = game();
      resume = {
        title: t('summary.resume'),
        detail: t('summary.resumeDetail', { mode: modeOf(), n: g.moves, time: formatTime(elapsedMs()) }),
        pct: Math.round((E.inPlace(g.tiles) / (g.size * g.size - 1)) * 1000) / 1000,
      };
    }
    writeJSON(KEYS.summary, {
      v: 1,
      updatedAt: Date.now(),
      played: stats.played,
      won: stats.solved,
      note,
      stats: list,
      resume,
      daily: null,
    });
  }

  function saveAll() {
    persist();
    saveStats();
    writeSummary();
  }

  /* ---------------- DOM ---------------- */
  const boardEl = $('board');
  const gridEl = $('grid');
  const tilesEl = $('tiles');
  const timeEl = $('time');
  const timeBox = $('time-box');
  const movesEl = $('moves');
  const bestEl = $('best');
  const overlayWin = $('overlay-win');

  /* ---------------- Render theo số trên ô ---------------- */
  let tileEls = []; // tileEls[v] = phần tử .tile của ô số v

  /** Dựng lại nền lưới và các ô khi bắt đầu ván / đổi kích thước. */
  function buildBoard() {
    const n = game().size;
    boardEl.dataset.n = n;
    boardEl.classList.remove('solved');
    gridEl.textContent = '';
    tilesEl.textContent = '';
    tileEls = [null];
    for (let i = 0; i < n * n; i++) gridEl.appendChild(document.createElement('span'));
    for (let v = 1; v < n * n; v++) {
      const el = document.createElement('div');
      el.className = 'tile';
      el.dataset.v = v;
      el.style.setProperty('--i', v);
      const inner = document.createElement('div');
      inner.className = 'tile-inner';
      inner.textContent = v;
      el.appendChild(inner);
      tilesEl.appendChild(el);
      tileEls.push(el);
    }
    placeAll();
  }

  /** Đặt mọi ô vào đúng chỗ theo state (ô đổi chỗ thì tự trượt nhờ transition). */
  function placeAll() {
    const g = game();
    const n = g.size;
    g.tiles.forEach((v, i) => {
      if (!v) return;
      const el = tileEls[v];
      el.style.setProperty('--r', Math.floor(i / n));
      el.style.setProperty('--c', i % n);
      el.classList.toggle('ok', v === i + 1);
      el.classList.toggle('can', !session.done && E.canMoveAt(g, i));
    });
  }

  /* ---------------- HUD ---------------- */
  function renderTimer() {
    if (!session) return;
    timeEl.textContent = session.done ? formatTime(session.elapsed, true) : formatTime(elapsedMs());
  }

  function updateHud() {
    const g = game();
    movesEl.textContent = fmt(g.moves);
    const st = stats.modes[modeOf()];
    bestEl.textContent = st.bestMs ? formatTime(st.bestMs, true) : '—';
    timeBox.classList.toggle('idle', !started());
    $('size-badge').textContent = modeOf();
    renderTimer();
  }

  /** Chạy lại một hiệu ứng CSS (gỡ lớp, ép reflow, gắn lại). */
  function replayClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function announce(text) {
    const el = $('announcer');
    el.textContent = '';
    setTimeout(() => (el.textContent = text), 30);
  }

  let toastTimer = 0;
  function toast(text) {
    const el = $('toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 1800);
  }

  /* ---------------- Lớp phủ thắng ---------------- */
  function syncOverlay(focus) {
    overlayWin.hidden = !session.done;
    if (!session.done) return;
    $('win-time').textContent = formatTime(session.elapsed, true);
    $('win-sub').textContent = t('win.sub', { n: game().moves, mode: modeOf() });
    $('win-best').hidden = !session.newBest;
    if (focus) $('btn-win-new').focus();
  }

  /* ---------------- Luồng chơi ---------------- */
  /** Bỏ ván đã đi ít nhất một nước mà chưa giải xong: báo cổng là thua. */
  function abandonCurrent() {
    if (session && !session.done && started()) PN && PN.gameEnd({ mode: modeOf(), won: false });
  }

  function startNewGame(mode) {
    abandonCurrent();
    stopClock();
    const size = E.sizeOf(mode) || E.DEFAULT_SIZE;
    session = { game: E.newGame(size), elapsed: 0, counted: false, done: false, newBest: false };
    PN && PN.gameStart({ mode: modeOf() });
    buildBoard();
    updateHud();
    syncOverlay(false);
    saveAll();
  }

  // Tiếng "không đi được" giãn cách để giữ phím không kêu liên tục
  let lastBlocked = 0;

  /** Không đi được: bàn chơi giật nhẹ theo hướng (nếu có) + tiếng báo. */
  function blocked(dir) {
    const now = Date.now();
    if (now - lastBlocked < 300) return;
    lastBlocked = now;
    if (dir) {
      boardEl.dataset.nudge = dir;
      replayClass(boardEl, 'nudge');
    }
    sfx('error', { volume: 0.5 });
  }

  function canPlay() {
    return session && !session.done && !modalOpen();
  }

  /** Áp kết quả một nước đi từ engine. */
  function applyMove(res, dirIfBlocked) {
    if (!res.moved) {
      blocked(dirIfBlocked);
      return;
    }
    session.game = res.state;
    const st = stats.modes[modeOf()];
    if (!session.counted) {
      // Nước đầu tiên: tính một ván, bắt đầu chạy đồng hồ
      session.counted = true;
      stats.played++;
      st.played++;
      saveStats();
    }
    startClock();
    placeAll();
    sfx('move', { volume: 0.5, pitch: 1 + Math.min(4, res.slides.length - 1) * 0.06 });
    if (res.solved) {
      finish();
      return;
    }
    updateHud();
    persist();
  }

  /** Bàn đã xếp xong: dừng đồng hồ, ghi kỷ lục, báo cổng, hiện lớp phủ. */
  function finish() {
    stopClock();
    const ms = Math.max(1, Math.round(session.elapsed));
    session.elapsed = ms;
    session.done = true;
    const g = game();
    const mode = modeOf();
    const st = stats.modes[mode];
    const hadBest = st.bestMs > 0;
    session.newBest = !hadBest || ms < st.bestMs;
    st.solved++;
    stats.solved++;
    if (session.newBest) {
      st.bestMs = ms;
      st.bestMoves = g.moves;
    }
    PN && PN.gameEnd({ mode, won: true, timeMs: ms, assisted: false });
    saveAll();

    placeAll();
    updateHud();
    if (!reduceMotion.matches) replayClass(boardEl, 'solved');
    setTimeout(() => {
      sfx('win');
      confetti();
      if (session.newBest && hadBest) {
        replayClass(bestEl.parentElement, 'record');
        setTimeout(() => sfx('coin'), 260);
      }
    }, slideMs());
    syncOverlay(true);
    announce(t('announce.solved', { time: formatTime(ms, true), n: g.moves }));
  }

  /** Chạm / bấm ô idx: cả đoạn từ ô đó tới ô trống trượt theo. */
  function doMoveAt(idx) {
    if (!canPlay()) return;
    applyMove(E.moveAt(game(), idx), null);
  }

  /** Phím hướng / vuốt: đưa ô theo hướng dir vào ô trống. */
  function doMoveDir(dir) {
    if (!canPlay()) return;
    applyMove(E.moveDir(game(), dir), dir);
  }

  /** Ván mới: hỏi lại nếu đang dở ván. mode khác mode hiện tại thì đổi kích thước. */
  function requestNewGame(mode) {
    const target = mode || settings.mode;
    const inProgress = session && !session.done && started();
    const go = () => {
      if (target !== settings.mode) {
        settings.mode = target;
        saveSettings();
      }
      closeModal();
      startNewGame(target);
      sfx('start');
      syncSegmented();
      boardEl.focus();
    };
    if (!inProgress) {
      go();
      return;
    }
    $('confirm-title').textContent =
      target !== modeOf() ? t('confirm.sizeTitle', { n: E.sizeOf(target) }) : t('confirm.newTitle');
    $('confirm-text').textContent = t('confirm.text', { n: game().moves, time: formatTime(elapsedMs()) });
    confirmAction = go;
    openModal('modal-confirm', $('btn-confirm-ok'));
  }

  /* ---------------- Modal ---------------- */
  let openId = null;
  let returnFocus = null;
  let confirmAction = null;
  const modalOpen = () => openId !== null;

  function openModal(id, focusEl) {
    if (openId && openId !== id) $(openId).hidden = true;
    else returnFocus = document.activeElement;
    openId = id;
    const m = $(id);
    m.hidden = false;
    // Mặc định focus vào khung hộp thoại (không vào nút "Đặt lại" để tránh bấm nhầm bằng Enter)
    const card = m.querySelector('.modal-card');
    card.tabIndex = -1;
    (focusEl || card).focus();
  }

  function closeModal() {
    if (!openId) return;
    $(openId).hidden = true;
    openId = null;
    if (returnFocus && document.body.contains(returnFocus) && !returnFocus.closest('[hidden]')) returnFocus.focus();
    else boardEl.focus();
    returnFocus = null;
  }

  function trapFocus(e) {
    const items = Array.from($(openId).querySelectorAll('.modal-card button:not([disabled])')).filter(
      (b) => b.tabIndex >= 0
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!items.includes(document.activeElement)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) closeModal();
  });

  /* ---------------- Cài đặt (nút chọn dạng segmented) ---------------- */
  function syncSegmented() {
    document.querySelectorAll('.segmented').forEach((group) => {
      const key = group.dataset.setting;
      const cur =
        key === 'lang' ? I18N.lang : key === 'sound' ? (SFX && SFX.isMuted() ? 'off' : 'on') : String(settings[key]);
      group.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.value === cur;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
    });
  }

  function chooseSetting(key, value) {
    if (key === 'theme') {
      settings.theme = value;
      saveSettings();
      applyTheme();
      syncSegmented();
    } else if (key === 'mode') {
      if (!E.MODES.includes(value)) return;
      if (value === modeOf() && !session.done) {
        settings.mode = value;
        saveSettings();
        syncSegmented();
        return;
      }
      requestNewGame(value);
    } else if (key === 'sound') {
      if (!SFX) return;
      SFX.setMuted(value === 'off');
      syncSegmented();
      sfx('tap');
    } else if (key === 'lang') {
      // Lưu ván rồi tải lại trang theo ngôn ngữ mới
      if (value === I18N.lang) return;
      saveAll();
      I18N.set(value);
    }
  }

  document.querySelectorAll('.segmented').forEach((group) => {
    const key = group.dataset.setting;
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-value]');
      if (b) chooseSetting(key, b.dataset.value);
    });
    // Phím mũi tên di chuyển trong nhóm radio
    group.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const btns = Array.from(group.querySelectorAll('button'));
      const i = btns.indexOf(document.activeElement);
      const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const next = btns[(i + step + btns.length) % btns.length];
      next.focus();
      if (key === 'theme' || key === 'sound') chooseSetting(key, next.dataset.value);
    });
  });

  /* ---------------- Thống kê (modal) ---------------- */
  function renderStats() {
    $('st-played').textContent = fmt(stats.played);
    $('st-solved').textContent = fmt(stats.solved);
    const list = $('st-best-list');
    list.textContent = '';
    E.MODES.forEach((m) => {
      const st = stats.modes[m];
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = t('stats.grid', { n: E.sizeOf(m) });
      if (session && modeOf() === m) {
        const tag = document.createElement('small');
        tag.textContent = t('stats.current');
        dt.appendChild(tag);
      }
      const dd = document.createElement('dd');
      dd.textContent = st.bestMs ? t('stats.bestLine', { time: formatTime(st.bestMs, true), n: st.bestMoves }) : '—';
      row.append(dt, dd);
      list.appendChild(row);
    });
  }

  let resetArmed = false;
  let resetTimer = 0;
  const resetBtn = $('btn-stats-reset');
  function disarmReset() {
    resetArmed = false;
    clearTimeout(resetTimer);
    resetBtn.textContent = t('stats.reset');
    resetBtn.classList.remove('btn-danger');
  }
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      // Bấm hai lần để tránh xóa nhầm
      resetArmed = true;
      resetBtn.textContent = t('stats.resetConfirm');
      resetBtn.classList.add('btn-danger');
      resetTimer = setTimeout(disarmReset, 3500);
      return;
    }
    disarmReset();
    stats = emptyStats();
    session.counted = false; // ván đang dở sẽ được tính lại khi đi nước tiếp theo
    saveAll();
    renderStats();
    updateHud();
    toast(t('toast.statsReset'));
  });

  /* ---------------- Nút bấm ---------------- */
  $('btn-new').addEventListener('click', () => requestNewGame());
  $('btn-win-new').addEventListener('click', () => requestNewGame());
  const openSettings = () => {
    syncSegmented();
    openModal('modal-settings');
  };
  $('btn-win-size').addEventListener('click', openSettings);
  $('size-badge').addEventListener('click', openSettings);
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-confirm-ok').addEventListener('click', () => {
    const fn = confirmAction;
    confirmAction = null;
    if (fn) fn();
    else closeModal();
  });
  $('btn-stats').addEventListener('click', () => {
    disarmReset();
    renderStats();
    openModal('modal-stats');
  });

  /* ---------------- Bàn phím ---------------- */
  const KEY_DIRS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
  };

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (modalOpen()) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      } else if (e.key === 'Tab') {
        trapFocus(e);
      }
      return;
    }
    const dir = KEY_DIRS[e.key];
    if (dir) {
      // Phím mũi tên trên nút của lớp phủ thắng thì để trình duyệt xử lý
      if (session.done) return;
      e.preventDefault();
      doMoveDir(dir);
      return;
    }
    if (e.repeat) return;
    if (e.key === 'n' || e.key === 'N') requestNewGame();
  });

  /* ---------------- Chạm / vuốt (pointer events) ---------------- */
  const pointers = new Set();
  let press = null; // { id, x, y, idx }: idx là vị trí ô được nhấn (-1 nếu nhấn vào chỗ trống)

  /** Hướng ô ở vị trí idx sẽ trượt nếu chạm (về phía ô trống); null nếu không cùng hàng / cột. */
  function dirToGap(idx) {
    const g = game();
    if (!E.canMoveAt(g, idx)) return null;
    const n = g.size;
    const gap = g.tiles.indexOf(0);
    if (Math.floor(idx / n) === Math.floor(gap / n)) return idx < gap ? 'right' : 'left';
    return idx < gap ? 'down' : 'up';
  }

  boardEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.overlay')) return; // để nút trên lớp phủ bấm bình thường
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.add(e.pointerId);
    const tile = e.target.closest('.tile');
    const idx = tile && session ? game().tiles.indexOf(Number(tile.dataset.v)) : -1;
    // Hai ngón trở lên: bỏ qua cử chỉ
    press = pointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, idx } : null;
  });

  function endPointer(e, cancelled) {
    pointers.delete(e.pointerId);
    if (!press || press.id !== e.pointerId) return;
    const p = press;
    press = null;
    if (cancelled) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < SWIPE_MIN) {
      // Chạm: ô cùng hàng / cột với ô trống thì trượt, ô khác thì báo không đi được
      if (p.idx >= 0) {
        if (dirToGap(p.idx)) doMoveAt(p.idx);
        else if (canPlay()) blocked(null);
      }
      return;
    }
    const dir = ax > ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    // Vuốt bắt đầu trên một ô cùng hàng / cột và hướng về ô trống: trượt cả đoạn từ ô đó
    if (p.idx >= 0 && dirToGap(p.idx) === dir) doMoveAt(p.idx);
    else doMoveDir(dir);
  }
  window.addEventListener('pointerup', (e) => endPointer(e, false));
  window.addEventListener('pointercancel', (e) => endPointer(e, true));
  // Chặn cuộn trang bằng cảm ứng khi vuốt trên bàn chơi (dự phòng cho trình duyệt cũ)
  boardEl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  /* ---------------- Đồng hồ, ẩn tab, lưu khi rời trang ---------------- */
  setInterval(() => {
    if (!session || clockStart === null) return;
    renderTimer();
    if (Date.now() - lastSaveAt >= AUTOSAVE_MS) {
      persist();
      writeSummary();
    }
  }, 200);

  document.addEventListener('visibilitychange', () => {
    if (!session) return;
    if (document.hidden) {
      stopClock();
      saveAll();
    } else {
      startClock();
    }
  });
  window.addEventListener('pagehide', saveAll);
  I18N.onBeforeReload(saveAll);
  const onSchemeChange = () => {
    if (settings.theme === 'auto') applyTheme();
  };
  const schemeMQ = window.matchMedia('(prefers-color-scheme: dark)');
  if (schemeMQ.addEventListener) schemeMQ.addEventListener('change', onSchemeChange);

  /* ---------------- Khởi động ---------------- */
  $('app-version').textContent = APP_VERSION;
  // Không có âm thanh (SDK cũ / chạy không SDK) thì ẩn hàng bật/tắt tiếng; cổng đổi thì đồng bộ lại
  $('setting-sound').hidden = !SFX;
  if (SFX && SFX.onChange) SFX.onChange(syncSegmented);
  applyTheme();
  const restored = restoreSession();
  if (restored) {
    session = restored;
    settings.mode = modeOf(); // kích thước theo ván đang dở
    saveSettings();
    // Đã đi nước nào thì nối lại ván cũ trên cổng; bàn chưa đụng tới thì coi như ván mới
    PN && PN.gameStart(started() ? { mode: modeOf(), resume: true } : { mode: modeOf() });
    buildBoard();
    if (!document.hidden) startClock();
    updateHud();
    syncOverlay(false);
    saveAll();
  } else {
    startNewGame(settings.mode);
  }
  syncSegmented();
})();
