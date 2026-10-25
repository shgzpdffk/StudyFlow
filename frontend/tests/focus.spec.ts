import { test, expect, type Page } from '@playwright/test';

test.use({ timezoneId: 'Europe/Moscow' });
type Session = { id: number; subject_id: number; started_at: string; ended_at: string | null; duration_seconds: number };
const active = (id = 50): Session => ({ id, subject_id: 1, started_at: '2026-10-25T21:30:00Z', ended_at: null, duration_seconds: 125 });
const completed = (id = 1): Session => ({ id, subject_id: id % 2 ? 1 : 2, started_at: '2026-10-25T21:30:00Z', ended_at: '2026-10-25T22:30:00Z', duration_seconds: 3600 });
const openFocus = async (page: Page) => {
  await page.getByRole('button', { name: 'Фокус', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Время сосредоточиться.' })).toBeVisible();
};
async function setup(page: Page, initial: Session | null = null, count = 0, hasSubjects = true) {
  const state = { active: initial, history: Array.from({ length: count }, (_, i) => completed(i + 1)), posts: [] as string[], failRead: false, failHistory: false, failWrite: false, lostStart: false, lostStop: false, conflict: false, unauthorized: false, delay: 0, offsets: [] as number[] };
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ body: '' }));
  await page.addInitScript(() => { Object.assign(window, { Telegram: { WebApp: { initData: 'TEST', ready() {}, expand() {} } } }); });
  await page.route('**/api/me', route => route.fulfill({ json: { id: 1, telegram_id: 100, name: 'Студент' } }));
  await page.route('**/api/subjects', route => route.fulfill({ json: hasSubjects ? [{ id: 1, name: 'Математика' }, { id: 2, name: 'Физика' }] : [] }));
  await page.route('**/api/sessions**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    expect(req.headers().authorization).toBe('tma TEST');
    if (state.unauthorized) { await route.fulfill({ status: 401, json: { detail: 'Unauthorized' } }); return; }
    if (req.method() === 'GET') {
      if (url.pathname.endsWith('/active')) {
        await route.fulfill(state.failRead ? { status: 500, body: 'error' } : { json: state.active }); return;
      }
      if (state.failHistory) { await route.fulfill({ status: 500, body: 'error' }); return; }
      expect(url.searchParams.get('completed')).toBe('true'); expect(url.searchParams.get('limit')).toBe('20');
      const offset = Number(url.searchParams.get('offset')); state.offsets.push(offset);
      const subject = url.searchParams.get('subject_id');
      await route.fulfill({ json: state.history.filter(item => !subject || item.subject_id === Number(subject)).slice(offset, offset + 20) }); return;
    }
    state.posts.push(url.pathname);
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (state.failWrite) { await route.fulfill({ status: 500, body: 'error' }); return; }
    if (url.pathname.endsWith('/start')) {
      expect(Object.keys(req.postDataJSON())).toEqual(['subject_id']);
      if (state.conflict) { state.active = active(99); await route.fulfill({ status: 409, body: 'conflict' }); return; }
      state.active = { ...active(), subject_id: req.postDataJSON().subject_id, started_at: new Date().toISOString(), duration_seconds: 0 };
      if (state.lostStart) { await route.abort('failed'); return; }
      await route.fulfill({ status: 201, json: state.active }); return;
    }
    expect(url.pathname).toBe(`/api/sessions/${state.active!.id}/stop`);
    const item = { ...state.active!, ended_at: new Date().toISOString(), duration_seconds: 135 };
    state.history.unshift(item); state.active = null;
    if (state.lostStop) { await route.abort('failed'); return; }
    await route.fulfill({ json: item });
  });
  await page.goto('/');
  await openFocus(page);
  return state;
}

