import { test, expect, type Page } from '@playwright/test';

// 9 game đấu máy báo kết quả qua SDK. Không có Supabase: cổng vẫn trả pn:ready,
// nên game gửi pn:start/pn:end; ở đây bắt thẳng tin nhắn ở khung trên cùng.

const boardGames: [id: string, dir: string][] = [
  ['co9o', 'co9o'], ['caro', 'caro'], ['xiangqi', 'xiangqi'], ['covua', 'covua'], ['colat', 'colat'],
  ['codam', 'codam'], ['coganh', 'coganh'], ['oanquan', 'oanquan'], ['bonlientiep', 'bonlientiep'],
];

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean };

async function captureMessages(page: Page) {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const w = window as unknown as { __pn: unknown[] };
    w.__pn = [];
    window.addEventListener('message', (e) => {
      if (e.data && typeof e.data === 'object' && String(e.data.type).startsWith('pn:')) w.__pn.push(e.data);
    });
  });
}

const messages = (page: Page) => page.evaluate(() => (window as unknown as { __pn: Msg[] }).__pn);

for (const [id] of boardGames) {
  test(`${id} reports hello and start through the SDK`, async ({ page }) => {
    await captureMessages(page);
    await page.goto(`#/play/${id}`);
    await expect
      .poll(async () => (await messages(page)).some((m) => m.type === 'pn:hello' && m.gameId === id), { timeout: 5000 })
      .toBe(true);
    await expect
      .poll(
        async () =>
          (await messages(page)).some(
            (m) => m.type === 'pn:start' && m.gameId === id && ['easy', 'medium', 'hard'].includes(m.mode ?? ''),
          ),
        { timeout: 5000 },
      )
      .toBe(true);
  });
}

for (const [id, dir] of boardGames) {
  test(`${id} plays standalone without the SDK`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/sdk/playnine.js*', (r) => r.abort());
    const res = await page.goto(`${dir}/`);
    expect(res?.status()).toBe(200);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
}

test('bonlientiep reports a won run with assisted false', async ({ page }) => {
  await captureMessages(page);
  // Ván lưu: người chơi (cột 0) có ba quân dọc, máy ba quân ở cột 1, tới lượt người chơi.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-bonlientiep-save-v1')) return;
    window.localStorage.setItem(
      'playnine-bonlientiep-save-v1',
      JSON.stringify({ v: 1, mode: 'ai', level: 'easy', first: 0, moves: [0, 1, 0, 1, 0, 1], recorded: false }),
    );
    window.localStorage.setItem('playnine-bonlientiep-settings-v1', JSON.stringify({ guideSeen: true }));
  });
  await page.goto('#/play/bonlientiep');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  await page.frameLocator('iframe').locator('.col').first().click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'bonlientiep', mode: 'easy', won: true, assisted: false });
});

test('xiangqi re-sends start with the new level when switched before the first move', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/xiangqi');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  await page.frameLocator('iframe').locator('#segLevel [data-level="hard"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  await page.frameLocator('iframe').locator('#segLevel [data-level="easy"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('easy');
});

// 4 game tính điểm (2048, xepgach, ran, phagach): mode theo cấu hình mặc định.
const arcadeGames: [id: string, mode: string, start?: string][] = [
  ['2048', '4x4'],
  ['xepgach', 'lv1', '#btn-start'],
  ['ran', 'classic-normal', '#btn-start'],
  ['phagach', 'default', '#btn-start'],
];

for (const [id, mode, startBtn] of arcadeGames) {
  test(`${id} reports hello and start with mode ${mode}`, async ({ page }) => {
    await captureMessages(page);
    // Bỏ hộp hướng dẫn lần đầu để bấm được nút bắt đầu
    await page.addInitScript((key) => window.localStorage.setItem(key, JSON.stringify({ guideSeen: true })), `playnine-${id}-settings-v1`);
    await page.goto(`#/play/${id}`);
    await expect
      .poll(async () => (await messages(page)).some((m) => m.type === 'pn:hello' && m.gameId === id), { timeout: 5000 })
      .toBe(true);
    if (startBtn) await page.frameLocator('iframe').locator(startBtn).click();
    await expect
      .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.gameId === id && m.mode === mode), {
        timeout: 5000,
      })
      .toBe(true);
  });

  test(`${id} plays standalone without the SDK`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/sdk/playnine.js*', (r) => r.abort());
    const res = await page.goto(`${id}/`);
    expect(res?.status()).toBe(200);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
}

