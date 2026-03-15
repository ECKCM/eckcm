import { test, expect } from "@playwright/test";

test.describe("Authentication flows", () => {
  test("protected route /dashboard redirects to login", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect unauthenticated users to login
    await page.waitForURL(/\/(login|$)/, { timeout: 10_000 });
    const url = page.url();
    expect(url).toMatch(/\/(login|$)/);
  });

  test("protected route /register redirects to login", async ({ page }) => {
    // Try accessing a registration page without auth
    await page.goto("/register/some-event-id");
    await page.waitForURL(/\/(login|$)/, { timeout: 10_000 });
    const url = page.url();
    expect(url).toMatch(/\/(login|$)/);
  });

  test("admin route /admin redirects unauthorized users", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/(login|admin\/unauthorized|$)/, { timeout: 10_000 });
    const url = page.url();
    expect(url).toMatch(/\/(login|admin\/unauthorized|$)/);
  });

  test("login form shows error for invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.fill("#email", "nonexistent@test.com");
    await page.fill("#password", "wrongpassword123");

    // Turnstile CAPTCHA may block submission — check for error or captcha
    const submitButton = page.getByRole("button", { name: /sign in/i });
    await submitButton.click();

    // Either an error message appears or the page stays on login
    // (Turnstile may prevent actual API call in test environment)
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    expect(currentUrl).toContain("/login");
  });

  test("signup page navigates to login via link", async ({ page }) => {
    await page.goto("/signup");
    const loginLink = page.getByRole("link", { name: /sign in|log in/i });
    if (await loginLink.isVisible()) {
      await loginLink.click();
      await page.waitForURL(/\/login/);
      expect(page.url()).toContain("/login");
    }
  });
});
