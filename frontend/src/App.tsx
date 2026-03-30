import React, { useState, useEffect, useContext, createContext, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import {
  Truck, Package, AlertTriangle, CheckCircle, Clock, MapPin, Building2,
  Inbox, Brain, BarChart3, Play, Pause, ChevronRight, X, Snowflake,
  AlertOctagon, Box, Shield, Zap, RefreshCw, Send, Eye, EyeOff,
  TrendingUp, Activity, Layers, Settings, Home, Navigation2 as Navigation
} from 'lucide-react';

// Fix Leaflet default marker icon issue
(L.Icon.Default.prototype as any)._getIconUrl = undefined;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// API Configuration
const API_BASE = 'http://localhost:7860';

// Types
interface Shipment {
  id: string;
  cargo_type: 'STANDARD' | 'REFRIGERATED' | 'HAZMAT' | 'OVERSIZED';
  weight_tons: number;
  deadline_step: number;
  status: 'UNASSIGNED' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'DELAYED';
  assigned_warehouse: string | null;
  assigned_truck: string | null;
  penalty_per_step: number;
  is_fragile: boolean;
  dispatch_step: number | null;
}

interface Warehouse {
  id: string;
  name: string;
  location: string;
  max_capacity_tons: number;
  current_load_tons: number;
  is_operational: boolean;
  strike_active: boolean;
  accepts_hazmat: boolean;
  has_refrigeration: boolean;
  coordinates: [number, number];
}

interface Truck {
  id: string;
  max_capacity_tons: number;
  current_load_tons: number;
  status: 'AVAILABLE' | 'IN_TRANSIT';
  current_location: string;
  destination: string | null;
  hazmat_certified: boolean;
  estimated_arrival_step: number | null;
}

interface Alert {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  subject: string;
  body: string;
  step_received: number;
  is_read: boolean;
  inbox_index: number;
}

interface GameState {
  current_step: number;
  episode_score: number;
  difficulty: 'easy' | 'medium' | 'hard';
  shipments: Shipment[];
  warehouses: Warehouse[];
  trucks: Truck[];
  alerts: Alert[];
  last_action_message: string;
  last_action_type: string;
  reward_history: { step: number; reward: number; components: any }[];
  is_terminal: boolean;
}

// Context
const AppContext = createContext<{
  state: GameState | null;
  isPolling: boolean;
  actionHistory: { step: number; message: string; type: string }[];
  resetGame: (difficulty: string) => Promise<void>;
  takeAction: (action: any) => Promise<any>;
  startPolling: () => void;
  stopPolling: () => void;
} | null>(null);

// Warehouse coordinates
const WAREHOUSE_COORDS: Record<string, [number, number]> = {
  'WH_PDX_MAIN': [45.5051, -122.6750],
  'WH_PDX_COLD': [45.4900, -122.6600],
  'WH_TAC_NORTH': [47.2529, -122.4443],
  'WH_TAC_SOUTH': [47.2000, -122.4300],
  'WH_SPK_CENTRAL': [47.6588, -117.4260],
  'WH_VAN_BC': [49.2827, -123.1207],
  'WH_BOI_LOGISTICS': [43.6150, -116.2023],
};

const SEATTLE_PORT: [number, number] = [47.6062, -122.3321];

// Mock initial state for demo
const createMockState = (difficulty: string = 'medium'): GameState => {
  const shipmentCount = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 30 : 50;
  const cargoTypes: Shipment['cargo_type'][] = ['STANDARD', 'REFRIGERATED', 'HAZMAT', 'OVERSIZED'];
  const statuses: Shipment['status'][] = ['UNASSIGNED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'DELAYED'];
  
  const shipments: Shipment[] = Array.from({ length: shipmentCount }, (_, i) => ({
    id: `SHP_${String(i + 1).padStart(3, '0')}`,
    cargo_type: cargoTypes[Math.floor(Math.random() * cargoTypes.length)],
    weight_tons: Math.floor(Math.random() * 20) + 5,
    deadline_step: Math.floor(Math.random() * 50) + 10,
    status: i < 5 ? 'DELIVERED' : i < 10 ? 'IN_TRANSIT' : i < 20 ? 'ASSIGNED' : statuses[Math.floor(Math.random() * 3)],
    assigned_warehouse: i < 20 ? Object.keys(WAREHOUSE_COORDS)[Math.floor(Math.random() * 7)] : null,
    assigned_truck: i < 10 ? `TRK_${String(Math.floor(Math.random() * 8) + 1).padStart(3, '0')}` : null,
    penalty_per_step: Math.floor(Math.random() * 50) + 10,
    is_fragile: Math.random() > 0.7,
    dispatch_step: i < 10 ? Math.floor(Math.random() * 5) : null,
  }));

  const warehouses: Warehouse[] = [
    { id: 'WH_PDX_MAIN', name: 'Portland Main Hub', location: 'Portland, OR', max_capacity_tons: 500, current_load_tons: 320, is_operational: true, strike_active: false, accepts_hazmat: true, has_refrigeration: false, coordinates: WAREHOUSE_COORDS['WH_PDX_MAIN'] },
    { id: 'WH_PDX_COLD', name: 'Portland Cold Store', location: 'Portland, OR', max_capacity_tons: 200, current_load_tons: 150, is_operational: true, strike_active: false, accepts_hazmat: false, has_refrigeration: true, coordinates: WAREHOUSE_COORDS['WH_PDX_COLD'] },
    { id: 'WH_TAC_NORTH', name: 'Tacoma North', location: 'Tacoma, WA', max_capacity_tons: 400, current_load_tons: 0, is_operational: difficulty === 'hard' ? false : true, strike_active: difficulty === 'hard', accepts_hazmat: true, has_refrigeration: true, coordinates: WAREHOUSE_COORDS['WH_TAC_NORTH'] },
    { id: 'WH_TAC_SOUTH', name: 'Tacoma South', location: 'Tacoma, WA', max_capacity_tons: 350, current_load_tons: 280, is_operational: true, strike_active: false, accepts_hazmat: false, has_refrigeration: false, coordinates: WAREHOUSE_COORDS['WH_TAC_SOUTH'] },
    { id: 'WH_SPK_CENTRAL', name: 'Spokane Central', location: 'Spokane, WA', max_capacity_tons: 300, current_load_tons: 120, is_operational: true, strike_active: false, accepts_hazmat: true, has_refrigeration: true, coordinates: WAREHOUSE_COORDS['WH_SPK_CENTRAL'] },
    { id: 'WH_VAN_BC', name: 'Vancouver BC', location: 'Vancouver, BC', max_capacity_tons: 450, current_load_tons: 200, is_operational: true, strike_active: false, accepts_hazmat: false, has_refrigeration: true, coordinates: WAREHOUSE_COORDS['WH_VAN_BC'] },
    { id: 'WH_BOI_LOGISTICS', name: 'Boise Logistics', location: 'Boise, ID', max_capacity_tons: 250, current_load_tons: 80, is_operational: true, strike_active: false, accepts_hazmat: true, has_refrigeration: false, coordinates: WAREHOUSE_COORDS['WH_BOI_LOGISTICS'] },
  ];

  const trucks: Truck[] = Array.from({ length: 8 }, (_, i) => ({
    id: `TRK_${String(i + 1).padStart(3, '0')}`,
    max_capacity_tons: [25, 30, 35, 40][Math.floor(Math.random() * 4)],
    current_load_tons: Math.floor(Math.random() * 20),
    status: i < 3 ? 'IN_TRANSIT' : 'AVAILABLE',
    current_location: i < 3 ? 'In Transit' : Object.keys(WAREHOUSE_COORDS)[Math.floor(Math.random() * 7)],
    destination: i < 3 ? Object.keys(WAREHOUSE_COORDS)[Math.floor(Math.random() * 7)] : null,
    hazmat_certified: i % 3 === 0,
    estimated_arrival_step: i < 3 ? Math.floor(Math.random() * 10) + 5 : null,
  }));

  const alerts: Alert[] = [
    { id: 'ALT_001', severity: 'CRITICAL', subject: '🚨 PORT OF SEATTLE CLOSED - STORM WARNING', body: 'URGENT: The Port of Seattle has been closed due to severe weather conditions. All incoming shipments must be rerouted to alternative facilities. Expected duration: 24-48 hours. Recommend immediate action to prevent supply chain disruption.', step_received: 1, is_read: false, inbox_index: 0 },
    { id: 'ALT_002', severity: 'HIGH', subject: 'Capacity Alert: WH_PDX_MAIN approaching limit', body: 'Warning: Portland Main Hub is at 64% capacity and receiving increased volume due to port closure. Consider redistributing shipments to prevent overflow.', step_received: 3, is_read: false, inbox_index: 1 },
    { id: 'ALT_003', severity: 'MEDIUM', subject: 'Refrigerated cargo deadline approaching', body: 'Shipments SHP_012, SHP_018, SHP_024 contain refrigerated cargo with deadlines within 10 steps. Prioritize cold chain routing.', step_received: 5, is_read: true, inbox_index: 2 },
    ...(difficulty === 'hard' ? [{ id: 'ALT_004', severity: 'CRITICAL' as const, subject: '🪧 STRIKE NOTICE: Tacoma North Warehouse', body: 'LABOR DISPUTE: Workers at WH_TAC_NORTH have initiated a strike. Facility is non-operational until further notice. All assigned shipments must be rerouted immediately.', step_received: 2, is_read: false, inbox_index: 3 }] : []),
  ];

  return {
    current_step: 8,
    episode_score: 0.45,
    difficulty: difficulty as 'easy' | 'medium' | 'hard',
    shipments,
    warehouses,
    trucks,
    alerts,
    last_action_message: 'Routed SHP_015 to WH_PDX_MAIN. Estimated delivery in 12 steps.',
    last_action_type: 'route_shipment',
    reward_history: Array.from({ length: 8 }, (_, i) => ({
      step: i + 1,
      reward: (Math.random() - 0.3) * 0.1,
      components: { on_time_bonus: Math.random() * 0.05, late_penalty: -Math.random() * 0.02, violation_penalty: -Math.random() * 0.01 }
    })),
    is_terminal: false,
  };
};

// App Provider
const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GameState | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [actionHistory, setActionHistory] = useState<{ step: number; message: string; type: string }[]>([]);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/state`);
      if (response.ok) {
        const data = await response.json();
        setState(data);
        if (data.last_action_message) {
          setActionHistory(prev => {
            const newEntry = { step: data.current_step, message: data.last_action_message, type: data.last_action_type };
            if (prev.length === 0 || prev[0].message !== newEntry.message) {
              return [newEntry, ...prev.slice(0, 49)];
            }
            return prev;
          });
        }
      }
    } catch (error) {
      // API not available, use mock state
      if (!state) {
        setState(createMockState('medium'));
      }
    }
  }, [state]);

  const resetGame = async (difficulty: string) => {
    try {
      const response = await fetch(`${API_BASE}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty }),
      });
      if (response.ok) {
        const data = await response.json();
        setState(data);
        setActionHistory([]);
      }
    } catch (error) {
      // Use mock state
      setState(createMockState(difficulty));
      setActionHistory([]);
    }
  };

  const takeAction = async (action: any) => {
    try {
      const response = await fetch(`${API_BASE}/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      if (response.ok) {
        const data = await response.json();
        setState(prev => prev ? { ...prev, ...data.observation, reward_history: [...(prev.reward_history || []), { step: data.observation.current_step, reward: data.reward_info.total_reward, components: data.reward_info }] } : data.observation);
        return data;
      }
    } catch (error) {
      // Mock response
      setState(prev => {
        if (!prev) return prev;
        const newStep = prev.current_step + 1;
        return {
          ...prev,
          current_step: newStep,
          episode_score: Math.min(1, prev.episode_score + (Math.random() - 0.3) * 0.05),
          last_action_message: `Action executed: ${action.action_type}`,
          last_action_type: action.action_type,
        };
      });
      return { reward_info: { total_reward: (Math.random() - 0.3) * 0.1 } };
    }
  };

  const startPolling = useCallback(() => {
    if (!pollingRef.current) {
      setIsPolling(true);
      pollingRef.current = setInterval(fetchState, 2000);
    }
  }, [fetchState]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
      setIsPolling(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  return (
    <AppContext.Provider value={{ state, isPolling, actionHistory, resetGame, takeAction, startPolling, stopPolling }}>
      {children}
    </AppContext.Provider>
  );
};

const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

// Components
const AnimatedCounter: React.FC<{ end: number; duration?: number; suffix?: string }> = ({ end, duration = 2000, suffix = '' }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTime: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [end, duration]);

  return <span>{count}{suffix}</span>;
};

const PulsingDot: React.FC<{ color: string }> = ({ color }) => (
  <span className={`inline-block w-2 h-2 rounded-full ${color} animate-pulse`} />
);

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    'UNASSIGNED': 'bg-gray-600 text-gray-200',
    'ASSIGNED': 'bg-violet-500/20 text-violet-400 border border-violet-500/50',
    'IN_TRANSIT': 'bg-amber-500/20 text-amber-400 border border-amber-500/50',
    'DELIVERED': 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50',
    'DELAYED': 'bg-red-500/20 text-red-500 border border-red-500/50',
    'AVAILABLE': 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50',
    'CRITICAL': 'bg-red-500/20 text-red-500 border border-red-500/50',
    'HIGH': 'bg-orange-500/20 text-orange-400 border border-orange-500/50',
    'MEDIUM': 'bg-amber-500/20 text-amber-400 border border-amber-500/50',
    'LOW': 'bg-blue-500/20 text-blue-400 border border-blue-500/50',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-600'}`}>
      {status}
    </span>
  );
};

