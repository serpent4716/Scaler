import React, { useState, useEffect } from 'react';

const pages = [
  { id:'dashboard', label:'Dashboard' },
  { id:'shipments', label:'Shipments' },
  { id:'map', label:'Map' },
  { id:'alerts', label:'Alerts' },
  { id:'ai', label:'AI Decisions' },
  { id:'fleet', label:'Fleet' },
  { id:'warehouses', label:'Warehouses' },
  { id:'simulator', label:'Simulator' },
  { id:'analytics', label:'Analytics' },
];

export default function Nav({ current, onNavigate }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleTheme = () => setIsDark(d => !d);

  return (
    <nav style={{
      position:'fixed', top:0, left:0, right:0, zIndex:999,
      height:'var(--nav-h)', display:'flex', alignItems:'center',
      justifyContent:'space-between', padding:'0 48px',
      background:'var(--bg-primary)', backdropFilter:'blur(14px)',
      borderBottom:'1px solid var(--border)',
      transition:'background .3s var(--ease), border-color .3s var(--ease)'
    }}>
      <div
        onClick={() => onNavigate('landing')}
        style={{ fontSize:13, fontWeight:900, letterSpacing:'0.32em',
          textTransform:'uppercase', display:'flex', alignItems:'center',
          gap:10, cursor:'pointer', color:'var(--text-primary)' }}
      >
        <span style={{ width:8, height:8, borderRadius:'50%',
          background:'var(--accent)', display:'inline-block' }} />
        DISPATCH
      </div>

      <ul style={{ display:'flex', alignItems:'center', listStyle:'none', gap:0 }}>
        {pages.map(p => (
          <li key={p.id}>
            <button
              onClick={() => onNavigate(p.id)}
              style={{
                fontFamily:'var(--font)', fontSize:10, fontWeight:700,
                letterSpacing:'0.22em', textTransform:'uppercase',
                color: current === p.id ? 'var(--text-primary)' : 'var(--text-muted)',
                background:'none', border:'none', cursor:'pointer',
                padding:'10px 14px', position:'relative',
                transition:'color .3s var(--ease)',
                borderBottom: current === p.id ? '1px solid var(--accent)' : '1px solid transparent'
              }}
            >
              {p.label}
            </button>
          </li>
        ))}
      </ul>

      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button
          onClick={toggleTheme}
          style={{
            background:'none', border:'1px solid var(--border)',
            borderRadius:8, padding:'8px 10px', cursor:'pointer',
            color:'var(--text-primary)', fontSize:16,
            transition:'all .3s var(--ease)'
          }}
          title={isDark ? 'Light mode' : 'Dark mode'}
        >
          {isDark ? '☀️' : '🌙'}
        </button>

        <button
          onClick={() => onNavigate('dashboard')}
          style={{
            fontFamily:'var(--font)', fontSize:10, fontWeight:900,
            letterSpacing:'0.18em', textTransform:'uppercase',
            background:'var(--accent)', color:'var(--text-primary)',
            border:'none', cursor:'pointer', padding:'10px 28px',
            borderRadius:40, transition:'all .35s var(--ease)'
          }}
          onMouseEnter={e => { e.target.style.background='var(--accent-dark)'; e.target.style.color='#fff'; }}
          onMouseLeave={e => { e.target.style.background='var(--accent)'; e.target.style.color='var(--text-primary)'; }}
        >
          Live View
        </button>
      </div>
    </nav>
  );
}
