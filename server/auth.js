import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { pool, tx, one, check } from "./db.js";
const scrypt = promisify(scryptCb);
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password) {
  check(
    typeof password === "string" &&
      password.length >= 12 &&
      password.length <= 128,
    "La contraseña necesita entre 12 y 128 caracteres",
  );
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64, {
    N: 32768,
    maxmem: 64 * 1024 * 1024,
  });
  return salt + ":" + hash.toString("hex");
}
async function verify(password, hash) {
  const [salt, expected] = hash.split(":");
  const actual = await scrypt(String(password), salt, 64, {
    N: 32768,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
export function publicUser(u) {
  const { password_hash, ...safe } = u;
  return safe;
}
export async function bootstrap() {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) return;
  await tx(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(290118)");
    if (!(await one(db, "SELECT id FROM users WHERE role='admin'")))
      await db.query(
        "INSERT INTO users(role,name,username,password_hash) VALUES('admin',$1,$2,$3)",
        [
          process.env.ADMIN_NAME || "Administrador",
          process.env.ADMIN_USERNAME.toLowerCase(),
          await hashPassword(process.env.ADMIN_PASSWORD),
        ],
      );
  });
}
export async function authenticate(req, res, next) {
  try {
    const token = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("polacos="))
      ?.slice(8);
    check(token, "Inicia sesión para continuar", 401);
    const u = await one(
      pool,
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.deleted_at IS NULL",
      [digest(token)],
    );
    check(u, "Tu sesión terminó. Inicia sesión de nuevo", 401);
    if (u.role !== "admin")
      await pool.query(
        `INSERT INTO platform_usage_daily(user_id,group_id,day) VALUES($1,$2,(clock_timestamp() AT TIME ZONE 'America/Costa_Rica')::date) ON CONFLICT(user_id,day) DO UPDATE SET last_seen_at=clock_timestamp() WHERE platform_usage_daily.last_seen_at<clock_timestamp()-interval '1 minute'`,
        [u.id, u.group_id],
      );
    req.user = u;
    req.sessionHash = digest(token);
    next();
  } catch (e) {
    next(e);
  }
}
async function limitIp(req, prefix = "ip") {
  const ipKey = digest(prefix + "|" + req.ip);
  const ipAttempts = await one(
    pool,
    "INSERT INTO login_attempts(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.reset_at<now() THEN 1 ELSE login_attempts.attempts+1 END,reset_at=CASE WHEN login_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE login_attempts.reset_at END RETURNING attempts",
    [ipKey],
  );
  check(
    ipAttempts.attempts <= 120,
    "Demasiados intentos desde esta conexión. Espera 15 minutos",
    429,
  );
}
async function startSession(req, res, user) {
  const old = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("polacos="))
    ?.slice(8);
  if (old)
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [digest(old)]);
  await pool.query("DELETE FROM sessions WHERE expires_at<now()");
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [digest(token), user.id],
  );
  res.cookie("polacos", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 86400000,
    path: "/",
  });
  res.json({ user: publicUser(user) });
}
export function authRoutes(app) {
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    check(
      typeof username === "string" &&
        username.length <= 100 &&
        typeof password === "string" &&
        password.length <= 128,
      "Usuario o contraseña incorrectos",
      401,
    );
    await limitIp(req);
    const key = digest(req.ip + "|" + username.toLowerCase());
    const allowed = await tx(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        key,
      ]);
      await db.query(
        "INSERT INTO login_attempts(key,attempts,reset_at) VALUES($1,0,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.reset_at<now() THEN 0 ELSE login_attempts.attempts END,reset_at=CASE WHEN login_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE login_attempts.reset_at END",
        [key],
      );
      const r = await one(
        db,
        "UPDATE login_attempts SET attempts=attempts+1 WHERE key=$1 RETURNING attempts",
        [key],
      );
      return r.attempts <= 12;
    });
    check(allowed, "Demasiados intentos. Espera 15 minutos", 429);
    const user = await one(
      pool,
      "SELECT * FROM users WHERE username=$1 AND deleted_at IS NULL",
      [username.toLowerCase()],
    );
    const dummy = "0".repeat(32) + ":" + "0".repeat(128);
    const valid = await verify(password, user?.password_hash || dummy);
    check(user && valid, "Usuario o contraseña incorrectos", 401);
    await pool.query("DELETE FROM login_attempts WHERE key=$1", [key]);
    await startSession(req, res, user);
  });
  // Only the two fixed demo profiles can bypass a password. Administrators use /login.
  app.post("/api/entry", async (req, res) => {
    check(
      req.body &&
        ["owner", "polaco"].includes(req.body.role) &&
        Object.keys(req.body).length === 1,
      "Elige Dueño o Polaco",
      400,
    );
    await limitIp(req, "entry");
    const user = await one(
      pool,
      "SELECT u.* FROM demo_state d JOIN users u ON u.id=CASE WHEN $1='owner' THEN d.owner_id ELSE d.polaco_id END WHERE d.id AND u.role=$1 AND u.deleted_at IS NULL",
      [req.body.role],
    );
    check(
      user,
      "Este perfil de prueba no está disponible. El administrador puede restaurarlo desde Grupos",
      404,
    );
    await startSession(req, res, user);
  });
  app.post("/api/logout", authenticate, async (req, res) => {
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      req.sessionHash,
    ]);
    res.clearCookie("polacos", { path: "/" });
    res.json({ ok: true });
  });
}