const ProgressRing: React.FC<{ progress: number; size?: number; strokeWidth?: number; color?: string }> = ({ 
  progress, size = 60, strokeWidth = 6, color = 'stroke-violet-500' 
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-gray-700"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={color}
      />
    </svg>
  );
};

const CargoIcons: React.FC<{ shipment: Shipment }> = ({ shipment }) => (
  <div className="flex gap-1">
    {shipment.cargo_type === 'REFRIGERATED' && <span title="Refrigerated" className="text-cyan-400">❄️</span>}
    {shipment.cargo_type === 'HAZMAT' && <span title="Hazmat" className="text-orange-500">☢️</span>}
    {shipment.cargo_type === 'OVERSIZED' && <span title="Oversized" className="text-blue-400">📦</span>}
    {shipment.is_fragile && <span title="Fragile" className="text-amber-400">🔸</span>}
  </div>
);

const Navbar: React.FC<{ currentPage: string; setPage: (page: string) => void; difficulty?: string }> = ({ currentPage, setPage, difficulty }) => {
  const pages = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'shipments', label: 'Shipments', icon: Package },
    { id: 'map', label: 'Map', icon: MapPin },
    { id: 'alerts', label: 'Alerts', icon: Inbox },
    { id: 'ai', label: 'AI Panel', icon: Brain },
    { id: 'fleet', label: 'Fleet', icon: Truck },
    { id: 'warehouses', label: 'Warehouses', icon: Building2 },
    { id: 'simulator', label: 'Simulator', icon: Play },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3 sticky top-0 z-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white">SCD Dispatcher</span>
        </div>
        <div className="flex items-center gap-1">
          {pages.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                currentPage === id
                  ? 'bg-violet-500/20 text-violet-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </div>
        {difficulty && (
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            difficulty === 'easy' ? 'bg-emerald-500/20 text-emerald-400' :
            difficulty === 'medium' ? 'bg-amber-500/20 text-amber-400' :
            'bg-red-500/20 text-red-500'
          }`}>
            {difficulty.toUpperCase()}
          </div>
        )}
      </div>
    </nav>
  );
};

// Page Components
const LandingPage: React.FC<{ onLaunch: () => void }> = ({ onLaunch }) => {
  const [lineProgress, setLineProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLineProgress(prev => (prev >= 100 ? 0 : prev + 0.5));
    }, 20);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]" />
      
      {/* Content */}
      <div className="text-center z-10 px-4">
        <div className="mb-8">
          <div className="w-20 h-20 bg-violet-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-violet-500/30">
            <Truck className="w-10 h-10 text-violet-400" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
            Supply Chain Disruption
            <br />
            <span className="text-violet-400">Dispatcher</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            An AI agent reroutes 50 shipments in real time when the Port of Seattle closes
          </p>
        </div>

        {/* Stats */}
        <div className="flex justify-center gap-12 mb-12">
          {[
            { value: 50, label: 'Shipments', icon: Package },
            { value: 7, label: 'Warehouses', icon: Building2 },
            { value: 8, label: 'Trucks', icon: Truck },
          ].map(({ value, label, icon: Icon }) => (
            <div key={label} className="text-center">
              <div className="text-4xl font-bold text-white mb-1">
                <AnimatedCounter end={value} />
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Icon className="w-4 h-4" />
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          onClick={onLaunch}
          className="bg-violet-500 hover:bg-violet-600 text-white px-8 py-4 rounded-xl font-semibold text-lg flex items-center gap-2 mx-auto transition-all hover:scale-105 hover:shadow-lg hover:shadow-violet-500/25"
        >
          Launch Command Center
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Animated route line */}
      <div className="absolute bottom-20 left-0 right-0 h-1 bg-gray-800">
        <div 
          className="h-full bg-gradient-to-r from-transparent via-violet-500 to-transparent transition-all duration-100"
          style={{ width: '20%', marginLeft: `${lineProgress}%` }}
        />
        <div 
          className="absolute top-1/2 -translate-y-1/2 text-2xl transition-all duration-100"
          style={{ left: `${lineProgress + 10}%` }}
        >
          🚛
        </div>
      </div>
    </div>
  );
};

const DashboardPage: React.FC = () => {
  const { state, resetGame, actionHistory } = useApp();
  
  if (!state) return <div className="p-8 text-white">Loading...</div>;

  const totalShipments = state.shipments.length;
  const delayed = state.shipments.filter(s => s.status === 'DELAYED').length;
  const delivered = state.shipments.filter(s => s.status === 'DELIVERED').length;
  const criticalAlerts = state.alerts.filter(a => a.severity === 'CRITICAL' && !a.is_read);

  return (
    <div className="p-6 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Shipments</p>
              <p className="text-3xl font-bold text-white">{totalShipments}</p>
            </div>
            <ProgressRing progress={(delivered / totalShipments) * 100} />
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Delayed</p>
              <p className="text-3xl font-bold text-amber-400">{delayed}</p>
            </div>
            {delayed > 0 && <PulsingDot color="bg-amber-400" />}
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <p className="text-gray-400 text-sm">Delivered On-Time</p>
          <p className="text-3xl font-bold text-emerald-400">{delivered}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Active Alerts</p>
              <p className="text-3xl font-bold text-red-500">{criticalAlerts.length}</p>
            </div>
            {criticalAlerts.length > 0 && <PulsingDot color="bg-red-500" />}
          </div>
        </div>
      </div>

      {/* Alert Banner */}
      {criticalAlerts.length > 0 && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 flex items-center gap-4">
          <AlertOctagon className="w-6 h-6 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-red-500 font-semibold">{criticalAlerts[0].subject}</p>
          </div>
          <button className="text-red-400 hover:text-red-300 text-sm">View All Alerts →</button>
        </div>
      )}

      <div className="grid grid-cols-5 gap-6">
        {/* AI Feed */}
        <div className="col-span-3 bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-violet-400" />
            AI Agent Live Feed
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {actionHistory.slice(0, 10).map((action, i) => (
              <div key={i} className="flex items-start gap-3 text-sm p-2 bg-gray-800/50 rounded-lg">
                <span className="text-gray-500 font-mono">#{action.step}</span>
                <StatusPill status={action.type?.toUpperCase() || 'ACTION'} />
                <span className="text-gray-300">{action.message}</span>
              </div>
            ))}
            {actionHistory.length === 0 && (
              <p className="text-gray-500 text-center py-4">No actions yet. Start the simulation!</p>
            )}
          </div>
        </div>

        {/* Mini Map */}
        <div className="col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-violet-400" />
            Pacific Northwest
          </h3>
          <div className="h-48 rounded-lg overflow-hidden">
            <MapContainer center={[46.5, -120.5]} zoom={5} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer url="[{s}.basemaps.cartocdn.com](https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png)" />
              {state.warehouses.map(wh => (
                <Marker key={wh.id} position={wh.coordinates}>
                  <Popup>{wh.name}</Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      </div>

      {/* Difficulty & Score */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-white font-semibold mb-4">Select Difficulty</h3>
          <div className="grid grid-cols-3 gap-3">
            {['easy', 'medium', 'hard'].map(diff => (
              <button
                key={diff}
                onClick={() => resetGame(diff)}
                className={`p-4 rounded-xl border text-center transition-all ${
                  state.difficulty === diff
                    ? 'bg-violet-500/20 border-violet-500 text-violet-400'
                    : 'border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                <p className="font-semibold capitalize">{diff}</p>
                <p className="text-xs mt-1">{diff === 'easy' ? '10 shipments' : diff === 'medium' ? '30 shipments' : '50 + strike'}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-white font-semibold mb-4">Episode Score</h3>
          <div className="relative h-8 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                state.episode_score < 0.3 ? 'bg-red-500' : state.episode_score < 0.6 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${state.episode_score * 100}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-white font-semibold">
              {(state.episode_score * 100).toFixed(1)}%
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-2">Step {state.current_step}</p>
        </div>
      </div>
    </div>
  );
};

const ShipmentsPage: React.FC = () => {
  const { state, takeAction } = useApp();
  const [statusFilter, setStatusFilter] = useState('all');
  const [cargoFilter, setCargoFilter] = useState('all');
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [routeWarehouse, setRouteWarehouse] = useState('');
  const [routeRationale, setRouteRationale] = useState('');
  const [dispatchTruck, setDispatchTruck] = useState('');

  if (!state) return <div className="p-8 text-white">Loading...</div>;

  const filteredShipments = state.shipments.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter.toUpperCase()) return false;
    if (cargoFilter !== 'all' && s.cargo_type !== cargoFilter.toUpperCase()) return false;
    return true;
  });

  const availableWarehouses = state.warehouses.filter(w => 
    w.is_operational && !w.strike_active && 
    (selectedShipment?.cargo_type !== 'REFRIGERATED' || w.has_refrigeration) &&
    (selectedShipment?.cargo_type !== 'HAZMAT' || w.accepts_hazmat) &&
    (w.max_capacity_tons - w.current_load_tons >= (selectedShipment?.weight_tons || 0))
  );

  const availableTrucks = state.trucks.filter(t =>
    t.status === 'AVAILABLE' &&
    (selectedShipment?.cargo_type !== 'HAZMAT' || t.hazmat_certified) &&
    (t.max_capacity_tons - t.current_load_tons >= (selectedShipment?.weight_tons || 0))
  );

  const handleRoute = async () => {
    if (!selectedShipment || !routeWarehouse) return;
    await takeAction({
      action_type: 'route_shipment',
      shipment_id: selectedShipment.id,
      warehouse_id: routeWarehouse,
      rationale: routeRationale || 'Routing shipment to available warehouse'
    });
    setSelectedShipment(null);
    setRouteWarehouse('');
    setRouteRationale('');
  };

  const handleDispatch = async () => {
    if (!selectedShipment || !dispatchTruck) return;
    await takeAction({
      action_type: 'dispatch_truck',
      shipment_id: selectedShipment.id,
      truck_id: dispatchTruck,
      rationale: 'Dispatching truck for delivery'
    });
    setSelectedShipment(null);
    setDispatchTruck('');
  };

  return (
    <div className="p-6">
      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
        >
          <option value="all">All Statuses</option>
          <option value="unassigned">Unassigned</option>
          <option value="assigned">Assigned</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
          <option value="delayed">Delayed</option>
        </select>
        <select
          value={cargoFilter}
          onChange={e => setCargoFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
        >
          <option value="all">All Cargo Types</option>
          <option value="standard">Standard</option>
          <option value="refrigerated">Refrigerated</option>
          <option value="hazmat">Hazmat</option>
          <option value="oversized">Oversized</option>
        </select>
      </div>

      <div className="flex gap-6">
        {/* Table */}
        <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">ID</th>
                <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Cargo</th>
                <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Weight</th>
                <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Deadline</th>
                <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Warehouse</th>
                <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Truck</th>
                <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Penalty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredShipments.map(shipment => (
                <tr
                  key={shipment.id}
                  onClick={() => setSelectedShipment(shipment)}
                  className={`hover:bg-gray-800/50 cursor-pointer ${selectedShipment?.id === shipment.id ? 'bg-violet-500/10' : ''}`}
                >
                  <td className="px-4 py-3 text-white font-mono text-sm">{shipment.id}</td>
                  <td className="px-4 py-3"><CargoIcons shipment={shipment} /></td>
                  <td className="px-4 py-3 text-gray-300">{shipment.weight_tons}t</td>
                  <td className="px-4 py-3 text-gray-300">Step {shipment.deadline_step}</td>
                  <td className="px-4 py-3"><StatusPill status={shipment.status} /></td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{shipment.assigned_warehouse || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{shipment.assigned_truck || '—'}</td>
                  <td className="px-4 py-3 text-red-400">${shipment.penalty_per_step}/step</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Side Drawer */}
        {selectedShipment && (
          <div className="w-96 bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white font-semibold text-lg">{selectedShipment.id}</h3>
              <button onClick={() => setSelectedShipment(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-400">Cargo Type</span>
                <span className="text-white flex items-center gap-2">
                  <CargoIcons shipment={selectedShipment} />
                  {selectedShipment.cargo_type}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Weight</span>
                <span className="text-white">{selectedShipment.weight_tons} tons</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Deadline</span>
                <span className="text-white">Step {selectedShipment.deadline_step}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <StatusPill status={selectedShipment.status} />
              </div>
            </div>

            {/* Route Form */}
            {(selectedShipment.status === 'UNASSIGNED' || selectedShipment.status === 'DELAYED') && (
              <div className="border-t border-gray-800 pt-6 mb-6">
                <h4 className="text-white font-medium mb-4">Route Shipment</h4>
                <select
                  value={routeWarehouse}
                  onChange={e => setRouteWarehouse(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white mb-3"
                >
                  <option value="">Select Warehouse</option>
                  {availableWarehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.max_capacity_tons - w.current_load_tons}t available)</option>
                  ))}
                </select>
                <textarea
                  value={routeRationale}
                  onChange={e => setRouteRationale(e.target.value)}
                  placeholder="Rationale for routing decision..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white mb-3 h-20 resize-none"
                />
                <button
                  onClick={handleRoute}
                  disabled={!routeWarehouse}
                  className="w-full bg-violet-500 hover:bg-violet-600 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2 rounded-lg font-medium"
                >
                  Route Shipment
                </button>
              </div>
            )}

            {/* Dispatch Form */}
            {selectedShipment.status === 'ASSIGNED' && (
              <div className="border-t border-gray-800 pt-6">
                <h4 className="text-white font-medium mb-4">Dispatch Truck</h4>
                <select
                  value={dispatchTruck}
                  onChange={e => setDispatchTruck(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white mb-3"
                >
                  <option value="">Select Truck</option>
                  {availableTrucks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.id} ({t.max_capacity_tons - t.current_load_tons}t capacity)
                      {t.hazmat_certified && ' ☢️'}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleDispatch}
                  disabled={!dispatchTruck}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 text-white py-2 rounded-lg font-medium"
                >
                  Dispatch Truck
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const MapPage: React.FC = () => {
  const { state } = useApp();

  if (!state) return <div className="p-8 text-white">Loading...</div>;

  const getWarehouseColor = (wh: Warehouse) => {
    if (!wh.is_operational || wh.strike_active) return '#ef4444';
    if (wh.has_refrigeration) return '#22d3ee';
    const utilization = wh.current_load_tons / wh.max_capacity_tons;
    if (utilization > 0.8) return '#f59e0b';
    return '#10b981';
  };

  const createWarehouseIcon = (wh: Warehouse) => {
    const color = getWarehouseColor(wh);
    const size = 20 + (wh.current_load_tons / wh.max_capacity_tons) * 20;
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:3px solid ${wh.id === 'WH_VAN_BC' ? '#3b82f6' : 'white'};display:flex;align-items:center;justify-content:center;font-size:10px;">${!wh.is_operational || wh.strike_active ? '❌' : ''}</div>`,
      iconSize: [size, size],
      iconAnchor: [size/2, size/2],
    });
  };

  const portIcon = L.divIcon({
    className: 'port-marker',
    html: `<div style="background:#ef4444;padding:8px 12px;border-radius:8px;color:white;font-weight:bold;white-space:nowrap;border:2px solid white;">❌ PORT CLOSED</div>`,
    iconSize: [120, 40],
    iconAnchor: [60, 20],
  });

  const getRouteColor = (status: string) => {
    if (status === 'DELIVERED') return '#10b981';
    if (status === 'DELAYED') return '#f59e0b';
    return '#8b5cf6';
  };

  return (
    <div className="h-[calc(100vh-64px)] relative">
      <MapContainer center={[47.5, -122.5]} zoom={7} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="[{s}.basemaps.cartocdn.com](https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png)"
          attribution='&copy; <a href="[openstreetmap.org](https://www.openstreetmap.org/copyright)">OpenStreetMap</a>'
        />
        
        {/* Port of Seattle */}
        <Marker position={SEATTLE_PORT} icon={portIcon}>
          <Popup>
            <div className="text-center">
              <strong className="text-red-600">Port of Seattle</strong>
              <p className="text-sm">CLOSED - Storm Warning</p>
            </div>
          </Popup>
        </Marker>

        {/* Warehouses */}
        {state.warehouses.map(wh => (
          <Marker key={wh.id} position={wh.coordinates} icon={createWarehouseIcon(wh)}>
            <Popup>
              <div className="min-w-48">
                <strong>{wh.name}</strong>
                <p className="text-sm text-gray-600">{wh.location}</p>
                <div className="mt-2">
                  <div className="flex justify-between text-sm">
                    <span>Capacity</span>
                    <span>{wh.current_load_tons}/{wh.max_capacity_tons}t</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div 
                      className={`h-2 rounded-full ${wh.current_load_tons / wh.max_capacity_tons > 0.8 ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${(wh.current_load_tons / wh.max_capacity_tons) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex gap-1 mt-2">
                  {wh.has_refrigeration && <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded">❄️ Cold</span>}
                  {wh.accepts_hazmat && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">☢️ Hazmat</span>}
                  {wh.strike_active && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">🪧 Strike</span>}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Route lines */}
        {state.shipments
          .filter(s => s.assigned_warehouse && (s.status === 'ASSIGNED' || s.status === 'IN_TRANSIT' || s.status === 'DELIVERED'))
          .map(s => {
            const wh = state.warehouses.find(w => w.id === s.assigned_warehouse);
            if (!wh) return null;
            return (
              <Polyline
                key={s.id}
                positions={[SEATTLE_PORT, wh.coordinates]}
                color={getRouteColor(s.status)}
                weight={2}
                opacity={0.7}
                dashArray={s.status === 'ASSIGNED' ? '5,10' : undefined}
              />
            );
          })}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-6 left-6 bg-gray-900/95 backdrop-blur-sm rounded-xl p-4 border border-gray-800 z-[1000]">
        <h4 className="text-white font-medium mb-3">Legend</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-emerald-500" />
            <span className="text-gray-300">Operational Warehouse</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-cyan-400" />
            <span className="text-gray-300">Refrigerated Warehouse</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <span className="text-gray-300">Closed/Strike</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-violet-500" />
            <span className="text-gray-300">Assigned Route</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-emerald-500" />
            <span className="text-gray-300">Delivered</span>
          </div>
          <div className="flex items-center gap-2">
            <span>🚛</span>
            <span className="text-gray-300">Truck In Transit</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const AlertsPage: React.FC = () => {
  const { state, takeAction } = useApp();
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  if (!state) return <div className="p-8 text-white">Loading...</div>;

  const handleMarkRead = async (alert: Alert) => {
    await takeAction({
      action_type: 'read_inbox',
      inbox_index: alert.inbox_index,
      rationale: 'Acknowledging alert'
    });
  };

  const getAIInterpretation = (alert: Alert) => {
    if (alert.subject.includes('PORT')) {
      return 'The Port of Seattle closure requires immediate rerouting of all incoming shipments. Prioritize WH_PDX_MAIN and WH_SPK_CENTRAL as primary alternatives. Monitor capacity levels closely.';
    }
    if (alert.subject.includes('STRIKE')) {
      return 'WH_TAC_NORTH is non-operational. Redirect all assigned shipments to WH_TAC_SOUTH or WH_PDX_MAIN. Check for hazmat-certified alternatives if needed.';
    }
    if (alert.subject.includes('Capacity')) {
      return 'Consider redistributing incoming shipments to warehouses with lower utilization. WH_SPK_CENTRAL and WH_BOI_LOGISTICS have available capacity.';
    }
    if (alert.subject.includes('Refrigerated')) {
      return 'Prioritize routing these shipments to WH_PDX_COLD or WH_SPK_CENTRAL (refrigeration-capable facilities). Time-sensitive delivery required.';
    }
    return 'Review alert details and take appropriate action based on current operational status.';
  };

  return (
    <div className="h-[calc(100vh-64px)] flex">
      {/* Alert List */}
      <div className="w-1/3 border-r border-gray-800 overflow-y-auto">
        {state.alerts.map(alert => (
          <div
            key={alert.id}
            onClick={() => setSelectedAlert(alert)}
            className={`p-4 border-b border-gray-800 cursor-pointer hover:bg-gray-800/50 ${
              selectedAlert?.id === alert.id ? 'bg-violet-500/10' : ''
            } ${!alert.is_read ? 'border-l-4 border-l-violet-500 bg-gray-900/50' : ''}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <StatusPill status={alert.severity} />
              {!alert.is_read && <PulsingDot color="bg-violet-500" />}
            </div>
            <p className="text-white font-medium text-sm line-clamp-2">{alert.subject}</p>
            <p className="text-gray-500 text-xs mt-1">Step {alert.step_received}</p>
          </div>
        ))}
      </div>

      {/* Alert Detail */}
      <div className="flex-1 p-6">
        {selectedAlert ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <StatusPill status={selectedAlert.severity} />
              <span className="text-gray-400 text-sm">Received at Step {selectedAlert.step_received}</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">{selectedAlert.subject}</h2>
            
            <div className="bg-gray-800 rounded-xl p-6 mb-6 font-mono text-sm text-gray-300 whitespace-pre-wrap">
              {selectedAlert.body}
            </div>

            <div className={`rounded-xl p-6 mb-6 ${selectedAlert.severity === 'CRITICAL' ? 'bg-violet-500/20 border border-violet-500/50' : 'bg-violet-500/10'}`}>
              <h3 className="text-violet-400 font-semibold mb-3 flex items-center gap-2">
                <Brain className="w-5 h-5" />
                AI Interpretation
              </h3>
              <p className="text-gray-300">{getAIInterpretation(selectedAlert)}</p>
            </div>

            {!selectedAlert.is_read && (
              <button
                onClick={() => handleMarkRead(selectedAlert)}
                className="bg-violet-500 hover:bg-violet-600 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2"
              >
                <Eye className="w-5 h-5" />
                Mark as Read
              </button>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Select an alert to view details
          </div>
        )}
      </div>
    </div>
  );
};

const AIDecisionPage: React.FC = () => {
  const { state, takeAction } = useApp();
  const [actionType, setActionType] = useState('');
  const [shipmentId, setShipmentId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [truckId, setTruckId] = useState('');
  const [inboxIndex, setInboxIndex] = useState('');
  const [rationale, setRationale] = useState('');
  const [lastResult, setLastResult] = useState<{ reward: number; message: string } | null>(null);

  if (!state) return <div className="p-8 text-white">Loading...</div>;

  // Generate suggestions
  const suggestions: { action: string; target: string; reason: string; actionData: any }[] = [];
  
  const unreadCritical = state.alerts.find(a => a.severity === 'CRITICAL' && !a.is_read);
  if (unreadCritical) {
    suggestions.push({
      action: 'read_inbox',
      target: unreadCritical.subject.slice(0, 40) + '...',
      reason: 'Critical alert requires immediate attention',
      actionData: { action_type: 'read_inbox', inbox_index: unreadCritical.inbox_index, rationale: 'Acknowledging critical alert' }
    });
  }

  const refrigeratedUnassigned = state.shipments.find(s => s.cargo_type === 'REFRIGERATED' && s.status === 'UNASSIGNED');
  if (refrigeratedUnassigned) {
    const coldWarehouse = state.warehouses.find(w => w.has_refrigeration && w.is_operational && !w.strike_active);
    if (coldWarehouse) {
      suggestions.push({
        action: 'route_shipment',
        target: `${refrigeratedUnassigned.id} → ${coldWarehouse.id}`,
        reason: 'Refrigerated cargo needs cold storage',
        actionData: { action_type: 'route_shipment', shipment_id: refrigeratedUnassigned.id, warehouse_id: coldWarehouse.id, rationale: 'Routing refrigerated cargo to cold storage facility' }
      });
    }
  }

  const overloadedWarehouse = state.warehouses.find(w => w.current_load_tons / w.max_capacity_tons > 0.9);
  if (overloadedWarehouse) {
    suggestions.push({
      action: 'check_alternatives',
      target: overloadedWarehouse.id,
      reason: `Warehouse at ${Math.round(overloadedWarehouse.current_load_tons / overloadedWarehouse.max_capacity_tons * 100)}% capacity`,
      actionData: null
    });
  }

  const assignedShipment = state.shipments.find(s => s.status === 'ASSIGNED');
  const availableTruck = state.trucks.find(t => t.status === 'AVAILABLE');
  if (assignedShipment && availableTruck) {
    suggestions.push({
      action: 'dispatch_truck',
      target: `${availableTruck.id} for ${assignedShipment.id}`,
      reason: 'Shipment ready for dispatch',
      actionData: { action_type: 'dispatch_truck', shipment_id: assignedShipment.id, truck_id: availableTruck.id, rationale: 'Dispatching available truck for ready shipment' }
    });
  }

  const handleAccept = async (actionData: any) => {
    if (!actionData) return;
    const result = await takeAction(actionData);
    setLastResult({ reward: result?.reward_info?.total_reward || 0, message: 'Action executed successfully' });
  };

  const handleManualAction = async () => {
    const action: any = { action_type: actionType, rationale };
    if (actionType === 'route_shipment') {
      action.shipment_id = shipmentId;
      action.warehouse_id = warehouseId;
    } else if (actionType === 'dispatch_truck') {
      action.shipment_id = shipmentId;
      action.truck_id = truckId;
    } else if (actionType === 'read_inbox') {
      action.inbox_index = parseInt(inboxIndex);
    }
    const result = await takeAction(action);
    setLastResult({ reward: result?.reward_info?.total_reward || 0, message: 'Action executed' });
  };

  return (
    <div className="p-6 grid grid-cols-2 gap-6">
      {/* Suggestions */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-violet-400" />
          Suggested Actions
        </h3>
        <div className="space-y-4">
          {suggestions.length === 0 && (
            <p className="text-gray-500 text-center py-8">No suggestions at this time</p>
          )}
          {suggestions.map((s, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <StatusPill status={s.action.toUpperCase().replace('_', ' ')} />
                <span className="text-white font-medium">{s.target}</span>
              </div>
              <p className="text-gray-400 text-sm mb-3">{s.reason}</p>
              <div className="flex gap-2">
                {s.actionData && (
                  <button
                    onClick={() => handleAccept(s.actionData)}
                    className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    Accept
                  </button>
                )}
                <button className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual Action Builder */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-violet-400" />
          Manual Action Builder
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm block mb-2">Action Type</label>
            <select
              value={actionType}
              onChange={e => setActionType(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
            >
              <option value="">Select action...</option>
              <option value="route_shipment">Route Shipment</option>
              <option value="dispatch_truck">Dispatch Truck</option>
              <option value="read_inbox">Read Inbox</option>
              <option value="wait">Wait</option>
            </select>
          </div>

          {(actionType === 'route_shipment' || actionType === 'dispatch_truck') && (
            <div>
              <label className="text-gray-400 text-sm block mb-2">Shipment</label>
              <select
                value={shipmentId}
                onChange={e => setShipmentId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
              >
                <option value="">Select shipment...</option>
                {state.shipments
                  .filter(s => actionType === 'route_shipment' ? s.status === 'UNASSIGNED' : s.status === 'ASSIGNED')
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.id} - {s.cargo_type}</option>
                  ))}
              </select>
            </div>
          )}

          {actionType === 'route_shipment' && (
            <div>
              <label className="text-gray-400 text-sm block mb-2">Warehouse</label>
              <select
                value={warehouseId}
                onChange={e => setWarehouseId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
              >
                <option value="">Select warehouse...</option>
                {state.warehouses
                  .filter(w => w.is_operational && !w.strike_active)
                  .map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
              </select>
            </div>
          )}

          {actionType === 'dispatch_truck' && (
            <div>
              <label className="text-gray-400 text-sm block mb-2">Truck</label>
              <select
                value={truckId}
                onChange={e => setTruckId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
              >
                <option value="">Select truck...</option>
                {state.trucks
                  .filter(t => t.status === 'AVAILABLE')
                  .map(t => (
                    <option key={t.id} value={t.id}>{t.id} - {t.max_capacity_tons}t capacity</option>
                  ))}
              </select>
            </div>
          )}

          {actionType === 'read_inbox' && (
            <div>
              <label className="text-gray-400 text-sm block mb-2">Inbox Index</label>
              <select
                value={inboxIndex}
                onChange={e => setInboxIndex(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
              >
                <option value="">Select alert...</option>
                {state.alerts.filter(a => !a.is_read).map(a => (
                  <option key={a.inbox_index} value={a.inbox_index}>{a.subject.slice(0, 50)}...</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-gray-400 text-sm block mb-2">Rationale ({rationale.length}/200)</label>
            <textarea
              value={rationale}
              onChange={e => setRationale(e.target.value)}
              maxLength={200}
              placeholder="Explain your reasoning..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white h-24 resize-none"
            />
          </div>

          <button
            onClick={handleManualAction}
            disabled={!actionType || rationale.length < 10}
            className="w-full bg-violet-500 hover:bg-violet-600 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <Send className="w-5 h-5" />
            Execute Action
          </button>

          {lastResult && (
            <div className={`p-4 rounded-lg ${lastResult.reward >= 0 ? 'bg-emerald-500/20 border border-emerald-500/50' : 'bg-red-500/20 border border-red-500/50'}`}>
              <p className={lastResult.reward >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                Reward: {lastResult.reward >= 0 ? '+' : ''}{lastResult.reward.toFixed(4)}
              </p>
              <p className="text-gray-400 text-sm">{lastResult.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const FleetPage: React.FC = () => {
  const { state } = useApp();

  if (!state) return <div className="p-8 text-white">Loading...</div>;

  const availableCount = state.trucks.filter(t => t.status === 'AVAILABLE').length;
  const inTransitCount = state.trucks.filter(t => t.status === 'IN_TRANSIT').length;
  const totalCapacity = state.trucks.reduce((sum, t) => sum + t.max_capacity_tons, 0);
  const usedCapacity = state.trucks.reduce((sum, t) => sum + t.current_load_tons, 0);

  return (
    <div className="p-6">
      {/* Summary Bar */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6 flex items-center gap-8">
        <div>
          <span className="text-gray-400 text-sm">Available</span>
          <p className="text-2xl font-bold text-emerald-400">{availableCount}</p>
        </div>
        <div>
          <span className="text-gray-400 text-sm">In Transit</span>
          <p className="text-2xl font-bold text-amber-400">{inTransitCount}</p>
        </div>
        <div className="flex-1">
          <span className="text-gray-400 text-sm">Total Capacity Utilization</span>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-violet-500 rounded-full"
                style={{ width: `${(usedCapacity / totalCapacity) * 100}%` }}
              />
            </div>
            <span className="text-white font-medium">{Math.round((usedCapacity / totalCapacity) * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Truck Grid */}
      <div className="grid grid-cols-2 gap-4">
        {state.trucks.map(truck => (
          <div key={truck.id} className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${truck.status === 'AVAILABLE' ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                  <Truck className={`w-5 h-5 ${truck.status === 'AVAILABLE' ? 'text-emerald-400' : 'text-amber-400'}`} />
                </div>
                <div>
                  <h4 className="text-white font-semibold">{truck.id}</h4>
                  <StatusPill status={truck.status} />
                </div>
              </div>
              {truck.hazmat_certified && (
                <span className="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-xs font-medium">☢️ Hazmat Certified</span>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">Capacity</span>
                  <span className="text-white">{truck.current_load_tons}/{truck.max_capacity_tons}t</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${truck.current_load_tons / truck.max_capacity_tons > 0.8 ? 'bg-red-500' : 'bg-violet-500'}`}
                    style={{ width: `${(truck.current_load_tons / truck.max_capacity_tons) * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Location</span>
                <span className="text-white">
                  {truck.status === 'IN_TRANSIT' ? (
                    <span className="flex items-center gap-1">
                      In Transit <ChevronRight className="w-4 h-4" /> {truck.destination}
                    </span>
                  ) : truck.current_location}
                </span>
              </div>

              {truck.status === 'IN_TRANSIT' && truck.estimated_arrival_step && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Delivery Progress</span>
                    <span className="text-amber-400">ETA: Step {truck.estimated_arrival_step}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-amber-500 rounded-full animate-pulse"
                      style={{ width: '60%' }}
                    />
                  </div>
                </div>
              )}

              {truck.status === 'AVAILABLE' && (
                <button className="w-full mt-2 bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 py-2 rounded-lg text-sm font-medium border border-violet-500/30">
                  Assign to Shipment
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const WarehousesPage: React.FC = () => {
  const { state } = useApp();
  const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null);

  if (!state) return <div className="p-8 text-white">Loading...</div>;

  const getUtilizationColor = (wh: Warehouse) => {
    const util = wh.current_load_tons / wh.max_capacity_tons;
    if (util > 0.8) return 'stroke-red-500';
    if (util > 0.6) return 'stroke-amber-500';
    return 'stroke-emerald-500';
  };

  return (
    <div className="p-6 flex gap-6">
      <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-4">
        {state.warehouses.map(wh => (
          <div 
            key={wh.id}
            onClick={() => setSelectedWarehouse(wh)}
            className={`bg-gray-900 rounded-xl border border-gray-800 p-6 cursor-pointer hover:border-gray-700 transition-colors relative overflow-hidden ${
              selectedWarehouse?.id === wh.id ? 'ring-2 ring-violet-500' : ''
            } ${(!wh.is_operational || wh.strike_active) ? 'opacity-75' : ''}`}
          >
            {(!wh.is_operational || wh.strike_active) && (
              <div className="absolute inset-0 bg-red-500/10 flex items-center justify-center">
                <span className="text-red-500 font-bold text-lg rotate-[-15deg]">
                  {wh.strike_active ? '🪧 STRIKE' : 'CLOSED'}
                </span>
              </div>
            )}
            
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="text-white font-semibold">{wh.name}</h4>
                <p className="text-gray-400 text-sm">{wh.location}</p>
              </div>
              <ProgressRing 
                progress={(wh.current_load_tons / wh.max_capacity_tons) * 100}
                size={50}
                strokeWidth={5}
                color={getUtilizationColor(wh)}
              />
            </div>

            <div className="flex gap-2 mb-4">
              {wh.has_refrigeration && (
                <span className="bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded text-xs">❄️ Refrigerated</span>
              )}
              {wh.accepts_hazmat && (
                <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded text-xs">☢️ Hazmat</span>
              )}
              {wh.strike_active && (
                <span className="bg-red-500/20 text-red-500 px-2 py-0.5 rounded text-xs animate-pulse">🪧 Strike</span>
              )}
            </div>

            <div className="text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Load</span>
                <span className="text-white">{wh.current_load_tons}/{wh.max_capacity_tons}t</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-400">Shipments</span>
                <span className="text-white">{state.shipments.filter(s => s.assigned_warehouse === wh.id).length}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedWarehouse && (
        <div className="w-96 bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-white font-semibold text-lg mb-4">{selectedWarehouse.name}</h3>
          <p className="text-gray-400 mb-6">{selectedWarehouse.location}</p>
          
          <h4 className="text-gray-400 text-sm mb-3">Assigned Shipments</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {state.shipments
              .filter(s => s.assigned_warehouse === selectedWarehouse.id)
              .map(s => (
                <div key={s.id} className="bg-gray-800 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <span className="text-white font-mono text-sm">{s.id}</span>
                    <div className="flex gap-1 mt-1">
                      <CargoIcons shipment={s} />
                    </div>
                  </div>
                  <StatusPill status={s.status} />
                </div>
              ))}
            {state.shipments.filter(s => s.assigned_warehouse === selectedWarehouse.id).length === 0 && (
              <p className="text-gray-500 text-center py-4">No shipments assigned</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SimulatorPage: React.FC = () => {
  const { state, resetGame, takeAction, actionHistory } = useApp();
  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const autoPilotRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!state) return <div className="p-8 text-white">Loading...</div>;

  const runAutoPilotStep = async () => {
    // Simple heuristic agent
    const unreadCritical = state.alerts.find(a => a.severity === 'CRITICAL' && !a.is_read);
    if (unreadCritical) {
      await takeAction({ action_type: 'read_inbox', inbox_index: unreadCritical.inbox_index, rationale: 'Auto: Reading critical alert' });
      return;
    }

    const refrigeratedUnassigned = state.shipments.find(s => s.cargo_type === 'REFRIGERATED' && s.status === 'UNASSIGNED');
    const coldWarehouse = state.warehouses.find(w => w.has_refrigeration && w.is_operational && !w.strike_active);
    if (refrigeratedUnassigned && coldWarehouse) {
      await takeAction({ action_type: 'route_shipment', shipment_id: refrigeratedUnassigned.id, warehouse_id: coldWarehouse.id, rationale: 'Auto: Routing refrigerated to cold storage' });
      return;
    }

    const standardUnassigned = state.shipments.find(s => s.status === 'UNASSIGNED');
    const availableWarehouse = state.warehouses.find(w => w.is_operational && !w.strike_active && w.current_load_tons < w.max_capacity_tons * 0.9);
    if (standardUnassigned && availableWarehouse) {
      await takeAction({ action_type: 'route_shipment', shipment_id: standardUnassigned.id, warehouse_id: availableWarehouse.id, rationale: 'Auto: Routing to available warehouse' });
      return;
    }

    const assignedShipment = state.shipments.find(s => s.status === 'ASSIGNED');
    const availableTruck = state.trucks.find(t => t.status === 'AVAILABLE');
    if (assignedShipment && availableTruck) {
      await takeAction({ action_type: 'dispatch_truck', shipment_id: assignedShipment.id, truck_id: availableTruck.id, rationale: 'Auto: Dispatching truck' });
      return;
    }

    await takeAction({ action_type: 'wait', rationale: 'Auto: Waiting for state change' });
  };

  const toggleAutoPilot = () => {
    if (isAutoPilot) {
      if (autoPilotRef.current) {
        clearInterval(autoPilotRef.current);
        autoPilotRef.current = null;
      }
      setIsAutoPilot(false);
    } else {
      setIsAutoPilot(true);
      autoPilotRef.current = setInterval(runAutoPilotStep, 1500);
    }
  };

  useEffect(() => {
    return () => {
      if (autoPilotRef.current) {
        clearInterval(autoPilotRef.current);
      }
    };
  }, []);

  return (
    <div className="p-6">
      {/* Scenario Cards */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-gray-900 rounded-xl border-2 border-red-500/50 p-6 relative overflow-hidden">
          <div className="absolute top-3 right-3 bg-red-500 text-white px-2 py-0.5 rounded text-xs font-bold animate-pulse">
            ACTIVE
          </div>
          <div className="text-4xl mb-4">🌊</div>
          <h3 className="text-white font-bold text-lg mb-2">Storm at Seattle</h3>
          <p className="text-gray-400 text-sm">Port of Seattle closed due to severe weather. All shipments must be rerouted.</p>
        </div>

        <button
          onClick={() => state.difficulty === 'hard' && takeAction({ action_type: 'read_inbox', inbox_index: 3, rationale: 'Triggering strike scenario' })}
          className={`bg-gray-900 rounded-xl border-2 ${state.difficulty === 'hard' ? 'border-gray-700 hover:border-amber-500/50 cursor-pointer' : 'border-gray-800 opacity-50 cursor-not-allowed'} p-6 text-left transition-colors`}
        >
          <div className="text-4xl mb-4">🪧</div>
          <h3 className="text-white font-bold text-lg mb-2">Tacoma North Strike</h3>
          <p className="text-gray-400 text-sm">Trigger labor dispute at WH_TAC_NORTH. Requires Hard difficulty.</p>
        </button>

        <button
          onClick={() => resetGame('medium')}
          className="bg-gray-900 rounded-xl border-2 border-gray-700 hover:border-violet-500/50 p-6 text-left transition-colors"
        >
          <div className="text-4xl mb-4">📦</div>
          <h3 className="text-white font-bold text-lg mb-2">Capacity Crunch</h3>
          <p className="text-gray-400 text-sm">Reset to Medium difficulty with increased warehouse pressure.</p>
        </button>
      </div>

      {/* Auto-pilot Control */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-semibold text-lg">Auto-Pilot Mode</h3>
            <p className="text-gray-400 text-sm">Let the AI agent run autonomously using built-in heuristics</p>
          </div>
          <button
            onClick={toggleAutoPilot}
            className={`px-6 py-3 rounded-lg font-medium flex items-center gap-2 ${
              isAutoPilot 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-violet-500 hover:bg-violet-600 text-white'
            }`}
          >
            {isAutoPilot ? (
              <>
                <Pause className="w-5 h-5" />
                Stop Auto-Pilot
                <span className="ml-2 w-2 h-2 bg-white rounded-full animate-pulse" />
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Run Auto-Pilot
              </>
            )}
          </button>
        </div>
      </div>

      {/* Event Timeline */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-violet-400" />
          Live Event Timeline
        </h3>
        <div className="max-h-96 overflow-y-auto space-y-3">
          {actionHistory.map((event, i) => (
            <div key={i} className="flex items-start gap-4 p-3 bg-gray-800/50 rounded-lg">
              <div className="w-12 h-12 bg-violet-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-violet-400 font-mono text-sm">#{event.step}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <StatusPill status={event.type?.toUpperCase().replace('_', ' ') || 'ACTION'} />
                </div>
                <p className="text-gray-300 text-sm">{event.message}</p>
              </div>
            </div>
          ))}
          {actionHistory.length === 0 && (
            <p className="text-gray-500 text-center py-8">No events yet. Start the simulation!</p>
          )}
        </div>
      </div>
    </div>
  );
};

const AnalyticsPage: React.FC = () => {
  const { state } = useApp();

  if (!state) return <div className="p-8 text-white">Loading...</div>;

  const scoreData = state.reward_history?.map((r, i) => ({ step: i + 1, score: r.reward })) || [];
  
  const rewardComponents = state.reward_history?.slice(-10).map((r, i) => ({
    step: i + 1,
    bonus: r.components?.on_time_bonus || 0,
    latePenalty: Math.abs(r.components?.late_penalty || 0),
    violationPenalty: Math.abs(r.components?.violation_penalty || 0),
  })) || [];

  const statusCounts = {
    unassigned: state.shipments.filter(s => s.status === 'UNASSIGNED').length,
    assigned: state.shipments.filter(s => s.status === 'ASSIGNED').length,
    inTransit: state.shipments.filter(s => s.status === 'IN_TRANSIT').length,
    delivered: state.shipments.filter(s => s.status === 'DELIVERED').length,
    delayed: state.shipments.filter(s => s.status === 'DELAYED').length,
  };

  const statusPieData = [
    { name: 'Unassigned', value: statusCounts.unassigned, color: '#6b7280' },
    { name: 'Assigned', value: statusCounts.assigned, color: '#8b5cf6' },
    { name: 'In Transit', value: statusCounts.inTransit, color: '#f59e0b' },
    { name: 'Delivered', value: statusCounts.delivered, color: '#10b981' },
    { name: 'Delayed', value: statusCounts.delayed, color: '#ef4444' },
  ];

  const warehouseUtilization = state.warehouses.map(w => ({
    name: w.id.replace('WH_', ''),
    utilization: Math.round((w.current_load_tons / w.max_capacity_tons) * 100),
  }));

  const totalPenalties = state.reward_history?.reduce((sum, r) => sum + Math.abs(r.components?.violation_penalty || 0), 0) || 0;
  const totalReward = state.reward_history?.reduce((sum, r) => sum + r.reward, 0) || 0;
  const deliveredOnTime = state.shipments.filter(s => s.status === 'DELIVERED').length;
  const efficiency = state.shipments.length > 0 ? Math.round((deliveredOnTime / state.shipments.length) * 100) : 0;

  return (
    <div className="p-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Total Penalties</p>
          <p className="text-2xl font-bold text-red-500">{totalPenalties.toFixed(3)}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Total Reward</p>
          <p className={`text-2xl font-bold ${totalReward >= 0 ? 'text-emerald-400' : 'text-red-500'}`}>
            {totalReward >= 0 ? '+' : ''}{totalReward.toFixed(3)}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Violations</p>
          <p className="text-2xl font-bold text-amber-400">{statusCounts.delayed}</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <p className="text-gray-400 text-sm">Efficiency Score</p>
          <p className="text-2xl font-bold text-violet-400">{efficiency}%</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Episode Score */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-white font-semibold mb-4">Episode Score Over Steps</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={scoreData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="step" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#fff' }}
              />
              <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Reward Components */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-white font-semibold mb-4">Reward Components Breakdown</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={rewardComponents}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="step" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                labelStyle={{ color: '#fff' }}
              />
              <Legend />
              <Bar dataKey="bonus" stackId="a" fill="#10b981" name="On-Time Bonus" />
              <Bar dataKey="latePenalty" stackId="a" fill="#f59e0b" name="Late Penalty" />
              <Bar dataKey="violationPenalty" stackId="a" fill="#ef4444" name="Violation Penalty" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Shipment Status */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-white font-semibold mb-4">Shipment Status Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={statusPieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {statusPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Warehouse Utilization */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-white font-semibold mb-4">Warehouse Utilization</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={warehouseUtilization} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" domain={[0, 100]} stroke="#9ca3af" />
              <YAxis type="category" dataKey="name" stroke="#9ca3af" width={80} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                formatter={(value: unknown) => [`${value}%`, 'Utilization']}
              />
              <Bar dataKey="utilization" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

// Main App
const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('landing');

  return (
    <AppProvider>
      <div className="min-h-screen bg-gray-950 text-white">
        {currentPage === 'landing' ? (
          <LandingPage onLaunch={() => setCurrentPage('dashboard')} />
        ) : (
          <>
            <AppContent currentPage={currentPage} setCurrentPage={setCurrentPage} />
          </>
        )}
      </div>
    </AppProvider>
  );
};

const AppContent: React.FC<{ currentPage: string; setCurrentPage: (page: string) => void }> = ({ currentPage, setCurrentPage }) => {
  const { state, startPolling, stopPolling } = useApp();

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return (
    <>
      <Navbar currentPage={currentPage} setPage={setCurrentPage} difficulty={state?.difficulty} />
      {currentPage === 'dashboard' && <DashboardPage />}
      {currentPage === 'shipments' && <ShipmentsPage />}
      {currentPage === 'map' && <MapPage />}
      {currentPage === 'alerts' && <AlertsPage />}
      {currentPage === 'ai' && <AIDecisionPage />}
      {currentPage === 'fleet' && <FleetPage />}
      {currentPage === 'warehouses' && <WarehousesPage />}
      {currentPage === 'simulator' && <SimulatorPage />}
      {currentPage === 'analytics' && <AnalyticsPage />}
    </>
  );
};

export default App;