test('2048 game over reports the score', async ({ page }) => {
  await captureMessages(page);
  // Lưới 4x4 đầy, chỉ còn một nước (gộp 2+2 ở hàng đầu); sau nước đó và ô sinh thêm thì hết nước.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-2048-game-v1')) return;
    const vals = [2, 2, 16, 32, 64, 128, 64, 128, 128, 64, 128, 64, 64, 128, 64, 128];
    const game = {
      v: 1,
      size: 4,
      cells: vals.map((v, i) => ({ id: i + 1, v })),
      nextId: 17,
      score: 0,
      moves: 0,
      won: false,
      keepPlaying: false,
      over: false,
      undoLeft: 3,
      history: [],
    };
    window.localStorage.setItem('playnine-2048-game-v1', JSON.stringify({ game, counted: false }));
  });
  await page.goto('#/play/2048');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === '4x4'), {
      timeout: 5000,
    })
    .toBe(true);
  await page.frameLocator('iframe').locator('#board').focus();
  await page.keyboard.press('ArrowLeft');
  const shown = await page.frameLocator('iframe').locator('#score').innerText();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: '2048', mode: '4x4', won: false, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg & { score?: number };
  expect(String(end.score)).toBe(shown.replace(/\D/g, ''));
});

// 2 game giải đố (tranhan, xepbai): mode theo cấu hình mặc định, ván seed gần xong để kiểm tra pn:end.
const puzzleGames: [id: string, mode: string][] = [
  ['tranhan', 's5'],
  ['xepbai', 'draw1'],
];

for (const [id, mode] of puzzleGames) {
  test(`${id} reports hello and start with mode ${mode}`, async ({ page }) => {
    await captureMessages(page);
    await page.addInitScript((key) => window.localStorage.setItem(key, JSON.stringify({ guideSeen: true })), `playnine-${id}-settings-v1`);
    await page.goto(`#/play/${id}`);
    await expect
      .poll(async () => (await messages(page)).some((m) => m.type === 'pn:hello' && m.gameId === id), { timeout: 5000 })
      .toBe(true);
    await expect
      .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.gameId === id && m.mode === mode), {
        timeout: 5000,
      })
      .toBe(true);
  });

  test(`${id} plays standalone without the SDK`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/sdk/playnine.js*', (r) => r.abort());
    const res = await page.goto(`${id}/`);
    expect(res?.status()).toBe(200);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
}

test('tranhan reports a solved picture with assisted false', async ({ page }) => {
  await captureMessages(page);
  // Tranh ngẫu nhiên 5x5 chỉ cần tô nốt ô cuối của hàng đầu (ô 4); đã có 5 giây trên đồng hồ.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-tranhan-save-v1')) return;
    const sol = [1, 1, 1, 1, 1, ...new Array(20).fill(0)];
    const cells = [1, 1, 1, 1, ...new Array(21).fill(0)];
    window.localStorage.setItem(
      'playnine-tranhan-save-v1',
      JSON.stringify({
        v: 1, kind: 'random', pid: null, daily: null, elapsed: 5000, counted: true, hintsUsed: 0, cursor: 0,
        game: { v: 1, w: 5, h: 5, sol, cells, mistakes: 0, past: [], future: [], solved: false },
      }),
    );
  });
  await page.goto('#/play/tranhan');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 's5'), {
      timeout: 5000,
    })
    .toBe(true);
  await page.frameLocator('iframe').locator('#c4').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'tranhan', mode: 's5', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg & { timeMs?: number };
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
});

