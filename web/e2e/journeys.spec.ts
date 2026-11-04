import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async () => {
  // Explicitly reset only the runner's private file, never the development DB.
  await promisify(execFile)(process.execPath, ["--import", "tsx", "api/src/db/seed.ts"], {
    cwd: resolve(__dirname, "../.."),
    env: process.env,
    windowsHide: true,
  });
});

async function museum(page: Page) {
  await page.goto("/places/1");
  await expect(page.getByRole("heading", { level: 1, name: "National Museum of Ethiopia" })).toBeVisible();
  await expect(page.getByLabel("Acting as")).toBeEnabled();
}

test("browse, persist filters, create and edit a review, then switch travellers", async ({ page }) => {
  const abortErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /AbortError|signal is aborted/.test(message.text())) abortErrors.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (/AbortError|signal is aborted/.test(error.message)) abortErrors.push(error.message);
  });
  await page.goto("/");
  await expect(page.locator(".place-card")).toHaveCount(10);
  await page.screenshot({ path: "docs/screenshots/directory.png", fullPage: true });
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await page.getByLabel("Sort by").selectOption("name");
  await expect(page).toHaveURL(/category=Food.*sort=name/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Food", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Sort by")).toHaveValue("name");
  await expect(page.locator(".place-card")).toHaveCount(3);
  await expect(page.locator(".place-card").first()).toContainText("New Corner Café");
  await page.getByRole("link", { name: /New Corner Café/ }).click();
  await page.getByLabel("Acting as").selectOption("3");
  await page.getByRole("button", { name: "Write a review" }).click();
  await page.getByRole("radio", { name: "4 stars", exact: true }).check();
  await page.getByLabel("Your review", { exact: true }).fill("A quiet corner and a very good cup of coffee.");
  const created = page.waitForResponse((response) => response.url().endsWith("/api/places/2/reviews") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Publish review" }).click();
  expect((await created).status()).toBe(201);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "4.5 out of 5 stars from 2 reviews" })).toBeVisible();
  await page.getByRole("button", { name: "Edit your review" }).click();
  await expect(page.getByLabel("Your review", { exact: true })).toHaveValue("A quiet corner and a very good cup of coffee.");
  await page.getByRole("radio", { name: "2 stars", exact: true }).check();
  await page.getByLabel("Your review", { exact: true }).fill("My updated experience after a second visit.");
  const updated = page.waitForResponse((response) => response.url().endsWith("/api/places/2/reviews") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await updated).status()).toBe(200);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "3.5 out of 5 stars from 2 reviews" })).toBeVisible();
  await page.getByLabel("Acting as").selectOption("1");
  await page.getByRole("button", { name: "Edit your review" }).click();
  await expect(page.getByLabel("Your review", { exact: true })).toHaveValue(/Excellent coffee/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(abortErrors).toEqual([]);
});

test("two tabs competing for the last seat receive one confirmation and one conflict", async ({ page, context }) => {
  await museum(page);
  const second = await context.newPage();
  await museum(second);
  await second.getByLabel("Acting as").selectOption("3");
  await expect(page.getByLabel("Acting as")).toHaveValue("1");
  for (const tab of [page, second]) {
    await tab.locator(".tour-slot").filter({ hasText: "1 seat available" }).getByRole("button", { name: /Book tour/ }).click();
  }
  await Promise.all([page, second].map((tab) => tab.getByRole("button", { name: "Confirm reservation" }).click()));
  await Promise.all([page, second].map((tab) => expect(tab.getByRole("dialog")).toContainText(/Your next discovery is booked|Those seats were just taken/)));
  const confirmed = await Promise.all([page, second].map((tab) => tab.getByRole("dialog", { name: "Booking confirmed" }).count()));
  expect(confirmed.reduce((sum, count) => sum + count, 0)).toBe(1);
  const loser = confirmed[0] ? second : page;
  await expect(loser.getByRole("radio", { name: /Fully booked/ })).toBeDisabled();
  await expect(loser.getByRole("radio", { name: /4 of 10 seats left/ })).toBeEnabled();
  const response = await page.request.get("/api/places/1");
  const detail = (await response.json()).data;
  expect(detail.tourSlots.find((slot: { id: number }) => slot.id === 2)).toMatchObject({ bookedSeats: 10, availableSeats: 0 });
});

