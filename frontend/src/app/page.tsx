"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  TrendingUp,
  Package,
  Truck,
  ArrowUpRight,
  Zap,
  ShieldCheck,
  RefreshCw,
  MapPin,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

function CircularProgress({ value, max, label, color }: { value: number, max: number, label: string, color: string }) {
  const percentage = Math.min(100, (value / max) * 100);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3 p-6 rounded-[2rem] bg-white/[0.03] border border-white/5 hover:bg-white/[0.05] transition-all group">
      <div className="relative w-24 h-24">
        {/* Background Circle */}
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            className="text-white/5"
          />
          {/* Progress Circle */}
          <motion.circle
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: "easeOut" }}
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={circumference}
            fill="transparent"
            className={color}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-black text-white tabular-nums leading-none">{value}</span>
          <span className="text-[8px] font-bold text-gray-500 uppercase mt-1">Erros</span>
        </div>
      </div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center group-hover:text-white transition-colors">{label}</p>
    </div>
  );
}

export default function Dashboard() {
  const [statsData, setStatsData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [recentLoads, setRecentLoads] = useState<any[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [districtData, setDistrictData] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchDistrictData = async (name: string) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/analytics/district/${name}`);
      setDistrictData(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDistrictClick = (name: string) => {
    setSelectedDistrict(name);
    fetchDistrictData(name);
    setIsModalOpen(true);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, loadsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/analytics`),
        axios.get(`${API_BASE_URL}/loads?limit=6`)
      ]);
      setStatsData(statsRes.data);
      setRecentLoads(loadsRes.data);
    } catch (error) {
      console.error("Dashboard fetch failed", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const statCards = [
    { 
      name: "Total de Cargas", 
      value: statsData?.total_loads?.toLocaleString() || "0", 
      icon: Package, 
      color: "bg-blue-500", 
      trend: "+100%",
      description: "Base de dados consolidada"
    },
    { 
      name: "Validados (OK)", 
      value: statsData?.validated_loads?.toLocaleString() || "0", 
      icon: ShieldCheck, 
      color: "bg-emerald-500", 
      trend: "Auditado",
      description: "Sem inconsistências RPA"
    },
    { 
      name: "Aguardando", 
      value: statsData?.pending_loads?.toLocaleString() || "0", 
      icon: Clock, 
      color: "bg-amber-500", 
      trend: "Fila",
      description: "Pendentes de análise"
    },
    { 
      name: "Erros Críticos", 
      value: statsData?.error_loads?.toLocaleString() || "0", 
      icon: AlertCircle, 
      color: "bg-red-500", 
      trend: "Ação",
      description: "Inconsistências detectadas"
    },
  ];

  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 w-fit rounded-full border border-blue-500/20">
             <Zap size={14} className="text-blue-400 fill-blue-400" />
             <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Painel Operacional</span>
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-white drop-shadow-2xl">
             Dados de Colheita <span className="text-gray-500 font-light">2026</span>
          </h2>
          <p className="text-gray-400 max-w-2xl leading-relaxed">
             Monitoramento em tempo real do fluxo de cargas e validações automáticas do RPA.
          </p>
        </div>
        <button 
          onClick={fetchData}
          className="glass p-4 rounded-2xl text-blue-400 hover:text-white transition-all active:scale-95"
        >
          <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
        </button>
      </header>

      {/* Stats Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, idx) => (
          <motion.div 
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="glass-card group"
          >
            <div className="flex items-start justify-between">
              <div className={`p-3 rounded-xl ${stat.color} bg-opacity-20 border border-white/5`}>
                <stat.icon className={stat.color.replace('bg-', 'text-')} size={22} />
              </div>
              <div className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                <span className="text-gray-400 uppercase">{stat.trend}</span>
              </div>
            </div>
            
            <div className="mt-8 space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{stat.name}</p>
              <h3 className="text-3xl font-bold text-white tabular-nums tracking-tight">
                {isLoading ? "---" : stat.value}
              </h3>
              <p className="text-[11px] text-gray-500 line-clamp-1">{stat.description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* District Performance Card */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-transparent opacity-50" />
        <div className="flex items-center justify-between mb-8">
          <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <MapPin className="text-purple-400" size={20} /> Performance por Distrito
              </h3>
              <p className="text-xs text-gray-500 mt-1">Ranking de distritos por volume de cargas e incidência de erros.</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsData?.district_performance?.slice(0, 8).map((dist: any, idx: number) => (
            <motion.div 
              key={dist.name} 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => handleDistrictClick(dist.name)}
              className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-purple-500/40 hover:bg-white/[0.04] transition-all group cursor-pointer active:scale-95"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-purple-400/80 uppercase tracking-widest leading-none">{dist.name}</p>
                  <p className="text-xl font-black text-white">{dist.total_loads.toLocaleString()}</p>
                  <p className="text-[9px] font-medium text-gray-500 uppercase">Cargas Totais</p>
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                    <p className="text-lg font-black text-red-500">{dist.error_loads.toLocaleString()}</p>
                  </div>
                  <p className="text-[9px] font-bold text-red-500/40 uppercase">Inconsistências</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold tracking-tight">
                  <span className="text-gray-600 uppercase">Aproveitamento</span>
                  <span className={dist.error_rate > 5 ? 'text-red-400' : 'text-emerald-400'}>
                    {(100 - dist.error_rate).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(2, 100 - dist.error_rate)}%` }}
                    className={`h-full rounded-full transition-colors duration-500 ${
                      dist.error_rate > 10 ? 'bg-red-500/60' : 
                      dist.error_rate > 3 ? 'bg-amber-500/60' : 
                      'bg-emerald-500/60'
                    }`}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ... existing chart and activity ... */}
      </div>

      {/* District Detail Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl glass rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div>
                   <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">
                     Análise Regional: <span className="text-purple-400">{selectedDistrict}</span>
                   </h2>
                   <p className="text-gray-500 text-xs font-bold tracking-widest uppercase mt-1">Perfil de Inconsistências Detectadas (Gráfico Bolha)</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all font-bold"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                   {districtData.map((d, i) => (
                     <CircularProgress 
                        key={i}
                        label={d.rule}
                        value={d.count}
                        max={Math.max(...districtData.map(v => v.count), 1)}
                        color={['text-red-500', 'text-orange-500', 'text-amber-500', 'text-rose-500', 'text-purple-500', 'text-pink-500', 'text-yellow-500'][i % 7]}
                     />
                   ))}
                   
                   {districtData.length === 0 && (
                     <div className="col-span-full py-20 flex flex-col items-center justify-center text-center opacity-40">
                        <ShieldCheck size={48} className="text-emerald-500 mb-4" />
                        <p className="text-lg font-bold text-white uppercase italic">Distrito 100% Limpo</p>
                        <p className="text-xs text-gray-500 font-medium">Nenhuma inconsistência fiscal detectada nesta região.</p>
                     </div>
                   )}
                </div>

                <div className="mt-12 p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                         <TrendingUp className="text-blue-400" size={24} />
                      </div>
                      <div>
                         <p className="text-sm font-bold text-white uppercase italic">Volume de Auditoria</p>
                         <p className="text-xs text-gray-500 font-medium">O motor processou {statsData?.district_performance?.find((p: any) => p.name === selectedDistrict)?.total_loads?.toLocaleString()} cargas para este distrito.</p>
                      </div>
                   </div>
                   <button 
                    onClick={() => {
                        window.location.href = `/analytics?district=${selectedDistrict}`;
                    }}
                    className="flex items-center gap-2 text-xs font-black text-blue-400 uppercase tracking-widest hover:text-white transition-colors"
                   >
                     Ver Detalhes <ArrowUpRight size={14} />
                   </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
