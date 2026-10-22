import { expect, test } from '@playwright/test';

test('the complete story keeps independent clocks, usable charts and reader controls', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Search for an island' })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await page.keyboard.press('Shift+P');
  const panel = page.locator('[data-presentation-story]');
  const patient = page.getByTestId('presentation-patient-clock');
  const staff = page.getByTestId('presentation-staff-clock');
  await expect(panel).toHaveAttribute('data-presentation-story', 'opening');
  await expect(patient).toHaveAttribute('data-elapsed-seconds', '0');
  await expect(staff).toHaveCount(0);
  await expect(panel.getByRole('region', { name: 'Fuller island context' })).toHaveAttribute('aria-busy', 'false', {
    timeout: 30_000
  });
  await expect(panel.getByText('Outbound education demand', { exact: true })).toBeVisible();

  // Keyboard activation of a chart switch must not advance the presentation.
  // The shorter layout offers pagination; the tall layout shows every chart.
  await page.setViewportSize({ width: 1280, height: 720 });
  const demand = panel.getByRole('button', { name: 'Demand & connections' });
  await expect(demand).toBeVisible();
  await demand.focus();
  await page.keyboard.press('Space');
  await expect(demand).toHaveAttribute('aria-pressed', 'true');
  await expect(panel).toHaveAttribute('data-presentation-story', 'opening');
  await expect(panel.getByRole('heading', { name: 'Demand on the island' })).toBeVisible();

  const scenes = [
    'baarah',
    'ferry-baarah-vashafaru',
    'ferry-vashafaru-dhihdhoo',
    'wait-dhihdhoo',
    'ferry-dhihdhoo-hanimaadhoo',
    'airport-connection',
    'flight-to-hulhule',
    'staff-walk-to-stop',
    'staff-wait-for-bus',
    'staff-bus-to-airport',
    'staff-walk-to-terminal',
    'road-to-care',
    'close'
  ];
  let previousPatient = 0;
  let previousStaff = 0;
  for (const scene of scenes) {
    await page.keyboard.press('ArrowRight');
    await expect(panel).toHaveAttribute('data-presentation-story', scene);
    await expect(panel.locator('h2')).toBeVisible();
    const seconds = Number(await patient.getAttribute('data-elapsed-seconds'));
    expect(seconds).toBeGreaterThanOrEqual(previousPatient);
    previousPatient = seconds;
    if (scene.startsWith('staff-') || scene === 'road-to-care' || scene === 'close') {
      await expect(staff).toBeVisible();
      const pickup = Number(await staff.getAttribute('data-elapsed-seconds'));
      expect(pickup).toBeGreaterThanOrEqual(previousStaff);
      expect(pickup).toBeLessThan(seconds);
      previousStaff = pickup;
    }
    if (scene === 'wait-dhihdhoo') {
      await expect(patient).toHaveAttribute('data-elapsed-seconds', String(205 * 60));
      await expect(panel.getByText('2h 50m', { exact: true })).toBeVisible();
    }
    if (scene === 'flight-to-hulhule') {
      await expect(patient).toHaveAttribute('data-elapsed-seconds', String(365 * 60));
      await expect(patient).toHaveAttribute('data-incomplete', 'true');
    }
  }
  expect(previousPatient).toBeGreaterThan(365 * 60);
  expect(previousStaff).toBeGreaterThan(45 * 60);
  await page.screenshot({ path: 'test-results/ui-review-presentation.png' });

  await page.keyboard.press('ArrowLeft');
  await expect(panel).toHaveAttribute('data-presentation-story', 'road-to-care');
  await page.keyboard.press('Home');
  await expect(panel).toHaveAttribute('data-presentation-story', 'opening');
  await expect(patient).toHaveAttribute('data-elapsed-seconds', '0');
  await expect(staff).toHaveCount(0);
  await page.keyboard.press('Shift+L');
  await expect(page.getByRole('complementary', { name: 'Presentation reader notes' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Search for an island' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('small-screen presentation keeps its charts and timers inside the panel', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Search for an island' })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Shift+P');
  const panel = page.locator('[data-presentation-story]');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Fuller island context' })).toHaveAttribute('aria-busy', 'false', {
    timeout: 30_000
  });
  for (const mode of ['Journey breakdown', 'Island details']) {
    const button = panel.getByRole('button', { name: mode, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(panel).toHaveAttribute('data-presentation-story', 'opening');
  }
  for (let scene = 0; scene < 10; scene++) await page.keyboard.press('ArrowRight');
  await expect(panel).toHaveAttribute('data-presentation-story', 'staff-bus-to-airport');
  await expect(page.getByTestId('presentation-patient-clock')).toBeVisible();
  await expect(page.getByTestId('presentation-staff-clock')).toBeVisible();
  const dimensions = await panel.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      x: box.x,
      right: box.right,
      bottom: box.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
      overflowX: element.scrollWidth - element.clientWidth,
      overflowY: element.scrollHeight - element.clientHeight
    };
  });
  expect(dimensions.x).toBeGreaterThanOrEqual(0);
  expect(dimensions.right).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.bottom).toBeLessThanOrEqual(dimensions.height);
  expect(dimensions.overflowX).toBeLessThanOrEqual(1);
  expect(dimensions.overflowY).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/ui-review-presentation-mobile.png' });
});
