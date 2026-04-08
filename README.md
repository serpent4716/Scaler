# DISPATCH — AI Logistics Dispatcher

A luxury-themed 10-page logistics intelligence dashboard built with React + Vite.

## Stack
- React 18
- Vite 5
- League Spartan (Google Fonts)
- Pure CSS (no UI library)

## Pages
1. **Landing** — Hero with animated badge, live KPI preview
2. **Dashboard** — KPI cards, mini map, live activity feed, alert banner
3. **Shipments** — Filterable table with modal detail view + reroute
4. **Map & Routing** — Spatial view with warehouses, trucks, routes
5. **Alerts** — Raw message vs AI interpretation side-by-side
6. **AI Decisions** — Accept/reject/edit AI suggestions with confidence scores
7. **Fleet** — Vehicle cards with status and assign functionality
8. **Warehouses** — Capacity bars, location stats
9. **Scenario Simulator** — 6 live disruption scenarios with animated terminal log
10. **Analytics** — KPI bars, bar charts, donut chart, trend line

## Getting Started

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Build for Production

```bash
npm run build
npm run preview
```

## Design System
- Font: League Spartan (900/700/400/300)
- Primary BG: #f5f2ee (warm off-white)
- Secondary BG: #ede9e3
- Accent: #b8c4a0 (sage green)
- Accent Dark: #8fa87a
- Alert: #d4956a
- Danger: #c97a7a
- All animations: cubic-bezier(0.16, 1, 0.3, 1) — 1s duration
