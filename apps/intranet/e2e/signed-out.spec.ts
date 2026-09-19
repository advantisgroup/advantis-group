import { expect, test } from "@playwright/test";

test("a deep link survives the trip through sign-up", async ({ page }) => {
  await page.goto("/calendar?view=week");
  await expect(page).toHaveURL(/\/sign-up/);
  const back = new URL(page.url()).searchParams.get("redirect_url");
  expect(back && new URL(back).pathname + new URL(back).search).toBe("/calendar?view=week");
});

test("the home page doesn't bother remembering itself", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-up/);
  expect(new URL(page.url()).searchParams.has("redirect_url")).toBe(false);
});

test("sign-in renders", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.locator('input[name="identifier"]')).toBeVisible();
});

for (const path of ["/privacy", "/terms", "/imprint"]) {
  test(`${path} is readable without an account`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });
}
