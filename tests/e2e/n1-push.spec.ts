import { expect, test, type Page } from "@playwright/test";

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

const reminders = (page: Page) => page.getByTestId("enable-reminders").first();

test("izin diberikan: aktifkan lalu matikan pengingat (simulasi mode demo)", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: "tests/e2e/.auth/demo.json",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    permissions: ["notifications"],
  });
  const page = await ctx.newPage();
  // Headless Chromium keeps Notification.permission at "denied" even after grantPermissions, so the page value is
  // overridden too. The context grant is still set so the browser-level permission matches.
  await page.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "granted" }));
  await page.goto("/settings");
  const box = reminders(page);
  await expect(box).toHaveAttribute("data-view", "can_ask");
  await expect(box.getByText("Data demo")).toBeVisible();
  await box.getByRole("button", { name: "Aktifkan pengingat" }).click();
  await expect(box).toHaveAttribute("data-view", "active");
  await expect(box.getByText("Pengingat aktif di perangkat ini.")).toBeVisible();

  // The choice survives a reload (kept per user in this browser).
  await page.reload();
  await expect(reminders(page)).toHaveAttribute("data-view", "active");

  await reminders(page).getByRole("button", { name: "Matikan pengingat" }).click();
  await expect(reminders(page)).toHaveAttribute("data-view", "can_ask");
  await ctx.close();
});

test("izin ditolak saat diketuk: panduan membuka izin muncul, tidak ada status aktif", async ({ page }) => {
  await page.addInitScript(() => {
    let perm: NotificationPermission = "default";
    Object.defineProperty(Notification, "permission", { get: () => perm });
    Notification.requestPermission = async () => {
      perm = "denied";
      return perm;
    };
  });
  await page.goto("/settings");
  const box = reminders(page);
  await box.getByRole("button", { name: "Aktifkan pengingat" }).click();
  await expect(box).toHaveAttribute("data-view", "denied");
  await expect(box.getByText("Izin notifikasi ditolak.")).toBeVisible();
  await expect(box.getByText(/gembok|pengaturan situs/)).toBeVisible();
  await expect(box.getByRole("button", { name: "Aktifkan pengingat" })).toHaveCount(0);
});

test("izin sudah ditolak: Pengaturan menampilkan cara membukanya", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "denied" }));
  await page.goto("/settings");
  await expect(reminders(page)).toHaveAttribute("data-view", "denied");
});

test("browser tanpa push: tidak ada tombol, ada saran alarm", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { PushManager?: unknown }).PushManager;
  });
  await page.goto("/settings");
  const box = reminders(page);
  await expect(box).toHaveAttribute("data-view", "unsupported");
  await expect(box.getByText("Browser ini belum mendukung pengingat.")).toBeVisible();
  await expect(box.getByRole("button", { name: "Aktifkan pengingat" })).toHaveCount(0);
});

test("iPhone di luar aplikasi terpasang: minta pasang dulu, ada panduan", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: "tests/e2e/.auth/demo.json",
    userAgent: IOS_UA,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
  });
  const page = await ctx.newPage();
  await page.goto("/settings");
  const box = reminders(page);
  await expect(box).toHaveAttribute("data-view", "needs_install");
  await expect(box.getByText("Pasang Munajaa di layar utama dulu, lalu aktifkan pengingat.")).toBeVisible();
  await box.getByRole("button", { name: "Lihat panduan pasang" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await ctx.close();
});

test("kartu dashboard tidak lagi bilang 'Segera tersedia'", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Segera tersedia di Pengaturan")).toHaveCount(0);
});

test("mode demo masih menampilkan pengingat tidur dengan badge Data demo", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("switch", { name: "Pengingat tidur" })).toBeVisible();
  await expect(page.getByTestId("bedtime-soon")).toHaveCount(0);
  await expect(page.getByText("Data demo").first()).toBeVisible();
});
