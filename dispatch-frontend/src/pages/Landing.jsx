import React, { useEffect } from 'react';
import { useReveal } from '../hooks/useReveal';

export default function Landing({ onNavigate }) {
  useReveal('landing');

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <section style={{
        flex:1, display:'grid', gridTemplateColumns:'1fr 1fr',
        padding:'0 48px', alignItems:'center',
        minHeight:'calc(100vh - var(--nav-h))', position:'relative', overflow:'hidden'
      }}>
        {/* BG number */}
        <div style={{
          position:'absolute', bottom:-80, left:-20,
          fontSize:340, fontWeight:900, letterSpacing:'-0.05em',
          color:'rgba(26,26,26,0.03)', userSelect:'none', pointerEvents:'none', lineHeight:1
        }}>AI</div>

        {/* LEFT */}
        <div style={{ paddingRight:60, position:'relative', zIndex:2 }}>
          <div className="reveal" style={{ display:'flex', alignItems:'center', gap:14, marginBottom:40 }}>
            <div style={{ width:48, height:1, background:'var(--accent)' }} />
            <span className="label">Logistics Intelligence Platform</span>
          </div>

          <h1 className="reveal" style={{
            fontSize:'clamp(52px, 7vw, 108px)', fontWeight:900,
            lineHeight:0.85, letterSpacing:'-0.02em', marginBottom:40
          }}>
            SHIP<br/>
            <em style={{ fontStyle:'italic', fontWeight:300, color:'var(--accent-dark)' }}>smarter</em><br/>
            FASTER
          </h1>

          <p className="reveal" style={{
            fontSize:18, fontWeight:400, lineHeight:1.6,
            color:'var(--text-label)', maxWidth:400, marginBottom:52
          }}>
            Real-time AI logistics dispatching that reroutes, adapts, and decides — before disruptions cost you.
          </p>

          <div className="reveal" style={{ display:'flex', alignItems:'center', gap:32 }}>
            <button className="btn-primary" onClick={() => onNavigate('dashboard')}>
              Start Demo →
            </button>
            <button className="btn-ghost" onClick={() => onNavigate('ai')}>
              See AI Decisions
            </button>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center' }}>
          <div className="reveal" style={{
            width:'100%', maxWidth:520,
            background:'var(--bg-secondary)', borderRadius:24,
            padding:40, position:'relative', overflow:'hidden',
            border:'1px solid var(--border)'
          }}>
            <div style={{ marginBottom:28 }}><span className="label">System Status — Live</span></div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, marginBottom:2 }}>
              {[
                { num:'247', lbl:'Active Shipments', color:'var(--text-primary)' },
                { num:'18', lbl:'Delayed', color:'var(--accent-alert)' },
                { num:'94%', lbl:'On-Time Rate', color:'var(--accent-dark)' },
                { num:'3', lbl:'Active Alerts', color:'var(--text-primary)' },
              ].map((s, i) => (
                <div key={i} style={{
                  background:'var(--card-bg)', padding:'28px 24px',
                  borderRadius: [16,0,0,0][i] + 'px ' + [0,16,0,0][i] + 'px ' + [0,0,16,0][i] + 'px ' + [0,0,0,16][i] + 'px',
                  transition:'background .4s var(--ease)', cursor:'default'
                }}>
                  <div style={{ fontSize:40, fontWeight:900, lineHeight:1, letterSpacing:'-0.02em', marginBottom:4, color:s.color }}>{s.num}</div>
                  <div className="label-muted">{s.lbl}</div>
                </div>
              ))}
            </div>

            {/* Badge */}
            <div style={{
              position:'absolute', top:-20, right:-20,
              width:140, height:140, borderRadius:'50%',
              background:'var(--accent)', display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center',
              animation:'bounce-slow 4s ease-in-out infinite',
              border:'3px solid var(--bg-primary)'
            }}>
              <div style={{ fontSize:28, fontStyle:'italic', fontWeight:900, lineHeight:1 }}>AI</div>
              <div style={{ fontSize:8, fontWeight:900, letterSpacing:'0.3em', textTransform:'uppercase', textAlign:'center' }}>powered<br/>dispatch</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
