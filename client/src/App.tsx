import React, { useEffect, useMemo, useState } from "react";

type User = { id: number; name: string; role: string; active: boolean };
type Cell = { cells: string[]; notified: boolean[] };
type Board = Record<string, Cell>;

const RUN_HEADERS = ["AM 1st", "AM 2nd", "AM 3rd", "AM 4th", "PM 1st", "PM 2nd", "PM 3rd", "PM 4th"];

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

function Login({ onAuthed }: { onAuthed: (u: User) => void }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    try {
      const u = await api<User>("/api/login", { method: "POST", body: JSON.stringify({ name, pin }) });
      onAuthed(u);
    } catch (e: any) {
      setErr(e.message || "Login failed");
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", padding: 16, border: "1px solid #ddd", borderRadius: 10 }}>
      <h2 style={{ marginTop: 0 }}>Transportation Dispatcher</h2>
      <div style={{ display: "grid", gap: 10 }}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
        <button onClick={submit}>Login</button>
        {err ? <div style={{ color: "crimson", fontSize: 13 }}>{err}</div> : null}
      </div>
    </div>
  );
}

function TopBar({
  user,
  date,
  setDate,
  onPrint,
  onLogout,
}: {
  user: User;
  date: string;
  setDate: (d: string) => void;
  onPrint: () => void;
  onLogout: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h2 style={{ margin: 0 }}>Transportation Dispatcher</h2>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Logged in as <b>{user.name}</b> ({user.role})
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button onClick={onPrint}>Print (Portrait)</button>
        <button onClick={onLogout}>Logout</button>
      </div>
    </div>
  );
}

function SectionRow({ label }: { label: string }) {
  return (
    <tr className="section-row">
      <td colSpan={9}>{label}</td>
    </tr>
  );
}

