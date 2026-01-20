
async function apiGet(path: string) {
  const r = await fetch(API_BASE + path, { credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}
async function apiPost(path: string, body?: any) {
  const r = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body || {})
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}
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
    document.title = `${APP_NAME} ${APP_VERSION}`;

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

function CalloutsTab({ date }: { date: string }) {
  const th: React.CSSProperties = { border: "1px solid #cfd8e3", padding: "6px 8px", background: "#f7f9fc", textAlign: "left" };
  const td: React.CSSProperties = { border: "1px solid #cfd8e3", padding: "6px 8px" };
  const tdc: React.CSSProperties = { border: "1px solid #cfd8e3", padding: "6px 8px", textAlign: "center" };
  const sel: React.CSSProperties = { width: "100%", padding: "6px 8px", border: "1px solid #cfd8e3", borderRadius: 6 };
  const btn: React.CSSProperties = { padding: "8px 10px", borderRadius: 10, border: "1px solid #cfd8e3", background: "white", cursor: "pointer" };
  const btnSmall: React.CSSProperties = { padding: "6px 10px", borderRadius: 10, border: "1px solid #cfd8e3", background: "white", cursor: "pointer", fontSize: 12 };
  type Callout = { name: string; amOut: boolean; pmOut: boolean; reason: string };
  type CoverageOption = any;

  const [routes, setRoutes] = useState<any[]>([]);
  const [sheet, setSheet] = useState<any>(null);
  const [err, setErr] = useState("");
  const [options, setOptions] = useState<CoverageOption[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    apiGet("/api/routes")
      .then(setRoutes)
      .catch((e) => setErr(String(e?.message || e)));
  }, []);

  useEffect(() => {
    apiGet(`/api/ops-daysheet?date=${date}`)
      .then((s: any) => {
        setSheet(s);
        setOptions(s.coverageOptions || []);
      })
      .catch((e) => setErr(String(e?.message || e)));
  }, [date]);

  const leaveCodeOptions = ["", "SIK", "FMLA", "WC", "PRS"];
  const yesNo = ["YES", "NO"];

  const driverNames = useMemo(() => {
    const defaults = routes
      .filter((r) => !(String(r.code || "").toUpperCase().endsWith("A")))
      .map((r) => String(r.default_driver || "").trim())
      .filter(Boolean);
    const reliefFirst = ["Julia", "Noel", "Lizette", "Myra", "Jeff", "Ray", "Nic", "Rachael"];
    return Array.from(new Set([...reliefFirst, ...defaults].map((x) => x.trim()).filter(Boolean)));
  }, [routes]);

  const assistantNames = useMemo(() => {
    const defaults = routes
      .filter((r) => String(r.code || "").toUpperCase().endsWith("A"))
      .map((r) => String(r.default_assistant || "").trim())
      .filter(Boolean);
    return Array.from(new Set(defaults.map((x) => x.trim()).filter(Boolean)));
  }, [routes]);

  const calloutsDrivers: Callout[] = sheet?.callouts?.drivers || [];
  const calloutsAssistants: Callout[] = sheet?.callouts?.assistants || [];

  function updateCallout(kind: "drivers" | "assistants", idx: number, patch: Partial<Callout>) {
    const next = { ...(sheet || {}) };
    next.callouts = next.callouts || { drivers: [], assistants: [] };
    const arr: Callout[] = [...(next.callouts[kind] || [])];
    arr[idx] = { ...(arr[idx] || { name: "", amOut: false, pmOut: false, reason: "" }), ...patch };
    next.callouts[kind] = arr;
    setSheet(next);
  }

  function addCallout(kind: "drivers" | "assistants") {
    const next = { ...(sheet || {}) };
    next.callouts = next.callouts || { drivers: [], assistants: [] };
    next.callouts[kind] = [...(next.callouts[kind] || []), { name: "", amOut: true, pmOut: true, reason: "" }];
    setSheet(next);
  }

  async function saveCallouts() {
    if (!sheet) return;
    setErr("");
    try {
      await apiPost("/api/ops-daysheet", sheet);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  async function generateOptions() {
    setGenerating(true);
    setErr("");
    try {
      await saveCallouts(); // persist before generating
      const r = await apiGet(`/api/coverage-options?date=${date}`);
      setOptions(r.options || []);
      // refresh sheet to get stored options
      const s2 = await apiGet(`/api/ops-daysheet?date=${date}`);
      setSheet(s2);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setGenerating(false);
    }
  }

  async function applyOption(i: number) {
    setErr("");
    try {
      const r = await apiPost("/api/apply-coverage-option", { date, optionIndex: i });
      setSheet(r.opsDaySheet);
      setOptions(r.opsDaySheet?.coverageOptions || []);
      alert("Applied coverage option to Day Sheet. Go to the Day Sheet tab to review and adjust.");
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }

  const CalloutTable = ({ title, kind, names }: { title: string; kind: "drivers" | "assistants"; names: string[] }) => {
    const rows: Callout[] = kind === "drivers" ? calloutsDrivers : calloutsAssistants;
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 980, fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>Employee</th>
              <th style={th}>AM Out</th>
              <th style={th}>PM Out</th>
              <th style={th}>Leave Code</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td style={td}>
                  <select value={r.name || ""} onChange={(e) => updateCallout(kind, idx, { name: e.target.value })} style={sel}>
                    <option value=""></option>
                    {names.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </td>
                <td style={tdc}>
                  <input type="checkbox" checked={!!r.amOut} onChange={(e) => updateCallout(kind, idx, { amOut: e.target.checked })} />
                </td>
                <td style={tdc}>
                  <input type="checkbox" checked={!!r.pmOut} onChange={(e) => updateCallout(kind, idx, { pmOut: e.target.checked })} />
                </td>
                <td style={td}>
                  <select value={r.reason || ""} onChange={(e) => updateCallout(kind, idx, { reason: e.target.value })} style={sel}>
                    {leaveCodeOptions.map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 6 }}>
          <button style={btnSmall} onClick={() => addCallout(kind)}>+ Add Call-Out</button>
        </div>
      </div>
    );
  };

  if (!sheet) {
    return <div style={{ padding: 10, fontSize: 13 }}>Loading Call-Outs…</div>;
  }

  return (
    <div>
      <h3 style={{ margin: "10px 0 6px" }}>Call-Outs + Coverage Options</h3>
      <div style={{ fontSize: 13, lineHeight: 1.4, maxWidth: 980 }}>
        Enter call-outs (AM/PM tracked separately), then generate 1–3 globally optimized coverage options. Apply an option to populate the Day Sheet (you can still edit manually).
      </div>

      {err && <div style={{ color: "crimson", marginTop: 8 }}>{err}</div>}

      <CalloutTable title="Drivers Call-Outs" kind="drivers" names={driverNames} />
      <CalloutTable title="Assistants Call-Outs" kind="assistants" names={assistantNames} />

      <div style={{ marginTop: 10 }}>
        <button style={btn} onClick={saveCallouts}>Save Call-Outs</button>{" "}
        <button style={btn} onClick={generateOptions} disabled={generating}>{generating ? "Generating..." : "Generate 1–3 Options"}</button>
      </div>

      <div style={{ marginTop: 12, maxWidth: 980 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Coverage Options</div>
        {options.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.8 }}>No options generated yet.</div>
        ) : (
          options.map((o: any, idx: number) => (
            <div key={idx} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 700 }}>{o.title || `Option ${idx + 1}`}</div>
                <button style={btnSmall} onClick={() => applyOption(idx)}>Apply this option</button>
              </div>
              <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>
                <div><b>Drivers AM open:</b> {(o.drivers?.am || []).length} | <b>PM open:</b> {(o.drivers?.pm || []).length}</div>
                <div><b>Assistants AM open:</b> {(o.assistants?.am || []).length} | <b>PM open:</b> {(o.assistants?.pm || []).length}</div>
                {(o.warnings || []).length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <b>Warnings:</b>
                    <ul style={{ margin: "4px 0 0 18px" }}>
                      {(o.warnings || []).slice(0, 8).map((w: string, i: number) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
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
  const [clientError, setClientError] = useState<string>("");
  useEffect(() => {
    const handler = (msg: any, src?: any, line?: any, col?: any, err?: any) => {
      const text = String((msg as any)?.message || msg);
      setClientError(text);
      fetch("/api/client-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "window.onerror", text, src, line, col }) }).catch(() => {});
      return false;
    };
    const onRej = (e: any) => {
      const text = String(e?.reason?.message || e?.reason || e);
      setClientError(text);
      fetch("/api/client-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "unhandledrejection", text }) }).catch(() => {});
    };
    // @ts-ignore
    window.onerror = handler;
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      // @ts-ignore
      window.onerror = null;
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);
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
      {activeTab === "callouts" ? <CalloutsTab date={date} /> : null}

      {activeTab === "admin" && user.role === "admin" ? <AdminPanel /> : null}
    </div>
  );
}type CalloutsData = {
  drivers: { am: string[]; pm: string[] };
  assistants: { am: string[]; pm: string[] };
};

function MultiSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <select
        multiple
        value={value}
        onChange={(e) => {
          const v = Array.from(e.target.selectedOptions).map((o) => o.value);
          onChange(v);
        }}
        style={{ width: "100%", minHeight: 120, padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Hold Ctrl (Windows) / Cmd (Mac) to select multiple.</div>
    </div>
  );
}

function CallOutsTab({ date }: { date: string }) {
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<string[]>([]);
  const [data, setData] = useState<CalloutsData>({ drivers: { am: [], pm: [] }, assistants: { am: [], pm: [] } });
  const [status, setStatus] = useState<string>("");
  const [options, setOptions] = useState<any[]>([]);
  const [selected, setSelected] = useState<number>(0);


  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const p = await apiGet(`/api/people`);
        const c = await apiGet(`/api/callouts?date=${encodeURIComponent(date)}`);
        if (!alive) return;
        setPeople(p.people || []);
        setData(c.data || { drivers: { am: [], pm: [] }, assistants: { am: [], pm: [] } });
      } catch (e: any) {
        setStatus(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [date]);

  async function save() {
    setStatus("");
    try {
      await apiPost("/api/callouts", { date, data });
      setStatus("Saved.");
    } catch (e: any) {
      setStatus("Save failed: " + String(e?.message || e));
    }
  }

  
  async function generateOptions() {
    setStatus("");
    try {
      const r = await apiGet(`/api/coverage-options?date=${encodeURIComponent(date)}`);
      setOptions(r.options || []);
      setSelected(0);
      setStatus(`Generated ${(r.options || []).length} option(s). Choose one and Apply.`);
    } catch (e: any) {
      setStatus("Generate failed: " + String(e?.message || e));
    }
  }

  async function applySelected() {
    setStatus("");
    try {
      await apiPost("/api/apply-coverage", { date, option: selected });
      setStatus("Applied to Day Sheet. Go to the Day Sheet tab to review/adjust, then Save.");
    } catch (e: any) {
      setStatus("Apply failed: " + String(e?.message || e));
    }
  }
if (loading) return <div style={{ padding: 16 }}>Loading Call-Outs…</div>;

  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      <h2 style={{ marginTop: 0 }}>Call-Outs — {date}</h2>

      {status && <div style={{ marginBottom: 12, padding: 10, border: "1px solid #ddd", borderRadius: 10 }}>{status}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <h3 style={{ marginTop: 0 }}>Drivers</h3>
          <MultiSelect label="AM Out" options={people} value={data.drivers.am} onChange={(v) => setData({ ...data, drivers: { ...data.drivers, am: v } })} />
          <MultiSelect label="PM Out" options={people} value={data.drivers.pm} onChange={(v) => setData({ ...data, drivers: { ...data.drivers, pm: v } })} />
        </div>

        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 14 }}>
          <h3 style={{ marginTop: 0 }}>Assistants</h3>
          <MultiSelect label="AM Out" options={people} value={data.assistants.am} onChange={(v) => setData({ ...data, assistants: { ...data.assistants, am: v } })} />
          <MultiSelect label="PM Out" options={people} value={data.assistants.pm} onChange={(v) => setData({ ...data, assistants: { ...data.assistants, pm: v } })} />
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={save} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #111", background: "#111", color: "white" }}>
          Save Call-Outs
        </button>
        <button onClick={generateOptions} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #111", background: "white" }}>
          Generate Coverage Options
        </button>
        {options.length > 0 && (
          <>
            <select value={selected} onChange={(e)=>setSelected(Number(e.target.value))} style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd" }}>
              {options.map((o:any)=> <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <button onClick={applySelected} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #111", background: "#111", color: "white" }}>
              Apply to Day Sheet
            </button>
          </>
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: 13, opacity: 0.75 }}>
        Tip: Save Call-Outs first, then Generate options. After Apply, review in Day Sheet and Save.
      </div>
    </div>
  );
}