test('start chosen subject, stop, reload history; server owns timing', async ({ page }) => {
  const state = await setup(page);
  await page.getByLabel('Чему уделим время?').selectOption('2');
  await page.getByRole('button', { name: 'Начать занятие', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Завершить занятие' })).toBeEnabled();
  await expect(page.locator('.timer-subject')).toHaveText('Физика');
  await expect(page.getByLabel('Чему уделим время?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Завершить занятие' }).click();
  await expect(page.getByRole('button', { name: 'Начать занятие', exact: true })).toBeEnabled();
  await expect(page.locator('.session-row')).toHaveCount(1);
  await expect(page.locator('.session-duration strong')).toHaveText('00:02:15');
  await page.reload(); await openFocus(page);
  await expect(page.locator('.session-row')).toHaveCount(1);
  expect(state.posts).toEqual(['/api/sessions/start', '/api/sessions/50/stop']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('restores server duration, ticks, and survives navigating away', async ({ page }) => {
  const state = await setup(page, active());
  await expect(page.getByRole('timer')).toHaveText('00:02:05');
  await expect(page.getByRole('timer')).not.toHaveText('00:02:05', { timeout: 4000 });
  await page.getByRole('button', { name: 'Дисциплины', exact: true }).filter({ visible: true }).click();
  await openFocus(page);
  await expect(page.getByRole('button', { name: 'Завершить занятие' })).toBeEnabled();
  await page.reload(); await openFocus(page);
  await expect(page.getByRole('timer')).toHaveText('00:02:05');
  expect(state.posts).toHaveLength(0);
});

test('409 discovers an existing timer without a second POST', async ({ page }) => {
  const state = await setup(page); state.conflict = true;
  await page.getByRole('button', { name: 'Начать занятие', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Завершить занятие' })).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText('Уже есть активное занятие');
  expect(state.posts).toHaveLength(1);
});

test('lost responses reconcile both start and stop from server', async ({ page }) => {
  const state = await setup(page); state.lostStart = true;
  await page.getByRole('button', { name: 'Начать занятие', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Завершить занятие' })).toBeEnabled();
  state.lostStop = true;
  await page.getByRole('button', { name: 'Завершить занятие' }).click();
  await expect(page.getByRole('button', { name: 'Начать занятие', exact: true })).toBeEnabled();
  await expect(page.locator('.session-row')).toHaveCount(1);
  expect(state.posts).toHaveLength(2);
});

test('uncertain write blocks controls until explicit successful refresh', async ({ page }) => {
  const state = await setup(page, active());
  await expect(page.getByRole('button', { name: 'Завершить занятие' })).toBeEnabled();
  state.failWrite = true; state.failRead = true;
  await page.getByRole('button', { name: 'Завершить занятие' }).click();
  await expect(page.getByRole('alert')).toContainText('не подтверждено');
  await expect(page.getByRole('button', { name: 'Завершить занятие' })).toBeDisabled();
  state.failRead = false; state.failWrite = false;
  await page.getByRole('button', { name: 'Обновить таймер', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Завершить занятие' })).toBeEnabled();
  expect(state.posts).toHaveLength(1);
});

test('history paging and subject filtering use server and local dates', async ({ page }) => {
  const state = await setup(page, null, 21);
  await expect(page.locator('.session-row')).toHaveCount(20);
  await expect(page.locator('.session-description').first()).toContainText('26 октября 2026');
  await page.getByRole('button', { name: 'Показать еще' }).click();
  await expect(page.locator('.session-row')).toHaveCount(21);
  expect(state.offsets).toContain(20);
  await page.getByLabel('Дисциплина в истории').selectOption('2');
  await expect(page.locator('.session-row')).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Показать еще' })).toHaveCount(0);
});

test('history failure does not block timer; can retry history', async ({ page }) => {
  const state = await setup(page, active(), 1);
  await expect(page.locator('.session-row')).toHaveCount(1);
  state.failHistory = true;
  await page.getByRole('button', { name: 'Обновить историю' }).click();
  await expect(page.getByRole('button', { name: 'Повторить загрузку истории' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Завершить занятие' })).toBeEnabled();
  state.failHistory = false;
  await page.getByRole('button', { name: 'Повторить загрузку истории' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('refresh detects another device stopping the timer', async ({ page }) => {
  const state = await setup(page, active());
  await expect(page.getByRole('button', { name: 'Завершить занятие' })).toBeEnabled();
  state.active = null; state.history = [completed()];
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Начать занятие', exact: true })).toBeEnabled();
  await expect(page.locator('.session-row')).toHaveCount(1);
  expect(state.posts).toHaveLength(0);
});

test('no subjects and expired authorization', async ({ page }) => {
  const state = await setup(page, null, 0, false);
  await expect(page.getByRole('button', { name: 'Начать занятие', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'К дисциплинам' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Обновить таймер', exact: true })).toBeEnabled();
  state.unauthorized = true;
  await page.getByRole('button', { name: 'Обновить таймер', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Сессия закончилась');
  await expect(page.getByRole('timer')).toHaveCount(0);
});

test('pending start prevents repeated submission', async ({ page }) => {
  const state = await setup(page); state.delay = 800;
  await page.getByRole('button', { name: 'Начать занятие', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Запускаем…' })).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Завершить занятие' })).toBeEnabled();
  expect(state.posts).toHaveLength(1);
});

test('demo timer stays across sections and never calls API', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/**', route => { calls++; return route.abort(); });
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ body: '' }));
  await page.goto('/'); await page.getByRole('button', { name: 'Посмотреть демо' }).click();
  await openFocus(page);
  await page.getByRole('button', { name: 'Начать занятие', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Завершить занятие' })).toBeEnabled();
  await page.getByRole('button', { name: 'Дисциплины', exact: true }).filter({ visible: true }).click(); await openFocus(page);
  await page.getByRole('button', { name: 'Завершить занятие' }).click();
  await expect(page.locator('.session-row')).toHaveCount(3);
  await page.reload(); await page.getByRole('button', { name: 'Посмотреть демо' }).click(); await openFocus(page);
  await expect(page.locator('.session-row')).toHaveCount(2);
  expect(calls).toBe(0);
});
