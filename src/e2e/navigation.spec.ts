import { test, expect } from "@playwright/test";

test.describe("Navigation and routing", () => {
  test("homepage → login navigation", async ({ page }) => {
    await page.goto("/");

    // Look for sign in / login link or button
    const loginLink = page.getByRole("link", { name: /sign in|log in|login/i });
    if (await loginLink.isVisible()) {
      await loginLink.click();
      await page.waitForURL(/\/login/);
      expect(page.url()).toContain("/login");
    }
  });

  test("homepage → signup navigation", async ({ page }) => {
    await page.goto("/");

    const signupLink = page.getByRole("link", { name: /sign up|register|get started/i });
    if (await signupLink.isVisible()) {
      await signupLink.click();
      await page.waitForURL(/\/signup/);
      expect(page.url()).toContain("/signup");
    }
  });

  test("login → forgot password navigation", async ({ page }) => {
    await page.goto("/login");

    const forgotLink = page.getByRole("link", { name: /forgot password/i });
    await forgotLink.click();
    await page.waitForURL(/\/forgot-password/);
    expect(page.url()).toContain("/forgot-password");
  });

  test("login → signup navigation", async ({ page }) => {
    await page.goto("/login");

    const signupLink = page.getByRole("link", { name: /sign up/i });
    await signupLink.click();
    await page.waitForURL(/\/signup/);
    expect(page.url()).toContain("/signup");
  });

  test("no console errors on homepage", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Filter out known non-critical errors (Turnstile, analytics, etc.)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("turnstile") &&
        !e.includes("analytics") &&
        !e.includes("favicon") &&
        !e.includes("Failed to load resource") // external resources
    );

    expect(criticalErrors).toEqual([]);
  });

  test("no console errors on login page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("turnstile") &&
        !e.includes("analytics") &&
        !e.includes("favicon") &&
        !e.includes("Failed to load resource")
    );

    expect(criticalErrors).toEqual([]);
  });
});