test('xepbai reports a won run (auto-complete is not assistance)', async ({ page }) => {
  await captureMessages(page);
  // Ván seed: đã đi các nước đến khi có thể tự xếp; bấm tự xếp để thắng.
  const deck = [24,44,23,10,43,31,50,41,6,29,35,22,40,34,11,3,49,33,8,14,4,27,45,38,30,7,21,16,12,1,36,37,25,47,2,17,39,9,15,5,20,19,42,18,51,28,13,46,48,26,0,32];
  const moves = [{"t":"move","from":"t5","n":1,"to":"t2"},{"t":"move","from":"t1","n":1,"to":"t6"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"t2"},{"t":"move","from":"t1","n":1,"to":"t2"},{"t":"move","from":"t5","n":1,"to":"t1"},{"t":"move","from":"t6","n":2,"to":"t5"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"f0"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"f1"},{"t":"draw"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"t6"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"f2"},{"t":"draw"},{"t":"draw"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"t4"},{"t":"move","from":"t5","n":3,"to":"t4"},{"t":"move","from":"t5","n":1,"to":"t0"},{"t":"move","from":"t3","n":1,"to":"t5"},{"t":"move","from":"t3","n":1,"to":"t1"},{"t":"move","from":"t5","n":2,"to":"t0"},{"t":"draw"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"t6"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"t0"},{"t":"move","from":"t4","n":5,"to":"t0"},{"t":"move","from":"t4","n":1,"to":"f2"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"t6"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"f2"},{"t":"move","from":"t0","n":1,"to":"t3"},{"t":"move","from":"t0","n":1,"to":"f2"},{"t":"move","from":"t3","n":2,"to":"t0"},{"t":"draw"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"f3"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"f2"},{"t":"move","from":"t0","n":3,"to":"t5"},{"t":"move","from":"t0","n":1,"to":"f2"},{"t":"draw"},{"t":"draw"},{"t":"draw"},{"t":"move","from":"t5","n":4,"to":"t0"},{"t":"move","from":"waste","n":1,"to":"t5"},{"t":"draw"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"t1"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"f0"},{"t":"draw"},{"t":"draw"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"t1"},{"t":"move","from":"t6","n":4,"to":"t1"},{"t":"move","from":"t6","n":1,"to":"t1"},{"t":"move","from":"t6","n":1,"to":"f1"},{"t":"move","from":"t4","n":1,"to":"t1"},{"t":"move","from":"t4","n":1,"to":"t3"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"f1"},{"t":"draw"},{"t":"draw"},{"t":"draw"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"f0"},{"t":"move","from":"t1","n":1,"to":"f0"},{"t":"move","from":"t0","n":2,"to":"t4"},{"t":"move","from":"t0","n":1,"to":"f0"},{"t":"move","from":"t1","n":1,"to":"t2"},{"t":"move","from":"t1","n":1,"to":"f0"},{"t":"move","from":"t1","n":1,"to":"f2"},{"t":"move","from":"t0","n":2,"to":"t6"},{"t":"move","from":"t0","n":1,"to":"f2"},{"t":"move","from":"t6","n":3,"to":"t0"},{"t":"move","from":"t6","n":1,"to":"f3"},{"t":"move","from":"t4","n":1,"to":"f3"},{"t":"move","from":"t4","n":1,"to":"f1"},{"t":"move","from":"t2","n":1,"to":"f1"},{"t":"move","from":"t0","n":1,"to":"f1"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"t3"},{"t":"draw"},{"t":"draw"},{"t":"move","from":"t6","n":1,"to":"t5"},{"t":"move","from":"waste","n":1,"to":"t6"},{"t":"move","from":"waste","n":1,"to":"t6"},{"t":"draw"},{"t":"draw"},{"t":"move","from":"t3","n":3,"to":"t6"},{"t":"move","from":"waste","n":1,"to":"t3"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"f3"},{"t":"move","from":"t4","n":1,"to":"f3"},{"t":"move","from":"t2","n":1,"to":"f3"},{"t":"move","from":"t0","n":1,"to":"f3"},{"t":"move","from":"t1","n":1,"to":"f3"},{"t":"move","from":"t1","n":1,"to":"f2"},{"t":"move","from":"t2","n":1,"to":"f1"},{"t":"move","from":"t0","n":1,"to":"f1"},{"t":"move","from":"t6","n":1,"to":"f3"},{"t":"move","from":"t1","n":1,"to":"f3"},{"t":"move","from":"t0","n":1,"to":"t6"},{"t":"move","from":"t0","n":1,"to":"f2"},{"t":"move","from":"t0","n":1,"to":"f3"},{"t":"move","from":"t5","n":1,"to":"f3"},{"t":"move","from":"t3","n":1,"to":"f3"},{"t":"draw"},{"t":"move","from":"waste","n":1,"to":"t1"},{"t":"move","from":"t2","n":2,"to":"t1"},{"t":"move","from":"t2","n":1,"to":"f0"}];
  await page.addInitScript(
    ([d, m]) => {
      if (window.localStorage.getItem('playnine-xepbai-save-v1')) return;
      window.localStorage.setItem(
        'playnine-xepbai-save-v1',
        JSON.stringify({ v: 1, kind: 'random', daily: null, draw: 1, deck: d, moves: m, elapsed: 5000, counted: true }),
      );
      window.localStorage.setItem('playnine-xepbai-settings-v1', JSON.stringify({ guideSeen: true }));
    },
    [deck, moves] as const,
  );
  await page.goto('#/play/xepbai');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'draw1'), {
      timeout: 5000,
    })
    .toBe(true);
  await page.frameLocator('iframe').locator('#btn-auto').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'xepbai', mode: 'draw1', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg & { timeMs?: number };
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
});