test("loading, empty and failed requests have useful states, and failed reviews preserve drafts", async ({ page }) => {
  await page.route("**/api/places?**", async (route) => {
    await new Promise((accept) => setTimeout(accept, 1_200));
    await route.fulfill({ status: 503, json: { error: "UNAVAILABLE", message: "The directory is temporarily unavailable." } });
  });
  await page.goto("/");
  await expect(page.getByRole("status", { name: "Loading places" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "We couldn’t load the places" })).toBeVisible();
  await page.unroute("**/api/places?**");
  await page.route("**/api/places?**", (route) => route.fulfill({ json: { data: [] } }));
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No places here yet" })).toBeVisible();
  await page.unroute("**/api/places?**");
  await museum(page);
  await page.route("**/api/places/1/reviews", (route) => route.fulfill({ status: 500, json: { error: "INTERNAL_ERROR", message: "The review could not be saved right now." } }));
  await page.getByRole("button", { name: "Edit your review" }).click();
  await page.getByLabel("Your review", { exact: true }).fill("Keep this careful draft after a failed request.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("The review could not be saved right now.");
  await expect(page.getByLabel("Your review", { exact: true })).toHaveValue("Keep this careful draft after a failed request.");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
});

test("an interrupted booking response stays unknown and never automatically repeats the write", async ({ page }) => {
  await museum(page);
  let writes = 0;
  await page.route("**/api/tour-slots/1/bookings", async (route) => {
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort("failed");
  });
  await page.locator(".tour-slot").filter({ hasText: "4 seats available" }).getByRole("button", { name: /Book tour/ }).click();
  await page.getByRole("button", { name: "Confirm reservation" }).click();
  await expect(page.getByRole("heading", { name: "Booking outcome unknown" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm reservation" })).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Refresh availability", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Booking outcome unknown" })).toBeVisible();
  expect(writes).toBe(1);
  const response = await page.request.get("/api/places/1");
  expect((await response.json()).data.tourSlots[0].availableSeats).toBe(3);
});

test("keyboard dialog access and a group booking work on a narrower screen", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await museum(page);
  await page.getByRole("button", { name: "Edit your review" }).click();
  const dialog = page.getByRole("dialog");
  for (let index = 0; index < 10; index++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  for (let index = 0; index < 10; index++) {
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit your review" })).toBeFocused();
  await page.screenshot({ path: "docs/screenshots/place-details.png", fullPage: true });
  await page.locator(".tour-slot").filter({ hasText: "4 seats available" }).getByRole("button", { name: /Book tour/ }).click();
  await page.getByRole("spinbutton", { name: "Number of seats" }).fill("2");
  await page.getByRole("button", { name: "Confirm reservation" }).click();
  await expect(page.getByRole("dialog", { name: "Booking confirmed" })).toBeVisible();
  await expect(page.getByText("2 seats reserved for Sara.")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/booking-confirmed.png" });
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".tour-slot").first()).toContainText("2 seats available");
});

test("phone layout keeps controls and dialogs within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?category=Nature");
  await expect(page.locator("a.place-card")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("link", { name: /Entoto Natural Park/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Entoto Natural Park" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Edit your review" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("cleans known extension markers before hydration without hiding diagnostics", async ({ page }) => {
  const extensionMessages: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && /hydrated|bis_skin_checked|bis_register|cz-shortcut-listen|__processed_/.test(text)) extensionMessages.push(text);
  });
  await page.addInitScript(() => {
    function annotate(root: Node) {
      if (root instanceof Element) {
        root.setAttribute("bis_skin_checked", "1");
        if (root instanceof HTMLBodyElement) {
          root.setAttribute("bis_register", "extension-data");
          root.setAttribute("cz-shortcut-listen", "true");
          root.setAttribute("__processed_e0b7f489-e38b-4816-bdc0-b250544e3f8c__", "true");
        }
      }
      if (root instanceof Element || root instanceof Document) {
        root.childNodes.forEach(annotate);
      }
    }
    const extension = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) annotate(node);
    });
    extension.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await expect(page.locator("a.place-card")).toHaveCount(10);
  await expect(page.locator("body")).not.toHaveAttribute("bis_register");
  await expect(page.locator("body")).not.toHaveAttribute("cz-shortcut-listen");
  expect(await page.locator("body").evaluate((element) => Array.from(element.attributes).some(({ name }) => name.startsWith("__processed_")))).toBe(false);
  expect(extensionMessages).toEqual([]);
});
