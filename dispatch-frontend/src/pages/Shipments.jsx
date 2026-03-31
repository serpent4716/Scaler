import React, { useState } from 'react';
import { useReveal } from '../hooks/useReveal';
import { useFetch } from '../hooks/useFetch';
import { getShipments, rerouteShipment, holdShipment, prioritizeShipment } from '../api';
import { SHIPMENTS } from '../data';
import Modal from '../components/Modal';
import { LoadingBar, ErrorBanner } from '../components/ApiStatus';

const WAREHOUSES = ['WH_PDX_MAIN','WH_PDX_COLD','WH_TAC_NORTH','WH_TAC_SOUTH','WH_SPK_CENTRAL','WH_VAN_BC','WH_BOI_LOGISTICS'];

function getPriority(sh, currentStep = 0) {
  if (sh.priority) return sh.priority; // mock data
  const left = (sh.deadline_step || 20) - currentStep;
  if (left <= 5) return 'high';
  if (left <= 15) return 'med';
  return 'low';
}

function getStatus(sh) {
  const s = sh.status || '';
  if (s === 'unassigned') return 'on-time';
  if (s === 'delayed') return 'delayed';
  if (s === 'assigned' || s === 'in_transit') return 'rerouted';
  if (s === 'delivered') return 'on-time';
  return s.replace('_', '-');
}

