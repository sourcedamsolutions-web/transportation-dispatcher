const path = require("path");
const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
require("dotenv").config();

const APP_NAME = process.env.APP_NAME || "Transportation Dispatcher";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ADMIN_NAME = process.env.ADMIN_NAME || "Ray";
const ADMIN_PIN = process.env.ADMIN_PIN || "619511";
const PORT = process.env.PORT || 10000;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Add it in Render → Environment.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function seedRoutesIfNeeded() {
  const count = await pool.query("select count(*)::int as n from routes");
  if ((count.rows[0]?.n || 0) > 0) return;

  const rosterPath = path.join(__dirname, "roster.json");
  if (!fs.existsSync(rosterPath)) {
    throw new Error("Missing server/roster.json in the repo (upload it to GitHub).");
  }

  const roster = JSON.parse(fs.readFileSync(rosterPath, "utf8"));
  for (const r of roster) {
    await pool.query(
      "insert into routes (code, category, requires_assistant, default_driver, default_assistant, bus) " +
        "values ($1,$2,$3,$4,$5,$6) " +
        "on conflict (code) do nothing",
      [
        r.code,
        r.category,
        !!r.requires_assistant,
        r.default_driver || null,
        r.default_assistant || null,
        r.bus || null,
      ]
    );
  }
  console.log(`✅ Seeded ${roster.length} routes into routes table`);
}

async function initDb() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);

  // Ensure admin user exists
  const pin_hash = await bcrypt.hash(String(ADMIN_PIN), 10);
  await pool.query(
    "insert into users (name, pin_hash, role, active) " +
      "values ($1,$2,'admin',true) " +
      "on conflict (name) do update set role='admin', active=true",
    [ADMIN_NAME, pin_hash]
  );

  await seedRoutesIfNeeded();
}

function signToken(user) {
  return jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, {
    expiresIn: "12h",
  });
}

function authRequired(req, res, next) {
  const token = req.cookies?.session;
  if (!token) return res.status(401).send("Not signed in");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).send("Invalid session");
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).send("Not signed in");
    if (!roles.includes(req.user.role)) return res.status(403).send("Forbidden");
    next();
  };
}

async function getRouteCodesOrdered() {
  const r = await pool.query(
    "select code, default_driver, default_assistant " +
      "from routes " +
      "order by " +
      "cast(substring(code from 2 for 3) as int), " +
      "case when right(code,1)='A' then 1 else 0 end"
  );
  return r.rows;
}

function buildDefaultBoard(routeRows) {
  const board = {};
  for (const r of routeRows) {
    const cells = Array(8).fill("");
    const notified = Array(8).fill(false);

    // Prefill AM 1st cell with default roster assignment (or OPEN)
    const prefill = (r.code.endsWith("A") ? r.default_assistant : r.default_driver) || "OPEN";
    cells[0] = prefill;

    board[r.code] = { cells, notified };
  }
  return board;
}

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Health
app.get("/api/health", (req, res) => res.json({ ok: true, app: APP_NAME }));

// Auth
app.post("/api/login", async (req, res) => {
  const { name, pin } = req.body || {};
  if (!name || !pin) return res.status(400).send("Name and PIN required");

  const r = await pool.query("select * from users where name=$1", [name]);
  if (r.rowCount === 0) return res.status(401).send("Invalid credentials");

  const u = r.rows[0];
  if (!u.active) return res.status(403).send("User is inactive");

  const ok = await bcrypt.compare(String(pin), u.pin_hash);
  if (!ok) return res.status(401).send("Invalid credentials");

  const token = signToken(u);
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
  });

  res.json({ id: u.id, name: u.name, role: u.role, active: u.active });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("session");
  res.json({ ok: true });
});

app.get("/api/me", authRequired, async (req, res) => {
  const r = await pool.query("select id,name,role,active from users where id=$1", [req.user.id]);
  if (r.rowCount === 0) return res.status(401).send("Not signed in");
  res.json(r.rows[0]);
});

// Users (admin only)
app.get("/api/users", authRequired, requireRole(["admin"]), async (req, res) => {
  const r = await pool.query("select id,name,role,active from users order by role,name");
  res.json(r.rows);
});

