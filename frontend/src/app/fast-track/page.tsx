"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  Table as TableIcon,
  ChevronDown,
  ArrowRight,
  FileSpreadsheet,
  User,
  Clock,
  Database,
  Truck,
  Zap,
  UserCheck
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const RULES = [
  { id: 1, name: "Romaneios Duplicados", filter: "duplicado", icon: "📋", color: "text-red-400", statsKey: "duplicado" },
  { id: 2, name: "Romaneio fora de padrão", filter: "padrão", icon: "🔍", color: "text-orange-400", statsKey: "documento" },
  { id: 3, name: "Campos Obrigatórios", filter: "não preenchido", icon: "❗", color: "text-amber-400", statsKey: "campos" },
  { id: 4, name: "Placa Inválida", filter: "Placa inválida", icon: "🚗", color: "text-rose-400", statsKey: "placa" },
  { id: 5, name: "Excesso de Peso", filter: "acima do limite", icon: "⚖️", color: "text-purple-400", statsKey: "peso_limite" },
  { id: 6, name: "Peso Fictício", filter: "peso fictício", icon: "🔢", color: "text-pink-400", statsKey: "peso_ficticio" },
  { id: 7, name: "Desconto Excessivo", filter: "Desconto excessivo", icon: "📉", color: "text-yellow-400", statsKey: "desconto" },
  { id: 8, name: "Rateio: Peso Inválido (PLCD > PL)", filter: "Divergência Grupo Rateio", icon: "⚖️", color: "text-blue-400", statsKey: "rateio_peso" },
  { id: 9, name: "Rateio: Sem Parceiro (SIM isolado)", filter: "Rateio sem parceiro", icon: "👤", color: "text-indigo-400", statsKey: "rateio_parceiro" },
  { id: 10, name: "Rateio: Tecnologias Diferentes", filter: "Regra Rateio 3", icon: "🧬", color: "text-cyan-400", statsKey: "rateio_tech" },
  { id: 11, name: "Possível Rateio (Aviso 20min)", filter: "Possível Rateio", icon: "🔔", color: "text-sky-400", statsKey: "rateio_possivel" },
  { id: 12, name: "Pesos Duplicados (Mesma Visita)", filter: "Peso duplicado", icon: "👯", color: "text-emerald-400", statsKey: "peso_duplicado" },
  { id: 13, name: "Rateio: Mesmo Produtor", filter: "Rateio mesma conta", icon: "👤", color: "text-violet-400", statsKey: "rateio_mesmo_pdr" },
];