export default function Shipments({ showToast }) {
  useReveal('shipments');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [rerouteWh, setRerouteWh] = useState('');

  const { data, loading, error, refetch } = useFetch(getShipments);
  const apiShipments = data?.shipments ?? null;
  const currentStep = data?.current_step ?? 0;

  const allShipments = apiShipments ?? SHIPMENTS;

  const filtered = allShipments.filter(s => {
    if (filter === 'all') return true;
    const st = getStatus(s);
    const pri = getPriority(s, currentStep);
    if (filter === 'high') return pri === 'high';
    if (filter === 'on-time') return st === 'on-time';
    if (filter === 'delayed') return st === 'delayed';
    if (filter === 'rerouted') return st === 'rerouted';
    return true;
  });

  const handleReroute = async (s) => {
    if (!apiShipments) { showToast(`Reroute initiated for ${s.id || s.shipment_id}`); setModal(null); return; }
    if (!rerouteWh) { showToast('Select a warehouse first'); return; }
    try {
      const res = await rerouteShipment(s.shipment_id, rerouteWh, 'Manual reroute via dashboard.');
      showToast(res.success ? `✓ ${s.shipment_id} routed to ${rerouteWh}` : `✗ ${res.message}`);
      setModal(null); refetch();
    } catch(e) { showToast(`Error: ${e.message}`); }
  };

  const handleHold = async (id) => {
    try {
      const res = await holdShipment(id);
      showToast(res.success ? `${id} placed on hold` : `✗ ${res.message}`);
      refetch();
    } catch(e) { showToast(`Error: ${e.message}`); }
  };

  const handlePrioritize = async (id) => {
    try {
      const res = await prioritizeShipment(id);
      showToast(res.success ? `${id} prioritized` : `✗ ${res.message}`);
      refetch();
    } catch(e) { showToast(`Error: ${e.message}`); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="label" style={{ marginBottom:12 }}>Operations</div>
          <h1 className="page-title">SHIP<br/><em>ments</em></h1>
        </div>
        <div className="page-meta">
          <div className="label">{data?.total ?? allShipments.length} Total</div>
          <div className="page-meta-time">
            {apiShipments
              ? `${allShipments.filter(s=>getStatus(s)==='delayed').length} Delayed · Step ${currentStep}/${data?.current_step ?? '?'}`
              : '18 Delayed · 3 Rerouted'}
          </div>
        </div>
      </div>

      {error && <ErrorBanner error={error} onRetry={refetch} />}

      <div style={{ padding:'24px 48px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--border)', flexWrap:'wrap' }}>
        <span className="label-muted" style={{ marginRight:8 }}>Filter:</span>
        {[['all','All'],['on-time','On Time'],['delayed','Delayed'],['rerouted','Rerouted'],['high','High Priority']].map(([v,l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{
            fontFamily:'var(--font)', fontSize:10, fontWeight:700, letterSpacing:'0.2em',
            textTransform:'uppercase', cursor:'pointer', padding:'8px 18px', borderRadius:40,
            transition:'all .3s var(--ease)',
            background: filter===v ? 'var(--text-primary)' : 'none',
            color: filter===v ? 'var(--bg-primary)' : 'var(--text-muted)',
            border: filter===v ? '1px solid var(--text-primary)' : '1px solid var(--border)',
            marginLeft: v==='high' ? 16 : 0
          }}>{l}</button>
        ))}
        {apiShipments && (
          <button onClick={refetch} style={{ marginLeft:'auto', fontFamily:'var(--font)', fontSize:10, fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', background:'none', border:'1px solid var(--border)', cursor:'pointer', padding:'8px 16px', borderRadius:40 }}>↻ Refresh</button>
        )}
      </div>

      {loading && !data ? <LoadingBar /> : (
        <div style={{ padding:'0 48px 48px', overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', marginTop:24 }}>
            <thead>
              <tr style={{ borderBottom:'1.5px solid var(--text-primary)' }}>
                {['ID','Origin / Flags','Destination','Status','Priority','Weight / Deadline','Action'].map(h => (
                  <th key={h} style={{ fontSize:9, fontWeight:900, letterSpacing:'0.3em', textTransform:'uppercase', color:'var(--text-muted)', padding:'14px 16px', textAlign:'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const id = s.shipment_id || s.id;
                const st = getStatus(s);
                const pri = getPriority(s, currentStep);
                const flags = s.cargo_flags?.join(', ') || s.cargo || '';
                const weight = s.weight_tons ? `${s.weight_tons}t` : '';
                const deadline = s.deadline_step ? `Deadline: step ${s.deadline_step}` : s.eta || '';
                return (
                  <tr key={id} onClick={() => setModal(s)} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'all .3s var(--ease)' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-secondary)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                  >
                    <td style={{ padding:'18px 16px', fontSize:12, fontWeight:900, letterSpacing:'0.06em' }}>{id}</td>
                    <td style={{ padding:'18px 16px', fontSize:13, fontWeight:500 }}>
                      {s.origin || '—'}
                      {flags && <div style={{ fontSize:10, color:'var(--accent-dark)', marginTop:2, fontWeight:700 }}>{flags}</div>}
                    </td>
                    <td style={{ padding:'18px 16px', fontSize:13, fontWeight:500 }}>{s.dest || s.assigned_warehouse || '—'}</td>
                    <td style={{ padding:'18px 16px' }}><span className={`status-pill ${st}`}>{st.replace('-',' ')}</span></td>
                    <td style={{ padding:'18px 16px' }}><span className={`priority-tag ${pri}`}>{pri}</span></td>
                    <td style={{ padding:'18px 16px', fontSize:12 }}>
                      <div style={{ fontWeight:700 }}>{weight}</div>
                      <div style={{ color:'var(--text-muted)', fontSize:10, marginTop:2 }}>{deadline}</div>
                    </td>
                    <td style={{ padding:'18px 16px', display:'flex', gap:8, flexWrap:'wrap' }}>
                      <button onClick={e=>{e.stopPropagation();setModal(s);}}
                        style={{ fontFamily:'var(--font)',fontSize:10,fontWeight:700,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--accent-dark)',background:'none',border:'none',borderBottom:'1px solid var(--accent)',paddingBottom:1,cursor:'pointer' }}>
                        Reroute
                      </button>
                      {apiShipments && (
                        <button onClick={e=>{e.stopPropagation();handleHold(id);}}
                          style={{ fontFamily:'var(--font)',fontSize:10,fontWeight:700,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--text-muted)',background:'none',border:'none',borderBottom:'1px solid var(--border)',paddingBottom:1,cursor:'pointer' }}>
                          Hold
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>No shipments match this filter.</div>}
        </div>
      )}

      <Modal
        isOpen={!!modal}
        onClose={() => { setModal(null); setRerouteWh(''); }}
        title={modal?.shipment_id || modal?.id}
        sub={modal ? (modal.origin ? `${modal.origin} → ${modal.dest}` : `Assigned: ${modal.assigned_warehouse || 'None'}`) : ''}
        body={modal && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div><div className="label-muted">Status</div><div style={{ marginTop:4 }}><span className={`status-pill ${getStatus(modal)}`}>{getStatus(modal).replace('-',' ')}</span></div></div>
              <div><div className="label-muted">Priority</div><div style={{ marginTop:4 }}><span className={`priority-tag ${getPriority(modal, currentStep)}`}>{getPriority(modal, currentStep)}</span></div></div>
              {modal.weight_tons && <div><div className="label-muted">Weight</div><div style={{ marginTop:4, fontWeight:600 }}>{modal.weight_tons}t</div></div>}
              {modal.deadline_step && <div><div className="label-muted">Deadline</div><div style={{ marginTop:4, fontWeight:600 }}>Step {modal.deadline_step}</div></div>}
              {modal.cargo_flags && <div><div className="label-muted">Cargo Flags</div><div style={{ marginTop:4, fontWeight:600 }}>{modal.cargo_flags.join(', ')}</div></div>}
              {modal.penalty_per_step_late && <div><div className="label-muted">Late Penalty</div><div style={{ marginTop:4, fontWeight:600, color:'var(--accent-danger)' }}>{modal.penalty_per_step_late}/step</div></div>}
            </div>
            {apiShipments && (
              <div>
                <div className="label-muted" style={{ marginBottom:8 }}>Route to Warehouse</div>
                <select value={rerouteWh} onChange={e=>setRerouteWh(e.target.value)}
                  style={{ fontFamily:'var(--font)', width:'100%', padding:'10px 14px', border:'1px solid var(--border)', borderRadius:6, background:'var(--bg-secondary)', fontSize:13, cursor:'pointer' }}>
                  <option value="">Select warehouse…</option>
                  {WAREHOUSES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            )}
          </div>
        )}
        actions={modal && [
          <button key="r" className="btn-primary" style={{ padding:'12px 24px' }}
            onClick={() => handleReroute(modal)}>
            {apiShipments ? 'Confirm Reroute' : 'Reroute Shipment'}
          </button>,
          apiShipments && <button key="p" className="btn-modify"
            onClick={() => { handlePrioritize(modal.shipment_id); setModal(null); }}>
            Prioritize
          </button>,
          <button key="c" className="btn-modify" onClick={() => { setModal(null); setRerouteWh(''); }}>Close</button>
        ].filter(Boolean)}
      />
    </div>
  );
}
