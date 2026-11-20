import { chromium, request as playwrightRequest } from "@playwright/test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cleanupGroup } from "./cleanup.js";
import { mkdir, writeFile } from "node:fs/promises";
import { pool } from "../server/db.js";
import { createApp } from "../server/index.js";
const suffix = Date.now().toString(36),
  password = randomBytes(18).toString("hex");
let app,
  server,
  base = process.env.TEST_BASE_URL;
const groups = [];
let redeploy = null;
if (!base) {
  app = await createApp();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
  process.env.APP_ORIGIN = base;
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["microphone"],
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await mkdir(".local/screenshots", { recursive: true });
async function signIn(user, pw = password, checkPending = false) {
  await page.goto(base);
  await page.getByRole("button", { name: /^Administrador/ }).click();
  await page.getByLabel("Usuario", { exact: true }).fill(user);
  await page.getByLabel("Contraseña", { exact: true }).fill(pw);
  let resume;
  if (checkPending) {
    const gate = new Promise((resolve) => {
      resume = resolve;
    });
    await page.route("**/api/login", async (route) => {
      await gate;
      await route.continue();
    });
  }
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  if (checkPending) {
    try {
      for (const label of [/^Administrador/, /^Dueño /, /^Polaco /])
        assert(await page.getByRole("button", { name: label }).isDisabled());
      await page.screenshot({ path: ".local/demo-admin-pending.png", fullPage: true });
    } finally {
      resume();
    }
  }
  await page.getByRole("heading", { name: /Hola |Estadísticas/ }).waitFor();
  if (checkPending) await page.unroute("**/api/login");
  if (await page.getByRole("dialog").isVisible())
    await page
      .getByRole("button", { name: "Continuar con estos colores" })
      .click();
}
async function signOut() {
  await page.goto(base + "/settings");
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page.getByRole("heading", { name: "Elige un perfil" }).waitFor();
}
async function api(path, body, method = body ? "POST" : "GET") {
  const r = await context.request.fetch(base + "/api" + path, {
    method,
    data: body,
  });
  assert.equal(r.status(), 200, await r.text());
  return r.json();
}
async function closed() {
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function snap(name, width, height) {
  await page.setViewportSize({ width, height });
  await page.getByRole("heading", { name: /Hola |Estadísticas/ }).waitFor();
  await page.getByText("Vendido confirmado", { exact: true }).waitFor();
  await page.screenshot({
    path: ".local/screenshots/" + name + ".png",
    fullPage: true,
    animations: "disabled",
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  assert.equal(overflow, false, "Sin overflow en " + name);
}
try {
  await page.goto(base);
  await page.screenshot({
    path: ".local/screenshots/login.png",
    fullPage: true,
    animations: "disabled",
  });
  // A pending direct entry also locks the expanded password form.
  for (const label of [/^Dueño /, /^Polaco /]) {
    await page.getByRole("button", { name: /^Administrador/ }).click();
    let resume;
    const gate = new Promise((resolve) => {
      resume = resolve;
    });
    await page.route("**/api/entry", async (route) => {
      await gate;
      await route.continue();
    });
    await page.getByRole("button", { name: label }).click();
    try {
      assert(
        await page.locator(".admin-login button[type=submit]").isDisabled(),
      );
    } finally {
      resume();
    }
    await page.getByRole("heading", { name: /^Hola / }).waitFor();
    await page.unroute("**/api/entry");
    await signOut();
  }
  await signIn(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, true);
  await page.goto(base + "/groups");
  await page.getByRole("button", { name: "Crear grupo", exact: true }).click();
  await page.getByLabel("Nombre del grupo").fill("QA Navegador " + suffix);
  await page.getByLabel("Cupos de polacos").fill("2");
  await page.getByLabel("Nombre del dueño").fill("María Vargas");
  await page.getByLabel("Usuario del dueño").fill("browser_owner_" + suffix);
  await page.getByLabel("Contraseña inicial").fill(password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear grupo", exact: true })
    .click();
  await closed();
  const group = (await api("/groups?limit=100")).items.find(
    (g) => g.name === "QA Navegador " + suffix,
  );
  assert(group);
  groups.push(group.id);
  await signOut();
  await signIn("browser_owner_" + suffix);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  assert.equal(await page.locator(".group-brand").count(), 0);
  assert.equal(
    await page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByText("QA Navegador " + suffix, { exact: true })
      .count(),
    0,
  );
  await page.waitForFunction(() => {
    const menu = document.querySelector(".sidebar.open");
    return menu && Math.abs(menu.getBoundingClientRect().left) < 1;
  });
  await page.screenshot({
    path: ".local/screenshots/owner-menu-no-group.png",
    fullPage: false,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Cerrar navegación", exact: true })
    .click();
  await page.goto(base + "/settings");
  await page
    .getByRole("heading", { name: "Colores de tu cuenta", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Identidad de tu grupo", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.getByLabel("Nombre del grupo", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByLabel("Logo o imagen del grupo", { exact: true }).count(),
    0,
  );
  assert(
    !(await page.locator("main").innerText()).includes(
      "QA Navegador " + suffix,
    ),
  );
  await page.screenshot({
    path: ".local/screenshots/owner-settings-no-group.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/team");
  await page.getByRole("button", { name: "Nuevo polaco", exact: true }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Carlos Solano");
  await page.getByLabel("Nombre de usuario").fill("browser_worker_" + suffix);
  await page.getByLabel("Contraseña inicial").fill(password);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await closed();
  const worker = (await api("/directory")).find((u) => u.role === "polaco");
  await page.goto(base + "/inventory");
  await page
    .getByRole("button", { name: "Nuevo producto", exact: true })
    .click();
  await page.getByLabel("Nombre", { exact: true }).fill("Licuadora Oster");
  await page.getByLabel("Descripción").fill("Vaso de vidrio · 3 velocidades");
  await page.getByLabel("Precio unitario (₡)").fill("100000");
  await page.getByLabel("Unidades disponibles").fill("5");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Guardar", exact: true })
    .click();
  await closed();
  await page.goto(base + "/clients");
  await page
    .getByRole("button", { name: "Nuevo cliente", exact: true })
    .click();
  await page.getByLabel("Nombre o identificador").fill("Andrea Jiménez");
  await page.getByLabel("Responsable").selectOption(worker.id);
  await page.getByLabel("Teléfono", { exact: true }).fill("8888 1234");
  await page.getByLabel("Dirección").fill("San Ramón · Centro");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Crear cliente", exact: true })
    .click();
  await closed();
  for (let i = 1; i <= 3; i++) {
    await api("/products", {
      name:
        i === 3
          ? "Producto de prueba con un nombre largo para comprobar que el texto se adapta a pantallas pequeñas"
          : `Producto cuadrícula ${i}`,
      description:
        "Descripción del producto con información suficiente para comprobar los saltos de línea",
      price: 15000 * i,
      available: 10 + i,
    });
    await api("/clients", {
      name:
        i === 3
          ? "Cliente de prueba con un nombre largo que debe seguir siendo legible en el teléfono"
          : `Cliente cuadrícula ${i}`,
      phone: "8888 9999",
      address:
        "Dirección de prueba con varios detalles para revisar el espacio disponible",
    });
  }
  await signOut();
  await signIn("browser_worker_" + suffix);
  assert.equal(await page.locator(".group-brand").count(), 0);
  assert(
    !(await page.locator(".sidebar").innerText()).includes(
      "QA Navegador " + suffix,
    ),
  );
  await page.goto(base + "/clients");
  await page.getByRole("button", { name: /Andrea Jiménez/ }).click();
  await page.getByRole("button", { name: "Nueva compra", exact: true }).click();
  await page
    .getByLabel("Producto", { exact: true })
    .selectOption({ label: "Licuadora Oster · ₡100 000,00 · 5 disponibles" })
    .catch(async () => {
      await page
        .getByLabel("Producto", { exact: true })
        .selectOption({ index: 1 });
    });
  await page.getByLabel("Precio", { exact: true }).selectOption("custom");
  await page.getByLabel("Precio unitario (₡)").fill("90000");
  await page.getByLabel("Monto de la cuota (₡)").fill("10000");
  await page
    .getByRole("button", { name: "Ver calendario", exact: true })
    .click();
  await page.getByText("9 cuotas ·").waitFor();
  await page
    .getByRole("button", { name: "Solicitar precio y reservar" })
    .click();
  await closed();
  await page
    .getByRole("heading", { name: "Pendiente de aprobación" })
    .waitFor();
  const pendingId = new URL(page.url()).pathname.split("/")[2];
  await signOut();
  await signIn("browser_owner_" + suffix);
  await page.goto(base + "/requests");
  await page.getByRole("button", { name: "Revisar y aprobar" }).click();
  await page
    .getByRole("button", { name: "Ver calendario", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aprobar compra", exact: true })
    .click();
  await closed();
  await page.goto(base + "/purchases/" + pendingId);
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Tipo de pago").selectOption("capital");
  await page.getByLabel("Monto recibido (₡)").fill("20000");
  await page
    .getByRole("button", { name: "Confirmar y registrar pago" })
    .click();
  await closed();
  await page.getByText("₡70 000,00", { exact: true }).waitFor();
  const p = await api("/purchases/" + pendingId);
  assert.equal(p.ledger.balance, 7000000);
  assert.equal(p.ledger.remaining_count, 7);
  assert.equal(p.ledger.schedule[0].remaining, 1000000);
  await page.goto(base + "/chats");
  await page
    .getByRole("button", { name: "Nueva conversación", exact: true })
    .click();
  await page.getByLabel("Tipo de conversación").selectOption("direct");
  await page.getByLabel("Compañero", { exact: true }).selectOption(worker.id);
  await page
    .getByLabel("Primer mensaje")
    .fill("Cobro revisado. Todo está en orden");
  await page.getByRole("button", { name: "Enviar primer mensaje" }).click();
  await closed();
  await page
    .getByText("Cobro revisado. Todo está en orden", { exact: true })
    .waitFor();
  const chatId = new URL(page.url()).pathname.split("/")[2];
  await page
    .getByLabel("Mensaje", { exact: true })
    .fill("Segunda nota persistente");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.getByText("Segunda nota persistente", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("Segunda nota persistente", { exact: true }).waitFor();
  await page
    .getByLabel("Adjuntar archivo", { exact: true })
    .filter({ visible: true })
    .last()
    .setInputFiles({
      name: "nota.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Archivo persistente de navegador"),
    });
  await page.getByText("nota.txt", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page
    .locator(".message")
    .getByRole("link", { name: "nota.txt" })
    .waitFor();
  await page.getByRole("button", { name: "Grabar audio" }).click();
  await page.getByRole("button", { name: "Terminar grabación" }).waitFor();
  await new Promise((r) => setTimeout(r, 350));
  await page.getByRole("button", { name: "Terminar grabación" }).click();
  await page.locator(".attached").waitFor();
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.locator("audio").waitFor();
  await page
    .getByLabel("Adjuntar archivo", { exact: true })
    .filter({ visible: true })
    .last()
    .setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPAcAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.locator(".attached").waitFor();
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await page.getByRole("img", { name: "foto.png" }).waitFor();
  await page.reload();
  await page.locator("audio").waitFor();
  await page.getByRole("img", { name: "foto.png" }).waitFor();
  await page.goto(base + "/");
  await snap("desktop", 1440, 1000);
  await snap("tablet", 820, 1180);
  await snap("mobile", 390, 844);
  await page.goto(base + "/calendar");
  await page.getByRole("heading", { name: "Cobros", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  await page.screenshot({
    path: ".local/screenshots/mobile-cobros.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(base + "/purchases/" + pendingId);
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.getByLabel("Monto recibido (₡)").fill("3000");
  await page
    .getByRole("button", { name: "Confirmar y registrar pago" })
    .click();
  await closed();
  assert.equal(
    (await api("/purchases/" + pendingId)).ledger.schedule[0].remaining,
    700000,
  );
  await page.screenshot({
    path: ".local/screenshots/mobile-compra.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(base + "/settings");
  await page.getByRole("button", { name: "Oscuro", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".theme-dark"));
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".theme-dark"));
  await page.getByRole("button", { name: "Claro", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".theme-light"));
  await page.getByRole("button", { name: "Océano", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".palette-ocean"));
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".palette-ocean"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signOut();
  await signIn("browser_worker_" + suffix);
  await page.goto(base + "/chats");
  await page
    .getByRole("button", { name: "Nueva conversación", exact: true })
    .click();
  assert.deepEqual(
    await page
      .getByLabel("Tipo de conversación")
      .locator("option")
      .evaluateAll((options) => options.map((o) => o.value)),
    ["direct", "group"],
  );
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  assert(
    !(await page.locator("main").innerText()).toLowerCase().includes("soporte"),
  );
  await signOut();
  await signIn(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
  await page.goto(base + "/");
  await page
    .getByRole("heading", { name: "Estadísticas", exact: true })
    .waitFor();
  assert.deepEqual(
    (
      await page
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("link")
        .allTextContents()
    ).map((s) => s.trim()),
    ["Estadísticas", "Grupos"],
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Ver notificaciones", exact: true })
      .count(),
    0,
  );
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({
      path: `.local/screenshots/platform-stats-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "Estadísticas sin desborde " + width,
    );
  }
  await page.goto(base + "/groups/" + group.id + "/team");
  await page
    .getByRole("heading", { name: "Usuarios del grupo", exact: true })
    .waitFor();
  await page
    .getByPlaceholder("Buscar nombre usuario o grupo")
    .fill("Carlos Solano");
  await page.getByRole("row").filter({ hasText: "Carlos Solano" }).waitFor();
  for (const path of [
    "/support",
    "/notes",
    "/activity",
    "/chats/" + chatId,
    "/purchases/" + pendingId,
  ]) {
    await page.goto(base + path);
    await page
      .getByRole("heading", { name: "Estadísticas", exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Enviar", exact: true }).count(),
      0,
    );
  }
  await page.goto(base + "/settings");
  await page.getByRole("button", { name: "Oscuro", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".theme-dark"));
  await page.goto(base + "/");
  await page
    .getByRole("heading", { name: "Estadísticas", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: ".local/screenshots/platform-stats-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  const gridResults = [];
  const gridRoutes = [
    ["users", "/groups/" + group.id + "/team", ".record-table tbody"],
    ["groups", "/groups", ".record-table tbody"],
  ];
  for (const width of [320, 390, 600, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, path, selector] of gridRoutes) {
      await page.goto(base + path);
      await page.locator(selector).waitFor();
      const layout = await page.evaluate(() => {
        const horizontal = [...document.querySelectorAll("main *")]
          .filter((el) => {
            const s = getComputedStyle(el),
              r = el.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.right > 0 &&
              r.left < innerWidth &&
              ["auto", "scroll"].includes(s.overflowX) &&
              el.scrollWidth > el.clientWidth + 2
            );
          })
          .map((el) => el.className);
        return {
          width: innerWidth,
          content: document.documentElement.scrollWidth,
          horizontal,
        };
      });
      assert(
        layout.content <= width + 1,
        `${name} desborda a ${width}: ${JSON.stringify(layout)}`,
      );
      assert.deepEqual(
        layout.horizontal,
        [],
        `${name} requiere desplazarse horizontalmente a ${width}`,
      );
      const columns = await page
        .locator(selector)
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        );
      if (
        ["clients", "products", "users", "groups"].includes(name) &&
        width >= 360
      )
        assert(columns >= 2, `${name} no usa cuadrícula a ${width}`);
      gridResults.push({ name, width, columns, ...layout });
      if (
        [390, 1440].includes(width) &&
        ["clients", "products", "users"].includes(name)
      )
        await page.screenshot({
          path: `.local/screenshots/grid-${name}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/");
  await page
    .getByRole("heading", { name: "Estadísticas", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  assert.equal(
    await page
      .locator(".sidebar nav")
      .evaluate((el) => getComputedStyle(el).flexDirection),
    "column",
  );
  await page.screenshot({
    path: ".local/screenshots/grid-menu-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Cerrar navegación", exact: true })
    .click();
  await signOut();
  await signIn("browser_owner_" + suffix);
  for (const width of [320, 390, 600, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, path, selector] of [
      ["clients", "/clients", ".client-list"],
      ["products", "/inventory", ".product-grid"],
    ]) {
      await page.goto(base + path);
      await page.locator(selector).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        name + " sin desborde " + width,
      );
      const columns = await page
        .locator(selector)
        .evaluate(
          (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
        );
      if (width >= 360)
        assert(columns >= 2, name + " conserva cuadrícula " + width);
      gridResults.push({ name, width, columns });
      if ([390, 1440].includes(width))
        await page.screenshot({
          path: `.local/screenshots/grid-${name}-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
    }
  }
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/calendar", "/reports", "/clients/" + p.client_id]) {
      await page.goto(base + path);
      await page
        .locator(
          path.includes("/clients/") ? ".purchase-grid" : ".record-table tbody",
        )
        .waitFor();
      const layout = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        horizontal: [...document.querySelectorAll("main *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.width > 0 &&
              ["auto", "scroll"].includes(getComputedStyle(el).overflowX) &&
              el.scrollWidth > el.clientWidth + 2
            );
          })
          .map((el) => el.className),
      }));
      assert(
        layout.content <= width + 1,
        `Vista del dueño ${path} desborda a ${width}`,
      );
      assert.deepEqual(
        layout.horizontal,
        [],
        `Vista del dueño ${path} requiere desplazarse lateralmente`,
      );
      gridResults.push({ name: "owner" + path, width, ...layout });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/inventory");
  await page
    .getByRole("button", { name: "Editar Licuadora Oster", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page.getByLabel("Nombre", { exact: true }).inputValue(),
    "Licuadora Oster",
  );
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  // Full cash workflow: independent count -> personal payment -> saved closing -> owner review.
  await signOut();
  await signIn("browser_worker_" + suffix);
  await page.goto(base + "/purchases/" + pendingId);
  await page
    .getByRole("button", { name: "Registrar pago", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Monto recibido (₡)").fill("1000");
  await page.getByLabel("Medio de pago", { exact: true }).selectOption("mixed");
  await page.getByLabel("Efectivo (₡)", { exact: true }).fill("500");
  await page.getByLabel("SINPE (₡)", { exact: true }).fill("500");
  await page.getByLabel("Efectivo entregado (₡)", { exact: true }).fill("1000");
  await page
    .getByRole("button", { name: "Confirmar y registrar pago", exact: true })
    .click();
  await closed();
  const cashPayment = (await api("/purchases/" + pendingId)).payments.find(
    (x) => x.created_by === worker.id && x.payment_cash === 50000,
  );
  assert(cashPayment);
  assert.equal(cashPayment.cash_change, 50000);
  await page.goto(base + "/cash");
  await page
    .getByRole("heading", { name: "Contar efectivo", exact: true })
    .waitFor();
  await page
    .getByLabel("Cantidad de monedas de ₡500", { exact: true })
    .fill("1");
  assert(
    (
      await page.getByLabel("Total contado", { exact: true }).innerText()
    ).includes("500"),
  );
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "Contador sin desborde " + width,
    );
    await page.screenshot({
      path: `.local/screenshots/cash-counter-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page
    .getByRole("button", { name: "Usar este conteo en el cierre", exact: true })
    .click();
  await page.getByRole("button", { name: "Nuevo cierre", exact: true }).click();
  await page
    .getByRole("button", { name: "Actualizar resumen", exact: true })
    .click();
  await page
    .getByLabel("Fondo inicial de este intervalo (₡)", { exact: true })
    .waitFor();
  await page
    .getByLabel("Fondo inicial de este intervalo (₡)", { exact: true })
    .fill("0");
  await page
    .getByLabel("SINPE verificado en el intervalo (₡)", { exact: true })
    .fill("500");
  await page
    .getByLabel("Tarjeta verificada en el intervalo (₡)", { exact: true })
    .fill("0");
  await page
    .getByRole("button", { name: "Revisar cierre de caja", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Confirmar cierre de caja", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Confirmar y guardar cierre", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Cierre guardado", exact: true })
    .waitFor();
  const workerClosing = (await api("/register/closings")).rows[0];
  assert.equal(workerClosing.difference_cash, 0);
  const closureBefore = await api("/register/closings/" + workerClosing.id);
  await page
    .getByRole("button", { name: "Enviar al dueño", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Enviado al dueño · Pendiente de revisión",
      exact: true,
    })
    .waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "Cierre sin desborde " + width,
    );
    await page.screenshot({
      path: `.local/screenshots/cash-closing-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await signOut();
  await signIn("browser_owner_" + suffix);
  await page.goto(base + "/register");
  await page.getByLabel("Caja", { exact: true }).selectOption("team");
  await page.getByRole("button", { name: "Nuevo cierre", exact: true }).click();
  await page
    .getByRole("button", { name: "Actualizar resumen", exact: true })
    .click();
  await page
    .getByLabel("Fondo inicial de este intervalo (₡)", { exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "Cierre de caja", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Historial de cierres", exact: true })
    .click();
  await page.getByLabel("Caja", { exact: true }).selectOption("inbox");
  await page.getByRole("button", { name: "Ver cierre", exact: true }).click();
  await page
    .getByRole("button", { name: "Marcar revisado", exact: true })
    .waitFor();
  await page
    .getByLabel("Nota para el polaco", { exact: true })
    .fill("Recibido y verificado en navegador");
  await page
    .getByRole("button", { name: "Marcar revisado", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Revisado por el dueño", exact: true })
    .waitFor();
  await page.reload();
  await page.getByLabel("Caja", { exact: true }).selectOption("inbox");
  await page.getByRole("button", { name: "Ver cierre", exact: true }).click();
  const closureAfter = await api("/register/closings/" + workerClosing.id);
  assert.deepEqual(closureAfter.snapshot, closureBefore.snapshot);
  assert.equal(closureAfter.review_note, "Recibido y verificado en navegador");
  await page.screenshot({
    path: ".local/screenshots/cash-owner-reviewed.png",
    fullPage: true,
    animations: "disabled",
  });
  await signOut();
  await signIn(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
  await page.goto(base + "/groups/" + group.id + "/register");
  await page
    .getByRole("heading", { name: "Uso de la página", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Cierre guardado", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(
    await page
      .getByRole("navigation", { name: "Administración del grupo" })
      .getByRole("button")
      .allTextContents(),
    ["Estadísticas", "Usuarios"],
  );
  await writeFile(
    ".local/grid-layout-result.json",
    JSON.stringify(gridResults, null, 2),
  );
  if (process.env.VERIFY_REDEPLOY === "1") {
    assert(
      process.env.TEST_BASE_URL,
      "El redespliegue requiere una URL pública explícita",
    );
    const run = promisify(execFile);
    const deployments = async () =>
      JSON.parse(
        (
          await run("railway", [
            "deployment",
            "list",
            "--service",
            "polacos-demo",
            "--json",
          ])
        ).stdout,
      );
    const before = (await deployments())[0].id;
    const chatBefore = await api("/conversations/" + chatId);
    const attachments = chatBefore.messages.items.filter((m) => m.file_id);
    assert.equal(attachments.length, 3);
    const hashes = new Map();
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    for (const m of attachments) {
      const response = await context.request.get(
        base + "/api/files/" + m.file_id,
      );
      assert.equal(response.status(), 200);
      hashes.set(m.file_id, hash(await response.body()));
    }
    await run("railway", [
      "redeploy",
      "--service",
      "polacos-demo",
      "--yes",
      "--json",
    ]);
    console.log(
      "Redespliegue solicitado para verificar texto, imagen, audio y archivo",
    );
    for (let i = 0; i < 36; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const current = (await deployments())[0];
      if (current.id === before) continue;
      assert(
        !["FAILED", "CRASHED", "REMOVED"].includes(current.status),
        "Falló el redespliegue: " + current.status,
      );
      if (current.status === "SUCCESS") {
        redeploy = { id: current.id, status: current.status };
        break;
      }
    }
    assert(redeploy, "El redespliegue no terminó dentro del plazo");
    await page.goto(base + "/chats/" + chatId);
    await page.getByText("Segunda nota persistente", { exact: true }).waitFor();
    await page.getByRole("img", { name: "foto.png" }).waitFor();
    await page.locator("audio").waitFor();
    for (const m of attachments) {
      const response = await context.request.get(
        base + "/api/files/" + m.file_id,
      );
      assert.equal(response.status(), 200);
      assert.equal(hash(await response.body()), hashes.get(m.file_id));
    }
    console.log(
      "Persistencia tras redespliegue: sesión, texto y bytes de los 3 adjuntos idénticos",
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Navegador: grupo, cupos, usuarios, inventario, cliente, reserva, aprobación, capital, parcial, chat, archivo, audio, retiro de soporte, estadísticas de plataforma, administración de grupos, paleta, modos, recarga y cuadrículas de 320 a 1440 px: OK",
  );
  await writeFile(
    ".local/browser-result.json",
    JSON.stringify(
      {
        ok: true,
        base,
        viewports: [320, 390, 600, 820, 1440],
        screenshots: ".local/screenshots",
        errors,
        redeploy,
      },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot({
    path: ".local/screenshots/failure.png",
    fullPage: true,
    animations: "disabled",
  });
  console.error("Browser failure:", e.message);
  throw e;
} finally {
  await browser.close();
  for (const id of groups) await cleanupGroup(pool, id);
  if (app) await app.locals.shutdown();
  if (server) await new Promise((r) => server.close(r));
  await pool.end();
}