app.post("/api/users", authRequired, requireRole(["admin"]), async (req, res) => {
  const { name, pin, role } = req.body || {};
  if (!name || !pin || !role) return res.status(400).send("name, pin, role required");

  const pin_hash = await bcrypt.hash(String(pin), 10);
  await pool.query(
    "insert into users (name, pin_hash, role, active) values ($1,$2,$3,true) " +
      "on conflict (name) do update set pin_hash=$2, role=$3, active=true",
    [name, pin_hash, role]
  );
  res.json({ ok: true });
});

app.post("/api/users/:id/toggle", authRequired, requireRole(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  await pool.query("update users set active = not active where id=$1", [id]);
  res.json({ ok: true });
});

// Routes
app.get("/api/routes", authRequired, async (req, res) => {
  const r = await pool.query(
    "select code, category, requires_assistant, default_driver, default_assistant, bus " +
      "from routes " +
      "order by " +
      "cast(substring(code from 2 for 3) as int), " +
      "case when right(code,1)='A' then 1 else 0 end"
  );
  res.json(r.rows);
});


// Ops Day Sheet (official template)
function makeOpsCells(n = 5) {
  return Array.from({ length: n }, () => ({ value: "", notified: false }));
}
function makeDefaultOpsRow(routeCode = "") {
  return {
    route: routeCode,
    employee: "",
    rtn: "",
    leaveCode: "",
    am: makeOpsCells(5),
    pm: makeOpsCells(5),
  };
}
function defaultBlocks() {
  return { other: "", reliefDrivers: "", officeStaff: "", busService: "", outOfService: "" };
}
async function buildDefaultOpsSheet(date) {
  // Template-based Day Sheet: 28 rows per sheet (Drivers + Assistants).
  // Dispatcher selects Route/Employee and fills runs; dropdowns enforce consistency.
  const makeRows = () => Array.from({ length: 28 }, () => makeDefaultOpsRow(""));
  return { date, drivers: makeRows(), assistants: makeRows(), blocks: defaultBlocks(), callouts: { drivers: [], assistants: [] }, coverageOptions: [], selectedOption: null };
}


// Get / Save ops day sheet inside day_sheets.data.opsDaySheet inside day_sheets.data.opsDaySheet
app.get("/api/ops-daysheet", authRequired, async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).send("date required");

  const r = await pool.query("select data from day_sheets where day=$1", [date]);
  if (r.rowCount === 0) {
    return res.json(await buildDefaultOpsSheet(date));
  }
  const data = r.rows[0].data || {};
  if (data.opsDaySheet) return res.json(data.opsDaySheet);

  // If legacy record exists but no opsDaySheet, create defaults and return
  const ds = await buildDefaultOpsSheet(date);
  return res.json(ds);
});

