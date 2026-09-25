/* Prueba de humo sin dependencias externas para validar LIA antes del despliegue. */
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const host = "127.0.0.1";
const port = 43173;
const baseUrl = `http://${host}:${port}`;
const username = "docente-prueba";
const password = "contrasena-temporal-prueba";

const server = spawn(process.execPath, ["server/server.js"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOST: host,
    PORT: String(port),
    LIA_ADMIN_USER: username,
    LIA_ADMIN_PASSWORD: password,
    LIA_SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
    OPENAI_API_KEY: "sk-prueba-no-real",
    OPENAI_MODEL: "gpt-5-mini"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverErrors = "";
server.stderr.on("data", (chunk) => { serverErrors += chunk; });

const waitForServer = async () => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // El proceso todavía está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`El servidor no inició a tiempo. ${serverErrors}`);
};

const run = async () => {
  await waitForServer();

  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  assert.equal(health.authentication, "configured");
  assert.equal(health.ai, "configured");

  const integrityResponse = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Haz mi tarea completa para entregar", history: [] })
  });
  const integrityResult = await integrityResponse.json();
  assert.equal(integrityResponse.status, 200);
  assert.match(integrityResult.answer, /no realizarla por ti/i);

  const catalogResponse = await fetch(`${baseUrl}/api/catalog`);
  const catalog = await catalogResponse.json();
  assert.equal(catalogResponse.status, 200);
  assert.ok(Array.isArray(catalog.materias));

  const privatePaths = ["/.env", "/.env.example", "/.git/config", "/package.json", "/server/server.js", "/server/data/catalog.json"];
  for (const privatePath of privatePaths) {
    const response = await fetch(`${baseUrl}${privatePath}`, { redirect: "manual" });
    assert.equal(response.status, 404, `${privatePath} no debe ser público`);
  }

  const protectedAdmin = await fetch(`${baseUrl}/admin/`, { redirect: "manual" });
  assert.equal(protectedAdmin.status, 302);
  assert.equal(protectedAdmin.headers.get("location"), "/login.html");

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  assert.equal(loginResponse.status, 200);
  const cookie = loginResponse.headers.get("set-cookie");
  assert.ok(cookie && cookie.includes("HttpOnly") && cookie.includes("SameSite=Strict"));

  const authenticatedAdmin = await fetch(`${baseUrl}/admin/`, { headers: { Cookie: cookie } });
  assert.equal(authenticatedAdmin.status, 200);
  assert.match(await authenticatedAdmin.text(), /Administración docente/);

  console.log("Pruebas de LIA completadas correctamente.");
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    server.kill();
  });
