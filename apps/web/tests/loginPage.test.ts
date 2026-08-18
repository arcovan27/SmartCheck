import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";

const loginPagePath = new URL("../src/pages/LoginPage.tsx", import.meta.url);
const authPath = new URL("../src/lib/auth.tsx", import.meta.url);
const webLogoPath = new URL("../public/arcovan-logo.png", import.meta.url);
const officialLogoSha256 = "8f544b74d6ea078573ecf3ad83b2f53c0e5d28d4826ac6fd393abd94fd654678";

test("login visual preserves the existing authentication contract", async () => {
  const [loginPage, auth] = await Promise.all([
    readFile(loginPagePath, "utf8"),
    readFile(authPath, "utf8"),
  ]);

  assert.match(loginPage, /await login\(email, password\)/);
  assert.match(loginPage, /navigate\("\/"\)/);
  assert.match(loginPage, /loginWithChecklistToken\(checklistToken\)/);
  assert.match(loginPage, /navigate\("\/execucao-checklist", \{ replace: true \}\)/);
  assert.match(auth, /apiRequest<\{ token: string; user: AuthUser \}>\("\/auth\/login"/);
  assert.match(auth, /body: JSON\.stringify\(\{ email, password \}\)/);
  assert.match(auth, /localStorage\.setItem\("smartcheck\.token", result\.token\)/);
});

test("login form keeps accessibility and safe interaction requirements", async () => {
  const loginPage = await readFile(loginPagePath, "utf8");

  assert.match(loginPage, /htmlFor="login-email"/);
  assert.match(loginPage, /id="login-email"/);
  assert.match(loginPage, /autoComplete="email"/);
  assert.match(loginPage, /htmlFor="login-password"/);
  assert.match(loginPage, /id="login-password"/);
  assert.match(loginPage, /autoComplete="current-password"/);
  assert.match(loginPage, /type=\{showPassword \? "text" : "password"\}/);
  assert.match(loginPage, /type="submit"/);
  assert.match(loginPage, /if \(authenticationInProgress\.current\) return/);
  assert.match(loginPage, /role="alert"/);
  assert.match(loginPage, /min-h-\[100dvh\]/);
  assert.match(loginPage, /overflow-x-hidden/);
  assert.doesNotMatch(loginPage, /Esqueci minha senha|Lembrar meu acesso/);
});

test("web logo is an unchanged copy of the official repository asset", async () => {
  const webLogo = await readFile(webLogoPath);
  const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");

  assert.equal(digest(webLogo), officialLogoSha256);
});
