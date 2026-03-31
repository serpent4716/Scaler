import React, { useState } from 'react';
import { useReveal } from '../hooks/useReveal';
import { useFetch } from '../hooks/useFetch';
import { getDecisions, acceptDecision, rejectDecision } from '../api';
import { DECISIONS_INITIAL } from '../data';
import { LoadingBar, ErrorBanner } from '../components/ApiStatus';

export default function AIDecisions({ showToast }) {
  useReveal('ai');
  const { data, loading, error, refetch } = useFetch(getDecisions);
  const [localStatus, setLocalStatus] = useState({});

  const apiDecisions = data?.decisions ?? null;
  // Merge API decisions with local status overrides
  const decisions = apiDecisions
    ? apiDecisions.map(d => ({ ...d, status: localStatus[d.id] || d.status }))
    : DECISIONS_INITIAL.map(d => ({ ...d, status: localStatus[d.id] || d.status }));

  const handleAccept = async (d) => {
    setLocalStatus(p => ({ ...p, [d.id]: 'accepted' }));
    if (apiDecisions) {
      try {
        const res = await acceptDecision(d.id, `Accepting: ${d.action}`);
        showToast(res.success ? '✓ Decision accepted — AI executing action' : `✗ ${res.message}`);
        refetch();
      } catch(e) { showToast(`Error: ${e.message}`); setLocalStatus(p => ({ ...p, [d.id]: 'pending' })); }
    } else {
      showToast('Decision accepted — AI is executing reroute');
    }
  };

  const handleReject = async (d) => {
    setLocalStatus(p => ({ ...p, [d.id]: 'rejected' }));
    if (apiDecisions) {
      try {
        await rejectDecision(d.id, 'Rejected via dashboard');
        showToast('Decision rejected — logged for review');
      } catch(e) { showToast(`Error: ${e.message}`); setLocalStatus(p => ({ ...p, [d.id]: 'pending' })); }
    } else {
      showToast('Decision rejected — logged for review');
    }
  };

  const pendingCount = decisions.filter(d => d.status === 'pending').length;
  const avgConf = data?.avg_confidence_pct ?? 91;
  const source = data?.source ?? 'mock';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="label" style={{ marginBottom:12 }}>Machine Intelligence</div>
          <h1 className="page-title">AI DE<br/><em>cisions</em></h1>
        </div>
        <div className="page-meta">
          <div className="label">{decisions.length} Suggestions · {pendingCount} Pending</div>
          <div className="page-meta-time">Confidence avg — {avgConf}% · {source === 'gemini' ? '🤖 Gemini' : source === 'rule_engine' ? '⚙️ Rule Engine' : '📋 Mock'}</div>
        </div>
      </div>

      {error && <ErrorBanner error={error} onRetry={refetch} />}

      <div style={{ padding:'28px 48px 48px' }}>
        <div className="reveal" style={{ background:'var(--bg-secondary)', borderRadius:16, padding:'32px 40px', marginBottom:28, display:'flex', alignItems:'center', gap:24, border:'1px solid var(--border)' }}>
          <span style={{ fontSize:36 }}>🤖</span>
          <p style={{ fontSize:14, lineHeight:1.6, color:'var(--text-label)', flex:1 }}>
            {apiDecisions
              ? <>The AI has analysed the current state at <strong style={{ color:'var(--text-primary)' }}>step {data?.current_step}</strong> and generated <strong style={{ color:'var(--text-primary)' }}>{decisions.length} routing recommendations</strong> using {source === 'gemini' ? 'Gemini 2.5 Flash' : 'the rule engine'}. Accepting executes the action live in the environment.</>
              : <>The AI has analyzed <strong style={{ color:'var(--text-primary)' }}>247 active shipments</strong>, <strong style={{ color:'var(--text-primary)' }}>3 disruption events</strong>, and <strong style={{ color:'var(--text-primary)' }}>fleet availability</strong> to generate recommendations. You stay in full control.</>
            }
          </p>
          {apiDecisions && (
            <button onClick={() => { refetch(); showToast('Regenerating decisions…'); }}
              style={{ fontFamily:'var(--font)', fontSize:10, fontWeight:900, letterSpacing:'0.18em', textTransform:'uppercase', background:'var(--bg-primary)', border:'1px solid var(--border)', borderRadius:4, padding:'10px 20px', cursor:'pointer', whiteSpace:'nowrap' }}>
              ↻ Refresh
            </button>
          )}
        </div>

        {loading && !data ? <LoadingBar /> : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {decisions.map(d => {
              const status = localStatus[d.id] || d.status || 'pending';
              const conf = typeof d.confidence === 'number' ? `${Math.round(d.confidence * 100)}%` : d.confidence;
              return (
                <div key={d.id} className="reveal" style={{
                  background: status==='accepted' ? 'rgba(143,168,122,0.06)' : 'var(--card-bg)',
                  border: status==='accepted' ? '1px solid var(--accent-dark)' : '1px solid var(--border)',
                  borderRadius:16, padding:32, transition:'all .4s var(--ease)',
                  opacity: status==='rejected' ? 0.45 : 1,
                  borderStyle: status==='rejected' ? 'dashed' : 'solid'
                }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16, gap:24 }}>
                    <div>
                      <div className="label-muted" style={{ marginBottom:6 }}>{d.id}</div>
                      <div style={{ fontSize:18, fontWeight:700, lineHeight:1.3 }}>{d.action}</div>
                    </div>
                    <div style={{ fontSize:28, fontWeight:900, letterSpacing:'-0.02em', color:'var(--accent-dark)', whiteSpace:'nowrap' }}>{conf}</div>
                  </div>

                  <div style={{ fontSize:13, color:'var(--text-label)', lineHeight:1.6, marginBottom:16, padding:'14px 18px', background:'var(--bg-secondary)', borderRadius:8 }}>
                    🤖 {d.reason}
                  </div>

                  <div style={{ fontSize:11, color:'var(--accent-dark)', marginBottom:20, fontWeight:700 }}>Impact: {d.impact}</div>

                  <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                    {status === 'pending' ? (
                      <>
                        <button className="btn-accept" onClick={() => handleAccept(d)}>✓ Accept</button>
                        <button className="btn-reject" onClick={() => handleReject(d)}>✕ Reject</button>
                        <button className="btn-modify" onClick={() => showToast('Modification interface coming soon')}>Edit</button>
                      </>
                    ) : (
                      <span style={{
                        fontSize:10, fontWeight:900, letterSpacing:'0.2em', textTransform:'uppercase',
                        padding:'6px 16px', borderRadius:40,
                        background: status==='accepted'?'rgba(143,168,122,0.15)':'rgba(201,122,122,0.1)',
                        color: status==='accepted'?'var(--accent-dark)':'var(--accent-danger)'
                      }}>
                        {status==='accepted'?'✓ Accepted':'✕ Rejected'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
