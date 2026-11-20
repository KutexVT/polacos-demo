import express from "express";
import helmet from "helmet";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pool, one, check } from "./db.js";
import { seedDemo } from "./demo.js";
import { migrate } from "./migrate.js";
import { bootstrap, authenticate, authRoutes } from "./auth.js";
import { routes } from "./routes.js";
import { collaborationRoutes } from "./collaboration.js";
import { lifecycleRoutes, runJobs } from "./lifecycle.js";
import { adminRoutes, adminAccess } from "./admin.js";
import { reportRoutes } from "./reports.js";
import { registerRoutes } from "./register.js";
export async function createApp() {
  await migrate();
  await bootstrap();
  await seedDemo();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "blob:", "data:"],
          mediaSrc: ["'self'", "blob:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "polacos" });
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        if (req.headers.origin)
          check(
            req.headers.origin === process.env.APP_ORIGIN ||
              (!process.env.APP_ORIGIN &&
                req.headers.origin === `${req.protocol}://${req.get("host")}`),
            "Origen no autorizado",
            403,
          );
        check(
          req.is("application/json") ||
            (req.path === "/files" && req.is("multipart/form-data")),
          "Formato de solicitud no permitido",
          415,
        );
      }
      next();
    } catch (e) {
      next(e);
    }
  });
  authRoutes(app);
  app.use("/api", authenticate);
  app.use("/api", adminAccess);
  adminRoutes(app);
  routes(app);
  collaborationRoutes(app);
  lifecycleRoutes(app);
  reportRoutes(app);
  registerRoutes(app);
  const streams = new Map();
  let listener;
  app.get("/api/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const id = req.user.id;
    const set = streams.get(id) || new Set();
    set.add(res);
    streams.set(id, set);
    res.write("event: ready\ndata: {}\n\n");
    const timer = setInterval(async () => {
      try {
        if (
          !(await one(
            pool,
            "SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now() AND u.deleted_at IS NULL",
            [req.sessionHash],
          ))
        )
          return res.end();
        res.write(": heartbeat\n\n");
      } catch {
        res.end();
      }
    }, 10000);
    req.on("close", () => {
      clearInterval(timer);
      set.delete(res);
      if (!set.size) streams.delete(id);
    });
  });
  async function listen() {
    listener = await pool.connect();
    listener.on("notification", (m) => {
      for (const res of streams.get(m.payload) || [])
        res.write("event: update\ndata: {}\n\n");
    });
    listener.on("error", () => {
      listener.release(true);
      for (const set of streams.values()) for (const res of set) res.end();
      if (!app.locals.closed)
        setTimeout(() => listen().catch(console.error), 2000).unref();
    });
    await listener.query("LISTEN polacos");
  }
  await listen();
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Operación no disponible" }),
  );
  const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
  app.use(express.static(dist, { maxAge: "1h", index: false }));
  app.get("/{*path}", (req, res) =>
    res.sendFile(resolve(dist, "index.html"), {
      headers: { "Cache-Control": "no-cache" },
    }),
  );
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.name === "ZodError")
      return res.status(400).json({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" · "),
      });
    if (err.code === "23505")
      return res
        .status(409)
        .json({ error: "Ese nombre de usuario o registro ya existe" });
    if (["22P02", "23503", "23514"].includes(err.code))
      return res.status(400).json({
        error: "Los datos no son válidos o el registro ya no está disponible",
      });
    if (err.code === "LIMIT_FILE_SIZE")
      return res
        .status(400)
        .json({ error: "El archivo supera el límite de 10 MB" });
    if (!err.status) console.error(err);
    res.status(err.status || 500).json({
      error: err.status
        ? err.message
        : "No se pudo completar la operación. Intenta de nuevo",
    });
  });
  app.locals.shutdown = async () => {
    app.locals.closed = true;
    for (const set of streams.values()) for (const res of set) res.end();
    await listener.query("UNLISTEN polacos");
    listener.release();
  };
  return app;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createApp();
  // Finish overdue deletions before serving data from a restored database.
  await runJobs();
  const server = app.listen(Number(process.env.PORT) || 3210, "0.0.0.0", () =>
    console.log(`Polacos en http://localhost:${process.env.PORT || 3210}`),
  );
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runJobs();
    } catch (e) {
      console.error("Tareas:", e.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 60000);
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, async () => {
      clearInterval(timer);
      await app.locals.shutdown();
      server.close();
      await pool.end();
      process.exit(0);
    });
}
