import { test, expect, type Page } from '@playwright/test';

test.use({ timezoneId: 'Europe/Moscow' });
const today = new Date();
const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
const iso = `${localDay}T15:00:00Z`;
type Item = { id: number; subject_id: number; title: string; due_at: string; done: boolean };
const sample = (): Item => ({ id: 1, subject_id: 1, title: 'Лабораторная', due_at: iso, done: false });

async function calendar(page: Page) {
  await page.getByRole('button', { name: 'Календарь', exact: true }).filter({ visible: true }).click();
  await expect(page.getByRole('heading', { name: 'Все успеется.' })).toBeVisible();
}

async function setup(page: Page, initial: Item[] = [sample()], subjects = [{ id: 1, name: 'Математика' }, { id: 2, name: 'Физика' }]) {
  const state = { items: [...initial], requests: [] as { method: string; data: any }[], offsets: [] as number[], failure: '', delay: 0 };
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ body: '' }));
  await page.addInitScript(() => { Object.assign(window, { Telegram: { WebApp: { initData: 'TEST', ready() {}, expand() {} } } }); });
  await page.route('**/api/me', route => route.fulfill({ json: { id: 1, telegram_id: 123, name: 'Студент' } }));
  await page.route('**/api/subjects', route => route.fulfill({ json: subjects }));
  await page.route('**/api/deadlines**', async route => {
    const req = route.request();
    expect(req.headers().authorization).toBe('tma TEST');
    const method = req.method();
    const url = new URL(req.url());
    if (state.failure === method || state.failure === '401' || state.failure === '404') {
      await route.fulfill({ status: state.failure === '401' ? 401 : state.failure === '404' ? 404 : 500, json: { detail: 'Test failure' } }); return;
    }
    if (method === 'GET') {
      const offset = Number(url.searchParams.get('offset'));
      expect(url.searchParams.get('limit')).toBe('200');
      state.offsets.push(offset);
      await route.fulfill({ json: state.items.slice(offset, offset + 200) }); return;
    }
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    const data = method === 'DELETE' ? null : req.postDataJSON();
    state.requests.push({ method, data });
    if (data) expect(data).not.toHaveProperty('user_id');
    if (method === 'POST') {
      const item = { ...data, id: Math.max(0, ...state.items.map(item => item.id)) + 1, done: false };
      state.items.push(item);
      await route.fulfill({ status: 201, json: item }); return;
    }
    const id = Number(url.pathname.split('/').pop());
    if (method === 'PATCH') {
      const item = { ...state.items.find(item => item.id === id)!, ...data };
      state.items = state.items.map(old => old.id === id ? item : old);
      await route.fulfill({ json: item }); return;
    }
    state.items = state.items.filter(item => item.id !== id);
    await route.fulfill({ status: 204 });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Математика', exact: true })).toHaveCount(subjects.length ? 1 : 0);
  await calendar(page);
  return state;
}

const openAdd = async (page: Page) => {
  await page.getByRole('button', { name: 'Добавить дедлайн', exact: true }).click();
  await expect(page.getByLabel('Название задания')).toBeFocused();
};

test('create, edit, complete, reopen, cancel deletion, delete and reload', async ({ page }) => {
  const state = await setup(page);
  await openAdd(page);
  await page.getByLabel('Название задания').fill('   ');
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить дедлайн' }).click();
  await expect(page.getByRole('alert')).toContainText('Напиши название');
  await page.getByLabel('Название задания').fill('  Курсовая  ');
  await page.getByLabel('Дисциплина', { exact: true }).filter({ visible: true }).last().selectOption('2');
  await page.getByLabel('Дата и время', { exact: true }).fill(`${localDay}T00:30`);
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить дедлайн' }).click();
  await expect(page.getByRole('heading', { name: 'Курсовая', exact: true })).toBeVisible();
  const posted = state.requests.find(req => req.method === 'POST')!.data;
  expect(posted).toEqual({ title: 'Курсовая', subject_id: 2, due_at: new Date(`${localDay}T00:30:00+03:00`).toISOString() });
  await page.getByRole('button', { name: 'Изменить: Курсовая', exact: true }).click();
  await expect(page.getByLabel('Дата и время', { exact: true })).toHaveValue(`${localDay}T00:30`);
  await page.getByLabel('Название задания').fill('Курсовая готова');
  await page.getByLabel('Дата и время', { exact: true }).fill('2027-01-05T18:15');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByRole('heading', { name: 'Курсовая готова', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'январь 2027 г.' })).toBeVisible();
  await page.getByRole('button', { name: 'Выполнить: Курсовая готова', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Вернуть в работу: Курсовая готова' })).toBeVisible();
  await page.getByRole('button', { name: 'Вернуть в работу: Курсовая готова' }).click();
  await expect(page.getByRole('button', { name: 'Выполнить: Курсовая готова' })).toBeVisible();
  await page.getByRole('button', { name: 'Удалить: Курсовая готова', exact: true }).click();
  await page.getByRole('button', { name: 'Оставить', exact: true }).click();
  expect(state.requests.filter(req => req.method === 'DELETE')).toHaveLength(0);
  await page.getByRole('button', { name: 'Удалить: Курсовая готова', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить дедлайн', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Курсовая готова', exact: true })).toHaveCount(0);
  await page.reload(); await calendar(page);
  expect(state.items.some(item => item.title === 'Курсовая готова')).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('pagination and filters include records past the first 200', async ({ page }) => {
  const items = Array.from({ length: 201 }, (_, i) => ({ ...sample(), id: i + 1, title: `Задание ${i + 1}`, subject_id: i === 200 ? 2 : 1, done: i === 200 }));
  const state = await setup(page, items);
  await expect(page.getByRole('heading', { name: 'Задание 201', exact: true })).toBeVisible();
  expect(state.offsets).toContain(200);
  await page.getByLabel('Дисциплина', { exact: true }).selectOption('2');
  await expect(page.locator('.deadline-card')).toHaveCount(1);
  await page.getByLabel('Статус', { exact: true }).selectOption('pending');
  await expect(page.getByText('Нет подходящих заданий')).toBeVisible();
  await page.getByLabel('Статус', { exact: true }).selectOption('done');
  await expect(page.locator('.deadline-card')).toHaveCount(1);
});

test('month navigation, today and local day boundaries', async ({ page }) => {
  const state = await setup(page, [{ ...sample(), due_at: new Date(`${localDay}T00:30:00+03:00`).toISOString() }]);
  await expect(page.getByRole('heading', { name: 'Лабораторная', exact: true })).toBeVisible();
  await expect(page.locator('.deadline-meta time')).toHaveText('00:30');
  const initialRequests = state.offsets.length;
  await page.getByRole('button', { name: 'Следующий месяц' }).click();
  await expect(page.getByText('День без дедлайнов')).toBeVisible();
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Лабораторная', exact: true })).toBeVisible();
  expect(state.offsets).toHaveLength(initialRequests);
});

test('failed create preserves form; failed update and delete preserve records', async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole('heading', { name: 'Лабораторная' })).toBeVisible();
  state.failure = 'POST';
  await openAdd(page); await page.getByLabel('Название задания').fill('Не потерять');
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить дедлайн' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Название задания')).toHaveValue('Не потерять');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Добавить дедлайн', exact: true })).toBeFocused();
  state.failure = 'PATCH';
  await page.getByRole('button', { name: 'Выполнить: Лабораторная' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Выполнить: Лабораторная' })).toBeEnabled();
  state.failure = 'DELETE';
  await page.getByRole('button', { name: 'Удалить: Лабораторная' }).click();
  await page.getByRole('button', { name: 'Удалить дедлайн', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  expect(state.items).toHaveLength(1);
  await page.getByRole('button', { name: 'Оставить' }).click();
  await expect(page.getByRole('heading', { name: 'Лабораторная' })).toBeVisible();
});

test('expired session during mutation locks the workspace', async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole('heading', { name: 'Лабораторная' })).toBeVisible();
  state.failure = '401';
  await page.getByRole('button', { name: 'Выполнить: Лабораторная' }).click();
  await expect(page.getByRole('alert')).toContainText('Сессия закончилась');
  await expect(page.getByRole('button', { name: 'Добавить дисциплину', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Лабораторная' })).toHaveCount(0);
});

test('failed calendar load retries and no-subject state links back', async ({ page }) => {
  const state = await setup(page, [], []);
  await expect(page.getByText('Сначала добавь дисциплину')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить дедлайн', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'К дисциплинам' }).click();
  state.failure = 'GET'; await calendar(page);
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить календарь');
  state.failure = '';
  await page.getByRole('button', { name: 'Попробовать снова' }).click();
  await expect(page.getByText('День без дедлайнов')).toBeVisible();
});

test('demo deadlines survive tab navigation but never access API', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/**', route => { calls++; return route.abort(); });
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ body: '' }));
  await page.goto('/'); await page.getByRole('button', { name: 'Посмотреть демо' }).click();
  await calendar(page); await openAdd(page);
  await page.getByLabel('Название задания').fill('Демо-дедлайн');
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить дедлайн' }).click();
  await expect(page.getByRole('heading', { name: 'Демо-дедлайн' })).toBeVisible();
  await page.getByRole('button', { name: 'Дисциплины', exact: true }).filter({ visible: true }).click();
  await calendar(page);
  await expect(page.getByRole('heading', { name: 'Демо-дедлайн' })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Посмотреть демо' }).click(); await calendar(page);
  await expect(page.getByRole('heading', { name: 'Демо-дедлайн' })).toHaveCount(0);
  expect(calls).toBe(0);
});


test('nonexistent local time is rejected before POST', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/New_York' });
  const page = await context.newPage();
  try {
    const state = await setup(page);
    await openAdd(page);
    await page.getByLabel('Название задания').fill('Проверка времени');
    await page.getByLabel('Дата и время', { exact: true }).fill('2027-03-14T02:30');
    await page.getByRole('dialog').getByRole('button', { name: 'Добавить дедлайн' }).click();
    await expect(page.getByRole('alert')).toContainText('При переводе часов');
    expect(state.requests).toHaveLength(0);
  } finally { await context.close(); }
});

test('repeated submit cannot create two deadlines while saving', async ({ page }) => {
  const state = await setup(page);
  state.delay = 600;
  await openAdd(page);
  await page.getByLabel('Название задания').fill('Один дедлайн');
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить дедлайн' }).click();
  await expect(page.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Один дедлайн' })).toBeVisible();
  expect(state.requests.filter(req => req.method === 'POST')).toHaveLength(1);
});

test('removed deadline shows 404 and refresh clears stale record', async ({ page }) => {
  const state = await setup(page);
  await expect(page.getByRole('heading', { name: 'Лабораторная' })).toBeVisible();
  state.failure = '404'; state.items = [];
  await page.getByRole('button', { name: 'Выполнить: Лабораторная' }).click();
  await expect(page.getByRole('alert')).toContainText('больше не доступны');
  state.failure = '';
  await page.getByRole('button', { name: 'Обновить календарь' }).click();
  await expect(page.getByText('День без дедлайнов')).toBeVisible();
});
