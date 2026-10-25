import { test, expect, type Page } from '@playwright/test';

// Masyu trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase, cổng vẫn trả pn:ready).
// Ván lưu dựng sẵn: bàn Dễ 6x6, bốn hạt đen ở bốn góc, lời giải là vòng chạy quanh viền bàn;
// đã vẽ mọi đoạn trừ đoạn ngang trên cùng bên trái (cạnh 0, nối ô (0,0) với ô (0,1)).

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean; timeMs?: number };

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

/** Bỏ hướng dẫn lần đầu (hộp thoại sẽ chặn thao tác trên bàn). */
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-masyu-settings-v1')) {
      window.localStorage.setItem('playnine-masyu-settings-v1', JSON.stringify({ theme: 'auto', mode: 's', size: 's', errors: 'auto', guideSeen: true }));
    }
  });
}

async function seedAlmostSolved(page: Page) {
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-masyu-save-v1')) return;
    const n = 6;
    const NH = n * (n - 1); // cạnh ngang 0..29, cạnh dọc 30..59
    const sol: number[] = new Array(2 * NH).fill(0);
    for (let c = 0; c < n - 1; c++) {
      sol[c] = 1; // hàng trên cùng
      sol[(n - 1) * (n - 1) + c] = 1; // hàng dưới cùng
    }
    for (let r = 0; r < n - 1; r++) {
      sol[NH + r * n] = 1; // cột trái
      sol[NH + r * n + n - 1] = 1; // cột phải
    }
    const pearls = new Array(n * n).fill(0);
    pearls[0] = 2;
    pearls[n - 1] = 2;
    pearls[n * (n - 1)] = 2;
    pearls[n * n - 1] = 2;
    const edges = sol.map((x, e) => (e === 0 ? 0 : x));
    const game = { v: 1, mode: 's', n, seed: 7, date: null, pearls: pearls.join(''), sol: sol.join(''), edges: edges.join(''), undo: [], redo: [], moves: 3, hints: 0 };
    window.localStorage.setItem('playnine-masyu-save-v1', JSON.stringify({ v: 1, game, elapsed: 30000 }));
  });
}

async function waitResumed(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 's'), {
      timeout: 5000,
    })
    .toBe(true);
}

test('masyu reports a won run when the loop is closed', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedAlmostSolved(page);
  await page.goto('#/play/masyu');
  await waitResumed(page);
  const frame = page.frameLocator('iframe');
  const board = frame.locator('#board');
  await expect(board).toHaveAttribute('data-n', '6');
  // Cạnh 0 nối tâm ô (0,0) với tâm ô (0,1): chạm vào ranh giới hai ô, ở 1/6 bề rộng và 1/12 bề cao của bàn
  const box = await board.boundingBox();
  expect(box).not.toBeNull();
  await board.click({ position: { x: box!.width / 6, y: box!.height / 12 } });
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'masyu', mode: 's', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(30000);
  await expect(frame.locator('#modal-win')).toBeVisible();
  await expect(board).toHaveClass(/solved/);
});

test('masyu reports a loss when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedAlmostSolved(page);
  await page.goto('#/play/masyu');
  await waitResumed(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'masyu', mode: 's', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});

test('masyu switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/masyu');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-mode').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('m');
  await expect(frame.locator('#board')).toHaveAttribute('data-n', '8');
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
