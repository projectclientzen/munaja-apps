import { expect, test } from "@playwright/test";

// Owner report 18 Nov 2026: a fresh browser opening "/" was sent to /access-status after 1-2 seconds.
test("live: a visitor who is not signed in stays on the entry page", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(4000);
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("link", { name: "Masuk" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aktivasi akun" })).toBeVisible();
});
