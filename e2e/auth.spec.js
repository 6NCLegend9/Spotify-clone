const { test, expect } = require("@playwright/test");

async function mockAuthApi(page, { credentials = "success" } = {}) {
  let session = null;
  let verificationPosts = 0;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/session") {
      return route.fulfill({ json: session || {} });
    }
    if (url.pathname === "/api/auth/providers") {
      return route.fulfill({
        json: {
          credentials: {
            id: "credentials",
            name: "Credentials",
            type: "credentials",
            signinUrl: `${url.origin}/api/auth/signin/credentials`,
            callbackUrl: `${url.origin}/api/auth/callback/credentials`,
          },
        },
      });
    }
    if (url.pathname === "/api/auth/csrf") {
      return route.fulfill({ json: { csrfToken: "fixture-csrf" } });
    }
    if (url.pathname === "/api/auth/callback/credentials") {
      if (credentials === "invalid") {
        return route.fulfill({
          status: 401,
          json: { url: `${url.origin}/login?error=AUTH_INVALID_CREDENTIALS` },
        });
      }
      if (credentials === "csrf") {
        return route.fulfill({
          status: 200,
          json: { url: `${url.origin}/login?csrf=true` },
        });
      }
      const form = new URLSearchParams(request.postData() || "");
      const callbackUrl = form.get("callbackUrl") || "/";
      session = {
        user: {
          id: "aaaaaaaaaaaaaaaaaaaaaaaa",
          name: "Auth Fixture",
          email: "listener@example.com",
        },
        expires: "2099-01-01T00:00:00.000Z",
      };
      return route.fulfill({
        status: 200,
        json: { url: new URL(callbackUrl, url.origin).href },
      });
    }
    if (url.pathname === "/api/signup") {
      return route.fulfill({
        status: 201,
        json: { success: true, data: { userName: "Listener" } },
      });
    }
    if (url.pathname === "/api/verify-email") {
      verificationPosts += 1;
      return route.fulfill({
        status: 200,
        json: { success: true, message: "Email verified successfully." },
      });
    }
    if (url.pathname === "/api/forgotPassword" && request.method() === "PUT") {
      return route.fulfill({
        status: 200,
        json: { success: true, message: "Password updated successfully." },
      });
    }

    return route.fulfill({
      json: {
        success: true,
        data: [],
        releases: [],
        genres: [],
        tree: [],
      },
    });
  });

  return {
    verificationPosts: () => verificationPosts,
  };
}

test.beforeEach(async ({ page, serviceWorkers }) => {
  if (serviceWorkers === "block") {
    await page.addInitScript(() => {
      delete Navigator.prototype.serviceWorker;
    });
  }
});

test("credentials login preserves a safe return path", async ({ page }) => {
  await mockAuthApi(page);
  await page.goto("/login?callbackUrl=%2Flibrary", {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Email").fill("listener@example.com");
  await page.getByLabel("Password").fill("fixture-password-123");
  await page.locator("#main-content").getByRole("button", {
    name: "Log in",
    exact: true,
  }).click();
  await expect(page).toHaveURL(/\/library$/);
});

test("invalid credentials and CSRF-shaped success stay on login", async ({ page }) => {
  await mockAuthApi(page, { credentials: "invalid" });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill("listener@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  const loginButton = page.locator("#main-content").getByRole("button", {
    name: "Log in",
    exact: true,
  });
  await loginButton.click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/couldn't sign you in with those details/i)).toBeVisible();

  await page.unrouteAll({ behavior: "wait" });
  await mockAuthApi(page, { credentials: "csrf" });
  await loginButton.click();
  await expect(page).toHaveURL(/\/login/);
});

test("signup ends in a check-email state instead of login", async ({ page }) => {
  await mockAuthApi(page);
  await page.goto("/signup", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Username").fill("Listener");
  await page.getByLabel("Email").fill("listener+music@gmail.com");
  await page.getByLabel("Password").fill("fixture-password-123");
  await page.locator("#main-content").getByRole("button", {
    name: "Sign up",
    exact: true,
  }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Resend verification email" })).toBeVisible();
});

test("fresh-browser verification waits for an explicit click", async ({ page }) => {
  const api = await mockAuthApi(page);
  const token = "a".repeat(64);
  await page.goto(`/verify-email/${token}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  expect(api.verificationPosts()).toBe(0);
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByRole("heading", { name: "Email Verified!" })).toBeVisible();
  expect(api.verificationPosts()).toBe(1);
});

test("fresh-browser password reset replaces token history with login", async ({ page }) => {
  await mockAuthApi(page);
  const token = "b".repeat(64);
  await page.goto(`/reset-password/${token}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("New password").fill("new-fixture-password");
  await page.getByLabel("Confirm password").fill("new-fixture-password");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