function FastRuleTable({ rule, totalCount }: { rule: typeof RULES[0], totalCount?: number }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [analysis, setAnalysis] = useState<{ user_name: string, started_at: string } | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/analysis/status`);
      const active = res.data.find((a: any) => a.rule_filter === rule.filter);
      setAnalysis(active || null);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const fetchRuleData = async () => {
      if (!isOpen) return;
      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/loads`, {
          params: { 
            status: 'error',
            error_type: rule.statsKey, 
            queue: 'urgent', 
            limit: 200 
          }
        });
        setData(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchRuleData();
    if (isOpen) {
       fetchStatus();
       const interval = setInterval(fetchStatus, 5000);
       return () => clearInterval(interval);
    }
  }, [rule.statsKey, isOpen]);

  const handleRegisterID = async (item: any) => {
    const reason = prompt(`Motivo para registrar ID ${item.load_identifier}:`);
    if (!reason) return;
    try {
      await axios.post(`${API_BASE_URL}/registered-loads`, {
        visit_code: item.visit_code || 'N/A',
        load_identifier: item.load_identifier,
        column_name: rule.name,
        user_name: localStorage.getItem("harvest_user_name") || "Fila Urgência",
        reason: reason
      });
      alert("ID registrado! Refaça a auditoria para atualizar.");
    } catch (e) {
      alert("Erro ao registrar.");
    }
  };

  const handleSendOperation = async (cod: string) => {
    if (!confirm(`Enviar visita ${cod} para OPERAÇÃO?`)) return;
    try {
      await axios.post(`${API_BASE_URL}/loads/operation`, { visit_code: cod });
      alert("Enviado!");
    } catch (e) {
      alert("Erro.");
    }
  };

  if (totalCount === 0) return null; // In Fast Track we ONLY care about what's broken

  return (
    <div className="glass rounded-3xl border border-red-500/20 overflow-hidden mb-6 shadow-2xl relative">
       <div className="absolute top-0 right-0 p-2 opacity-50">
          <Zap size={16} className="text-red-500 animate-pulse" />
       </div>
      <div 
        className="p-5 flex items-center justify-between bg-red-950/20 cursor-pointer hover:bg-black/60 transition-all border-b border-white/5"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <span className="text-2xl">{rule.icon}</span>
          <div>
            <h3 className={`text-lg font-black tracking-tight ${rule.color} uppercase`}>
              {rule.name} 
              <span className="ml-3 px-2 py-0.5 rounded-lg bg-red-500/20 border border-red-500/30 text-xs font-bold tabular-nums text-white">
                {totalCount?.toLocaleString()} URGENTES
              </span>
            </h3>
            <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">Novas entradas críticas para operação</p>
          </div>
        </div>
        <ChevronDown size={20} className={`text-gray-500 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar p-1">
              {loading ? (
                <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-red-500/40" size={32} /></div>
              ) : (
                <table className="w-full text-left text-[11px] border-collapse sticky-header">
                  <thead className="sticky top-0 z-20 bg-[#0a0a0a]">
                    <tr className="bg-white/[0.02] text-gray-400 uppercase tracking-tighter text-[9px]">
                      <th className="px-3 py-4 font-bold border-b border-white/5">COD</th>
                      <th className="px-3 py-4 font-bold border-b border-white/5">ID</th>
                      <th className="px-3 py-4 font-bold border-b border-white/5">CHEGOU EM</th>
                      <th className="px-3 py-4 font-bold border-b border-white/5">PLARA</th>
                      <th className="px-3 py-4 font-bold border-b border-white/5">PRODUTOR</th>
                      <th className="px-3 py-4 font-bold text-center border-b border-white/5">PL (kg)</th>
                      <th className="px-3 py-4 font-bold text-center border-b border-white/5">PLCD (kg)</th>
                      <th className="px-3 py-4 font-bold border-b border-white/5">AÇÕES</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.map((item) => (
                      <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-3 py-3 text-red-400 font-bold">{item.visit_code || 'N/A'}</td>
                        <td className="px-3 py-3 text-white font-black">{item.load_identifier}</td>
                        <td className="px-3 py-3 text-gray-500 font-mono text-[9px]">
                           {new Date(item.updated_at + (item.updated_at.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-3">
                           <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white font-mono">
                             {item.truck_plate || 'N/A'}
                           </span>
                        </td>
                        <td className="px-3 py-3 max-w-[150px] truncate text-gray-400 uppercase">{item.product}</td>
                        <td className="px-3 py-3 text-center text-gray-300">{(item.weight_gross || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-center text-emerald-400 font-bold">{(item.weight_net || 0).toLocaleString()}</td>
                        <td className="px-3 py-3">
                           <div className="flex items-center gap-2">
                              <button onClick={() => handleRegisterID(item)} className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"><Database size={14} /></button>
                              <button onClick={() => handleSendOperation(item.visit_code)} className="p-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20"><Truck size={14} /></button>
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FastTrackPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isMemorySyncing, setIsMemorySyncing] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/analytics/fast-track`);
      setStats(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleMemorySync = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);

    setIsMemorySyncing(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/loads/register-memory`, formData);
      alert(res.data.message);
      fetchStats();
    } catch (e) {
      alert("Erro ao sincronizar memória.");
    } finally {
      setIsMemorySyncing(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative">
        <div className="absolute -top-20 -left-20 w-60 h-60 bg-red-600/10 blur-[120px] -z-10 animate-pulse" />
        <div className="flex items-center gap-4">
           <div className="p-4 bg-red-600/20 rounded-3xl border border-red-500/30 shadow-[0_0_25px_rgba(239,68,68,0.2)]">
              <Zap className="text-red-400 fill-red-400" size={28} />
           </div>
           <div>
              <h2 className="text-4xl font-black tracking-tight text-white uppercase italic">
                Fila de <span className="text-red-500">Urgência</span> ⚡
              </h2>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">
                Análise de cargas novas • Janela de 72 horas
              </p>
           </div>
        </div>

        {user?.username === "BrunoHarvest2026" && (
          <div className="flex flex-col gap-2">
            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-2">Painel Especial - Bruno</span>
            <label className={`
              cursor-pointer flex items-center gap-3 px-6 py-3 rounded-2xl border transition-all
              ${isMemorySyncing ? 'bg-blue-600/20 border-blue-500/30 opacity-50' : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'}
            `}>
              <Database size={16} className="text-blue-400" />
              <div className="flex flex-col">
                <span className="text-xs font-black text-white uppercase tracking-tighter leading-none">Sincronizar Memória</span>
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Vá para Fila Normal os IDs já existentes</span>
              </div>
              <input type="file" className="hidden" accept=".xlsx,.csv" onChange={handleMemorySync} disabled={isMemorySyncing} />
            </label>
          </div>
        )}
      </header>

      {/* Urgency Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="glass p-8 rounded-[2.5rem] border-2 border-red-500/20 bg-red-600/[0.03] flex items-center justify-between col-span-1 md:col-span-2 shadow-2xl">
            <div className="flex flex-col gap-1">
               <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Alerta de Pendências de 72h</span>
               <span className="text-5xl font-black text-white tabular-nums tracking-tighter">
                  {loading ? '...' : (stats?.total_recent || 0)}
               </span>
               <span className="text-gray-400 text-[10px] font-bold uppercase tracking-tight">Entradas com erro que ainda não estão registradas no histórico</span>
            </div>
            <div className="w-16 h-16 rounded-full border-4 border-red-500/20 border-t-red-500 animate-spin" />
         </div>
         
         <div className="glass p-8 rounded-[2.5rem] border border-white/5 bg-black/40 flex flex-col justify-center gap-3">
            <p className="text-[11px] text-gray-400 font-medium leading-relaxed italic border-l-2 border-red-500/50 pl-4">
              "Esta fila mostra apenas o que é DE FATO NOVO para o servidor. Após 72h ou ao sincronizar a memória, as cargas saem daqui."
            </p>
         </div>
      </div>

      <div className="space-y-6">
         {RULES.map(rule => (
           <FastRuleTable 
             key={rule.id} 
             rule={rule} 
             totalCount={stats?.rule_breakdown?.[rule.statsKey]} 
           />
         ))}
         
         {stats && stats.total_recent === 0 && !loading && (
           <div className="p-20 text-center glass rounded-[2.5rem] border-dashed border-2 border-white/10 opacity-50">
              <UserCheck size={60} className="mx-auto text-emerald-500 mb-6" />
              <h3 className="text-2xl font-black text-white uppercase italic">Zero Pendências!</h3>
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Toda operação nova está validada ou registrada</p>
           </div>
         )}
      </div>
    </div>
  );
}
