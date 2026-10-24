import { test, expect, type Page } from '@playwright/test';

// Nhảy Cao trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean; score?: number };

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

test('nhaycao reports the height when the run ends', async ({ page }) => {
  await captureMessages(page);
  // Ván lưu: nhân vật đã trúng mây (dead), đang rơi ngay trên đáy màn hình, độ cao lớn nhất 67 m.
  // Bấm Chơi tiếp là rơi khỏi màn hình trong vài phần mười giây.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-nhaycao-save-v1')) return;
    if (window.sessionStorage.getItem('nhaycao-seeded')) return;
    window.sessionStorage.setItem('nhaycao-seeded', '1');
    const game = {
      v: 1,
      seed: 1,
      rng: 1,
      t: 2400,
      player: { x: 180, y: 1500, vx: 0, vy: -600, face: 1 },
      platforms: [],
      monsters: [],
      nextId: 2,
      cam: 1400,
      maxY: 1715,
      score: 67,
      dead: true,
      over: false,
      gen: { y: 1800, spring: -100000, mon: 0, arc: null },
    };
    window.localStorage.setItem('playnine-nhaycao-save-v1', JSON.stringify({ v: 1, game }));
    window.localStorage.setItem('playnine-nhaycao-settings-v1', JSON.stringify({ guideSeen: true }));
  });
  await page.goto('#/play/nhaycao');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#score')).toHaveText('67 m');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'nhaycao', mode: 'classic', won: false, score: 67, assisted: false });
  await expect(frame.locator('#modal-over')).toBeVisible();
  await expect(frame.locator('#over-score')).toHaveText('67 m');
});

test('nhaycao reports a lost run with the current height when a started run is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript(() => window.localStorage.setItem('playnine-nhaycao-settings-v1', JSON.stringify({ guideSeen: true })));
  await page.goto('#/play/nhaycao');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  // Không bấm gì: nhân vật tự nảy trên bệ xuất phát, độ cao lên vài mét
  await expect(frame.locator('#score')).not.toHaveText('0 m', { timeout: 5000 });
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  const score = parseInt((await frame.locator('#score').textContent()) || '', 10);
  expect(score).toBeGreaterThan(0);
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'nhaycao', mode: 'classic', won: false, score, assisted: false });
});

test('nhaycao sends no end when a new run is dealt before starting', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript(() => window.localStorage.setItem('playnine-nhaycao-settings-v1', JSON.stringify({ guideSeen: true })));
  await page.goto('#/play/nhaycao');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#btn-start')).toBeVisible();
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(1);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
