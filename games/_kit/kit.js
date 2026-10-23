/* =====================================================================
 * PlayNine Kit - phần dùng chung cho game mới (JS thuần, không build)
 *   - Nhúng trước các file của game: <script src="../_kit/kit.js?v=1"></script>
 *   - Phần thuần (chạy được trong Node để test): createStore, createTimer, createI18n, buildSummary
 *   - Phần giao diện: PNKit.init({ gameId, version, dict, defaults, onSetting }) trả về đối tượng `kit`
 *     (lưu trữ, cài đặt, giao diện sáng/tối, ngôn ngữ, SDK, modal, toast, âm thanh, đồng hồ)
 *   - Game cũ không dùng kit; đổi kit phải tăng ?v= ở mọi game dùng nó
 * ===================================================================== */
(function (root) {
  'use strict';

  const KIT_VERSION = '1.0.0';
  const LANG_KEY = 'playnine-lang';
  const LANGS = ['en', 'vi'];
  const LOCALES = { en: 'en-US', vi: 'vi-VN' };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // Chuỗi giao diện chung của kit; game đè được bằng khóa trùng tên trong dict của game
  const KIT_DICT = {
    en: {
      'kit.settings': 'Settings',
      'kit.stats': 'Statistics',
      'kit.help': 'How to play',
      'kit.close': 'Close',
      'kit.newGame': 'New game',
      'kit.playAgain': 'Play again',
      'kit.cancel': 'Cancel',
      'kit.confirm': 'OK',
      'kit.theme': 'Theme',
      'kit.themeAuto': 'Auto',
      'kit.themeLight': 'Light',
      'kit.themeDark': 'Dark',
      'kit.lang': 'Language',
      'kit.sound': 'Sound',
      'kit.soundDesc': 'Sound effects, shared with PlayNine',
      'kit.version': 'Version {v}',
    },
    vi: {
      'kit.settings': 'Cài đặt',
      'kit.stats': 'Thống kê',
      'kit.help': 'Cách chơi',
      'kit.close': 'Đóng',
      'kit.newGame': 'Ván mới',
      'kit.playAgain': 'Chơi lại',
      'kit.cancel': 'Hủy',
      'kit.confirm': 'Đồng ý',
      'kit.theme': 'Giao diện',
      'kit.themeAuto': 'Tự động',
      'kit.themeLight': 'Sáng',
      'kit.themeDark': 'Tối',
      'kit.lang': 'Ngôn ngữ',
      'kit.sound': 'Âm thanh',
      'kit.soundDesc': 'Hiệu ứng âm thanh, dùng chung với PlayNine',
      'kit.version': 'Phiên bản {v}',
    },
  };

  /* ---------------- Phần thuần ---------------- */

  /** Đọc / ghi JSON vào localStorage theo khóa playnine-<id>-*-v1; mọi lỗi đều nuốt (chế độ riêng tư, đầy bộ nhớ). */
  function createStore({ gameId, storage }) {
    const p = 'playnine-' + gameId + '-';
    return {
      keys: { save: p + 'save-v1', stats: p + 'stats-v1', settings: p + 'settings-v1', summary: p + 'summary-v1' },
      read(key, fallback) {
        try {
          const raw = storage ? storage.getItem(key) : null;
          return raw == null ? fallback : JSON.parse(raw);
        } catch (e) {
          return fallback;
        }
      },
      write(key, value) {
        try {
          if (storage) storage.setItem(key, JSON.stringify(value));
        } catch (e) { /* bỏ qua */ }
      },
      remove(key) {
        try {
          if (storage) storage.removeItem(key);
        } catch (e) { /* bỏ qua */ }
      },
    };
  }

  /** Đồng hồ cộng dồn (ms): start chạy từ đầu nếu chưa chạy, pause / resume, set khôi phục từ ván lưu. */
  function createTimer({ now }) {
    let base = 0; // thời gian đã cộng dồn trước lần chạy hiện tại
    let since = null; // mốc bắt đầu lần chạy hiện tại; null = đang dừng
    const elapsed = () => base + (since == null ? 0 : now() - since);
    return {
      get running() { return since != null; },
      elapsed,
      start() { if (since == null) since = now(); },
      pause() { if (since != null) { base = elapsed(); since = null; } },
      resume() { if (since == null) since = now(); },
      reset() { base = 0; since = null; },
      set(ms) { base = Math.max(0, Number(ms) || 0); if (since != null) since = now(); },
    };
  }

  /** Bộ dịch: dict { en, vi } của game + KIT_DICT; thiếu thì lấy tiếng Anh, thiếu nữa trả về chính khóa. */
  function createI18n({ dict, lang, kitDict }) {
    const l = LANGS.indexOf(lang) >= 0 ? lang : 'en';
    const kd = kitDict || KIT_DICT;
    const pick = (lng, key) => {
      if (dict && dict[lng] && has(dict[lng], key)) return dict[lng][key];
      if (kd[lng] && has(kd[lng], key)) return kd[lng][key];
      return undefined;
    };
    function t(key, params) {
      let s = pick(l, key);
      if (s === undefined) s = pick('en', key);
      if (s === undefined) s = key;
      if (s && typeof s === 'object') s = params && params.n === 1 && s.one != null ? s.one : s.other;
      s = String(s);
      if (!params) return s;
      return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
    }
    return { lang: l, t, fmtNumber: (n) => Number(n || 0).toLocaleString(LOCALES[l]) };
  }

  /** Tóm tắt game cho thẻ trên cổng (localStorage playnine-<id>-summary-v1), đúng dạng readSummary của cổng. */
  function buildSummary({ played, won, note, stats, resume, daily, now }) {
    return {
      v: 1,
      updatedAt: now,
      played: played || 0,
      won: won || 0,
      note: note || '',
      stats: stats || [],
      resume: resume || null,
      daily: daily || null,
    };
  }

  /* ---------------- Phần giao diện ---------------- */

  function readLang(storage) {
    try {
      const v = storage && storage.getItem(LANG_KEY);
      return LANGS.indexOf(v) >= 0 ? v : 'en';
    } catch (e) {
      return 'en';
    }
  }

  /** Điền [data-i18n], [data-i18n-html] (chỉ chuỗi tin cậy trong dict), [data-i18n-attr="attr:key;attr:key"]. */
  function applyI18n(i18n, root) {
    const doc = root || document;
    const t = i18n.t;
    doc.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    doc.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    doc.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.getAttribute('data-i18n-attr').split(';').forEach((pair) => {
        const i = pair.indexOf(':');
        if (i > 0) el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      });
    });
    if (doc === document) {
      document.title = t('meta.title');
      const desc = document.querySelector('meta[name="description"]');
      if (desc) desc.setAttribute('content', t('meta.description'));
      const appTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (appTitle) appTitle.setAttribute('content', t('meta.title'));
    }
  }

  function safeStorage() {
    try {
      return window.localStorage;
    } catch (e) {
      return null;
    }
  }

  /**
   * Dựng các phần dùng chung cho một game. Gọi một lần, sau khi DOM của trang đã có (script đặt cuối <body>).
   * opts: { gameId, version, dict, defaults: { theme: 'auto', ... }, onSetting(key, value) }
   */
  function init(opts) {
    const storage = safeStorage();
    const store = createStore({ gameId: opts.gameId, storage });
    const settings = Object.assign({ theme: 'auto' }, opts.defaults || {}, store.read(store.keys.settings, {}) || {});
    if (['auto', 'light', 'dark'].indexOf(settings.theme) < 0) settings.theme = 'auto';

    const i18n = createI18n({ dict: opts.dict, lang: readLang(storage), kitDict: KIT_DICT });
    document.documentElement.lang = i18n.lang;
    let beforeReload = [];
    const reload = () => {
      beforeReload.forEach((fn) => { try { fn(); } catch (e) { /* bỏ qua */ } });
      location.reload();
    };
    i18n.apply = (r) => applyI18n(i18n, r);
    i18n.set = (next) => {
      if (LANGS.indexOf(next) < 0 || next === i18n.lang) return;
      try {
        storage && storage.setItem(LANG_KEY, next);
      } catch (e) { /* bỏ qua */ }
      reload();
    };
    i18n.onBeforeReload = (fn) => beforeReload.push(fn);
    // Cổng hoặc tab khác đổi ngôn ngữ thì trang này đi theo
    window.addEventListener('storage', (e) => {
      if (e.key === LANG_KEY && readLang(storage) !== i18n.lang) reload();
    });

    /* SDK: chỉ có khi chạy trong cổng; thiếu SDK thì mọi lệnh im lặng */
    const PN = window.PlayNine || null;
    try {
      PN && PN.init({ gameId: opts.gameId });
    } catch (e) { /* bỏ qua */ }
    const SFX = PN && PN.sfx ? PN.sfx : null;
    const sdk = {
      available: !!PN,
      start(mode, resume) {
        try { PN && PN.gameStart({ mode, resume: !!resume }); } catch (e) { /* bỏ qua */ }
      },
      end(result) {
        try { PN && PN.gameEnd(result); } catch (e) { /* bỏ qua */ }
      },
    };
    const sfx = (name, o) => {
      try { SFX && SFX.play(name, o); } catch (e) { /* bỏ qua */ }
    };
    const confetti = () => {
      try { PN && PN.fx && PN.fx.confetti(); } catch (e) { /* bỏ qua */ }
    };

    /* Giao diện sáng / tối */
    const theme = {
      apply() {
        const r = document.documentElement;
        if (settings.theme === 'auto') r.removeAttribute('data-theme');
        else r.setAttribute('data-theme', settings.theme);
        const meta = document.getElementById('theme-color');
        if (meta) requestAnimationFrame(() => { meta.content = getComputedStyle(r).getPropertyValue('--bg').trim() || meta.content; });
      },
      set(v) {
        set({ theme: v });
      },
    };
    window.matchMedia && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (settings.theme === 'auto') theme.apply();
    });

    function set(patch) {
      Object.assign(settings, patch);
      store.write(store.keys.settings, settings);
      if (has(patch, 'theme')) theme.apply();
      renderSettings();
      Object.keys(patch).forEach((k) => opts.onSetting && opts.onSetting(k, patch[k]));
    }

    /* Modal: mở một cái tại một thời điểm, Esc đóng (trừ data-locked), Tab quẩn trong modal, đóng thì trả focus */
    let lastFocus = null;
    const modal = {
      current() {
        return document.querySelector('.modal:not([hidden])');
      },
      open(id) {
        const m = document.getElementById(id);
        if (!m || !m.hidden) return;
        document.querySelectorAll('.modal:not([hidden])').forEach((x) => { x.hidden = true; });
        if (!lastFocus || !lastFocus.closest || !lastFocus.closest('.modal')) lastFocus = document.activeElement;
        m.hidden = false;
        const visible = (el) => el.offsetParent !== null;
        const target = Array.from(m.querySelectorAll('.btn-primary')).find(visible) || Array.from(m.querySelectorAll('button')).find(visible);
        if (target) target.focus();
      },
      close(id) {
        const m = document.getElementById(id);
        if (!m || m.hidden) return;
        m.hidden = true;
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
        lastFocus = null;
      },
      closeAll() {
        document.querySelectorAll('.modal:not([hidden])').forEach((x) => modal.close(x.id));
      },
    };
    document.addEventListener('click', (e) => {
      const c = e.target.closest && e.target.closest('[data-close]');
      if (c) modal.close(c.getAttribute('data-close'));
      const o = e.target.closest && e.target.closest('[data-open]');
      if (o) {
        renderSettings();
        modal.open(o.getAttribute('data-open'));
      }
    });
    document.addEventListener('keydown', (e) => {
      const open = modal.current();
      if (!open) return;
      if (e.key === 'Escape' && !open.hasAttribute('data-locked')) {
        e.preventDefault();
        modal.close(open.id);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(open.querySelectorAll('button, input, select, a[href]')).filter((el) => !el.disabled && el.offsetParent !== null);
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
    }, true);

    /* Toast */
    let toastTimer = null;
    function toast(msg, ms) {
      let el = document.getElementById('toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.className = 'toast';
        el.setAttribute('role', 'status');
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { el.hidden = true; }, ms || 1800);
    }

    /* Cài đặt: .segmented[data-setting] (theme, lang và khóa riêng của game), .switch[data-setting], âm thanh #sw-sound */
    function renderSettings(r) {
      const doc = r || document;
      doc.querySelectorAll('.segmented[data-setting]').forEach((seg) => {
        const key = seg.dataset.setting;
        const cur = key === 'lang' ? i18n.lang : settings[key];
        seg.querySelectorAll('button').forEach((b) => {
          const on = b.dataset.value === String(cur);
          b.setAttribute('aria-checked', String(on));
          b.tabIndex = on ? 0 : -1;
        });
      });
      doc.querySelectorAll('input.switch[data-setting]').forEach((sw) => { sw.checked = !!settings[sw.dataset.setting]; });
      const sound = document.getElementById('sw-sound');
      if (sound) sound.checked = !!SFX && !SFX.isMuted();
    }
    function bindSettings(r) {
      const doc = r || document;
      doc.querySelectorAll('.segmented[data-setting]').forEach((seg) => {
        const key = seg.dataset.setting;
        const buttons = Array.from(seg.querySelectorAll('button'));
        seg.setAttribute('role', 'radiogroup');
        buttons.forEach((b) => b.setAttribute('role', 'radio'));
        const choose = (b) => {
          if (key === 'lang') return i18n.set(b.dataset.value);
          set({ [key]: b.dataset.value });
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
          // Ngôn ngữ: mũi tên chỉ chuyển focus, bấm mới đổi (đổi là tải lại trang)
          if (key !== 'lang') choose(buttons[j]);
          buttons[j].focus();
        });
      });
      doc.querySelectorAll('input.switch[data-setting]').forEach((sw) => {
        sw.addEventListener('change', () => set({ [sw.dataset.setting]: sw.checked }));
      });
      const row = document.getElementById('setting-sound');
      if (row) row.hidden = !SFX;
      const sound = document.getElementById('sw-sound');
      if (sound && SFX) {
        sound.addEventListener('change', () => {
          SFX.setMuted(!sound.checked);
          sfx('tap');
        });
        if (SFX.onChange) SFX.onChange(() => renderSettings());
      }
      renderSettings(doc);
    }

    /** Gọi fn khi rời trang hoặc trang bị ẩn (lưu ván), và trước khi tải lại vì đổi ngôn ngữ. */
    function onLeave(fn) {
      document.addEventListener('visibilitychange', () => { if (document.hidden) fn(); });
      window.addEventListener('pagehide', fn);
      i18n.onBeforeReload(fn);
    }

    /** Đồng hồ theo performance.now, tự dừng khi trang ẩn và chạy tiếp khi hiện lại (nếu đang chạy). */
    function timer() {
      const c = createTimer({ now: () => performance.now() });
      let held = false;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && c.running) {
          c.pause();
          held = true;
        } else if (!document.hidden && held) {
          held = false;
          c.resume();
        }
      });
      return c;
    }

    const ver = document.getElementById('app-version');
    if (ver) ver.textContent = i18n.t('kit.version', { v: opts.version || '' });

    theme.apply();
    i18n.apply();
    bindSettings();

    return { gameId: opts.gameId, store, settings: { get: () => settings, set }, theme, i18n, t: i18n.t, sdk, sfx, confetti, modal, toast, bindSettings, renderSettings, onLeave, timer };
  }

  const api = { KIT_VERSION, KIT_DICT, createStore, createTimer, createI18n, buildSummary, init };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PNKit = api;
})(typeof window !== 'undefined' ? window : this);
