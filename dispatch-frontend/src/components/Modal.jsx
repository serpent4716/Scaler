import React from 'react';

export default function Modal({ isOpen, onClose, title, sub, body, actions }) {
  if (!isOpen) return null;
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position:'fixed', inset:0, zIndex:9000,
        background:'rgba(26,26,26,0.5)', backdropFilter:'blur(4px)',
        display:'flex', alignItems:'center', justifyContent:'center'
      }}
    >
      <div style={{
        background:'var(--bg-primary)', borderRadius:20, padding:48,
        maxWidth:560, width:'90%', border:'1px solid var(--border)',
        animation:'modal-in .5s var(--ease)', position:'relative'
      }}>
        <button onClick={onClose} style={{
          position:'absolute', top:24, right:24, background:'none',
          border:'none', cursor:'pointer', fontSize:20, color:'var(--text-muted)'
        }}>✕</button>
        <h2 style={{ fontSize:28, fontWeight:900, letterSpacing:-0.01, marginBottom:8 }}>{title}</h2>
        <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:28 }}>{sub}</p>
        <div style={{ fontSize:14, lineHeight:1.7, color:'var(--text-label)' }}>{body}</div>
        {actions && <div style={{ display:'flex', gap:12, marginTop:28 }}>{actions}</div>}
      </div>
    </div>
  );
}
