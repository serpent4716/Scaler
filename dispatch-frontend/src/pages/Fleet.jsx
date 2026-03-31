import React from 'react';
import { useReveal } from '../hooks/useReveal';
import { useFetch } from '../hooks/useFetch';
import { getFleet } from '../api';
import { FLEET } from '../data';
import { LoadingBar, ErrorBanner } from '../components/ApiStatus';

const fleetIcon = (t) => {
  if (!t) return '🚛';
  const s = String(t).toLowerCase();
  if (s.includes('❄') || s.includes('hazmat') && s.includes('15')) return '❄️';
  if (s.includes('flat') || s.includes('heavy')) return '🏗️';
  if (s.includes('van') || s.includes('light')) return '🚐';
  return '🚛';
};

export default function Fleet({ showToast }) {
  useReveal('fleet');
  const { data, loading, error, refetch } = useFetch(getFleet);

  const apiTrucks = data?.trucks ?? null;

  // Normalise API truck to display shape
  const trucks = apiTrucks
    ? apiTrucks.map(t => ({
        id: t.truck_id,
        type: t.type || (t.is_hazmat_certified ? 'Hazmat Certified' : 'Standard'),
        status: t.status || (t.is_available ? 'idle' : 'in_transit'),
        driver: t.current_location ? `At ${String(t.current_location).replace('WH_','')}` : 'In Transit',
        location: t.current_location ? String(t.current_location).replace(/_/g,' ') : 'En Route',
        load: t.current_load_tons > 0 ? `${t.current_load_tons}t loaded` : '—',
        cap: t.capacity_tons ? `${Math.round((t.current_load_tons/t.capacity_tons)*100)}%` : '0%',
        is_available: t.is_available,
        is_hazmat: t.is_hazmat_certified,
        capacity: t.capacity_tons,
      }))
    : FLEET;

  const idle = trucks.filter(t => t.status === 'idle' || t.is_available).length;
  const inTransit = trucks.filter(t => t.status === 'busy' || t.status === 'in_transit' || t.is_available === false).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="label" style={{ marginBottom:12 }}>Asset Management</div>
          <h1 className="page-title">FLEET<br/><em>Control</em></h1>
        </div>
        <div className="page-meta">
          <div className="label">{trucks.length} Total Vehicles</div>
          <div className="page-meta-time">{inTransit} Active · {idle} Idle{error ? ' · Mock' : ''}</div>
        </div>
      </div>

      {error && <ErrorBanner error={error} onRetry={refetch} />}
      {loading && !data ? <LoadingBar /> : (
        <div style={{ padding:'28px 48px 48px', display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 }}>
          {trucks.map(t => {
            const isIdle = t.status === 'idle' || t.is_available === true;
            const isMaint = t.status === 'maintenance';
            const statusStyle = isIdle
              ? { bg:'rgba(143,168,122,0.15)', color:'var(--accent-dark)' }
              : isMaint
              ? { bg:'rgba(26,26,26,0.08)', color:'var(--text-muted)' }
              : { bg:'rgba(212,149,106,0.15)', color:'var(--accent-alert)' };
            const statusLabel = isIdle ? 'idle' : isMaint ? 'maintenance' : 'in transit';

            return (
              <div key={t.id} className="reveal" style={{
                background:'var(--card-bg)', border:'1px solid var(--border)',
                borderRadius:14, padding:28, transition:'all .4s var(--ease)', cursor:'pointer'
              }}
              onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.borderColor='rgba(26,26,26,0.2)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.borderColor='var(--border)'; }}
              >
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
                  <span style={{ fontSize:28 }}>{fleetIcon(t.type)}</span>
                  <span style={{ fontSize:9, fontWeight:900, letterSpacing:'0.2em', textTransform:'uppercase', padding:'5px 12px', borderRadius:40, background:statusStyle.bg, color:statusStyle.color }}>{statusLabel}</span>
                </div>
                <div style={{ fontSize:18, fontWeight:900, letterSpacing:'0.06em', marginBottom:4 }}>{String(t.id).replace('TruckID.','')}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:16 }}>
                  {t.type}
                  {t.is_hazmat && <span style={{ marginLeft:8, fontSize:9, fontWeight:900, background:'rgba(212,149,106,0.15)', color:'var(--accent-alert)', padding:'2px 8px', borderRadius:40, letterSpacing:'0.1em' }}>HAZMAT ✓</span>}
                </div>
                {[
                  ['Driver / Status', t.driver],
                  ['Location', t.location],
                  ['Current Load', t.load],
                  ['Capacity Used', t.cap],
                ].map(([k, v]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                    <span style={{ color:'var(--text-muted)', fontWeight:600 }}>{k}</span>
                    <span style={{ fontWeight:700 }}>{v}</span>
                  </div>
                ))}
                {t.capacity && (
                  <div style={{ marginTop:14 }}>
                    <div style={{ height:4, background:'var(--border)', borderRadius:40 }}>
                      <div style={{ height:'100%', borderRadius:40, background: isIdle?'var(--accent-dark)':'var(--accent-alert)', width: t.cap }} />
                    </div>
                  </div>
                )}
                <button
                  disabled={!isIdle}
                  onClick={() => showToast(`${String(t.id).replace('TruckID.','')} assignment dialog opened`)}
                  style={{
                    fontFamily:'var(--font)', fontSize:10, fontWeight:900, letterSpacing:'0.18em',
                    textTransform:'uppercase', width:'100%', marginTop:20,
                    background:'var(--bg-secondary)', color:'var(--text-primary)',
                    border:'1px solid var(--border)', cursor: isIdle?'pointer':'not-allowed',
                    padding:12, borderRadius:6, transition:'all .3s var(--ease)',
                    opacity: isIdle ? 1 : 0.4
                  }}
                  onMouseEnter={e=>{ if(isIdle){ e.target.style.background='var(--accent)'; e.target.style.borderColor='var(--accent)'; }}}
                  onMouseLeave={e=>{ e.target.style.background='var(--bg-secondary)'; e.target.style.borderColor='var(--border)'; }}
                >
                  {isIdle ? 'Assign Shipment' : 'Currently Assigned'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
