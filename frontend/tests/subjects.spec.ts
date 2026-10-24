import { test, expect, type Page } from '@playwright/test';

async function telegram(page: Page) {
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.addInitScript(() => {
    Object.assign(window, { Telegram: { WebApp: { initData: 'TEST_INIT_DATA', ready() {}, expand() {} } } });
  });
}

async function mockApi(page: Page, seed = [{ id: 1, name: 'Математика' }]) {
  const subjects = [...seed];
  await page.route('**/api/me', route => route.fulfill({ json: { id: 1, telegram_id: 101, name: 'Мирослав' } }));
  await page.route('**/api/subjects', async route => {
    expect(route.request().headers().authorization).toBe('tma TEST_INIT_DATA');
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(Object.keys(body)).toEqual(['name']);
      const item = { id: subjects.length + 1, name: body.name };
      subjects.push(item);
      await route.fulfill({ status: 201, json: item });
    } else await route.fulfill({ json: subjects });
  });
}

test('browser demo stays isolated from backend and resets on reload', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/**', route => { calls++; return route.abort(); });
  await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ body: '' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Твое пространство — в Telegram' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Добавить дисциплину', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Посмотреть демо' }).click();
  await expect(page.getByText('Демо-режим. Изменения не сохраняются на сервере.')).toBeVisible();
  await page.getByRole('button', { name: 'Добавить дисциплину', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('История');
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить дисциплину' }).click();
  await expect(page.getByRole('heading', { name: 'История', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'История', exact: true })).toHaveCount(0);
  expect(calls).toBe(0);
});

test('load, search, validate, create, and reload subjects', async ({ page }) => {
  await telegram(page); await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Математика', exact: true })).toBeVisible();
  await page.getByLabel('Найти дисциплину').fill('несуществующий');
  await expect(page.getByText('Ничего не нашлось')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить поиск' }).click();
  await page.getByRole('button', { name: 'Добавить дисциплину', exact: true }).click();
  const modal = page.getByRole('dialog');
  await page.getByLabel('Название', { exact: true }).fill('   ');
  await modal.getByRole('button', { name: 'Добавить дисциплину' }).click();
  await expect(page.getByRole('alert')).toContainText('Напиши название');
  await page.getByLabel('Название', { exact: true }).fill('  Физика  ');
  await modal.getByRole('button', { name: 'Добавить дисциплину' }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Физика', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Физика', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('empty state and modal keyboard dismissal', async ({ page }) => {
  await telegram(page); await mockApi(page, []);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'С чего начнем?' })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить дисциплину', exact: true }).click();
  await expect(page.getByLabel('Название', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Добавить дисциплину', exact: true })).toBeFocused();
});

test('expired authorization asks to reopen Telegram', async ({ page }) => {
  await telegram(page);
  await page.route('**/api/**', route => route.fulfill({ status: 401, json: { detail: 'Unauthorized' } }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Сессия закончилась');
  await expect(page.getByRole('button', { name: 'Добавить дисциплину', exact: true })).toBeDisabled();
});

test('server error allows retry without fabricating subjects', async ({ page }) => {
  await telegram(page);
  await page.route('**/api/me', route => route.fulfill({ json: { id: 1, telegram_id: 101, name: 'Студент' } }));
  let fail = true;
  await page.route('**/api/subjects', route => fail ? route.fulfill({ status: 500, body: 'error' }) : route.fulfill({ json: [{ id: 1, name: 'Физика' }] }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Не получилось');
  fail = false;
  await page.getByRole('button', { name: 'Попробовать снова' }).click();
  await expect(page.getByRole('heading', { name: 'Физика', exact: true })).toBeVisible();
});

test('failed save keeps typed name for retry', async ({ page }) => {
  await telegram(page); await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Математика', exact: true })).toBeVisible();
  await page.route('**/api/subjects', route => route.request().method() === 'POST' ? route.fulfill({ status: 500, body: 'error' }) : route.fallback());
  await page.getByRole('button', { name: 'Добавить дисциплину', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('История');
  await page.getByRole('dialog').getByRole('button', { name: 'Добавить дисциплину' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('История');
  await expect(page.getByRole('heading', { name: 'История', exact: true })).toHaveCount(0);
});
