import React from 'react';
import { useReveal } from '../hooks/useReveal';
import { useFetch } from '../hooks/useFetch';
import { getWarehouses } from '../api';
import { WAREHOUSES } from '../data';
import { LoadingBar, ErrorBanner } from '../components/ApiStatus';

const WH_ICONS = { MAIN:'🏭', COLD:'❄️', NORTH:'🏭', SOUTH:'🏭', CENTRAL:'🏗️', BC:'🏢', LOGISTICS:'🏭' };
const whIcon = (id) => {
  const key = Object.keys(WH_ICONS).find(k => String(id).includes(k));
  return key ? WH_ICONS[key] : '🏭';
};
const whCity = (id) => {
  const map = { PDX:'Portland', TAC:'Tacoma', SPK:'Spokane', VAN:'Vancouver BC', BOI:'Boise' };
  const key = Object.keys(map).find(k => String(id).includes(k));
  return key ? map[key] : String(id).replace('WH_','').replace(/_/g,' ');
};

export default function Warehouses() {
  useReveal('warehouses');
  const { data, loading, error, refetch } = useFetch(getWarehouses);

  const apiWh = data?.warehouses ?? null;

  const warehouses = apiWh
    ? apiWh.map(w => ({
        name: String(w.warehouse_id).replace('WH_','').replace(/_/g,' '),
        loc: whCity(w.warehouse_id),
        status: w.status || (!w.is_operational ? 'closed' : w.strike_active ? 'strike' : w.utilization_pct >= 85 ? 'near-full' : 'open'),
        cap: Math.round(w.utilization_pct),
        slots: Math.round(w.capacity_tons * 10),
        incoming: w.assigned_shipment_count ?? 0,
        icon: whIcon(w.warehouse_id),
        available: w.available_tons,
        is_refrigerated: w.is_refrigerated,
        accepts_hazmat: w.accepts_hazmat,
        strike: w.strike_active,
      }))
    : WAREHOUSES;

  const openCount = warehouses.filter(w => w.status === 'open').length;
  const closedCount = warehouses.filter(w => w.status === 'closed' || w.status === 'strike').length;
  const nearFullCount = warehouses.filter(w => w.status === 'near-full').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="label" style={{ marginBottom:12 }}>Infrastructure</div>
          <h1 className="page-title">WARE<br/><em>houses</em></h1>
        </div>
        <div className="page-meta">
          <div className="label">{warehouses.length} Locations</div>
          <div className="page-meta-time">{openCount} Open · {closedCount} Closed/Strike · {nearFullCount} Near Full</div>
        </div>
      </div>

      {error && <ErrorBanner error={error} onRetry={refetch} />}
      {loading && !data ? <LoadingBar /> : (
        <div style={{ padding:'28px 48px 48px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:16 }}>
          {warehouses.map((w, i) => {
            const fillColor = w.cap < 60 ? 'var(--accent-dark)' : w.cap < 85 ? 'var(--accent-alert)' : 'var(--accent-danger)';
            const statusStyle =
              w.status === 'open'      ? { bg:'rgba(143,168,122,0.15)', color:'var(--accent-dark)' } :
              w.status === 'strike'    ? { bg:'rgba(212,149,106,0.15)', color:'var(--accent-alert)' } :
              w.status === 'closed'    ? { bg:'rgba(201,122,122,0.12)', color:'var(--accent-danger)' } :
                                         { bg:'rgba(212,149,106,0.15)', color:'var(--accent-alert)' };
            const statusLabel = w.status === 'near-full' ? 'near full' : w.status;

            return (
              <div key={i} className="reveal" style={{
                background:'var(--card-bg)', border:'1px solid var(--border)',
                borderRadius:16, padding:32, transition:'all .4s var(--ease)'
              }}
              onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.borderColor='rgba(26,26,26,0.18)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.borderColor='var(--border)'; }}
              >
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24 }}>
                  <span style={{ fontSize:32 }}>{w.icon}</span>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }}>
                    <span style={{ fontSize:9, fontWeight:900, letterSpacing:'0.2em', textTransform:'uppercase', padding:'5px 12px', borderRadius:40, background:statusStyle.bg, color:statusStyle.color }}>{statusLabel}</span>
                    <div style={{ display:'flex', gap:4 }}>
                      {w.is_refrigerated && <span style={{ fontSize:9, background:'rgba(143,168,122,0.15)', color:'var(--accent-dark)', padding:'2px 8px', borderRadius:40, fontWeight:700 }}>❄️ COLD</span>}
                      {w.accepts_hazmat  && <span style={{ fontSize:9, background:'rgba(212,149,106,0.15)', color:'var(--accent-alert)', padding:'2px 8px', borderRadius:40, fontWeight:700 }}>☣️ HAZMAT</span>}
                      {w.strike          && <span style={{ fontSize:9, background:'rgba(212,149,106,0.15)', color:'var(--accent-alert)', padding:'2px 8px', borderRadius:40, fontWeight:700 }}>✊ STRIKE</span>}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize:20, fontWeight:900, letterSpacing:'0.04em', marginBottom:4 }}>{w.name}</div>
                <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:24 }}>📍 {w.loc}</div>

                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:10, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase' }}>
                  <span className="label-muted">Capacity</span>
                  <span style={{ fontWeight:700 }}>{w.cap}%{w.available !== undefined ? ` · ${w.available}t free` : ''}</span>
                </div>
                <div style={{ height:6, background:'var(--border)', borderRadius:40, overflow:'hidden', marginBottom:24 }}>
                  <div style={{ height:'100%', borderRadius:40, background:fillColor, width:`${w.cap}%`, transition:'width 1.2s var(--ease)' }} />
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  {[
                    ['Total Slots', w.slots?.toLocaleString() ?? '—'],
                    ['Inbound', w.incoming ?? '—'],
                  ].map(([lbl, val]) => (
                    <div key={lbl} style={{ background:'var(--bg-secondary)', borderRadius:10, padding:16 }}>
                      <div style={{ fontSize:22, fontWeight:900, letterSpacing:'-0.01em' }}>{val}</div>
                      <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--text-muted)', marginTop:2 }}>{lbl}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
