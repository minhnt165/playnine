/* =====================================================================
 * 2048 - Logic giao diện (cần engine.js nạp trước)
 *   - Render theo id ô: ô trượt bằng transform, ô gộp / ô mới có hiệu ứng nảy
 *   - Bàn phím (mũi tên, WASD), vuốt (pointer events)
 *   - Lưu ván, cài đặt, thống kê vào localStorage; ghi tóm tắt cho cổng PlayNine
 *   - Chữ hiển thị đi qua I18N.t (i18n.js nạp trước)
 * ===================================================================== */
(function () {
  'use strict';
  const PN = window.PlayNine || null; // SDK PlayNine: chỉ có khi chạy trong cổng
  PN && PN.init({ gameId: '2048' });

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

  const APP_VERSION = '1.3.0';
  const G = window.Game2048;
  const t = I18N.t;

  // Điền chữ tĩnh theo ngôn ngữ trước khi vẽ phần động
  I18N.apply();

  // Mọi khóa localStorage đều có tiền tố playnine-2048-
  const KEYS = {
    settings: 'playnine-2048-settings-v1',
    game: 'playnine-2048-game-v1',
    stats: 'playnine-2048-stats-v1',
    summary: 'playnine-2048-summary-v1',
  };
  const SWIPE_MIN = 24; // px, quãng vuốt tối thiểu
  const SLIDE_MS = 110; // khớp với --slide trong style.css
  const THEMES = ['auto', 'light', 'dark'];

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const slideMs = () => (reduceMotion.matches ? 0 : SLIDE_MS);
  const fmt = (n) => I18N.fmtNumber(n);

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

  /* ---------------- Cài đặt ---------------- */
  function loadSettings() {
    const s = readJSON(KEYS.settings) || {};
    return {
      theme: THEMES.includes(s.theme) ? s.theme : 'auto',
      size: G.SIZES.includes(s.size) ? s.size : G.DEFAULT_SIZE,
    };
  }
  const settings = loadSettings();
  const saveSettings = () => writeJSON(KEYS.settings, settings);

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    const meta = $('theme-color');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f6f2ea';
  }

  /* ---------------- Thống kê ---------------- */
  function emptyStats() {
    return { played: 0, won: 0, bestTile: 0, best: { 3: 0, 4: 0, 5: 0 } };
  }
  function loadStats() {
    const s = readJSON(KEYS.stats);
    const out = emptyStats();
    if (!s || typeof s !== 'object') return out;
    const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
    out.played = int(s.played);
    out.won = int(s.won);
    out.bestTile = int(s.bestTile);
    if (s.best && typeof s.best === 'object') G.SIZES.forEach((k) => (out.best[k] = int(s.best[k])));
    return out;
  }
  let stats = loadStats();
  const saveStats = () => writeJSON(KEYS.stats, stats);
  const bestOverall = () => Math.max(0, ...G.SIZES.map((k) => stats.best[k]));

  /* ---------------- Ván đang chơi ---------------- */
  // counted: ván này đã được tính vào "ván đã chơi" chưa (tính khi đi nước đầu tiên)
  let game = null;
  let counted = false;

  function loadGame() {
    const saved = readJSON(KEYS.game);
    const g = saved && G.restore(saved.game);
    if (!g) return false;
    game = g;
    counted = saved.counted === true;
    return true;
  }
  const saveGame = () => writeJSON(KEYS.game, { game, counted });

  /** Tóm tắt cho thẻ game ở cổng PlayNine. */
  function writeSummary() {
    const best = bestOverall();
    const list = [];
    if (best > 0) list.push({ value: fmt(best), label: t('stats.bestScore') });
    if (stats.bestTile > 0) list.push({ value: String(stats.bestTile), label: t('stats.bestTile') });
    if (stats.won > 0) list.push({ value: fmt(stats.won), label: t('stats.won') });

    let note = t('summary.note');
    if (best > 0) note = t('summary.noteBest', { score: fmt(best), tile: stats.bestTile });

    let resume = null;
    if (game && game.moves > 0 && !game.over) {
      const sizeTxt = game.size !== G.DEFAULT_SIZE ? game.size + 'x' + game.size + ' · ' : '';
      resume = {
        title: t('summary.resume'),
        detail: sizeTxt + t('game.scoreTile', { score: fmt(game.score), tile: G.maxTile(game) }),
        pct: null,
      };
    }
    writeJSON(KEYS.summary, {
      v: 1,
      updatedAt: Date.now(),
      played: stats.played,
      won: stats.won,
      note,
      stats: list,
      resume,
      daily: null,
    });
  }

  function persist() {
    saveGame();
    saveStats();
    writeSummary();
  }

  /* ---------------- DOM ---------------- */
  const boardEl = $('board');
  const gridEl = $('grid');
  const tilesEl = $('tiles');
  const scoreEl = $('score');
  const scoreBox = $('score-box');
  const bestEl = $('best');
  const undoBtn = $('btn-undo');
  const undoLeftEl = $('undo-left');
  const overlayWin = $('overlay-win');
  const overlayOver = $('overlay-over');

  /* ---------------- Render theo id ô ---------------- */
  const tileEls = new Map(); // id -> phần tử .tile
  let leaving = []; // phần tử ô bị gộp, gỡ sau khi trượt xong
  let leaveTimer = 0;

  function digitsClass(v) {
    const d = String(v).length;
    return d >= 3 ? 'd' + Math.min(d, 6) : '';
  }

  function placeTile(el, idx) {
    el.style.setProperty('--r', Math.floor(idx / game.size));
    el.style.setProperty('--c', idx % game.size);
  }

  function createTile(tile, idx, kind) {
    const el = document.createElement('div');
    el.className = 'tile ' + (tile.v <= G.WIN_VALUE ? 'v' + tile.v : 'vbig');
    const dc = digitsClass(tile.v);
    if (dc) el.classList.add(dc);
    if (kind) el.classList.add(kind);
    const inner = document.createElement('div');
    inner.className = 'tile-inner';
    inner.textContent = tile.v;
    el.appendChild(inner);
    placeTile(el, idx);
    tilesEl.appendChild(el);
    tileEls.set(tile.id, el);
    return el;
  }

  function flushLeaving() {
    clearTimeout(leaveTimer);
    leaving.forEach((el) => el.remove());
    leaving = [];
  }

  /** Dựng lại nền lưới khi đổi kích thước. */
  function buildGrid() {
    boardEl.dataset.n = game.size;
    gridEl.textContent = '';
    for (let i = 0; i < game.size * game.size; i++) gridEl.appendChild(document.createElement('span'));
    flushLeaving();
    tilesEl.textContent = '';
    tileEls.clear();
  }

  /**
   * Đồng bộ phần tử với state: ô có sẵn thì trượt tới chỗ mới, ô thiếu thì tạo,
   * ô thừa thì gỡ. Dùng khi tải trang, ván mới, hoàn tác.
   */
  function reconcile(kindForNew) {
    flushLeaving();
    const alive = new Set();
    game.cells.forEach((t, i) => {
      if (!t) return;
      alive.add(t.id);
      const el = tileEls.get(t.id);
      if (el) {
        el.classList.remove('new', 'merged', 'restored');
        placeTile(el, i);
      } else {
        createTile(t, i, kindForNew);
      }
    });
    tileEls.forEach((el, id) => {
      if (!alive.has(id)) {
        el.remove();
        tileEls.delete(id);
      }
    });
  }

  /** Hiệu ứng cho một nước đi theo kết quả engine trả về. */
  function animateMove(res) {
    flushLeaving();
    // Bỏ hiệu ứng nảy cũ để ô trượt không bị nảy lại
    tileEls.forEach((el) => el.classList.remove('new', 'merged', 'restored'));
    for (const s of res.slides) {
      const el = tileEls.get(s.id);
      if (el) placeTile(el, s.to);
    }
    for (const m of res.merges) {
      for (const id of m.from) {
        const el = tileEls.get(id);
        tileEls.delete(id);
        if (el) {
          el.classList.add('leaving');
          leaving.push(el);
        }
      }
      createTile({ id: m.id, v: m.v }, m.at, 'merged');
    }
    if (res.spawned) createTile(res.spawned, res.spawned.at, 'new');
    if (leaving.length) leaveTimer = setTimeout(flushLeaving, slideMs() + 20);
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    scoreEl.textContent = fmt(game.score);
    bestEl.textContent = fmt(stats.best[game.size]);
    undoLeftEl.textContent = game.undoLeft;
    const can = G.canUndo(game);
    undoBtn.disabled = !can;
    undoBtn.setAttribute(
      'aria-label',
      t('hud.undoAria', { n: game.undoLeft }) + (can ? '' : game.undoLeft ? t('hud.undoNone') : '')
    );
    $('size-badge').textContent = game.size + 'x' + game.size;
    $('btn-over-undo').hidden = !can;
  }

  /** Chạy lại một hiệu ứng CSS (gỡ lớp, ép reflow, gắn lại). */
  function replayClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function floatScore(n) {
    if (!n || reduceMotion.matches) return;
    replayClass(scoreBox, 'bump');
    const el = document.createElement('span');
    el.className = 'score-float';
    el.textContent = '+' + fmt(n);
    el.setAttribute('aria-hidden', 'true');
    scoreBox.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 1200);
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

  /* ---------------- Lớp phủ thắng / thua ---------------- */
  function syncOverlays(focus) {
    const showWin = game.won && !game.keepPlaying && !game.over;
    const showOver = game.over;
    overlayWin.hidden = !showWin;
    overlayOver.hidden = !showOver;
    if (showWin) {
      $('win-score').textContent = fmt(game.score);
      $('win-sub').textContent = t('win.sub', { n: game.moves });
    }
    if (showOver) {
      $('over-score').textContent = fmt(game.score);
      $('over-sub').textContent = t('game.maxTile', { tile: G.maxTile(game) });
      $('over-best').hidden = !(game.score > 0 && game.score >= stats.best[game.size]);
    }
    if (focus) {
      if (showWin) $('btn-continue').focus();
      else if (showOver) (G.canUndo(game) ? $('btn-over-undo') : $('btn-over-new')).focus();
    }
  }
  const overlayShown = () => !overlayWin.hidden || !overlayOver.hidden;

  /* ---------------- Luồng chơi ---------------- */
  const modeOf = (g) => g.size + 'x' + g.size;
  const endRun = (g) => PN && PN.gameEnd({ mode: modeOf(g), score: g.score, won: G.maxTile(g) >= G.WIN_VALUE, assisted: false });

  function startNewGame(size) {
    // Đã đạt 2048 rồi chơi tiếp mà bấm ván mới: tính ván cũ là một ván thắng
    if (game && !game.over && G.maxTile(game) >= G.WIN_VALUE) endRun(game);
    game = G.newGame(size || settings.size);
    PN && PN.gameStart({ mode: modeOf(game) });
    counted = false;
    bestToBeat = stats.best[game.size];
    buildGrid();
    reconcile('new');
    updateHud();
    syncOverlays(false);
    persist();
  }

  // Kỷ lục mới báo một lần mỗi ván (chỉ khi đã có kỷ lục từ ván trước); tiếng "không đi được" giãn cách để giữ phím không kêu liên tục
  let bestToBeat = 0; // kỷ lục lúc bắt đầu ván (0 = chưa có kỷ lục, không báo)
  let lastBlocked = 0;

  /** Không dồn được theo hướng này: bàn chơi giật nhẹ + tiếng báo. */
  function blocked(dir) {
    const now = Date.now();
    if (now - lastBlocked < 350) return;
    lastBlocked = now;
    boardEl.dataset.nudge = dir;
    replayClass(boardEl, 'nudge');
    sfx('error', { volume: 0.6 });
  }

  /** Tiếng cho một nước đi: gộp cao giọng dần theo giá trị ô, ô lớn mới thì lên cấp. */
  function moveSound(res, prevTop) {
    if (res.reached) {
      sfx('win');
      setTimeout(confetti, slideMs());
    } else if (res.merges.length) {
      const top = Math.max(...res.merges.map((m) => m.v));
      if (top >= 128 && top > prevTop) sfx('levelup');
      else sfx('merge', { pitch: 0.85 + Math.log2(top) * 0.07, volume: Math.min(1, 0.7 + res.merges.length * 0.1) });
    } else {
      sfx('move', { volume: 0.5 });
    }
    if (bestToBeat > 0 && game.score > bestToBeat) {
      bestToBeat = 0;
      replayClass(scoreBox, 'record');
      setTimeout(() => sfx('coin'), 140);
    }
    if (game.over) setTimeout(() => sfx('lose'), slideMs() + 220);
  }

  function doMove(dir) {
    if (!game || modalOpen() || overlayShown()) return;
    const res = G.move(game, dir);
    if (!res.moved) {
      blocked(dir);
      return;
    }
    const prevTop = G.maxTile(game);
    game = res.state;

    if (!counted) {
      counted = true;
      stats.played++;
    }
    if (game.score > stats.best[game.size]) stats.best[game.size] = game.score;
    const top = G.maxTile(game);
    if (top > stats.bestTile) stats.bestTile = top;
    if (res.reached) stats.won++;

    animateMove(res);
    floatScore(res.gained);
    moveSound(res, prevTop);
    updateHud();
    if (game.over) endRun(game);
    if (res.reached || game.over) {
      syncOverlays(true);
      announce(game.over ? t('announce.over', { score: fmt(game.score) }) : t('announce.won'));
    }
    persist();
  }

  function doUndo() {
    if (!game || modalOpen()) return;
    const prev = G.undo(game);
    if (!prev) {
      sfx('error', { volume: 0.6 });
      toast(game.undoLeft ? t('toast.nothingToUndo') : t('toast.noUndosLeft'));
      return;
    }
    sfx('flip');
    game = prev;
    reconcile('restored');
    updateHud();
    syncOverlays(false);
    announce(t('announce.undone', { n: game.undoLeft }));
    if (document.activeElement && document.activeElement.closest('.overlay')) boardEl.focus();
    persist();
  }

  function doContinue() {
    sfx('tap');
    game = G.continuePlaying(game);
    syncOverlays(false);
    boardEl.focus();
    persist();
  }

  /** Ván mới: hỏi lại nếu đang dở ván. size khác size hiện tại thì đổi lưới. */
  function requestNewGame(size) {
    const target = size || settings.size;
    const inProgress = game && game.moves > 0 && !game.over;
    const go = () => {
      if (target !== settings.size) {
        settings.size = target;
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
    $('confirm-title').textContent = target !== game.size ? t('confirm.sizeTitle', { n: target }) : t('confirm.newTitle');
    $('confirm-text').textContent = t('confirm.text', { score: fmt(game.score), n: target });
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
    } else if (key === 'size') {
      const size = Number(value);
      if (size === game.size) {
        settings.size = size;
        saveSettings();
        syncSegmented();
        return;
      }
      requestNewGame(size);
    } else if (key === 'sound') {
      if (!SFX) return;
      SFX.setMuted(value === 'off');
      syncSegmented();
      sfx('tap');
    } else if (key === 'lang') {
      // Lưu ván rồi tải lại trang theo ngôn ngữ mới
      if (value === I18N.lang) return;
      persist();
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
    $('st-won').textContent = fmt(stats.won);
    $('st-tile').textContent = stats.bestTile ? String(stats.bestTile) : '—';
    $('st-best').textContent = fmt(bestOverall());
    const list = $('st-best-list');
    list.textContent = '';
    G.SIZES.forEach((k) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = t('stats.grid', { n: k });
      if (game && game.size === k) {
        const tag = document.createElement('small');
        tag.textContent = t('stats.current');
        dt.appendChild(tag);
      }
      const dd = document.createElement('dd');
      dd.textContent = stats.best[k] ? fmt(stats.best[k]) : '—';
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
    counted = false; // ván đang dở sẽ được tính lại khi đi nước tiếp theo
    persist();
    renderStats();
    updateHud();
    toast(t('toast.statsReset'));
  });

  /* ---------------- Nút bấm ---------------- */
  $('btn-new').addEventListener('click', () => requestNewGame());
  $('btn-undo').addEventListener('click', doUndo);
  $('btn-over-undo').addEventListener('click', doUndo);
  $('btn-over-new').addEventListener('click', () => requestNewGame());
  $('btn-win-new').addEventListener('click', () => requestNewGame());
  $('btn-continue').addEventListener('click', doContinue);
  $('btn-confirm-ok').addEventListener('click', () => {
    const fn = confirmAction;
    confirmAction = null;
    if (fn) fn();
    else closeModal();
  });
  $('btn-settings').addEventListener('click', () => {
    syncSegmented();
    openModal('modal-settings');
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
      e.preventDefault();
      doMove(dir);
      return;
    }
    if (e.repeat) return;
    if (e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'U') doUndo();
    else if (e.key === 'n' || e.key === 'N') requestNewGame();
  });

  /* ---------------- Vuốt (pointer events) ---------------- */
  const pointers = new Set();
  let swipe = null;

  boardEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.overlay')) return; // để nút trên lớp phủ bấm bình thường
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.add(e.pointerId);
    // Hai ngón trở lên: bỏ qua cử chỉ
    swipe = pointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
  });

  function endPointer(e, cancelled) {
    pointers.delete(e.pointerId);
    if (!swipe || swipe.id !== e.pointerId) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    swipe = null;
    if (cancelled) return;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < SWIPE_MIN) return;
    doMove(ax > ay ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  }
  window.addEventListener('pointerup', (e) => endPointer(e, false));
  window.addEventListener('pointercancel', (e) => endPointer(e, true));
  // Chặn cuộn trang bằng cảm ứng khi vuốt trên bàn chơi (dự phòng cho trình duyệt cũ)
  boardEl.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  /* ---------------- Lưu khi rời trang ---------------- */
  window.addEventListener('pagehide', persist);
  I18N.onBeforeReload(persist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });
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
  if (loadGame()) {
    settings.size = game.size; // kích thước theo ván đang dở
    bestToBeat = game.score < stats.best[game.size] ? stats.best[game.size] : 0;
    PN && !game.over && PN.gameStart({ mode: modeOf(game), resume: true });
    buildGrid();
    reconcile('');
    updateHud();
    syncOverlays(false);
    persist();
  } else {
    startNewGame(settings.size);
  }
  syncSegmented();
})();
