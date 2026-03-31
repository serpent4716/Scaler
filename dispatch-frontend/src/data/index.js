export const SHIPMENTS = [
  { id:'S-001', origin:'Seattle, WA', dest:'Chicago, IL', status:'delayed', priority:'high', cargo:'Electronics', eta:'+4h' },
  { id:'S-002', origin:'Portland, OR', dest:'Denver, CO', status:'on-time', priority:'med', cargo:'Pharmaceuticals', eta:'On track' },
  { id:'S-003', origin:'Los Angeles, CA', dest:'New York, NY', status:'rerouted', priority:'high', cargo:'Perishables ❄️', eta:'+1h' },
  { id:'S-004', origin:'Seattle, WA', dest:'Boston, MA', status:'delayed', priority:'high', cargo:'Auto Parts', eta:'+6h' },
  { id:'S-005', origin:'Denver, CO', dest:'Miami, FL', status:'on-time', priority:'low', cargo:'Textiles', eta:'On track' },
  { id:'S-006', origin:'Chicago, IL', dest:'Dallas, TX', status:'on-time', priority:'med', cargo:'Consumer Goods', eta:'On track' },
  { id:'S-007', origin:'Portland, OR', dest:'San Francisco, CA', status:'rerouted', priority:'med', cargo:'Machinery', eta:'+30m' },
  { id:'S-008', origin:'Boston, MA', dest:'Seattle, WA', status:'delayed', priority:'high', cargo:'Medical Supplies', eta:'+8h' },
  { id:'S-009', origin:'New York, NY', dest:'Los Angeles, CA', status:'on-time', priority:'low', cargo:'Books', eta:'On track' },
  { id:'S-010', origin:'Dallas, TX', dest:'Chicago, IL', status:'on-time', priority:'med', cargo:'Industrial', eta:'On track' },
  { id:'S-011', origin:'Miami, FL', dest:'Denver, CO', status:'delayed', priority:'high', cargo:'Perishables ❄️', eta:'+3h' },
  { id:'S-012', origin:'San Francisco, CA', dest:'Portland, OR', status:'rerouted', priority:'med', cargo:'Tech Hardware', eta:'+45m' },
];

export const ALERTS = [
  { type:'critical', raw:'"Port of Seattle experiencing severe weather conditions. All cargo operations suspended until further notice. Storm expected to last 48-72 hours."', ai:'Seattle Port is fully closed due to storm. 14 inbound shipments directly affected. Recommend immediate rerouting via Los Angeles or Vancouver. Estimated impact: +$28,000 logistics cost, 2-3 day delay.', time:'12 min ago', affected:'14 shipments' },
  { type:'critical', raw:'"UNION ALERT: Workers at Portland Depot B to strike starting 06:00 tomorrow. Management negotiations have broken down."', ai:'Portland Depot B will be operationally unavailable from 06:00 tomorrow. 8 shipments scheduled for drop-off must be redirected. Warehouse C (Denver) has 23% spare capacity and is the optimal alternate.', time:'34 min ago', affected:'8 shipments' },
  { type:'warning', raw:'"Weather forecast: Heavy snowfall expected in Midwest corridor over next 48 hours. Roads may be affected."', ai:'Midwest routes face potential slowdowns. 5 shipments using I-80 corridor flagged. No immediate rerouting needed but monitoring advised. Pre-position 2 trucks in Chicago as contingency.', time:'1h ago', affected:'5 shipments' },
  { type:'warning', raw:'"Warehouse C capacity alert: Current load 94%, projected to reach 100% in 18 hours based on inbound schedule."', ai:'Denver Warehouse C approaching capacity threshold. Block 3 inbound shipments, redirect to Chicago (Depot D, 61% capacity). Alternatively, expedite 6 outbound shipments to free space.', time:'2h ago', affected:'3 shipments' },
  { type:'info', raw:'"New customs clearance policy for electronics entering East Coast ports effective next Monday."', ai:'New customs rules may add 4-6 hours to East Coast electronics shipments. 2 future shipments (S-018, S-024) flagged for documentation review. No current shipments impacted.', time:'3h ago', affected:'2 future shipments' },
  { type:'info', raw:'"Fuel prices on West Coast dropped 8% this week."', ai:'West Coast fuel cost reduction. Current 3 active West Coast routes save approximately $1,200 combined. No routing changes needed — savings already captured.', time:'4h ago', affected:'Cost optimization' },
];