// Minesweeper và Sudoku: mode theo ván mặc định / độ khó chọn, ván Sudoku seed gần xong để kiểm tra pn:end.
test('minesweeper reports hello and start with mode easy', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/minesweeper');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:hello' && m.gameId === 'minesweeper'), { timeout: 5000 })
    .toBe(true);
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.gameId === 'minesweeper' && m.mode === 'easy'), {
      timeout: 5000,
    })
    .toBe(true);
});

test('sudoku reports hello and start with the chosen difficulty', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/sudoku');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:hello' && m.gameId === 'sudoku'), { timeout: 5000 })
    .toBe(true);
  await page.frameLocator('iframe').locator('.difficulty-option[data-difficulty="easy"]').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.gameId === 'sudoku' && m.mode === 'easy'), {
      timeout: 8000,
    })
    .toBe(true);
});

for (const [id, dir] of [['minesweeper', 'minesweeper'], ['sudoku', 'sugoku']]) {
  test(`${id} plays standalone without the SDK`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/sdk/playnine.js*', (r) => r.abort());
    const res = await page.goto(`${dir}/`);
    expect(res?.status()).toBe(200);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
}

test('minesweeper custom game sends nothing', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/minesweeper');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const before = (await messages(page)).filter((m) => m.type === 'pn:start').length;
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('.level-option', { hasText: /custom|tùy chỉnh/i }).click();
  await frame.locator('#custom-form button[type="submit"]').click();
  await page.waitForTimeout(800);
  const after = await messages(page);
  expect(after.filter((m) => m.type === 'pn:start').length).toBe(before);
  expect(after.some((m) => m.type === 'pn:end')).toBe(false);
});

test('sudoku reports a won run with assisted false', async ({ page }) => {
  await captureMessages(page);
  // Ván seed: chỉ thiếu ô đầu tiên (đáp án 3), đã có 120 giây trên đồng hồ.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('sudoku-vn-save-v1')) return;
    const puzzle = '090567800106248790780103260260900370009000120000870056000380000000401087015020030'.split('').map(Number);
    const solution = '392567841156248793784193265268915374579634128431872956647389512923451687815726439'.split('').map(Number);
    const board = solution.slice();
    board[0] = 0;
    window.localStorage.setItem(
      'sudoku-vn-save-v1',
      JSON.stringify({
        version: 1, difficulty: 'easy', daily: null, level: 1, puzzle, solution, board, notes: new Array(81).fill(0),
        initialGivens: puzzle.filter((v) => v !== 0).length, hintCells: [], mistakes: 0, hintsUsed: 0, seconds: 120,
        history: [], status: 'playing',
      }),
    );
  });
  await page.goto('#/play/sudoku');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-resume').click();
  await frame.locator('.cell[data-idx="0"]').click();
  await frame.locator('.num[data-num="3"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'sudoku', mode: 'easy', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg & { timeMs?: number };
  expect(end.timeMs).toBeGreaterThanOrEqual(120000);
});