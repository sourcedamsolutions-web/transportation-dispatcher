import React, { useEffect, useState } from 'react'
import { api, User } from './api'

type DaySheet = { date: string; board: Record<string, { cells: string[], notified: boolean[] }>; notes?: string; }

function todayISO(){
  const d = new Date();
  const pad = (n:number)=> String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

export default function App(){
  const [me, setMe] = useState<User|null>(null);
  const [err, setErr] = useState('');
  const [date, setDate] = useState(todayISO());
  const [sheet, setSheet] = useState<DaySheet|null>(null);

  async function loadMe(){ try{ setMe(await api('/api/me')); }catch{ setMe(null); } }
  useEffect(()=>{ loadMe(); }, []);

  async function loadSheet(d:string){
    setErr('');
    try{ setSheet(await api(`/api/daysheet?date=${encodeURIComponent(d)}`)); }
    catch(e:any){ setErr(e.message); }
  }
  useEffect(()=>{ if(me) loadSheet(date); }, [me, date]);

  if(!me) return <Login onLoggedIn={loadMe} err={err} setErr={setErr}/>;

  return (
    <div className="container">
      <div className="topbar no-print">
        <div>
          <h2 style={{margin:'0 0 4px 0'}}>Transportation Dispatcher</h2>
          <div className="small">Logged in as <b>{me.name}</b> <span className="badge">{me.role}</span></div>
        </div>
        <div className="row" style={{alignItems:'center'}}>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
          <button onClick={()=>window.print()}>Print (Portrait)</button>
          <button onClick={async()=>{ await api('/api/logout', {method:'POST'}); setMe(null); }}>Logout</button>
        </div>
      </div>

      {err && <div className="card" style={{border:'1px solid #f2b8b5', background:'#fff5f5', marginBottom:12}}>{err}</div>}

      {sheet && <DaySheetBoard sheet={sheet} onSave={async(s)=>{
        await api('/api/daysheet', {method:'POST', body: JSON.stringify(s)});
        await loadSheet(date);
      }}/>}

      {me.role === 'admin' && <AdminPanel />}
    </div>
  );
}

function Login({onLoggedIn, err, setErr}:{onLoggedIn: ()=>void, err:string, setErr:(s:string)=>void}){
  const [name, setName] = useState('Ray');
  const [pin, setPin] = useState('');
  return (
    <div className="container">
      <div className="card" style={{maxWidth:520, margin:'80px auto'}}>
        <h2 style={{marginTop:0}}>Transportation Dispatcher</h2>
        <div className="small">Sign in with your name + PIN</div>
        <div className="row" style={{marginTop:12}}>
          <input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
          <input placeholder="PIN" value={pin} onChange={e=>setPin(e.target.value)} />
          <button onClick={async()=>{
            setErr('');
            try{ await api('/api/login', {method:'POST', body: JSON.stringify({name, pin})}); onLoggedIn(); }
            catch(e:any){ setErr(e.message); }
          }}>Login</button>
        </div>
        {err && <div style={{marginTop:12, color:'#b42318'}}>{err}</div>}
      </div>
    </div>
  );
}

function DaySheetBoard({sheet, onSave}:{sheet:DaySheet, onSave:(s:DaySheet)=>Promise<void>}){
  const [local, setLocal] = useState<DaySheet>(sheet);
  useEffect(()=>setLocal(sheet), [sheet.date]);

  return (
    <div className="card">
      <div className="print-only" style={{textAlign:'center', marginBottom:8}}>
        <h3 style={{margin:0}}>Transportation SOUTHEAST – Day Sheet</h3>
        <div className="small">{local.date}</div>
      </div>

      <div className="topbar no-print">
        <div><b>Day Sheet Board</b> <span className="badge">{local.date}</span></div>
        <div className="row">
          <button onClick={async()=> setLocal(await api('/api/generate?date='+encodeURIComponent(local.date)))}>Generate Coverage</button>
          <button onClick={()=>onSave(local)}>Save</button>
        </div>
      </div>

      <div className="daysheet-wrap">
        <table className="daysheet-grid" style={{marginTop:8}}
        >
          <thead>
            <tr>
              <th className="route-col">Route</th>
              <th className="am run-col">AM 1st</th><th className="am run-col">AM 2nd</th><th className="am run-col">AM 3rd</th><th className="am run-col">AM 4th</th>
              <th className="pm run-col">PM 1st</th><th className="pm run-col">PM 2nd</th><th className="pm run-col">PM 3rd</th><th className="pm run-col">PM 4th</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const entries = Object.entries(local.board || {});
              const rows: any[] = [];
              let insertedBasic = false;
              let insertedESE = false;

              const pushSection = (label: string) => rows.push(
                <tr className="section-row" key={"section-"+label}>
                  <td colSpan={9}>{label}</td>
                </tr>
              );

              for (const [route, row] of entries) {
                if (!insertedBasic) {
                  pushSection('BASIC ROUTES (Z500–Z521)');
                  insertedBasic = true;
                }
                if (!insertedESE && route.startsWith('Z56')) {
                  pushSection('ESE ROUTES (Z560–Z588)');
                  insertedESE = true;
                }

                rows.push(
                  <tr key={route}>
                    <td className="route-col"><b>{route}</b></td>
                    {Array.from({length:8}).map((_,i)=> (
                      <td key={i} className="run-col">
                        <input
                          className="cell-input"
                          value={(row?.cells?.[i] || '')}
                          onChange={(e)=>{
                            const v = e.target.value;
                            setLocal(prev=>{
                              const next:DaySheet = JSON.parse(JSON.stringify(prev));
                              next.board[route].cells[i] = v;
                              return next;
                            })
                          }}
                        />
                        <div className="cell-footer">
                          ✔
                          <input
                            type="checkbox"
                            checked={!!row?.notified?.[i]}
                            onChange={(e)=>{
                              const checked = e.target.checked;
                              setLocal(prev=>{
                                const next:DaySheet = JSON.parse(JSON.stringify(prev));
                                next.board[route].notified[i] = checked;
                                return next;
                              })
                            }}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              }

              return rows;
            })()}
          </tbody>
        </table>
      </div>

      <div style={{marginTop:10}} className="small">AM is highlighted yellow; PM is highlighted orange; prints in portrait.</div>
    </div>
  );
}

function AdminPanel(){
  const [users, setUsers] = useState<User[]>([]);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'dispatcher'|'supervisor'|'admin'>('dispatcher');

  async function load(){ try{ setUsers(await api('/api/users')); }catch(e:any){ setErr(e.message); } }
  useEffect(()=>{ load(); }, []);

  return (
    <div className="card" style={{marginTop:12}}>
      <h3 style={{marginTop:0}}>Admin – Users</h3>
      {err && <div style={{color:'#b42318'}}>{err}</div>}
      <div className="row">
        <input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
        <input placeholder="PIN" value={pin} onChange={e=>setPin(e.target.value)} />
        <select value={role} onChange={e=>setRole(e.target.value as any)}>
          <option value="dispatcher">dispatcher</option>
          <option value="supervisor">supervisor</option>
          <option value="admin">admin</option>
        </select>
        <button onClick={async()=>{
          setErr('');
          try{ await api('/api/users', {method:'POST', body: JSON.stringify({name, pin, role})}); setName(''); setPin(''); setRole('dispatcher'); await load(); }
          catch(e:any){ setErr(e.message); }
        }}>Add/Update User</button>
      </div>

      <table className="grid" style={{marginTop:10}}>
        <thead><tr><th>Name</th><th>Role</th><th>Active</th><th>Actions</th></tr></thead>
        <tbody>
          {users.map(u=>(
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.role}</td><td>{String(u.active)}</td>
              <td><button onClick={async()=>{ await api('/api/users/'+u.id+'/toggle', {method:'POST'}); await load(); }}>Toggle Active</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
