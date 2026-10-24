import { test, expect, type Page } from '@playwright/test';

// Vòng Kín trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase, cổng vẫn trả pn:ready).
// Ván lưu dựng sẵn: bàn Dễ 5x5, lời giải là vòng chạy quanh viền bàn; đã vẽ mọi cạnh trừ cạnh ngang trên cùng bên trái (cạnh 0).

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
    if (!window.localStorage.getItem('playnine-vongkin-settings-v1')) {
      window.localStorage.setItem('playnine-vongkin-settings-v1', JSON.stringify({ theme: 'auto', mode: 's', errors: 'auto', guideSeen: true }));
    }
  });
}

async function seedAlmostSolved(page: Page) {
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-vongkin-save-v1')) return;
    const n = 5;
    const NH = (n + 1) * n; // cạnh ngang 0..29, cạnh dọc 30..59
    const sol: number[] = new Array(2 * n * (n + 1)).fill(0);
    for (let c = 0; c < n; c++) {
      sol[c] = 1; // viền trên
      sol[n * n + c] = 1; // viền dưới
    }
    for (let r = 0; r < n; r++) {
      sol[NH + r * (n + 1)] = 1; // viền trái
      sol[NH + r * (n + 1) + n] = 1; // viền phải
    }
    // Số của mọi ô: góc 2, cạnh viền 1, bên trong 0
    const clues: number[] = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) clues.push((r === 0 || r === n - 1 ? 1 : 0) + (c === 0 || c === n - 1 ? 1 : 0));
    }
    const edges = sol.map((x, e) => (e === 0 ? 0 : x));
    const game = { v: 1, mode: 's', n, seed: 7, clues, sol: sol.join(''), edges: edges.join(''), undo: [], redo: [], moves: 3, hints: 0 };
    window.localStorage.setItem('playnine-vongkin-save-v1', JSON.stringify({ v: 1, game, elapsed: 30000 }));
  });
}

async function waitResumed(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 's'), {
      timeout: 5000,
    })
    .toBe(true);
}

test('vongkin reports a won run when the loop is closed', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedAlmostSolved(page);
  await page.goto('#/play/vongkin');
  await waitResumed(page);
  const frame = page.frameLocator('iframe');
  const board = frame.locator('#board');
  await expect(board).toHaveAttribute('data-n', '5');
  // Cạnh 0 nối điểm (0,0) với (0,1): khung SVG có 6 điểm mỗi chiều, lề nửa ô → trung điểm ở (1/6, 1/12) bề rộng / cao
  const box = await board.boundingBox();
  expect(box).not.toBeNull();
  await board.click({ position: { x: box!.width / 6, y: box!.height / 12 } });
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'vongkin', mode: 's', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(30000);
  await expect(frame.locator('#modal-win')).toBeVisible();
  await expect(board).toHaveClass(/solved/);
});

test('vongkin reports a loss when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedAlmostSolved(page);
  await page.goto('#/play/vongkin');
  await waitResumed(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'vongkin', mode: 's', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});

test('vongkin switches level before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/vongkin');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-mode').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('m');
  await expect(frame.locator('#board')).toHaveAttribute('data-n', '7');
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
