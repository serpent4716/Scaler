import React, { useState } from 'react';
import { useReveal } from '../hooks/useReveal';
import { useFetch } from '../hooks/useFetch';
import { getAlerts, readAlert } from '../api';
import { ALERTS } from '../data';
import { LoadingBar, ErrorBanner } from '../components/ApiStatus';

export default function Alerts({ onNavigate, showToast }) {
  useReveal('alerts');
  const [reading, setReading] = useState(null);
  const { data, loading, error, refetch } = useFetch(getAlerts);

  const apiAlerts = data?.alerts ?? null;
  const displayAlerts = apiAlerts ?? ALERTS;

  const handleRead = async (alertId) => {
    if (!apiAlerts) return;
    setReading(alertId);
    try {
      const res = await readAlert(alertId);
      if (res.ai_interpretation) showToast('✓ AI interpretation ready');
      refetch();
    } catch(e) { showToast(`Error: ${e.message}`); }
    finally { setReading(null); }
  };

  // counts
  const criticalCount = apiAlerts ? apiAlerts.filter(a => a.type === 'critical').length : 3;
  const warnCount     = apiAlerts ? apiAlerts.filter(a => a.type === 'warning').length : 2;
  const unreadCount   = data?.unread_count ?? 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="label" style={{ marginBottom:12 }}>Intelligence Feed</div>
          <h1 className="page-title">ALERT<br/><em>Center</em></h1>
        </div>
        <div className="page-meta">
          <div className="label" style={{ color:'var(--accent-danger)' }}>{criticalCount} Critical</div>
          <div className="page-meta-time">{warnCount} Warnings · {apiAlerts ? `${unreadCount} Unread` : '1 Info'}</div>
        </div>
      </div>

      {error && <ErrorBanner error={error} onRetry={refetch} />}
      {loading && !data ? <LoadingBar /> : (
        <div style={{ padding:'28px 48px 48px', display:'flex', flexDirection:'column', gap:16 }}>
          {displayAlerts.map((a, i) => {
            const type = a.type || (a.severity === 'critical' || a.severity === 'high' ? 'critical' : a.severity === 'medium' ? 'warning' : 'info');
            const isRead = a.is_read ?? false;
            const alertId = a.alert_id;
            const rawText = a.raw || a.body || '';
            const aiText  = a.ai  || a.ai_interpretation || 'Analysing disruption impact…';
            const time     = a.time || `Step ${a.received_at_step ?? 0}`;
            const affected = a.affected || a.affects_warehouse || 'Unknown';

            return (
              <div key={alertId || i} className="reveal" onClick={() => handleRead(alertId)} style={{
                background: isRead ? 'var(--bg-secondary)' : 'var(--card-bg)',
                borderLeft: `3px solid ${type==='critical'?'var(--accent-danger)':type==='warning'?'var(--accent-alert)':'var(--accent)'}`,
                border:'1px solid var(--border)',
                borderRadius:14, padding:'28px 32px',
                display:'grid', gridTemplateColumns:'1fr 1fr', gap:40,
                transition:'all .4s var(--ease)', cursor: alertId ? 'pointer' : 'default',
                opacity: isRead ? 0.7 : 1,
              }}
              onMouseEnter={e=>e.currentTarget.style.transform='translateY(-2px)'}
              onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}
              >
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                    <span className="label-muted">Raw Message</span>
                    {!isRead && alertId && <span style={{ fontSize:8, fontWeight:900, letterSpacing:'0.2em', textTransform:'uppercase', background:'var(--accent-danger)', color:'#fff', padding:'2px 8px', borderRadius:40 }}>UNREAD</span>}
                    {reading === alertId && <span style={{ fontSize:10, color:'var(--text-muted)' }}>Reading…</span>}
                  </div>
                  <div style={{ fontSize:14, fontWeight:500, lineHeight:1.6, color:'var(--text-label)', fontStyle:'italic', borderLeft:'2px solid var(--border)', paddingLeft:14 }}>
                    {a.subject && <strong style={{ fontStyle:'normal', display:'block', marginBottom:6 }}>{a.subject}</strong>}
                    {rawText}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:14, flexWrap:'wrap' }}>
                    <span style={{
                      fontSize:9, fontWeight:900, letterSpacing:'0.2em', textTransform:'uppercase', padding:'4px 12px', borderRadius:40,
                      background: type==='critical'?'rgba(201,122,122,0.12)':type==='warning'?'rgba(212,149,106,0.12)':'rgba(143,168,122,0.15)',
                      color: type==='critical'?'var(--accent-danger)':type==='warning'?'var(--accent-alert)':'var(--accent-dark)'
                    }}>{type}</span>
                    <span className="label-muted">{time}</span>
                  </div>
                </div>
                <div>
                  <div style={{ marginBottom:10 }}><span className="label">AI Interpretation</span></div>
                  <div style={{ fontSize:14, fontWeight:500, lineHeight:1.6 }}>{aiText}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:14, flexWrap:'wrap' }}>
                    <span className="label-muted">Affected: <strong>{String(affected)}</strong></span>
                    <button onClick={e=>{e.stopPropagation(); showToast('Navigating to AI Decisions...'); onNavigate('ai');}}
                      style={{ fontFamily:'var(--font)',fontSize:10,fontWeight:700,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--accent-dark)',background:'none',border:'none',borderBottom:'1px solid var(--accent)',paddingBottom:1,cursor:'pointer' }}>
                      View Decision →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