app.post("/api/ops-daysheet", authRequired, async (req, res) => {
  const body = req.body || {};
  if (!body.date) return res.status(400).send("date required");

  const r = await pool.query("select data from day_sheets where day=$1", [body.date]);
  const existing = r.rowCount ? r.rows[0].data || {} : {};
  const merged = { ...existing, opsDaySheet: body };

  await pool.query(
    `insert into day_sheets (day, data) values ($1, $2::jsonb)
     on conflict (day) do update set data=$2::jsonb, updated_at=now()`,
    [body.date, JSON.stringify(merged)]
  );
  res.json({ ok: true });

// ---- Coverage generation (MVP v1) ----
const RELIEF_DRIVERS = ["Julia", "Noel", "Lizette", "Myra", "Jeff"];
const SUPERVISORS_PRIMARY = ["Ray", "Nic"];
const SUPERVISORS_EXTREME = ["Rachael"];

function normName(x) { return String(x||"").trim(); }

function unique(arr) {
  const out = [];
  const seen = new Set();
  for (const a of arr) {
    const k = normName(a);
    if (!k) continue;
    if (seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}

async function getAllDriverNames() {
  const r = await pool.query("select distinct default_driver as name from routes where default_driver is not null and default_driver <> '' and right(code,1) <> 'A'");
  const names = r.rows.map(x => x.name);
  return unique([...RELIEF_DRIVERS, ...SUPERVISORS_PRIMARY, ...SUPERVISORS_EXTREME, ...names]);
}

async function getAllAssistantNames() {
  const r = await pool.query("select distinct default_assistant as name from routes where default_assistant is not null and default_assistant <> '' and right(code,1) = 'A'");
  return unique(r.rows.map(x => x.name));
}

function buildOutSet(callouts, half) {
  const out = new Set();
  for (const c of (callouts||[])) {
    const n = normName(c.name);
    if (!n) continue;
    if (half === "am" && c.amOut) out.add(n.toLowerCase());
    if (half === "pm" && c.pmOut) out.add(n.toLowerCase());
  }
  return out;
}

function covererCost(name, counts, mode) {
  const n = normName(name);
  const lc = n.toLowerCase();
  let base = 3;
  if (RELIEF_DRIVERS.map(x=>x.toLowerCase()).includes(lc)) base = 1;
  if (SUPERVISORS_PRIMARY.map(x=>x.toLowerCase()).includes(lc)) base = (mode === 2 ? 1.5 : 2);
  if (SUPERVISORS_EXTREME.map(x=>x.toLowerCase()).includes(lc)) base = 4;

  const used = counts.get(lc) || 0;
  // allow multiple assignments but penalize repeats
  return base + used * (mode === 3 ? 0.4 : 0.7);
}

function pickCoverer(candidates, counts, mode) {
  let best = null;
  let bestScore = 1e9;
  for (const c of candidates) {
    const score = covererCost(c, counts, mode);
    if (score < bestScore) { best = c; bestScore = score; }
  }
  return best;
}

async function computeCoverageOptions(date, opsDaySheet) {
  // Determine uncovered routes based on roster defaults + callouts.
  const routes = await pool.query("select code, requires_assistant, default_driver, default_assistant from routes order by cast(substring(code from 2 for 3) as int), case when right(code,1)='A' then 1 else 0 end");
  const driverOutAM = buildOutSet(opsDaySheet?.callouts?.drivers, "am");
  const driverOutPM = buildOutSet(opsDaySheet?.callouts?.drivers, "pm");
  const asstOutAM  = buildOutSet(opsDaySheet?.callouts?.assistants, "am");
  const asstOutPM  = buildOutSet(opsDaySheet?.callouts?.assistants, "pm");

  const allDrivers = await getAllDriverNames();
  const allAssistants = await getAllAssistantNames();

  const options = [];
  for (const mode of [1,2,3]) {
    const driverCountsAM = new Map();
    const driverCountsPM = new Map();
    const asstCountsAM = new Map();
    const asstCountsPM = new Map();

    const driverAssignmentsAM = [];
    const driverAssignmentsPM = [];
    const asstAssignmentsAM = [];
    const asstAssignmentsPM = [];
    const warnings = [];

    // build candidate pools (available)
    const driversAvailAM = allDrivers.filter(n => !driverOutAM.has(n.toLowerCase()));
    const driversAvailPM = allDrivers.filter(n => !driverOutPM.has(n.toLowerCase()));
    const asstAvailAM = allAssistants.filter(n => !asstOutAM.has(n.toLowerCase()));
    const asstAvailPM = allAssistants.filter(n => !asstOutPM.has(n.toLowerCase()));

    for (const r of routes.rows) {
      const code = r.code;
      const isAsst = String(code||"").toUpperCase().endsWith("A");
      if (!isAsst) {
        const def = normName(r.default_driver) || "OPEN";
        const defOutAM = (def !== "OPEN" && driverOutAM.has(def.toLowerCase()));
        const defOutPM = (def !== "OPEN" && driverOutPM.has(def.toLowerCase()));
        const needsAM = (def === "OPEN") || defOutAM;
        const needsPM = (def === "OPEN") || defOutPM;

        if (needsAM) {
          const cov = pickCoverer(driversAvailAM, driverCountsAM, mode) || "OTHER DEPOT";
          const lc = cov.toLowerCase();
          driverCountsAM.set(lc, (driverCountsAM.get(lc)||0) + 1);
          driverAssignmentsAM.push({ route: code, absent: def, cover: cov });
          if (cov === "OTHER DEPOT") warnings.push(`AM ${code}: other depot assistance needed`);
        }
        if (needsPM) {
          const cov = pickCoverer(driversAvailPM, driverCountsPM, mode) || "OTHER DEPOT";
          const lc = cov.toLowerCase();
          driverCountsPM.set(lc, (driverCountsPM.get(lc)||0) + 1);
          driverAssignmentsPM.push({ route: code, absent: def, cover: cov });
          if (cov === "OTHER DEPOT") warnings.push(`PM ${code}: other depot assistance needed`);
        }
      } else {
        const def = normName(r.default_assistant) || "OPEN";
        const defOutAM = (def !== "OPEN" && asstOutAM.has(def.toLowerCase()));
        const defOutPM = (def !== "OPEN" && asstOutPM.has(def.toLowerCase()));
        const needsAM = (def === "OPEN") || defOutAM;
        const needsPM = (def === "OPEN") || defOutPM;

        if (needsAM) {
          const cov = pickCoverer(asstAvailAM, asstCountsAM, mode) || "OTHER DEPOT";
          const lc = cov.toLowerCase();
          asstCountsAM.set(lc, (asstCountsAM.get(lc)||0) + 1);
          asstAssignmentsAM.push({ route: code, absent: def, cover: cov });
          if (cov === "OTHER DEPOT") warnings.push(`AM ${code}: other depot assistance needed`);
        }
        if (needsPM) {
          const cov = pickCoverer(asstAvailPM, asstCountsPM, mode) || "OTHER DEPOT";
          const lc = cov.toLowerCase();
          asstCountsPM.set(lc, (asstCountsPM.get(lc)||0) + 1);
          asstAssignmentsPM.push({ route: code, absent: def, cover: cov });
          if (cov === "OTHER DEPOT") warnings.push(`PM ${code}: other depot assistance needed`);
        }
      }
    }

    options.push({
      mode,
      title: mode === 1 ? "Option 1 (Relief first)" : mode === 2 ? "Option 2 (More supervisor usage)" : "Option 3 (Emergency / other depot)",
      drivers: { am: driverAssignmentsAM, pm: driverAssignmentsPM },
      assistants: { am: asstAssignmentsAM, pm: asstAssignmentsPM },
      warnings
    });
  }
  return options;
}

function reasonFor(name, callouts, half) {
  const lc = String(name||"").trim().toLowerCase();
  for (const c of (callouts||[])) {
    const n = normName(c.name).toLowerCase();
    if (n === lc) {
      if (half === "am" && c.amOut) return c.reason || "";
      if (half === "pm" && c.pmOut) return c.reason || "";
    }
  }
  return "";
}

function applyOptionToOpsSheet(ops, option) {
  // Do not destroy existing rows; fill/merge into first empty rows or matching route rows.
  const ensureRow = (rows, route) => {
    const idx = rows.findIndex(r => (r.route||"").trim().toUpperCase() === String(route).toUpperCase());
    if (idx >= 0) return rows[idx];
    const emptyIdx = rows.findIndex(r => !String(r.route||"").trim());
    const targetIdx = emptyIdx >= 0 ? emptyIdx : rows.length - 1;
    if (emptyIdx < 0) rows.push({ ...rows[rows.length-1] });
    const row = rows[targetIdx];
    row.route = route;
    return row;
  };

  // Drivers
  for (const a of option.drivers.am) {
    const row = ensureRow(ops.drivers, a.route);
    row.employee = a.absent || "OPEN";
    row.rtn = "NO";
    row.leaveCode = reasonFor(a.absent, ops.callouts?.drivers, "am");
    row.am[0].value = a.cover;
  }
  for (const a of option.drivers.pm) {
    const row = ensureRow(ops.drivers, a.route);
    row.employee = a.absent || "OPEN";
    row.rtn = "NO";
    row.leaveCode = reasonFor(a.absent, ops.callouts?.drivers, "pm");
    row.pm[0].value = a.cover;
  }

  // Assistants (A routes)
  for (const a of option.assistants.am) {
    const row = ensureRow(ops.assistants, a.route);
    row.employee = a.absent || "OPEN";
    row.rtn = "NO";
    row.leaveCode = reasonFor(a.absent, ops.callouts?.assistants, "am");
    row.am[0].value = a.cover;
  }
  for (const a of option.assistants.pm) {
    const row = ensureRow(ops.assistants, a.route);
    row.employee = a.absent || "OPEN";
    row.rtn = "NO";
    row.leaveCode = reasonFor(a.absent, ops.callouts?.assistants, "pm");
    row.pm[0].value = a.cover;
  }

  return ops;
}

// Generate options and store under opsDaySheet for the date
app.get("/api/coverage-options", authRequired, async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).send("date required");

  const r = await pool.query("select data from day_sheets where day=$1", [date]);
  const existing = r.rowCount ? (r.rows[0].data || {}) : {};
  const ops = existing.opsDaySheet || (await buildDefaultOpsSheet(date));

  const options = await computeCoverageOptions(date, ops);
  ops.coverageOptions = options;
  ops.selectedOption = null;

  const merged = { ...existing, opsDaySheet: ops };
  await pool.query(
    `insert into day_sheets (day, data) values ($1, $2::jsonb)
     on conflict (day) do update set data=$2::jsonb, updated_at=now()`,
    [date, JSON.stringify(merged)]
  );
  res.json({ options });
});

app.post("/api/apply-coverage-option", authRequired, async (req, res) => {
  const { date, optionIndex } = req.body || {};
  if (!date && date !== "") return res.status(400).send("date required");
  if (optionIndex === undefined || optionIndex === null) return res.status(400).send("optionIndex required");

  const r = await pool.query("select data from day_sheets where day=$1", [date]);
  const existing = r.rowCount ? (r.rows[0].data || {}) : {};
  const ops = existing.opsDaySheet || (await buildDefaultOpsSheet(date));
  const options = ops.coverageOptions || [];
  const opt = options[Number(optionIndex)];
  if (!opt) return res.status(400).send("invalid optionIndex");

  const updated = applyOptionToOpsSheet(ops, opt);
  updated.selectedOption = Number(optionIndex);

  const merged = { ...existing, opsDaySheet: updated };
  await pool.query(
    `insert into day_sheets (day, data) values ($1, $2::jsonb)
     on conflict (day) do update set data=$2::jsonb, updated_at=now()`, 
    [date, JSON.stringify(merged)]
  );
  res.json({ ok: true, opsDaySheet: updated });
});


});