function RosterBoard({
  date,
  board,
  setBoard,
  onGenerate,
  onSave,
}: {
  date: string;
  board: Board;
  setBoard: (b: Board) => void;
  onGenerate: () => void;
  onSave: () => void;
}) {
  const routes = useMemo(() => Object.keys(board), [board]);

  const driverRoutes = useMemo(() => routes.filter((r) => !r.endsWith("A")), [routes]);
  const assistantRoutes = useMemo(() => routes.filter((r) => r.endsWith("A")), [routes]);

  function updateCell(route: string, idx: number, val: string) {
    const next: Board = { ...board, [route]: { ...board[route], cells: [...board[route].cells] } };
    next[route].cells[idx] = val;
    setBoard(next);
  }

  function toggleNotified(route: string, idx: number) {
    const next: Board = { ...board, [route]: { ...board[route], notified: [...board[route].notified] } };
    next[route].notified[idx] = !next[route].notified[idx];
    setBoard(next);
  }

  const renderRows = (rows: string[], includeSections: boolean) => {
    const out: JSX.Element[] = [];
    let insertedESE = false;

    if (includeSections) out.push(<SectionRow key="__basic__" label="BASIC ROUTES (Z500–Z521)" />);

    for (const route of rows) {
      if (includeSections) {
        if (!insertedESE && route.startsWith("Z560")) {
          out.push(<SectionRow key="__ese__" label="ESE ROUTES (Z560–Z588)" />);
          insertedESE = true;
        }
      }

      const row = board[route];
      out.push(
        <tr key={route}>
          <td className="route-col">{route}</td>
          {row.cells.map((v, i) => (
            <td key={i} className={"run-col " + (i < 4 ? "am" : "pm")}>
              <input className="cell-input" value={v} onChange={(e) => updateCell(route, i, e.target.value)} />
              <div className="cell-footer">
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={!!row.notified[i]} onChange={() => toggleNotified(route, i)} />
                  <span style={{ fontSize: 11, opacity: 0.85 }}>Notified</span>
                </label>
                {row.notified[i] ? <span title="Notified">✔</span> : null}
              </div>
            </td>
          ))}
        </tr>
      );
    }
    return out;
  };

  const chunk = (arr: string[], n: number) => {
    const chunks: string[][] = [];
    for (let i = 0; i < arr.length; i += n) chunks.push(arr.slice(i, i + n));
    return chunks;
  };

  const driverChunks = chunk(driverRoutes, 28);
  const assistantChunks = chunk(assistantRoutes, 28);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button onClick={onGenerate}>Generate Coverage</button>
        <button onClick={onSave}>Save</button>
      </div>

      <h3 style={{ margin: "10px 0 6px" }}>Roster Board (Inventory)</h3>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
        Lists all routes with default assignments (OPEN where unassigned). Print splits into Drivers then Assistants, 28 rows/page.
      </div>

      <div className="daysheet-wrap">
        {driverChunks.map((rows, idx) => (
          <div key={"drv_" + idx} className="print-page">
            <div className="print-page-title">Drivers – Page {idx + 1}</div>
            <table className="daysheet-grid" style={{ marginTop: 6 }}>
              <thead>
                <tr>
                  <th className="route-col">Route</th>
                  {RUN_HEADERS.map((h, i) => (
                    <th key={i} className={(i < 4 ? "am " : "pm ") + "run-col"}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{renderRows(rows, idx === 0)}</tbody>
            </table>
          </div>
        ))}

        {assistantChunks.map((rows, idx) => (
          <div key={"asst_" + idx} className="print-page">
            <div className="print-page-title">Assistants – Page {idx + 1}</div>
            <table className="daysheet-grid" style={{ marginTop: 6 }}>
              <thead>
                <tr>
                  <th className="route-col">Route</th>
                  {RUN_HEADERS.map((h, i) => (
                    <th key={i} className={(i < 4 ? "am " : "pm ") + "run-col"}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{renderRows(rows, idx === 0)}</tbody>
            </table>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, marginTop: 10 }}>
        <div>AM is highlighted yellow; PM is highlighted orange; prints in portrait.</div>
      </div>
    </div>
  );
}

function DaySheetTab({ date }: { date: string }) {
  type OpsCell = { value: string; notified: boolean };
  type OpsRow = {
    route: string;
    employee: string;
    rtn: string;
    leaveCode: string;
    am: OpsCell[]; // 5 cells (1-4 + Add'l 5)
    pm: OpsCell[]; // 5 cells (1-4 + Add'l 5)
  };
  type OpsBlocks = {
    other: string;
    reliefDrivers: string;
    officeStaff: string;
    busService: string;
    outOfService: string;
  };
  type OpsSheet = { date: string; drivers: OpsRow[]; assistants: OpsRow[]; blocks: OpsBlocks };

  const [sheet, setSheet] = useState<OpsSheet | null>(null);
  const [routes, setRoutes] = useState<any[]>([]);
  const [err, setErr] = useState("");

  const rtnOptions = ["", "YES", "NO"];
  const leaveCodeOptions = ["", "SIK", "FMLA", "WC", "PRS"]; // you will provide the full list later

  const employeeOptions = useMemo(() => {
    const names = new Set<string>();
    for (const r of routes) {
      if (r.default_driver) names.add(String(r.default_driver).trim());
      if (r.default_assistant) names.add(String(r.default_assistant).trim());
    }
    names.add("OPEN");
    // remove blanks
    const arr = Array.from(names).filter((x) => x && x !== "null" && x !== "undefined");
    arr.sort((a, b) => a.localeCompare(b));
    return arr;
  }, [routes]);

  const routeOptions = useMemo(() => {
    const arr = routes.map((r) => r.code);
    return arr;
  }, [routes]);

  const load = async () => {
    setErr("");
    try {
      const rts = await api<any[]>("/api/routes");
      setRoutes(rts || []);
      const ds = await api<OpsSheet>(`/api/ops-daysheet?date=${date}`);
      setSheet(ds);
    } catch (e: any) {
      setErr(e.message || "Failed to load Day Sheet");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const save = async () => {
    if (!sheet) return;
    setErr("");
    try {
      await api("/api/ops-daysheet", { method: "POST", body: JSON.stringify(sheet) });
    } catch (e: any) {
      setErr(e.message || "Failed to save");
    }
  };

  const makeCells = (n = 5): { value: string; notified: boolean }[] =>
    Array.from({ length: n }, () => ({ value: "", notified: false }));

  const addRow = (mode: "drivers" | "assistants") => {
    if (!sheet) return;
    const next: OpsSheet = JSON.parse(JSON.stringify(sheet));
    next[mode].push({ route: "", employee: "", rtn: "", leaveCode: "", am: makeCells(), pm: makeCells() });
    setSheet(next);
  };

  const updateRowField = (mode: "drivers" | "assistants", idx: number, field: keyof OpsRow, val: string) => {
    if (!sheet) return;
    const next: OpsSheet = JSON.parse(JSON.stringify(sheet));
    // @ts-ignore
    next[mode][idx][field] = val;
    setSheet(next);
  };

  const updateCell = (
    mode: "drivers" | "assistants",
    idx: number,
    part: "am" | "pm",
    cidx: number,
    val: string
  ) => {
    if (!sheet) return;
    const next: OpsSheet = JSON.parse(JSON.stringify(sheet));
    next[mode][idx][part][cidx].value = val;
    setSheet(next);
  };

  const toggleNotified = (mode: "drivers" | "assistants", idx: number, part: "am" | "pm", cidx: number) => {
    if (!sheet) return;
    const next: OpsSheet = JSON.parse(JSON.stringify(sheet));
    next[mode][idx][part][cidx].notified = !next[mode][idx][part][cidx].notified;
    setSheet(next);
  };

  const renderGrid = (title: string, mode: "drivers" | "assistants") => {
    if (!sheet) return null;
    const rows = sheet[mode];

    const headerCols = ["1st", "2nd", "3rd", "4th", "Add'l 5"];

    return (
      <div className="print-page">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{title}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Transportation SOUTHEAST — {date}</div>
          </div>
          <button onClick={() => addRow(mode)}>Add Row</button>
        </div>

        <table className="ops-grid" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th className="ops-route">Route</th>
              <th className="ops-emp">Employee</th>
              <th className="ops-rtn">RTN</th>
              <th className="ops-leave">Leave Code</th>
              {headerCols.map((h) => (
                <th key={h} className="ops-run">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <React.Fragment key={i}>
                {/* AM row */}
                <tr className="ops-am-row">
                  <td className="ops-route">
                    <select value={row.route} onChange={(e) => updateRowField(mode, i, "route", e.target.value)}>
                      <option value=""></option>
                      {routeOptions.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td className="ops-emp">
                    <input list={"empList"} value={row.employee} onChange={(e) => updateRowField(mode, i, "employee", e.target.value)} />
                  </td>
                  <td className="ops-rtn">
                    <select value={row.rtn} onChange={(e) => updateRowField(mode, i, "rtn", e.target.value)}>
                      {rtnOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ops-leave">
                    <select value={row.leaveCode} onChange={(e) => updateRowField(mode, i, "leaveCode", e.target.value)}>
                      {leaveCodeOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </td>
                  {row.am.map((c, cidx) => (
                    <td
                      key={"am" + cidx}
                      className={"ops-run " + (c.notified ? "am-notified" : "am-default")}
                    >
                      <input
                        list={"runList"}
                        className="ops-cell"
                        value={c.value}
                        onChange={(e) => updateCell(mode, i, "am", cidx, e.target.value)}
                      />
                      <label className="ops-notify">
                        <input type="checkbox" checked={!!c.notified} onChange={() => toggleNotified(mode, i, "am", cidx)} />
                      </label>
                    </td>
                  ))}
                </tr>

                {/* PM row */}
                <tr className="ops-pm-row">
                  <td className="ops-route" />
                  <td className="ops-emp" />
                  <td className="ops-rtn" />
                  <td className="ops-leave" />
                  {row.pm.map((c, cidx) => (
                    <td
                      key={"pm" + cidx}
                      className={"ops-run " + (c.notified ? "pm-notified" : "pm-default")}
                    >
                      <input
                        list={"runList"}
                        className="ops-cell"
                        value={c.value}
                        onChange={(e) => updateCell(mode, i, "pm", cidx, e.target.value)}
                      />
                      <label className="ops-notify">
                        <input type="checkbox" checked={!!c.notified} onChange={() => toggleNotified(mode, i, "pm", cidx)} />
                      </label>
                    </td>
                  ))}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <datalist id="empList">
          {employeeOptions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
<datalist id="runList">
  {["Julia", "Noel", "Lizette", "Ray", "Nic", "Rachael", "Myra", "Jeff"].map((n) => (
    <option key={"p-" + n} value={n} />
  ))}
  {routeOptions.map((r) => (
    <option key={"r-" + r} value={r} />
  ))}
</datalist>

      </div>
    );
  };

  const renderBlocks = () => {
    if (!sheet) return null;
    return (
      <div className="print-page">
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>Additional Blocks (Print Page 3)</div>
        <div className="blocks-grid">
          <div>
            <div className="block-title">OTHER</div>
            <textarea value={sheet.blocks.other} onChange={(e) => setSheet({ ...sheet, blocks: { ...sheet.blocks, other: e.target.value } })} />
          </div>
          <div>
            <div className="block-title">RELIEF DRIVERS</div>
            <textarea value={sheet.blocks.reliefDrivers} onChange={(e) => setSheet({ ...sheet, blocks: { ...sheet.blocks, reliefDrivers: e.target.value } })} />
          </div>
          <div>
            <div className="block-title">OFFICE STAFF</div>
            <textarea value={sheet.blocks.officeStaff} onChange={(e) => setSheet({ ...sheet, blocks: { ...sheet.blocks, officeStaff: e.target.value } })} />
          </div>
          <div>
            <div className="block-title">Bus Service</div>
            <textarea value={sheet.blocks.busService} onChange={(e) => setSheet({ ...sheet, blocks: { ...sheet.blocks, busService: e.target.value } })} />
          </div>
          <div>
            <div className="block-title">Out of Service Buses</div>
            <textarea value={sheet.blocks.outOfService} onChange={(e) => setSheet({ ...sheet, blocks: { ...sheet.blocks, outOfService: e.target.value } })} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={save}>Save Day Sheet</button>
        <button onClick={load}>Reload</button>
      </div>
      {err ? <div style={{ color: "crimson", marginBottom: 10 }}>{err}</div> : null}
      {!sheet ? <div>Loading…</div> : null}

      {sheet ? (
        <div className="daysheet-wrap">
          {renderGrid("DAY SHEET — DRIVERS", "drivers")}
          {renderGrid("DAY SHEET — ASSISTANTS (A Routes)", "assistants")}
          {renderBlocks()}
        </div>
      ) : null}

      <div style={{ fontSize: 12, opacity: 0.85, marginTop: 10 }}>
        AM cells default white → Yellow when notified. PM cells default blue → Green when notified.
      </div>
    </div>
  );
}

function CalloutsTab() {
  return (
    <div>
      <h3 style={{ margin: "10px 0 6px" }}>Call-Outs + Coverage Options</h3>
      <div style={{ fontSize: 13, lineHeight: 1.4, maxWidth: 980 }}>
        Coming next: enter driver/assistant call-outs (by AM/PM segment and run), generate 1–3 coverage options using your priority
        rules (relief first, supervisors next, cross-depot as last resort). Choosing an option will populate the Day Sheet.
      </div>
    </div>
  );
}


function AdminPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("dispatcher");
  const [err, setErr] = useState("");

  const refresh = async () => {
    try {
      setUsers(await api<User[]>("/api/users"));
    } catch (e: any) {
      setErr(e.message || "Failed to load users");
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const addOrUpdate = async () => {
    setErr("");
    try {
      await api<{ ok: boolean }>("/api/users", { method: "POST", body: JSON.stringify({ name, pin, role }) });
      setName("");
      setPin("");
      await refresh();
    } catch (e: any) {
      setErr(e.message || "Failed");
    }
  };

  const toggle = async (id: number) => {
    await api<{ ok: boolean }>(`/api/users/${id}/toggle`, { method: "POST" });
    await refresh();
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h3>Admin – Users</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <b>Add/Update User</b>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="admin">admin</option>
          <option value="dispatcher">dispatcher</option>
        </select>
        <button onClick={addOrUpdate}>Add/Update User</button>
      </div>
      {err ? <div style={{ color: "crimson", fontSize: 13 }}>{err}</div> : null}

      <table className="daysheet-grid">
        <thead>
          <tr>
            <th className="route-col">Name</th>
            <th className="run-col">Role</th>
            <th className="run-col">Active</th>
            <th className="run-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="route-col">{u.name}</td>
              <td className="run-col">{u.role}</td>
              <td className="run-col">{String(u.active)}</td>
              <td className="run-col">
                <button onClick={() => toggle(u.id)}>Toggle Active</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [date, setDate] = useState(todayISO());
  const [board, setBoard] = useState<Board>({});
  const [activeTab, setActiveTab] = useState<"roster" | "daysheet" | "callouts">("roster");
  const [err, setErr] = useState("");

  const load = async () => {
    setErr("");
    try {
      const me = await api<User>("/api/me");
      setUser(me);
      const ds = await api<{ date: string; board: Board }>(`/api/daysheet?date=${date}`);
      setBoard(ds.board || {});
    } catch (e: any) {
      if ((e.message || "").includes("Not signed")) return;
      setErr(e.message || "Failed to load");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const onAuthed = async (u: User) => {
    setUser(u);
    await load();
  };

  const logout = async () => {
    await api("/api/logout", { method: "POST" });
    setUser(null);
  };

  const generate = async () => {
    const r = await api<{ date: string; board: Board }>(`/api/generate?date=${date}`);
    setBoard(r.board);
  };

  const save = async () => {
    await api("/api/daysheet", { method: "POST", body: JSON.stringify({ date, board }) });
  };

  const print = () => window.print();

  if (!user) return <Login onAuthed={onAuthed} />;

  return (
    <div style={{ padding: 14 }}>
      <TopBar user={user} date={date} setDate={setDate} onPrint={print} onLogout={logout} />
      {err ? <div style={{ color: "crimson", marginBottom: 10 }}>{err}</div> : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setActiveTab("roster")} disabled={activeTab === "roster"}>
          Roster Board
        </button>
        <button onClick={() => setActiveTab("daysheet")} disabled={activeTab === "daysheet"}>
          Day Sheet
        </button>
        <button onClick={() => setActiveTab("callouts")} disabled={activeTab === "callouts"}>
          Call-Outs
        </button>
      </div>

      {activeTab === "roster" ? (
        <RosterBoard date={date} board={board} setBoard={setBoard} onGenerate={generate} onSave={save} />
      ) : null}
      {activeTab === "daysheet" ? <DaySheetTab date={date} /> : null}
      {activeTab === "callouts" ? <CalloutsTab /> : null}

      {activeTab === "admin" && user.role === "admin" ? <AdminPanel /> : null}
    </div>
  );
}