export const DECISIONS_INITIAL = [
  { id:'D-01', action:'Reroute Shipment S-001 and S-004 from Seattle Port to Los Angeles Port', reason:'Seattle Port closed due to storm (Alert #1). LA port has capacity. Estimated delay: +2h vs +6h current. Cost delta: +$840 (rerouting) vs +$3,200 (waiting).', confidence:'97%', impact:'Saves $2,360 per shipment', status:'pending' },
  { id:'D-02', action:'Redirect 8 shipments from Depot B (Portland) to Depot C (Denver)', reason:'Labor strike confirmed for tomorrow 06:00. Denver Warehouse C has 23% spare capacity (sufficient for 8 loads). Reroute trucks T-07, T-08, T-12 tonight.', confidence:'93%', impact:'Avoids 24h+ delay', status:'accepted' },
  { id:'D-03', action:'Assign Refrigerated Truck RF-03 to Shipment S-011 (Perishables)', reason:'S-011 contains temperature-sensitive cargo. Current truck T-14 (standard) is insufficient. RF-03 is idle at Denver depot 18km away. No impact to other routes.', confidence:'99%', impact:'Prevents cargo loss ~$45k', status:'pending' },
  { id:'D-04', action:'Hold 3 inbound shipments to Warehouse C for 18 hours', reason:'Denver warehouse at 94% capacity. Holding shipments S-019, S-022, S-031 prevents overflow. Trucks can be temporarily redirected to Chicago (Depot D).', confidence:'88%', impact:'Avoids facility disruption', status:'pending' },
  { id:'D-05', action:'Pre-position Trucks T-05 and T-06 to Chicago hub', reason:'Midwest snowstorm forecast in 48h. Having trucks pre-positioned reduces response time from 6h to 45min if rerouting needed. Cost: 2 idle truck-hours (~$180).', confidence:'82%', impact:'Risk mitigation', status:'rejected' },
  { id:'D-06', action:'Expedite Shipment S-003 on alternative I-70 route', reason:'S-003 (Perishables, High Priority) currently delayed due to I-80 congestion. I-70 via Kansas City adds 40mi but saves estimated 3h. Driver notified, approval pending.', confidence:'91%', impact:'Saves 3h on HiPri cargo', status:'pending' },
];

export const FLEET = [
  { id:'T-01', type:'Standard 18-Wheeler', status:'busy', driver:'M. Rodriguez', location:'I-80 Denver', load:'Electronics - S-001', cap:'80%' },
  { id:'T-02', type:'Standard 18-Wheeler', status:'busy', driver:'J. Kim', location:'Portland OR', load:'Consumer Goods', cap:'65%' },
  { id:'T-03', type:'Standard 18-Wheeler', status:'idle', driver:'Unassigned', location:'Seattle Depot', load:'—', cap:'0%' },
  { id:'RF-01', type:'Refrigerated ❄️', status:'busy', driver:'S. Patel', location:'I-5 California', load:'Pharmaceuticals S-002', cap:'90%' },
  { id:'RF-02', type:'Refrigerated ❄️', status:'busy', driver:'A. Johnson', location:'Denver CO', load:'Perishables S-003', cap:'75%' },
  { id:'RF-03', type:'Refrigerated ❄️', status:'idle', driver:'Unassigned', location:'Denver Depot', load:'—', cap:'0%' },
  { id:'T-04', type:'Heavy Flatbed', status:'idle', driver:'Unassigned', location:'Chicago Hub', load:'—', cap:'0%' },
  { id:'T-05', type:'Standard 18-Wheeler', status:'busy', driver:'L. Chen', location:'I-90 Chicago', load:'Auto Parts S-004', cap:'55%' },
  { id:'T-06', type:'Standard 18-Wheeler', status:'maintenance', driver:'Grounded', location:'Dallas Depot', load:'—', cap:'—' },
  { id:'T-07', type:'Standard 18-Wheeler', status:'idle', driver:'Unassigned', location:'Portland Depot', load:'—', cap:'0%' },
  { id:'LT-01', type:'Light Van', status:'busy', driver:'P. Williams', location:'New York NY', load:'Documents', cap:'30%' },
  { id:'LT-02', type:'Light Van', status:'idle', driver:'Unassigned', location:'Miami FL', load:'—', cap:'0%' },
];

export const WAREHOUSES = [
  { name:'Depot A', loc:'Seattle, WA', status:'closed', cap:42, slots:1200, incoming:0, icon:'🏭' },
  { name:'Depot B', loc:'Portland, OR', status:'open', cap:71, slots:2400, incoming:8, icon:'🏭' },
  { name:'Warehouse C', loc:'Denver, CO', status:'near-full', cap:94, slots:3200, incoming:6, icon:'🏗️' },
  { name:'Depot D', loc:'Chicago, IL', status:'open', cap:61, slots:2800, incoming:12, icon:'🏭' },
  { name:'Hub E', loc:'New York, NY', status:'open', cap:55, slots:4100, incoming:18, icon:'🏢' },
  { name:'Depot F', loc:'Los Angeles, CA', status:'open', cap:38, slots:2200, incoming:14, icon:'🏭' },
  { name:'Depot G', loc:'Dallas, TX', status:'open', cap:29, slots:1800, incoming:5, icon:'🏭' },
  { name:'Hub H', loc:'Miami, FL', status:'open', cap:47, slots:1600, incoming:3, icon:'🏢' },
];

