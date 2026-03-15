import { test, expect } from "@playwright/test";

test.describe("Smoke tests - pages load without errors", () => {
  test("homepage loads and shows ECKCM title", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("ECKCM");
  });

  test("login page renders form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("ECKCM").first()).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByText("Sign up with Email")).toBeVisible();
  });

  test("login page has link to signup", async ({ page }) => {
    await page.goto("/login");
    const signupLink = page.getByRole("link", { name: /sign up/i });
    await expect(signupLink).toBeVisible();
  });

  test("login page has link to forgot password", async ({ page }) => {
    await page.goto("/login");
    const forgotLink = page.getByRole("link", { name: /forgot password/i });
    await expect(forgotLink).toBeVisible();
  });

  test("terms page loads", async ({ page }) => {
    await page.goto("/terms");
    await expect(page).toHaveURL(/terms/);
  });

  test("privacy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page).toHaveURL(/privacy/);
  });
});