// Day sheets
app.get("/api/daysheet", authRequired, async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).send("date required");

  const routeRows = await getRouteCodesOrdered();
  const defaultBoard = buildDefaultBoard(routeRows);

  const r = await pool.query("select data from day_sheets where day=$1", [date]);
  if (r.rowCount === 0) return res.json({ date, board: defaultBoard });

  const data = r.rows[0].data || {};
  const board = data.board || {};

  // Merge existing entries with any new routes
  for (const code of Object.keys(defaultBoard)) {
    if (!board[code]) board[code] = defaultBoard[code];
  }

  // Return sorted by route order
  const sorted = {};
  for (const row of routeRows) sorted[row.code] = board[row.code];

  res.json({ date, board: sorted, notes: data.notes || "" });
});

app.post("/api/daysheet", authRequired, async (req, res) => {
  const body = req.body || {};
  if (!body.date) return res.status(400).send("date required");

  const data = { board: body.board || {}, notes: body.notes || "" };

  await pool.query(
    "insert into day_sheets (day, data) values ($1, $2::jsonb) " +
      "on conflict (day) do update set data=$2::jsonb, updated_at=now()",
    [body.date, JSON.stringify(data)]
  );

  res.json({ ok: true });
});

// Generate (v1.1 baseline: roster default)
app.get("/api/generate", authRequired, async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).send("date required");

  const routeRows = await getRouteCodesOrdered();
  const board = buildDefaultBoard(routeRows);

  const sorted = {};
  for (const row of routeRows) sorted[row.code] = board[row.code];

  res.json({ date, board: sorted });
});

// Serve built client
const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`✅ ${APP_NAME} listening on ${PORT}`));
  })
  .catch((e) => {
    console.error("DB init failed:", e);
    process.exit(1);
  });