export const ACTIVITIES = [
  { msg:'AI rerouted S-001 via Los Angeles Port', time:'2 min ago', color:'var(--accent-dark)', tag:'AI Action', tagBg:'rgba(143,168,122,0.15)', tagColor:'var(--accent-dark)' },
  { msg:'Storm alert received — Seattle operations suspended', time:'12 min ago', color:'var(--accent-danger)', tag:'Critical', tagBg:'rgba(201,122,122,0.12)', tagColor:'var(--accent-danger)' },
  { msg:'Truck RF-03 assigned to shipment S-011', time:'18 min ago', color:'var(--accent)', tag:'Fleet', tagBg:'rgba(184,196,160,0.2)', tagColor:'#6b8c5a' },
  { msg:'Depot B strike notice processed', time:'34 min ago', color:'var(--accent-alert)', tag:'Warning', tagBg:'rgba(212,149,106,0.15)', tagColor:'var(--accent-alert)' },
  { msg:'S-003 successfully rerouted — ETA updated', time:'1h ago', color:'var(--accent-dark)', tag:'Resolved', tagBg:'rgba(143,168,122,0.15)', tagColor:'var(--accent-dark)' },
];

export const SCENARIOS = {
  storm: {
    icon:'🌪️', title:'Storm at Seattle Port',
    desc:'Port closure affecting 14 inbound shipments. AI must reroute via LA or Vancouver.',
    log:[
      { t:'trigger', msg:'[TRIGGER] Storm scenario initiated: Seattle Port' },
      { t:'', msg:'Identifying affected shipments...' },
      { t:'', msg:'Found 14 shipments routing through Seattle Port' },
      { t:'', msg:' S-001, S-004, S-017, S-021, S-029... (+9 more)' },
      { t:'', msg:'Calculating alternate routes...' },
      { t:'highlight', msg:'[AI] Optimal reroute: Los Angeles Port (cost +$840/shipment)' },
      { t:'highlight', msg:'[AI] Secondary option: Vancouver BC (requires customs clearance +6h)' },
      { t:'', msg:'Notifying drivers: T-01, T-05, T-09, T-14...' },
      { t:'success', msg:'[SUCCESS] 12/14 shipments rerouted successfully' },
      { t:'error', msg:'[WARN] 2 shipments (S-004, S-021) require manual review' },
      { t:'', msg:' Estimated total impact: +$11,800 | Delay avoided: 48-72h' },
      { t:'success', msg:'[DONE] AI decision generated → Navigate to AI Decisions panel' },
    ]
  },
  strike: {
    icon:'✊', title:'Depot B Labor Strike',
    desc:'Portland depot unavailable tomorrow. 8 shipments need alternate drop points.',
    log:[
      { t:'trigger', msg:'[TRIGGER] Labor strike scenario: Portland Depot B' },
      { t:'', msg:'Strike effective: tomorrow 06:00 local time' },
      { t:'', msg:'Scanning shipments destined for Depot B...' },
      { t:'', msg:'Found 8 affected shipments (S-002, S-007, S-012...)' },
      { t:'', msg:'Checking alternate capacity...' },
      { t:'', msg:'Denver Warehouse C: 23% available (6/8 loads fit)' },
      { t:'', msg:'Chicago Depot D: 39% available (overflow capacity)' },
      { t:'highlight', msg:'[AI] Reroute 6 shipments to Denver, 2 to Chicago' },
      { t:'', msg:'Trucks T-07, T-08, T-12 flagged for diversion tonight' },
      { t:'', msg:'Driver notifications queued for 22:00 dispatch' },
      { t:'success', msg:'[SUCCESS] All 8 shipments rerouted. Zero delays expected.' },
      { t:'success', msg:'[DONE] Decisions added to AI panel for approval' },
    ]
  },
  capacity: {
    icon:'📦', title:'Warehouse C Overflow',
    desc:'Denver warehouse at 98% capacity. Block new inbounds, reroute to Chicago.',
    log:[
      { t:'trigger', msg:'[TRIGGER] Capacity overflow: Warehouse C Denver' },
      { t:'', msg:'Current load: 94% → Projected 100% in 18h' },
      { t:'', msg:'Scanning inbound schedule for Warehouse C...' },
      { t:'', msg:'Found 6 inbound shipments in next 12 hours' },
      { t:'highlight', msg:'[AI] BLOCK 3 low-priority inbounds (S-019, S-022, S-031)' },
      { t:'highlight', msg:'[AI] EXPEDITE 4 outbound shipments to clear space' },
      { t:'', msg:'Contacting Depot D Chicago — capacity confirmed 39%' },
      { t:'', msg:'Redirecting S-019 → Chicago ETA +2h' },
      { t:'', msg:'Redirecting S-022 → Chicago ETA +2.5h' },
      { t:'', msg:'Redirecting S-031 → Los Angeles Depot F ETA +4h' },
      { t:'success', msg:'[SUCCESS] Warehouse C capped at 89% after adjustment' },
      { t:'success', msg:'[DONE] Overflow prevented. No critical cargo affected.' },
    ]
  },
  truck: {
    icon:'🚛', title:'Fleet Breakdown ×3',
    desc:'Three refrigerated trucks out of service. Perishable shipments at risk.',
    log:[
      { t:'trigger', msg:'[TRIGGER] Fleet breakdown: 3 refrigerated units offline' },
      { t:'', msg:'Affected: RF-04, RF-05, RF-07 (mechanical failure)' },
      { t:'', msg:'Scanning perishable shipments at risk...' },
      { t:'error', msg:'HIGH RISK: S-011 (Dairy, 4h to expiry window)' },
      { t:'error', msg:'HIGH RISK: S-003 (Pharmaceuticals, temperature critical)' },
      { t:'', msg:'MEDIUM RISK: S-018 (Produce, 8h buffer)' },
      { t:'highlight', msg:'[AI] Assign RF-03 (idle, Denver) → S-011 IMMEDIATELY' },
      { t:'highlight', msg:'[AI] Assign RF-01 (completing S-002) → S-003 post-delivery' },
      { t:'highlight', msg:'[AI] Book external reefer truck via API for S-018' },
      { t:'', msg:'External booking initiated: ColdChain Logistics API...' },
      { t:'success', msg:'[SUCCESS] Truck CL-4421 confirmed for S-018 (ETA 45min)' },
      { t:'success', msg:'[DONE] All perishables covered. Estimated cost: +$2,100' },
    ]
  },
  demand: {
    icon:'📈', title:'Demand Surge (+40%)',
    desc:'Sudden volume spike. AI must allocate idle fleet and reprioritize queue.',
    log:[
      { t:'trigger', msg:'[TRIGGER] Demand surge detected: +40% volume spike' },
      { t:'', msg:'New shipments queued: 89 additional orders' },
      { t:'', msg:'Current fleet utilization: 82% → 94% projected' },
      { t:'', msg:'Scanning idle fleet assets...' },
      { t:'', msg:'Found: T-03 (Seattle), T-04 (Chicago), T-07 (Portland), LT-02 (Miami)' },
      { t:'highlight', msg:'[AI] Activate all 4 idle trucks immediately' },
      { t:'highlight', msg:'[AI] Reprioritize queue — high-value shipments first' },
      { t:'highlight', msg:'[AI] Flag 12 low-priority shipments for 24h delay' },
      { t:'', msg:'[AI] Request 3rd-party overflow from LogiPartner API' },
      { t:'', msg:'Partner API response: 6 trucks available, +$340/truck surcharge' },
      { t:'', msg:'Queue rebalanced. On-time rate projection: 89%' },
      { t:'success', msg:'[DONE] Surge absorbed. Client notifications sent.' },
    ]
  },
  blackout: {
    icon:'⚡', title:'Grid Outage — Midwest',
    desc:'Power failure at Chicago hub. Operations suspended for estimated 6 hours.',
    log:[
      { t:'trigger', msg:'[TRIGGER] Grid outage: Chicago Midwest Hub' },
      { t:'', msg:'Estimated downtime: 4-6 hours' },
      { t:'', msg:'Affected: Depot D Chicago — all operations suspended' },
      { t:'', msg:'Scanning shipments routing through Chicago...' },
      { t:'', msg:'Found 22 shipments with Chicago as waypoint' },
      { t:'highlight', msg:'[AI] Reroute 14 critical shipments bypassing Chicago' },
      { t:'', msg:'Alternative corridor: Indianapolis → Columbus → Pittsburgh' },
      { t:'highlight', msg:'[AI] Hold 8 non-urgent shipments at previous waypoints' },
      { t:'', msg:'Notifying 8 drivers to hold position...' },
      { t:'', msg:'Generator backup at Depot D: partial ops at 30% capacity' },
      { t:'highlight', msg:'[AI] Leverage partial capacity for 4 highest-priority loads' },
      { t:'success', msg:'[SUCCESS] 18/22 shipments managed. 4 held for hub restoration.' },
      { t:'success', msg:'[DONE] Estimated impact: +$4,200. Normal ops resume in 5h.' },
    ]
  },
};
