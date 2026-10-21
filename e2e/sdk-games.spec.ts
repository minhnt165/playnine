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
