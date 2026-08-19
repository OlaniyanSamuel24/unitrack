import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('UniTrack onboarding has no serious accessibility violations', async ({ page }) => {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:3000');
  await page.waitForTimeout(1500);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter(issue => ['critical', 'serious'].includes(issue.impact)).map(issue => issue.id)).toEqual([]);
});

test('Create Account exposes labelled account controls', async ({ page }) => {
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:3000');
  await page.waitForTimeout(1500);
  await page.locator('button.skip').waitFor({ state: 'visible' });
  await page.evaluate(() => document.querySelector('button.skip')?.click());
  await expect(page.locator('#account-email')).toBeVisible();
  await expect(page.locator('#account-password')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with Apple/ })).toBeVisible();
});
