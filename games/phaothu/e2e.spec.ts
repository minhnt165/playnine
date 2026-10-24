import { test, expect, type Page } from '@playwright/test';

// Pháo Thủ trong cổng: dựng ván lưu sẵn (playnine-phaothu-save-v1) trên đất phẳng, không gió, rồi bấm Bắn
// với góc / lực đã lưu trong ván; bắt tin nhắn pn:* ở khung trên cùng và kiểm tra pn:end.
// Các phát dưới đây đã chạy thử bằng engine (node): đất phẳng cao 120, pháo bạn ở x = 150, pháo máy ở x = 650.
// - WIN:  góc 45°, lực 70 → trúng thẳng pháo máy (35 sát thương), máy còn 5 máu → thắng
// - LOSE: góc 90°, lực 30 → đạn rơi về chính pháo bạn (32 sát thương), bạn còn 5 máu → thua

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

const COLS = 401; // E.COLS: 800 / 2 + 1 cột địa hình
const ammo = { heavy: 2, triple: 2 };

/** Ván lưu: mức Dễ, tới lượt bạn, đã bắn 2 phát; hp / góc / lực của bạn và máu máy theo tham số. */
function saveOf(you: { hp: number; angle: number; power: number }, cpuHp: number) {
  return {
    v: 1,
    mode: 'cpu',
    level: 'easy',
    humanShots: 2,
    game: {
      v: 1,
      seed: 12345,
      terrain: Array(COLS).fill(120),
      tanks: [
        { x: 150, hp: you.hp, angle: you.angle, power: you.power, ammo },
        { x: 650, hp: cpuHp, angle: 135, power: 60, ammo },
      ],
      turn: 0,
      wind: 0,
      rng: 440024424,
      shots: 4,
      winner: null,
      last: [null, null],
      mem: [null, null],
    },
  };
}

/** Ghi ván lưu + tắt hướng dẫn lần đầu (chỉ lần nạp đầu, để tải lại trang không ghi đè). */
async function seed(page: Page, save: object | null) {
  await page.addInitScript((s) => {
    if (window.localStorage.getItem('playnine-phaothu-settings-v1')) return;
    window.localStorage.setItem('playnine-phaothu-settings-v1', JSON.stringify({ guideSeen: true }));
    if (s) window.localStorage.setItem('playnine-phaothu-save-v1', JSON.stringify(s));
  }, save);
}

async function waitResume(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
}

test('phaothu knocking out the computer reports a won game', async ({ page }) => {
  await captureMessages(page);
  await seed(page, saveOf({ hp: 100, angle: 45, power: 70 }, 5));
  await page.goto('#/play/phaothu');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#btn-fire')).toBeEnabled();
  await frame.locator('#btn-fire').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'phaothu', mode: 'easy', won: true, assisted: false });
  await expect(frame.locator('#modal-result')).toBeVisible();
});

test('phaothu losing the game reports won false', async ({ page }) => {
  await captureMessages(page);
  await seed(page, saveOf({ hp: 5, angle: 90, power: 30 }, 100));
  await page.goto('#/play/phaothu');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#btn-fire')).toBeEnabled();
  await frame.locator('#btn-fire').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'phaothu', mode: 'easy', won: false, assisted: false });
});

test('phaothu abandoning a started game reports won false', async ({ page }) => {
  await captureMessages(page);
  await seed(page, saveOf({ hp: 100, angle: 45, power: 60 }, 100));
  await page.goto('#/play/phaothu');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'phaothu', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});

test('phaothu re-sends start with the new level when switched before the first shot', async ({ page }) => {
  await captureMessages(page);
  await seed(page, null);
  await page.goto('#/play/phaothu');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-open="modal-settings"]').first().click();
  await frame.locator('[data-setting="level"] [data-value="hard"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
