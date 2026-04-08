import React, { useState, useRef, useEffect } from 'react';
import { useReveal } from '../hooks/useReveal';
import { triggerScenario, getSimulatorLog } from '../api';
import { SCENARIOS } from '../data';

const SCENARIO_META = {
  storm:    { icon:'🌪️', title:'Storm at Seattle Port',   desc:'Port closure affecting inbound shipments. AI reroutes via LA or Vancouver.' },
  strike:   { icon:'✊', title:'Depot B Labor Strike',     desc:'Portland depot unavailable. Shipments need alternate drop points.' },
  capacity: { icon:'📦', title:'Warehouse Overflow',       desc:'Warehouse at 98% capacity. Block new inbounds, reroute to alternate.' },
  truck:    { icon:'🚛', title:'Fleet Breakdown ×3',       desc:'Three trucks out of service. Perishable shipments at risk.' },
  demand:   { icon:'📈', title:'Demand Surge (+40%)',      desc:'Volume spike. Allocate idle fleet and reprioritise queue.' },
  blackout: { icon:'⚡', title:'Grid Outage — Hub',        desc:'Power failure at hub. Operations suspended for ~6 hours.' },
};

export default function Simulator({ showToast }) {
  useReveal('simulator');
  const [activeKey, setActiveKey] = useState(null);
  const [logLines, setLogLines] = useState([{ t:'', msg:'› System ready. Select a disruption scenario above.' }]);
  const [running, setRunning] = useState(false);
  const [useApi, setUseApi] = useState(true);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logLines]);

  const runScenario = async (key) => {
    if (running) return;
    setRunning(true);
    setActiveKey(key);
    setLogLines([{ t:'trigger', msg:`› [TRIGGER] ${SCENARIO_META[key]?.title} initiated…` }]);

    if (useApi) {
      try {
        const res = await triggerScenario(key);
        if (res.log && res.log.length > 0) {
          // Stream log lines with delay for effect
          res.log.forEach((line, i) => {
            setTimeout(() => {
              setLogLines(prev => [...prev, {
                t: line.level,
                msg: line.msg
              }]);
              if (i === res.log.length - 1) {
                setRunning(false);
                showToast('Scenario complete — check AI Decisions panel');
              }
            }, i * 280);
          });
        } else {
          setLogLines(prev => [...prev, { t:'success', msg:`› [SUCCESS] ${res.message}` }]);
          setRunning(false);
          showToast('Scenario complete');
        }
      } catch(e) {
        // Fall back to mock log
        setUseApi(false);
        runMock(key);
      }
    } else {
      runMock(key);
    }
  };

  const runMock = (key) => {
    const scenario = SCENARIOS[key];
    if (!scenario) { setRunning(false); return; }
    scenario.log.forEach((line, i) => {
      setTimeout(() => {
        setLogLines(prev => [...prev, { t: line.t, msg: '› ' + line.msg }]);
        if (i === scenario.log.length - 1) {
          setRunning(false);
          showToast('Scenario complete — check AI Decisions panel');
        }
      }, i * 350);
    });
  };

  const lineColor = (t) => {
    if (t === 'success') return '#a8c98e';
    if (t === 'highlight' || t === 'trigger') return 'var(--accent)';
    if (t === 'error') return '#e09898';
    return 'rgba(245,242,238,0.65)';
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="label" style={{ marginBottom:12 }}>Stress Testing</div>
          <h1 className="page-title">SCEN<br/><em>ario Sim</em></h1>
        </div>
        <div className="page-meta">
          <div className="label">Interactive Simulation</div>
          <div className="page-meta-time">{useApi ? '🟢 Live Backend' : '🟡 Mock Mode'}</div>
        </div>
      </div>

      <div style={{ padding:'28px 48px 48px' }}>
        <div className="reveal" style={{ background:'var(--bg-secondary)', borderRadius:16, padding:'32px 40px', marginBottom:32, border:'1px solid var(--border)' }}>
          <p style={{ fontSize:14, lineHeight:1.6, color:'var(--text-label)' }}>
            Trigger real-world disruptions to see how DISPATCH responds in real time. {useApi ? 'Each scenario mutates the live environment state — alerts are injected, warehouses locked, and AI decisions regenerated.' : 'Running in mock mode — backend unreachable.'}
          </p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16, marginBottom:40 }}>
          {Object.entries(SCENARIO_META).map(([key, s]) => (
            <button key={key} className="reveal" onClick={() => runScenario(key)} style={{
              fontFamily:'var(--font)',
              background: activeKey===key ? 'rgba(143,168,122,0.06)' : 'var(--card-bg)',
              border: activeKey===key ? '1px solid var(--accent-dark)' : '1px solid var(--border)',
              borderRadius:14, padding:'32px 24px',
              cursor: running && activeKey!==key ? 'not-allowed' : 'pointer',
              textAlign:'left', transition:'all .4s var(--ease)',
            }}
            onMouseEnter={e=>{ if(!running){ e.currentTarget.style.transform='translateY(-4px)'; }}}
            onMouseLeave={e=>{ e.currentTarget.style.transform='translateY(0)'; }}
            >
              <span style={{ fontSize:32, marginBottom:16, display:'block' }}>{s.icon}</span>
              <div style={{ fontSize:14, fontWeight:900, marginBottom:8 }}>{s.title}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', lineHeight:1.5 }}>{s.desc}</div>
              {activeKey===key && running && <div style={{ marginTop:12, fontSize:10, color:'var(--accent-dark)', fontWeight:700, letterSpacing:'0.14em' }}>RUNNING…</div>}
            </button>
          ))}
        </div>

        <div className="reveal" style={{ background:'var(--text-primary)', borderRadius:16, padding:32, minHeight:280 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
            <span style={{ fontSize:10, fontWeight:900, letterSpacing:'0.3em', textTransform:'uppercase', color:'var(--accent)' }}>Simulation Log</span>
            <div style={{ width:8, height:8, borderRadius:'50%', background: running ? 'var(--accent-dark)' : 'rgba(245,242,238,0.3)', animation: running ? 'blink 1.5s ease-in-out infinite' : 'none' }} />
          </div>
          <div ref={logRef} style={{ fontSize:13, lineHeight:1.8, maxHeight:300, overflowY:'auto' }}>
            {logLines.map((line, i) => (
              <div key={i} style={{ color: lineColor(line.t), fontWeight: ['success','highlight','trigger'].includes(line.t) ? 700 : 400 }}>
                {line.msg}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
