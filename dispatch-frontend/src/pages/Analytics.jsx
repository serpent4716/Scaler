import React from 'react';
import { useReveal } from '../hooks/useReveal';
import { useFetch } from '../hooks/useFetch';
import { getAnalytics } from '../api';
import { LoadingBar, ErrorBanner } from '../components/ApiStatus';

function BarChart({ data, k1, k2, c1, c2, labels }) {
  const maxV = Math.max(...data.map(d => d[k1] || 0), 1);
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:160 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
          <div style={{ display:'flex', gap:3, alignItems:'flex-end', flex:1, width:'100%' }}>
            <div style={{ height:`${((d[k1]||0)/maxV)*100}%`, background:c1, flex:1, borderRadius:'6px 6px 0 0', minHeight:4, transition:'height .8s var(--ease)' }} />
            {k2 && <div style={{ height:`${((d[k2]||0)/maxV)*100}%`, background:c2, opacity:0.6, flex:1, borderRadius:'6px 6px 0 0', minHeight: d[k2]>0?4:0, transition:'height .8s var(--ease)' }} />}
          </div>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em', color:'var(--text-muted)' }}>{labels?.[i] || d.lbl || i}</div>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  useReveal('analytics');
  const { data, loading, error, refetch } = useFetch(getAnalytics);

  const kpis = data?.kpis;
  const breakdown = data?.status_breakdown;
  const trend = data?.step_trend ?? [];
  const wh_throughput = data?.warehouse_throughput ?? {};

  // Fallback values
  const delayReduction = kpis?.delay_reduction_pct ?? 34;
  const costSaved      = kpis ? `$${(kpis.cost_saved_usd/1e6).toFixed(1)}M` : '$2.4M';
  const aiAccuracy     = kpis?.ai_accuracy_pct ?? 91;
  const onTimeRate     = kpis?.on_time_rate_pct ?? 94;

  // Build donut segments from breakdown
  const donutTotal = breakdown ? Object.values(breakdown).reduce((a,b)=>a+b,0) : 247;
  const donutData = breakdown ? [
    { label:'On Time',  val:breakdown.on_time  || 0, color:'var(--accent-dark)' },
    { label:'Delayed',  val:breakdown.delayed  || 0, color:'var(--accent-alert)' },
    { label:'Rerouted', val:breakdown.rerouted || 0, color:'var(--accent)' },
    { label:'At Risk',  val:breakdown.at_risk  || 0, color:'var(--accent-danger)' },
  ] : [
    { label:'On Time (60%)',  val:60, color:'var(--accent-dark)' },
    { label:'Delayed (18%)',  val:18, color:'var(--accent-alert)' },
    { label:'Rerouted (16%)', val:16, color:'var(--accent)' },
    { label:'At Risk (6%)',   val:6,  color:'var(--accent-danger)' },
  ];

  // Warehouse bar data
  const whBars = Object.keys(wh_throughput).length > 0
    ? Object.entries(wh_throughput).map(([id, v]) => ({ lbl: id.replace('WH_','').replace(/_/g,'.').slice(0,5), v1: v, v2: 0 }))
    : [
        { lbl:'Mon', v1:42, v2:8 }, { lbl:'Tue', v1:58, v2:12 },
        { lbl:'Wed', v1:51, v2:6 }, { lbl:'Thu', v1:65, v2:14 },
        { lbl:'Fri', v1:73, v2:18 }, { lbl:'Sat', v1:48, v2:9 }, { lbl:'Sun', v1:38, v2:5 },
      ];

  // Trend line points
  const trendPoints = trend.length > 1
    ? trend.map(p => p.on_time_rate_pct)
    : [78, 81, 85, 86, 90, 94];

  const maxRate = Math.max(...trendPoints, 100);
  const minRate = Math.min(...trendPoints, 0);
  const norm = (v) => 120 - ((v - minRate) / (maxRate - minRate || 1)) * 110;
  const trendPath = trendPoints.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i/(trendPoints.length-1))*380},${norm(v)}`).join(' ');
  const trendLabels = trend.length > 1 ? trend.map(p => `S${p.step}`) : ['Jan','Feb','Mar','Apr','May','Jun'];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="label" style={{ marginBottom:12 }}>Business Intelligence</div>
          <h1 className="page-title">PERF<br/><em>ormance</em></h1>
        </div>
        <div className="page-meta">
          <div className="label">{data ? `Step ${data.current_step}/${data.max_steps}` : 'Last 30 Days'}</div>
          <div className="page-meta-time">{data ? `Episode Score: ${data.episode_score?.toFixed(2) ?? 'In Progress'}` : 'Updated in real-time'}</div>
        </div>
      </div>

      {error && <ErrorBanner error={error} onRetry={refetch} />}
      {loading && !data ? <LoadingBar /> : (
        <div style={{ padding:'28px 48px 48px' }}>
          {/* KPI Row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16, marginBottom:24 }}>
            {[
              { num:`${delayReduction}%`, lbl:'Delay Reduction',     fill:delayReduction, fillColor:'var(--accent-dark)' },
              { num:costSaved,             lbl:'Cost Saved',          fill:68,             fillColor:'var(--accent)' },
              { num:`${aiAccuracy}%`,      lbl:'AI Decision Accuracy',fill:aiAccuracy,     fillColor:'var(--accent-dark)' },
              { num:`${onTimeRate}%`,      lbl:'On-Time Rate',        fill:onTimeRate,     fillColor:'var(--accent-dark)' },
            ].map((k, i) => (
              <div key={i} className="reveal" style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:16, padding:'36px 32px', transition:'all .4s var(--ease)' }}
                onMouseEnter={e=>e.currentTarget.style.transform='translateY(-3px)'}
                onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}
              >
                <div style={{ fontSize:52, fontWeight:900, letterSpacing:'-0.03em', lineHeight:1, marginBottom:8, color:'var(--accent-dark)' }}>{k.num}</div>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.24em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:16 }}>{k.lbl}</div>
                <div style={{ height:4, background:'var(--border)', borderRadius:40 }}>
                  <div style={{ height:'100%', borderRadius:40, background:k.fillColor, width:`${Math.min(k.fill,100)}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Charts Row 1 */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16 }}>
            <div className="reveal" style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:16, padding:32 }}>
              <div style={{ fontSize:13, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:28 }}>
                {data ? 'Deliveries by Warehouse' : 'Weekly Shipment Volume'}
              </div>
              <BarChart data={whBars} k1="v1" k2="v2" c1="var(--accent-dark)" c2="var(--accent-danger)" />
              <div style={{ display:'flex', gap:20, marginTop:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, color:'var(--text-muted)', fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase' }}>
                  <div style={{ width:10, height:10, borderRadius:2, background:'var(--accent-dark)' }} /> {data ? 'Delivered' : 'On Time'}
                </div>
              </div>
            </div>

            <div className="reveal" style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:16, padding:32 }}>
              <div style={{ fontSize:13, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:20 }}>Shipment Status</div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:180, position:'relative' }}>
                <svg width="160" height="160" viewBox="0 0 100 100" style={{ transform:'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg-secondary)" strokeWidth="12"/>
                  {donutData.reduce((acc, seg, i) => {
                    const total = donutData.reduce((s,d)=>s+d.val,0) || 100;
                    const pct = seg.val / total;
                    const circ = 2 * Math.PI * 40;
                    const dash = circ * pct;
                    const offset = -circ * (acc.offset);
                    acc.elements.push(
                      <circle key={i} cx="50" cy="50" r="40" fill="none" stroke={seg.color} strokeWidth="12"
                        strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={offset} strokeLinecap="round"/>
                    );
                    acc.offset += pct;
                    return acc;
                  }, { offset:0, elements:[] }).elements}
                </svg>
                <div style={{ position:'absolute', display:'flex', flexDirection:'column', alignItems:'center' }}>
                  <div style={{ fontSize:28, fontWeight:900, letterSpacing:'-0.02em' }}>{donutTotal}</div>
                  <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--text-muted)' }}>Total</div>
                </div>
              </div>
              <div style={{ marginTop:8 }}>
                {donutData.map(seg => (
                  <div key={seg.label} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11, marginBottom:6 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:seg.color, flexShrink:0 }} />
                    {seg.label} {breakdown ? `(${seg.val})` : ''}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* On-time trend */}
          <div className="reveal" style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:16, padding:32 }}>
            <div style={{ fontSize:13, fontWeight:900, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:20 }}>On-Time Rate Trend</div>
            <div style={{ height:140, position:'relative' }}>
              <svg width="100%" height="100%" viewBox="0 0 400 140" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-dark)" stopOpacity="0.2"/>
                    <stop offset="100%" stopColor="var(--accent-dark)" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d={`${trendPath} L380,140 L0,140 Z`} fill="url(#lineGrad)"/>
                <path d={trendPath} fill="none" stroke="var(--accent-dark)" strokeWidth="2.5" strokeLinecap="round"/>
                {trendPoints.map((v, i) => (
                  <circle key={i} cx={(i/(trendPoints.length-1))*380} cy={norm(v)} r={i===trendPoints.length-1?5:4}
                    fill="var(--accent-dark)" stroke={i===trendPoints.length-1?"var(--bg-primary)":"none"} strokeWidth="2"/>
                ))}
                {trendLabels.map((l, i) => (
                  <text key={l} x={(i/(trendLabels.length-1))*380} y="135" fontSize="9" fill="rgba(26,26,26,0.4)" fontFamily="League Spartan">{l}</text>
                ))}
              </svg>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
              <span className="label-muted">{trendPoints[0]}% → Start</span>
              <span className="label" style={{ color:'var(--accent-dark)' }}>{trendPoints[trendPoints.length-1]}% → Now ↑</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
