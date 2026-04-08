import React from 'react';
import { useReveal } from '../hooks/useReveal';
import { useFetch } from '../hooks/useFetch';
import { getMapState } from '../api';
import { LoadingBar, ErrorBanner } from '../components/ApiStatus';

// Map lat/lng → % positions in the 520px container
// Bounding box: lat 43–50, lng -124 to -116
const toPos = (lat, lng) => ({
  left: `${((lng - (-124)) / ((-116) - (-124))) * 90 + 5}%`,
  top:  `${((50 - lat) / (50 - 43)) * 80 + 8}%`,
});

const statusColor = (wh) => {
  if (!wh.is_operational || wh.status === 'closed') return 'var(--accent-danger)';
  if (wh.strike_active  || wh.status === 'strike')  return 'var(--accent-alert)';
  if (wh.utilization_pct >= 85)                     return 'var(--accent-alert)';
  return 'var(--accent)';
};

export default function MapRouting() {
  useReveal('map');
  const { data, loading, error, refetch } = useFetch(getMapState);

  const warehouses  = data?.warehouses  ?? [];
  const trucks      = data?.trucks      ?? [];
  const routes      = data?.routes      ?? [];
  const disruptions = data?.disruptions ?? [];
  const summary     = data?.summary     ?? {};

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="label" style={{ marginBottom:12 }}>Spatial Intelligence</div>
          <h1 className="page-title">MAP &amp;<br/><em>Routing</em></h1>
        </div>
        <div className="page-meta">
          <div className="label">{summary.active_routes ?? 8} Routes Active</div>
          <div className="page-meta-time">{summary.trucks_in_transit ?? 12} Trucks En Route · {summary.disrupted_locations ?? 2} Disruptions</div>
        </div>
      </div>

      {error && <ErrorBanner error={error} onRetry={refetch} />}

      <div style={{ padding:'0 48px 48px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:24, padding:'20px 0', flexWrap:'wrap' }}>
          {[
            { color:'var(--accent)',        label:'Warehouse / Depot' },
            { color:'var(--text-primary)',  label:'Truck' },
            { color:'var(--accent-danger)', label:'Closed / Strike' },
            { color:'var(--accent-dark)',   label:'Active Route',  square:true },
            { color:'var(--accent-alert)',  label:'Delayed Route', square:true },
          ].map((l,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:10, fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--text-muted)' }}>
              <div style={{ width:10, height:10, borderRadius:l.square?0:'50%', background:l.color }} />
              {l.label}
            </div>
          ))}
          <button onClick={refetch} style={{ marginLeft:'auto', fontFamily:'var(--font)', fontSize:10, fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', background:'none', border:'1px solid var(--border)', cursor:'pointer', padding:'8px 16px', borderRadius:40 }}>↻ Refresh</button>
        </div>

        {loading && !data ? <LoadingBar /> : (
          <div className="reveal" style={{ background:'var(--bg-secondary)', borderRadius:20, height:520, position:'relative', overflow:'hidden', border:'1px solid var(--border)' }}>
            <div className="map-grid" style={{ backgroundSize:'40px 40px' }} />

            {/* Routes — draw lines between origin and dest using pseudo-positions */}
            {routes.slice(0, 12).map((r, i) => {
              if (!r.origin?.lat || !r.destination?.lat) return null;
              const o = toPos(r.origin.lat, r.origin.lng);
              const d = toPos(r.destination.lat, r.destination.lng);
              const oLeft = parseFloat(o.left); const oTop = parseFloat(o.top);
              const dLeft = parseFloat(d.left); const dTop  = parseFloat(d.top);
              const length = Math.sqrt(Math.pow(dLeft-oLeft,2)+Math.pow(dTop-oTop,2));
              const angle  = Math.atan2(dTop-oTop, dLeft-oLeft) * 180/Math.PI;
              return (
                <div key={i} style={{
                  position:'absolute', left:`${oLeft}%`, top:`${oTop}%`,
                  width:`${length}%`, height:2, borderRadius:2,
                  background: r.is_delayed ? 'var(--accent-alert)' : 'var(--accent-dark)',
                  opacity: 0.55, transformOrigin:'left center',
                  transform:`rotate(${angle}deg)`
                }} />
              );
            })}

            {/* Warehouses */}
            {(warehouses.length > 0 ? warehouses : [
              { warehouse_id:'WH_PDX_MAIN', lat:45.52, lng:-122.68, status:'open', utilization_pct:72, city:'Portland' },
              { warehouse_id:'WH_TAC_NORTH', lat:47.25, lng:-122.44, status:'closed', utilization_pct:0, city:'Tacoma N' },
              { warehouse_id:'WH_SPK_CENTRAL', lat:47.66, lng:-117.43, status:'open', utilization_pct:55, city:'Spokane' },
              { warehouse_id:'WH_VAN_BC', lat:49.28, lng:-123.12, status:'open', utilization_pct:38, city:'Vancouver' },
              { warehouse_id:'WH_BOI_LOGISTICS', lat:43.62, lng:-116.20, status:'open', utilization_pct:29, city:'Boise' },
            ]).map(wh => {
              const pos = (wh.lat && wh.lng) ? toPos(wh.lat, wh.lng) : { left:'30%', top:'40%' };
              const color = statusColor(wh);
              const isClosed = wh.status === 'closed' || !wh.is_operational;
              const isStrike = wh.strike_active || wh.status === 'strike';
              const label = String(wh.warehouse_id).replace('WH_','').replace(/_/g,' ').slice(0,8);
              const city = wh.city || label;
              return (
                <React.Fragment key={String(wh.warehouse_id)}>
                  <div className="map-node" style={{ left:pos.left, top:pos.top, width:44, height:44, background:color, fontSize:10 }}
                    title={`${wh.warehouse_id} — ${wh.utilization_pct ?? 0}% full`}>
                    {isClosed || isStrike ? (isStrike ? '✊' : '✕') : String(wh.warehouse_id).replace('WH_','').slice(0,1)}
                  </div>
                  <div className="map-label" style={{ left:`calc(${pos.left} + 24px)`, top:`calc(${pos.top} + 6px)` }}>
                    {city}
                    {wh.utilization_pct != null && <><br/>{Math.round(wh.utilization_pct)}%</>}
                    {(isClosed||isStrike) && <><br/><span style={{ color }}>{isStrike?'STRIKE':'CLOSED'}</span></>}
                  </div>
                </React.Fragment>
              );
            })}

            {/* Seattle Port (always disrupted) */}
            <div className="map-node closed" style={{ left:'22%', top:'20%', width:40, height:40 }}>✕</div>
            <div className="map-label" style={{ left:'calc(22% + 22px)', top:'calc(20% + 6px)', color:'var(--accent-danger)' }}>Seattle Port<br/>CLOSED</div>

            {/* Trucks */}
            {trucks.slice(0, 8).map((t, i) => {
              const pos = (t.lat && t.lng) ? toPos(t.lat, t.lng) : { left:`${20+i*9}%`, top:`${30+i*5}%` };
              return (
                <div key={String(t.truck_id)} className="map-node truck" style={{ left:pos.left, top:pos.top, width:28, height:28 }}
                  title={`${t.truck_id} — ${t.status}`}>
                  {t.is_hazmat_certified ? '☣️' : '🚛'}
                </div>
              );
            })}

            {/* Info Panel */}
            <div style={{
              position:'absolute', top:20, right:20,
              background:'var(--card-bg)', border:'1px solid var(--border)',
              borderRadius:14, padding:24, width:240, backdropFilter:'blur(8px)'
            }}>
              <div style={{ fontSize:12, fontWeight:900, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:16 }}>
                {data ? 'Live Summary' : 'Route Summary'}
              </div>
              {[
                ['Active Routes',    summary.active_routes    ?? 8,  'inherit'],
                ['Trucks Moving',    summary.trucks_in_transit ?? 12, 'inherit'],
                ['Idle Trucks',      summary.idle_trucks       ?? 4,  'var(--accent-dark)'],
                ['Disruptions',      summary.disrupted_locations ?? 2,'var(--accent-danger)'],
              ].map(([k,v,vc])=>(
                <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:12 }}>
                  <span style={{ color:'var(--text-muted)',fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase' }}>{k}</span>
                  <span style={{ fontWeight:700,color:vc }}>{v}</span>
                </div>
              ))}
              {data && disruptions.length > 0 && (
                <div style={{ marginTop:12 }}>
                  <div className="label-muted" style={{ marginBottom:6 }}>Disruptions</div>
                  {disruptions.map(d => (
                    <div key={d.id} style={{ fontSize:10, color:'var(--accent-danger)', marginBottom:4, fontWeight:700 }}>
                      {d.type === 'strike' ? '✊' : '🔴'} {d.name.replace('WH_','').replace(/_/g,' ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
