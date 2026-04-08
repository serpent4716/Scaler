import React, { useState, useEffect } from 'react';
import { useReveal } from '../hooks/useReveal';
import { useFetch } from '../hooks/useFetch';
import { getDashboardSummary, getAlerts } from '../api';
import { ACTIVITIES, ALERTS } from '../data';
import { LoadingBar, ErrorBanner } from '../components/ApiStatus';

export default function Dashboard({ onNavigate, showToast }) {
  useReveal('dashboard');
  const [time, setTime] = useState('');
  const [alertVisible, setAlertVisible] = useState(true);

  const { data, loading, error, refetch } = useFetch(getDashboardSummary);
  const { data: alertData } = useFetch(getAlerts);

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleString('en-IN', {
      timeZone:'Asia/Kolkata', hour12:true, hour:'2-digit', minute:'2-digit',
      second:'2-digit', weekday:'short', day:'numeric', month:'short'
    }) + ' IST');
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Auto-refresh KPIs every 15s
  useEffect(() => {
    const id = setInterval(refetch, 15000);
    return () => clearInterval(id);
  }, [refetch]);

  const kpis = data?.kpis;

  // Get first critical alert from backend or fall back to mock
  const criticalAlert = alertData?.alerts?.find(a => a.type === 'critical' && !a.is_read);
  const alertText = criticalAlert
    ? `CRITICAL — ${criticalAlert.subject}. ${criticalAlert.body.slice(0, 80)}…`
    : 'CRITICAL — Seattle Port closed due to storm. 14 shipments affected. AI rerouting initiated.';

  const kpiCards = [
    { icon:'📦', num: kpis?.total_shipments ?? 247,       lbl:'Total Shipments',   delta: kpis ? `${kpis.delivered} delivered` : '↑ 12 this week',        deltaType:'up',   numColor:'var(--text-primary)' },
    { icon:'🔴', num: kpis?.delayed_shipments ?? 18,       lbl:'Delayed Shipments', delta: kpis ? `${kpis.unassigned} unassigned` : '↑ 5 from yesterday',   deltaType:'down', numColor:'var(--accent-danger)' },
    { icon:'⚡', num: kpis?.active_alerts ?? 3,            lbl:'Active Alerts',     delta: kpis ? `${kpis.in_transit} in transit` : '2 critical',            deltaType:'down', numColor:'var(--accent-alert)' },
    { icon:'✅', num: kpis ? `${kpis.on_time_rate_pct}%` : '94%', lbl:'On-Time Rate', delta: kpis ? `${kpis.reward_earned.toFixed(2)} reward earned` : '↑ 2% vs last month', deltaType:'up', numColor:'var(--accent-dark)' },
  ];

  // Activity feed from alerts
  const activities = alertData?.alerts?.slice(0, 5).map(a => ({
    msg: a.subject,
    time: `Step ${a.received_at_step}`,
    color: a.type === 'critical' ? 'var(--accent-danger)' : a.type === 'warning' ? 'var(--accent-alert)' : 'var(--accent-dark)',
    tag: a.type,
    tagBg: a.type === 'critical' ? 'rgba(201,122,122,0.12)' : a.type === 'warning' ? 'rgba(212,149,106,0.15)' : 'rgba(143,168,122,0.15)',
    tagColor: a.type === 'critical' ? 'var(--accent-danger)' : a.type === 'warning' ? 'var(--accent-alert)' : 'var(--accent-dark)',
  })) ?? ACTIVITIES;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="label" style={{ marginBottom:12 }}>Control Center</div>
          <h1 className="page-title">DISPATCH<br/><em>Dashboard</em></h1>
        </div>
        <div className="page-meta">
          <div className="label">System Health — {error ? 'Mock Mode' : 'Live'}</div>
          <div className="page-meta-time">{time}</div>
        </div>
      </div>

      {error && <ErrorBanner error={error} onRetry={refetch} />}

      {alertVisible && (
        <div className="reveal" style={{
          margin:'28px 48px 0', background:'var(--accent-alert)', borderRadius:8,
          padding:'16px 24px', display:'flex', alignItems:'center', gap:16,
          animation:'pulse-alert 3s ease-in-out infinite'
        }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <span style={{ fontSize:13, fontWeight:700, color:'#fff', flex:1 }}>{alertText}</span>
          <button onClick={() => setAlertVisible(false)} style={{
            fontFamily:'var(--font)', fontSize:9, fontWeight:900, letterSpacing:'0.2em',
            textTransform:'uppercase', color:'rgba(255,255,255,0.7)',
            background:'none', border:'1px solid rgba(255,255,255,0.3)',
            cursor:'pointer', padding:'6px 14px', borderRadius:4
          }}>Dismiss</button>
        </div>
      )}

      {loading && !data ? <LoadingBar /> : (
        <>
          <div className="reveal" style={{
            display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:2,
            margin:'28px 48px', background:'var(--border)', borderRadius:12, overflow:'hidden'
          }}>
            {kpiCards.map((k, i) => (
              <div key={i} style={{
                background:'var(--card-bg)', padding:'36px 32px',
                transition:'all .4s var(--ease)', cursor:'pointer',
                borderRadius: i===0?'12px 0 0 12px':i===3?'0 12px 12px 0':'0'
              }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--bg-secondary)'}
              onMouseLeave={e=>e.currentTarget.style.background='var(--card-bg)'}
              >
                <span style={{ fontSize:22, marginBottom:20, display:'block' }}>{k.icon}</span>
                <div style={{ fontSize:48, fontWeight:900, lineHeight:1, letterSpacing:'-0.02em', marginBottom:6, color:k.numColor }}>{k.num}</div>
                <div className="label-muted" style={{ marginBottom:14 }}>{k.lbl}</div>
                <span style={{
                  fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:40, display:'inline-block',
                  background: k.deltaType==='up' ? 'rgba(143,168,122,0.15)' : 'rgba(201,122,122,0.12)',
                  color: k.deltaType==='up' ? 'var(--accent-dark)' : 'var(--accent-danger)'
                }}>{k.delta}</span>
              </div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, padding:'0 48px 48px', marginTop:24 }}>
            {/* Warehouse snapshot from API */}
            <div className="reveal" style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:16, padding:32 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
                <span style={{ fontSize:14, fontWeight:700, letterSpacing:'0.06em' }}>
                  {data ? 'Warehouse Snapshot' : 'Route Overview'}
                </span>
                <button className="btn-ghost" onClick={() => onNavigate(data ? 'warehouses' : 'map')} style={{ fontSize:10 }}>
                  {data ? 'Full View →' : 'Full Map →'}
                </button>
              </div>
              {data?.warehouse_snapshot ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {data.warehouse_snapshot.slice(0, 5).map(wh => (
                    <div key={wh.warehouse_id} style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', width:120, flexShrink:0, letterSpacing:'0.06em' }}>
                        {String(wh.warehouse_id).replace('WH_','').replace(/_/g,' ')}
                      </span>
                      <div style={{ flex:1, height:6, background:'var(--border)', borderRadius:40, overflow:'hidden' }}>
                        <div style={{
                          height:'100%', borderRadius:40,
                          width:`${wh.capacity_pct}%`,
                          background: !wh.is_operational ? 'var(--accent-danger)' : wh.strike_active ? 'var(--accent-alert)' : wh.capacity_pct >= 85 ? 'var(--accent-alert)' : 'var(--accent-dark)',
                          transition:'width 1s var(--ease)'
                        }} />
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, width:36, textAlign:'right',
                        color: !wh.is_operational ? 'var(--accent-danger)' : wh.capacity_pct >= 85 ? 'var(--accent-alert)' : 'var(--text-muted)'
                      }}>{wh.capacity_pct}%</span>
                      {(!wh.is_operational || wh.strike_active) && <span style={{ fontSize:10 }}>{wh.strike_active ? '✊' : '🔴'}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ background:'var(--bg-secondary)', borderRadius:12, height:180, position:'relative', overflow:'hidden', border:'1px solid var(--border)' }}>
                  <div className="map-grid" />
                  <div className="map-node wh" style={{ left:'12%',top:'22%',width:36,height:36 }}>A</div>
                  <div className="map-node wh" style={{ left:'34%',top:'18%',width:36,height:36 }}>B</div>
                  <div className="map-node closed" style={{ left:'78%',top:'22%',width:32,height:32 }}>✕</div>
                  <div className="map-label" style={{ left:'78%',top:'30%',color:'var(--accent-danger)' }}>CLOSED</div>
                </div>
              )}
            </div>

            {/* Activity feed */}
            <div className="reveal" style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:16, padding:32 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
                <span style={{ fontSize:14, fontWeight:700 }}>Activity Feed</span>
                <span className="label-muted">{data ? 'Live' : 'Mock'}</span>
              </div>
              {activities.map((a, i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 0', borderBottom: i<activities.length-1?'1px solid var(--border)':'none' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, marginTop:5, background:a.color }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500, lineHeight:1.4 }}>{a.msg}</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:3 }}>{a.time}</div>
                  </div>
                  <span style={{ fontSize:9, fontWeight:900, letterSpacing:'0.2em', textTransform:'uppercase', padding:'3px 10px', borderRadius:40, whiteSpace:'nowrap', flexShrink:0, background:a.tagBg, color:a.tagColor }}>{a.tag}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
