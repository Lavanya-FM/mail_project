import { test, expect } from '@playwright/test';

test('password must never appear in UI or storage', async ({ page }) => {
  await page.goto('http://localhost:3000/login');

  await page.fill('input[type="email"]', 'john@jeemail.in');
  await page.fill('input[type="password"]', 'correct-password');
  await page.click('button[type="submit"]');

  // Wait for login
  await page.waitForTimeout(1000);

  // 🔍 Check localStorage
  const user = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('user') || '{}')
  );

  expect(user.password).toBeUndefined();

  // 🔍 Check UI text
  const bodyText = await page.textContent('body');
  expect(bodyText).not.toContain('password');
  expect(bodyText).toContain('john@jeemail.in');
});
