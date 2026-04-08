import React from 'react';

export function LoadingBar() {
  return (
    <div style={{ padding:'80px 48px', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--accent-dark)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <span className="label-muted">Loading from backend…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  return (
    <div style={{ margin:'28px 48px', background:'rgba(201,122,122,0.1)', border:'1px solid rgba(201,122,122,0.3)', borderRadius:10, padding:'20px 24px', display:'flex', alignItems:'center', gap:16 }}>
      <span style={{ fontSize:20 }}>⚠️</span>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--accent-danger)' }}>Backend unreachable — showing mock data</div>
        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>{error}</div>
      </div>
      {onRetry && <button onClick={onRetry} style={{ fontFamily:'var(--font)', fontSize:10, fontWeight:900, letterSpacing:'0.18em', textTransform:'uppercase', background:'none', border:'1px solid var(--border)', borderRadius:4, padding:'8px 16px', cursor:'pointer' }}>Retry</button>}
    </div>
  );
}
