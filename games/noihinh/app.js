/* =====================================================================
 * Nối Hình - Logic game + render (cần i18n.js, engine.js nạp trước)
 *   - Mỗi lần chơi một cấp độ là một ván gửi lên cổng (thắng = qua cấp độ)
 *   - Ô bàn, ô hàng chờ và ô trong khay cùng nằm trong một lớp toạ độ (#layer)
 *     để ô bay từ bàn xuống khay bằng transition của transform
 * ===================================================================== */
(function () {
  'use strict';

  const E = window.NoiHinh;
  const APP_VERSION = '1.0.0';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: 'noihinh' });
  const MODE = 'classic';
  const t = I18N.t;

  // Điền chữ tĩnh theo ngôn ngữ trước khi vẽ phần động
  I18N.apply();

  const PREFIX = 'playnine-noihinh-';
  const SAVE_KEY = PREFIX + 'save-v1';
  const SETTINGS_KEY = PREFIX + 'settings-v1';
  const STATS_KEY = PREFIX + 'stats-v1';
  const SUMMARY_KEY = PREFIX + 'summary-v1';

  // Hình trên ô theo loại (engine dùng tối đa 18 loại)
  const ICONS = ['💄', '💍', '⌚', '🧺', '🎮', '🦆', '🏐', '📱', '🥤', '🔊', '👜', '👟', '🧸', '🎧', '👒', '📷', '🎀', '🧴'];
  const MAX_TILE = 58; // px, cạnh ô lớn nhất
  const FLY_MS = 240; // thời gian ô bay xuống khay
  const CLEAR_MS = 1800; // hiện "Hoàn thành cấp độ" trước khi sang cấp mới

  const $ = (id) => document.getElementById(id);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const wait = (ms) => (reduceMotion.matches ? 0 : ms);

  /* ---------------- localStorage (luôn bọc try/catch) ---------------- */
  function readJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      return null;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* bỏ qua: hết dung lượng hoặc bị chặn */ }
  }
  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) { /* bỏ qua */ }
  }

  /* ---------------- Cài đặt ---------------- */
  const DEFAULT_SETTINGS = { theme: 'auto', vibrate: true };
  let settings = loadSettings();

  function loadSettings() {
    const s = Object.assign({}, DEFAULT_SETTINGS);
    const raw = readJSON(SETTINGS_KEY);
    if (raw && typeof raw === 'object') {
      if (['auto', 'light', 'dark'].indexOf(raw.theme) >= 0) s.theme = raw.theme;
      if (typeof raw.vibrate === 'boolean') s.vibrate = raw.vibrate;
    }
    return s;
  }
  function saveSettings() {
    writeJSON(SETTINGS_KEY, settings);
  }

  /* ---------------- Tiến độ & thống kê ---------------- */
  // level: cấp độ đang chơi; cleared: số cấp độ đã qua; played: số lần chơi (mỗi lần bắt đầu một cấp độ)
  const emptyStats = () => ({ v: 1, level: 1, cleared: 0, played: 0 });
  let stats = loadStats();

  function loadStats() {
    const s = emptyStats();
    const raw = readJSON(STATS_KEY);
    if (raw && typeof raw === 'object') {
      ['level', 'cleared', 'played'].forEach((k) => {
        if (Number.isInteger(raw[k]) && raw[k] >= 0) s[k] = raw[k];
      });
      s.level = Math.max(1, s.level);
    }
    return s;
  }
  function saveStats() {
    writeJSON(STATS_KEY, stats);
  }

  /* ---------------- Ván chơi ---------------- */
  let game = null;
  let reported = false; // đã gửi kết quả ván hiện tại lên cổng
  let busyUntil = 0; // đang chuyển cấp độ: chặn chạm

  function startLevel(n) {
    game = E.createGame(n);
    reported = false;
    stats.level = n;
    stats.played++;
    saveStats();
    buildTiles(true);
    renderAll();
    persist();
    writeSummary();
    PN && PN.gameStart({ mode: MODE });
  }

  /** Gửi kết quả ván cho cổng một lần duy nhất. */
  function report(won) {
    if (reported) return;
    reported = true;
    PN && PN.gameEnd({ mode: MODE, won, assisted: false });
  }

  function persist() {
    if (!game || game.status !== 'playing') {
      removeKey(SAVE_KEY);
      return;
    }
    writeJSON(SAVE_KEY, { v: 1, game: E.toJSON(game) });
  }

  function restoreGame() {
    const s = readJSON(SAVE_KEY);
    if (!s || s.v !== 1) return null;
    const g = E.fromJSON(s.game);
    return g && g.level === stats.level ? g : null;
  }

  function writeSummary() {
    const headline = [];
    let note = t('summary.noGames');
    if (stats.played) {
      note = t('summary.at', { n: stats.level });
      headline.push({ value: String(stats.level), label: t('summary.statLevel') });
      headline.push({ value: String(stats.cleared), label: t('summary.statCleared') });
    }
    let resume = null;
    if (game && game.status !== 'won') {
      const left = E.remaining(game);
      const total = game.tiles.length;
      if (left < total) {
        resume = {
          title: t('summary.resume', { n: game.level }),
          detail: t('summary.resumeDetail', { n: left }),
          pct: Math.round((1 - left / total) * 1000) / 1000,
        };
      }
    }
    writeJSON(SUMMARY_KEY, {
      v: 1,
      updatedAt: Date.now(),
      played: stats.played,
      won: stats.cleared,
      note,
      stats: headline,
      resume,
    });
  }

  /* ---------------- Bố cục ---------------- */
  const stage = $('stage');
  const layer = $('layer');
  const trayEl = $('tray');
  const slotsEl = $('tray-slots');
  let tileEls = []; // theo id ô
  let geo = null; // { T, u, bx, by, tray: {x, y, S}, hold: {x, y} }

  function computeLayout() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const cap = game.cap;
    // Khay: ô khay không lớn hơn ô bàn tối đa, chừa chỗ nút "+"
    const addW = 46;
    const S = Math.max(24, Math.min(MAX_TILE, (Math.min(W, 520) - 24 - addW - 10) / E.MAX_TRAY));
    const trayW = S * cap + 16;
    const trayH = S + 18;
    const trayX = (W - (trayW + addW + 10)) / 2;
    const trayY = H - trayH - 4;
    // Hàng chờ (Lấy ra) ngay trên khay, chỉ chiếm chỗ khi có ô
    const holdH = game.hold.length ? S + 10 : 0;
    const boardH = trayY - holdH - 14;
    let maxX = 0;
    let maxY = 0;
    game.tiles.forEach((tl) => {
      maxX = Math.max(maxX, tl.x + E.TILE);
      maxY = Math.max(maxY, tl.y + E.TILE + 1);
    });
    // Mỗi lớp nhô lên một chút nên chừa thêm theo số lớp
    const u = Math.max(2, Math.min(MAX_TILE / E.TILE, (W - 12) / maxX, boardH / maxY));
    const T = u * E.TILE;
    geo = {
      T,
      u,
      bx: (W - maxX * u) / 2,
      by: Math.max(6, (boardH - maxY * u) / 2 + 6),
      tray: { x: trayX + 8, y: trayY + 9, S },
      hold: { x: (W - S * E.HOLD_SIZE - 8 * (E.HOLD_SIZE - 1)) / 2, y: trayY - holdH, S },
    };
    trayEl.style.left = trayX + 'px';
    trayEl.style.top = trayY + 'px';
    trayEl.style.setProperty('--S', S + 'px');
    slotsEl.style.width = trayW + 'px';
    slotsEl.style.height = trayH + 'px';
    if (slotsEl.childElementCount !== cap) {
      slotsEl.textContent = '';
      for (let i = 0; i < cap; i++) slotsEl.appendChild(document.createElement('span'));
    }
    layer.style.setProperty('--T', T + 'px');
  }

  /** Vị trí và tỉ lệ thu nhỏ của ô theo chỗ đang ở (bàn / hàng chờ / khay). */
  function tileTransform(tl, trayOrder) {
    const at = tl.at;
    if (at === 'tray' || at === 'gone') {
      const order = trayOrder || game.tray;
      const i = Math.max(0, order.indexOf(tl.id));
      const S = geo.tray.S;
      return { x: geo.tray.x + i * S, y: geo.tray.y, k: S / geo.T, z: 900 + i };
    }
    if (at === 'hold') {
      const i = game.hold.indexOf(tl.id);
      const S = geo.hold.S;
      return { x: geo.hold.x + i * (S + 8), y: geo.hold.y, k: S / geo.T, z: 800 + i };
    }
    return { x: geo.bx + tl.x * geo.u, y: geo.by + tl.y * geo.u, k: 1, z: tl.z * 10 + 1 };
  }

  function place(el, p) {
    el.style.transform = `translate(${p.x}px, ${p.y}px) scale(${p.k})`;
    el.style.zIndex = String(p.z);
  }

  function makeTile(tl) {
    const el = document.createElement('div');
    el.className = 'tile';
    el.dataset.id = String(tl.id);
    const face = document.createElement('span');
    face.className = 'face';
    face.textContent = ICONS[tl.type % ICONS.length];
    el.appendChild(face);
    return el;
  }

  function buildTiles(intro) {
    layer.textContent = '';
    computeLayout();
    stage.classList.add('no-anim');
    tileEls = game.tiles.map((tl) => {
      if (tl.at === 'gone') return null;
      const el = makeTile(tl);
      if (intro && !reduceMotion.matches) {
        el.classList.add('enter');
        el.style.setProperty('--d', Math.min(900, tl.z * 90 + (tl.y + tl.x) * 2) + 'ms');
        el.addEventListener('animationend', () => el.classList.remove('enter'), { once: true });
      }
      layer.appendChild(el);
      return el;
    });
    placeAll();
    requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('no-anim')));
  }

  function placeAll() {
    if (!game) return;
    const free = new Set(E.freeIds(game));
    game.tiles.forEach((tl) => {
      const el = tileEls[tl.id];
      if (!el || tl.at === 'gone') return;
      place(el, tileTransform(tl));
      const blocked = tl.at === 'board' && !free.has(tl.id);
      el.classList.toggle('blocked', blocked);
      el.classList.toggle('in-tray', tl.at === 'tray');
      el.setAttribute('aria-hidden', blocked || tl.at === 'tray' ? 'true' : 'false');
    });
  }

  function relayout() {
    if (!game) return;
    computeLayout();
    placeAll();
  }

  /* ---------------- HUD ---------------- */
  function renderBoosters() {
    const b = game.boosters;
    [['out', b.out], ['undo', b.undo], ['shuffle', b.shuffle]].forEach(([k, n]) => {
      $('count-' + k).textContent = String(n);
      $('btn-' + k).classList.toggle('empty', n <= 0);
    });
    $('btn-slot').classList.toggle('empty', b.slot <= 0 || game.cap >= E.MAX_TRAY);
  }

  function renderAll() {
    $('level-title').textContent = t('level.title', { n: game.level });
    renderBoosters();
    relayout();
  }

  /* ---------------- Chơi ---------------- */
  function vibrate(ms) {
    if (!settings.vibrate || !navigator.vibrate) return;
    try {
      navigator.vibrate(ms);
    } catch (e) { /* bỏ qua */ }
  }

  const canAct = () => !!game && game.status === 'playing' && performance.now() >= busyUntil && !document.querySelector('.modal:not([hidden])');

  function tap(id) {
    if (!canAct()) return;
    const tl = game.tiles[id];
    if (!E.isFree(game, id)) {
      const el = tileEls[id];
      if (el && tl.at === 'board') {
        el.classList.remove('nope');
        void el.offsetWidth;
        el.classList.add('nope');
      }
      return;
    }
    // Thứ tự khay ngay sau khi chèn (trước khi ăn bộ ba) để ô bay đúng chỗ rồi mới biến mất
    const order = game.tray.slice();
    order.splice(E.insertPosition(game, id), 0, id);
    const holdBefore = game.hold.length;
    const res = E.pick(game, id);
    if (!res) return;

    if (res.cleared.length) {
      const cleared = res.cleared.map((x) => tileEls[x]);
      res.cleared.forEach((x) => {
        tileEls[x] = null;
      });
      // Ô bay vào chỗ của bộ ba trước, các ô còn lại giữ chỗ cũ tới khi bộ ba biến mất
      if (holdBefore !== game.hold.length && !game.hold.length) computeLayout();
      game.tiles.forEach((tl) => {
        const el = tileEls[tl.id] || (res.cleared.indexOf(tl.id) >= 0 ? cleared[res.cleared.indexOf(tl.id)] : null);
        if (el && (tl.at === 'tray' || tl.at === 'gone')) place(el, tileTransform(tl, order));
      });
      placeBoardOnly();
      setTimeout(() => {
        cleared.forEach((el) => el.classList.add('gone'));
        vibrate(25);
        setTimeout(() => {
          cleared.forEach((el) => el.remove());
          placeAll();
        }, wait(220));
      }, wait(FLY_MS));
    } else {
      relayout();
    }
    renderBoosters();
    afterMove();
  }

  /** Cập nhật ô trên bàn (bị che / lộ) mà không dời các ô trong khay. */
  function placeBoardOnly() {
    const free = new Set(E.freeIds(game));
    game.tiles.forEach((tl) => {
      const el = tileEls[tl.id];
      if (!el || tl.at !== 'board') return;
      el.classList.toggle('blocked', !free.has(tl.id));
      el.setAttribute('aria-hidden', free.has(tl.id) ? 'false' : 'true');
    });
  }

  function afterMove() {
    if (game.status === 'won') onWin();
    else if (game.status === 'lost') onLost();
    persist();
    writeSummary();
  }

  function onWin() {
    report(true);
    stats.cleared++;
    stats.level = game.level + 1;
    saveStats();
    removeKey(SAVE_KEY);
    busyUntil = performance.now() + wait(CLEAR_MS) + 400;
    const banner = $('clear-banner');
    setTimeout(() => {
      banner.textContent = t('level.clear', { n: game.level });
      banner.hidden = false;
      banner.classList.remove('show');
      void banner.offsetWidth;
      banner.classList.add('show');
    }, wait(400));
    setTimeout(() => {
      banner.hidden = true;
      startLevel(stats.level);
    }, wait(CLEAR_MS) + 400);
  }

  function onLost() {
    vibrate(80);
    // Hết cách cứu thì ván coi như thua luôn
    if (game.boosters.out <= 0 && (game.boosters.slot <= 0 || game.cap >= E.MAX_TRAY)) report(false);
    setTimeout(() => {
      if (game.status !== 'lost') return;
      $('btn-lost-out').hidden = game.boosters.out <= 0;
      $('btn-lost-slot').hidden = game.boosters.slot <= 0 || game.cap >= E.MAX_TRAY;
      openModal('modal-lost');
    }, wait(FLY_MS + 300));
  }

  function retryLevel() {
    if (game && game.status !== 'won') report(false);
    startLevel(game ? game.level : stats.level);
  }

  function useOut() {
    if (!game || game.status === 'won') return;
    if (game.boosters.out <= 0) return toast(t('toast.none'));
    if (!game.tray.length) return toast(t('toast.outNeedsTiles'));
    if (game.hold.length) return toast(t('toast.outBusy'));
    if (!E.moveOut(game)) return;
    closeModal('modal-lost');
    renderAll();
    afterMove();
  }

  function useSlot() {
    if (!game || game.status === 'won') return;
    if (game.cap >= E.MAX_TRAY) return toast(t('toast.slotMax'));
    if (game.boosters.slot <= 0) return toast(t('toast.none'));
    if (!E.addSlot(game)) return;
    closeModal('modal-lost');
    renderAll();
    afterMove();
  }

  function useUndo() {
    if (!canAct()) return;
    if (game.boosters.undo <= 0) return toast(t('toast.none'));
    if (!game.history.length) return toast(t('toast.undoNone'));
    E.undo(game);
    renderAll();
    afterMove();
  }

  function useShuffle() {
    if (!canAct()) return;
    if (game.boosters.shuffle <= 0) return toast(t('toast.none'));
    E.shuffle(game);
    game.tiles.forEach((tl) => {
      const el = tileEls[tl.id];
      if (!el || tl.at !== 'board') return;
      el.firstChild.textContent = ICONS[tl.type % ICONS.length];
      el.classList.remove('flip');
      void el.offsetWidth;
      el.classList.add('flip');
    });
    renderAll();
    afterMove();
  }

  function requestRestart() {
    if (!game) return;
    closeModal('modal-settings');
    if (game.status !== 'playing' || E.remaining(game) === game.tiles.length) {
      retryLevel();
      return;
    }
    $('retry-text').textContent = t('retry.text', { n: game.level });
    openModal('modal-retry');
  }

  /* ---------------- Chạm / phím ---------------- */
  layer.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = e.target.closest && e.target.closest('.tile');
    if (!el || el.classList.contains('gone')) return;
    e.preventDefault();
    tap(Number(el.dataset.id));
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const open = document.querySelector('.modal:not([hidden])');
    if (e.key === 'Escape' && open) {
      if (open.id !== 'modal-lost') closeModal(open.id);
      return;
    }
    if (open) {
      trapFocus(e, open);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'z') useUndo();
    else if (k === 'o') useOut();
    else if (k === 's') useShuffle();
    else if (k === '+' || k === '=') useSlot();
    else if (k === 'r') requestRestart();
    else return;
    e.preventDefault();
  });

  /* ---------------- Modal ---------------- */
  let lastFocus = null;

  function openModal(id) {
    const m = $(id);
    if (!m.hidden) return;
    document.querySelectorAll('.modal:not([hidden])').forEach((x) => { x.hidden = true; });
    lastFocus = document.activeElement;
    m.hidden = false;
    const visible = (el) => el.offsetParent !== null;
    const target = Array.from(m.querySelectorAll('.btn-primary, .btn-green')).find(visible) || Array.from(m.querySelectorAll('button')).find(visible);
    if (target) target.focus();
  }
  function closeModal(id) {
    const m = $(id);
    if (!m || m.hidden) return;
    m.hidden = true;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  function trapFocus(e, modal) {
    if (e.key !== 'Tab') return;
    const items = Array.from(modal.querySelectorAll('button, input')).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  document.addEventListener('click', (e) => {
    const c = e.target.closest && e.target.closest('[data-close]');
    if (c) closeModal(c.getAttribute('data-close'));
  });

  /* ---------------- Cài đặt ---------------- */
  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    requestAnimationFrame(() => {
      $('theme-color').content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#e9dcf5';
    });
  }

  function renderSettings() {
    document.querySelectorAll('.segmented[data-setting]').forEach((seg) => {
      const key = seg.dataset.setting;
      seg.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.value === (key === 'lang' ? I18N.lang : settings[key]);
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      });
    });
    document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
      sw.checked = !!settings[sw.dataset.setting];
    });
  }

  document.querySelectorAll('.segmented[data-setting]').forEach((seg) => {
    const key = seg.dataset.setting;
    const buttons = Array.from(seg.querySelectorAll('button'));
    const choose = (b) => {
      if (key === 'lang') {
        // Lưu ván rồi tải lại trang theo ngôn ngữ mới
        if (b.dataset.value === I18N.lang) return;
        saveAll();
        I18N.set(b.dataset.value);
        return;
      }
      settings[key] = b.dataset.value;
      saveSettings();
      renderSettings();
      if (key === 'theme') applyTheme();
    };
    buttons.forEach((b) => b.addEventListener('click', () => choose(b)));
    seg.addEventListener('keydown', (e) => {
      const i = buttons.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % buttons.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + buttons.length) % buttons.length;
      if (j < 0) return;
      e.preventDefault();
      // Ngôn ngữ: phím mũi tên chỉ chuyển focus, bấm mới đổi (đổi là tải lại trang)
      if (key !== 'lang') choose(buttons[j]);
      buttons[j].focus();
    });
  });
  document.querySelectorAll('.switch[data-setting]').forEach((sw) => {
    sw.addEventListener('change', () => {
      settings[sw.dataset.setting] = sw.checked;
      saveSettings();
    });
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'auto') applyTheme();
  });

  /* ---------------- Thống kê ---------------- */
  function renderStats() {
    $('stats-level').textContent = String(stats.level);
    $('stats-cleared').textContent = I18N.fmtNumber(stats.cleared);
    $('stats-played').textContent = I18N.fmtNumber(stats.played);
    const reset = $('btn-stats-reset');
    reset.classList.remove('confirm');
    reset.textContent = t('stats.reset');
  }

  $('btn-stats-reset').addEventListener('click', () => {
    const reset = $('btn-stats-reset');
    if (!reset.classList.contains('confirm')) {
      reset.classList.add('confirm');
      reset.textContent = t('stats.resetConfirm');
      return;
    }
    // Đặt lại cả tiến độ: chơi lại từ cấp độ 1
    if (game && game.status !== 'won') report(false);
    stats = emptyStats();
    saveStats();
    closeModal('modal-stats');
    startLevel(1);
    toast(t('toast.statsReset'));
  });

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  /* ---------------- Nút ---------------- */
  $('btn-out').addEventListener('click', useOut);
  $('btn-undo').addEventListener('click', useUndo);
  $('btn-shuffle').addEventListener('click', useShuffle);
  $('btn-slot').addEventListener('click', useSlot);
  $('btn-lost-out').addEventListener('click', useOut);
  $('btn-lost-slot').addEventListener('click', useSlot);
  $('btn-lost-retry').addEventListener('click', () => {
    closeModal('modal-lost');
    retryLevel();
  });
  $('btn-restart').addEventListener('click', requestRestart);
  $('btn-retry-confirm').addEventListener('click', () => {
    closeModal('modal-retry');
    retryLevel();
  });
  $('btn-stats').addEventListener('click', () => {
    renderStats();
    openModal('modal-stats');
  });
  $('btn-settings').addEventListener('click', () => {
    renderSettings();
    openModal('modal-settings');
  });

  /** Lưu ván + tóm tắt (rời trang hoặc tải lại vì đổi ngôn ngữ). */
  function saveAll() {
    if (!game) return;
    persist();
    writeSummary();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveAll();
  });
  window.addEventListener('pagehide', saveAll);
  I18N.onBeforeReload(saveAll);

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => relayout()).observe(stage);
  } else {
    window.addEventListener('resize', relayout);
  }

  /* ---------------- Khởi động ---------------- */
  $('app-version').textContent = APP_VERSION;
  applyTheme();
  renderSettings();

  const restored = restoreGame();
  if (restored) {
    game = restored;
    buildTiles(false);
    renderAll();
    writeSummary();
    PN && PN.gameStart({ mode: MODE, resume: true });
  } else {
    startLevel(stats.level);
  }
})();
