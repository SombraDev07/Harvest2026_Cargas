"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  MoreVertical,
  Hash,
  RefreshCw,
  Database,
  Trash2,
  Table
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function DatabasePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [loads, setLoads] = useState<any[]>([]);
  const [registeredLoads, setRegisteredLoads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"all" | "registered" | "memory">("all");
  const [memoryIDs, setMemoryIDs] = useState<any[]>([]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (viewMode === "all") {
        const [loadsRes, statsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/loads?limit=100`),
          axios.get(`${API_BASE_URL}/analytics`)
        ]);
        setLoads(loadsRes.data);
        setStats(statsRes.data);
      } else if (viewMode === "registered") {
        const res = await axios.get(`${API_BASE_URL}/registered-loads`);
        setRegisteredLoads(res.data);
      } else if (viewMode === "memory") {
        const res = await axios.get(`${API_BASE_URL}/system/memory?limit=300`);
        setMemoryIDs(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRegistered = async (id: number) => {
    if (!confirm("Remover este ID da lista de ignorados?")) return;
    try {
      await axios.delete(`${API_BASE_URL}/registered-loads/${id}`);
      fetchData();
    } catch (error) {
       alert("Falha ao excluir registro");
    }
  };

  const handleDeleteMemory = async (loadId: string) => {
    if (!confirm("Remover este ID da Memória RPA? Ele voltará a ser considerado 'Novo' no próximo upload.")) return;
    try {
      await axios.delete(`${API_BASE_URL}/system/memory/${loadId}`);
      fetchData();
    } catch (error) {
       alert("Falha ao excluir da memória");
    }
  };

  useEffect(() => {
    fetchData();
  }, [viewMode]);

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-bold tracking-tight text-white flex items-center gap-3">
             Explorador de Dados <span className="text-blue-500/30 font-black italic">v1.2</span>
          </h2>
          <p className="text-gray-400 mt-2 max-w-xl">
            {viewMode === "all" 
              ? `Gerenciamento centralizado de auditoria para ${stats?.total_loads?.toLocaleString() || "500.000+"} registros.`
              : viewMode === "registered"
                ? "Lista de IDs marcados como OK manualmente (Exclusões de Auditoria)."
                : "Base de conhecimento histórica. IDs registrados aqui NÃO geram alerta de urgência."
            }
          </p>
        </div>
        <div className="flex gap-3">
           {/* View Selection Toggle */}
           <div className="p-1 glass-nav rounded-2xl flex gap-1 mr-4">
               <button 
                onClick={() => setViewMode("all")}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "all" ? "bg-blue-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"}`}
              >
                Auditoria Atual
              </button>
              <button 
                onClick={() => setViewMode("registered")}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "registered" ? "bg-orange-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"}`}
              >
                Exclusões (OK)
              </button>
              <button 
                onClick={() => setViewMode("memory")}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === "memory" ? "bg-emerald-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"}`}
              >
                Memória RPA
              </button>
           </div>

           <button 
             onClick={fetchData}
             className="glass p-3 hover:bg-white/10 transition-all rounded-xl text-gray-400 hover:text-white"
             title="Atualizar"
           >
              <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
           </button>
           <button className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl flex items-center gap-2 text-xs font-black transition-all shadow-xl shadow-blue-600/20 active:scale-95">
              <Download size={18} /> Exportar Lote
           </button>
        </div>
      </header>

      {/* Main Table Container */}
      <div className="glass rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl relative min-h-[400px]">
        {/* Action Bar */}
        <div className="p-6 flex flex-wrap items-center justify-between gap-6 border-b border-white/5 relative z-10 bg-black/20">
          <div className="flex items-center gap-6 flex-1 min-w-[300px]">
            <div className="relative flex-1 group">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={18} />
               <input 
                 type="text" 
                  placeholder={viewMode === "all" ? "Pesquisar por placas, IDs ou produtor..." : viewMode === "memory" ? "Pesquisar na memória histórica..." : "Pesquisar IDs registrados..."}
                 className="w-full bg-white/[0.03] border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all placeholder:text-gray-600"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>
            {viewMode === "all" && (
              <button className="glass px-4 py-3 flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition-all rounded-2xl border-white/5">
                <Filter size={16} /> Filtros Avançados
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-xs font-bold text-gray-600 uppercase tracking-widest">
             <span>Resultados Local: <span className="text-gray-300">{(viewMode === "all" ? loads : viewMode === "registered" ? registeredLoads : memoryIDs).length}</span></span>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-20 flex flex-col items-center justify-center gap-4">
               <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
               <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Acessando Banco de Dados RPA...</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="text-gray-500 text-[11px] uppercase tracking-tighter bg-white/[0.01]">
                  {viewMode === "all" ? (
                    <>
                      <th className="px-8 py-5 font-bold">CÓD (VISITA)</th>
                      <th className="px-6 py-5 font-bold">ID (LOTE)</th>
                      <th className="px-6 py-5 font-bold">COLUNA (STATUS)</th>
                      <th className="px-6 py-5 font-bold text-center">USUÁRIO</th>
                      <th className="px-6 py-5 font-bold text-center">DATA</th>
                      <th className="px-8 py-5 font-bold">AÇÕES</th>
                    </>
                  ) : viewMode === "registered" ? (
                    <>
                      <th className="px-8 py-5 font-bold">CÓD (VISITA)</th>
                      <th className="px-8 py-5 font-bold">ID (LOTE)</th>
                      <th className="px-8 py-5 font-bold">COLUNA</th>
                      <th className="px-8 py-5 font-bold text-center">USUÁRIO</th>
                      <th className="px-8 py-5 font-bold text-center">DATA</th>
                      <th className="px-8 py-5 font-bold text-emerald-400">MOTIVO</th>
                      <th className="px-8 py-5 font-bold text-center">AÇÕES</th>
                    </>
                  ) : (
                    <>
                      <th className="px-8 py-5 font-bold">LOTE IDENTIFIER (ID)</th>
                      <th className="px-8 py-5 font-bold text-center">REGISTRADO EM</th>
                      <th className="px-8 py-5 font-bold">ORIGEM</th>
                      <th className="px-8 py-5 font-bold text-center">AÇÕES</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {viewMode === "all" ? (
                  loads.filter(l => 
                    l.load_identifier.includes(searchTerm) || 
                    l.truck_plate.includes(searchTerm.toUpperCase()) ||
                    l.product?.toLowerCase().includes(searchTerm.toLowerCase())
                  ).map((load, idx) => (
                    <motion.tr 
                      key={load.id} 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.01 }}
                      className="group hover:bg-white/[0.03] transition-all cursor-default"
                    >
                      <td className="px-8 py-5 text-blue-400 font-bold">{load.visit_code || 'N/A'}</td>
                      <td className="px-6 py-5 text-white font-black">{load.load_identifier}</td>
                      <td className="px-6 py-5">
                         <div className="flex items-center gap-2">
                           <div className={`w-2 h-2 rounded-full ${load.status === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                           <span className="text-[10px] font-black uppercase text-gray-400">{load.status === 'error' ? 'INVÁLIDO' : 'VALIDADO'}</span>
                         </div>
                      </td>
                      <td className="px-6 py-5 text-center text-gray-400 font-bold text-[10px] uppercase">RPA SYSTEM</td>
                      <td className="px-6 py-5 text-center text-gray-500 text-[10px] font-bold">
                         {new Date(load.timestamp + (load.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-8 py-5">
                         <p className="text-[11px] font-bold text-red-400/80 italic max-w-[400px] truncate">
                            {load.error_message || "✔ Conferido pelas 7 Regras"}
                         </p>
                      </td>
                    </motion.tr>
                    ))
                ) : viewMode === "registered" ? (
                  registeredLoads.filter(rl => 
                    rl.load_identifier.includes(searchTerm) || 
                    rl.visit_code.includes(searchTerm)
                  ).map((rl, idx) => (
                    <motion.tr 
                      key={rl.id} 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className="group hover:bg-white/[0.03] transition-all"
                    >
                      <td className="px-8 py-5 font-bold text-blue-400">{rl.visit_code}</td>
                      <td className="px-8 py-5 text-white font-black">{rl.load_identifier}</td>
                      <td className="px-8 py-5 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                         <div className="flex items-center gap-2">
                           <Table size={12} /> {rl.column_name}
                         </div>
                      </td>
                      <td className="px-8 py-5 text-center text-blue-200/60 font-black text-[10px] uppercase">{rl.user_name}</td>
                      <td className="px-8 py-5 text-center text-gray-500 text-[10px] font-bold">
                         {new Date(rl.timestamp + (rl.timestamp.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-8 py-5">
                         <div className="bg-emerald-500/5 border border-emerald-500/10 px-4 py-2 rounded-xl text-emerald-400/90 text-xs font-medium italic">
                            {rl.reason}
                         </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                         <button 
                           onClick={() => handleDeleteRegistered(rl.id)}
                           className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all border border-red-500/10"
                         >
                            <Trash2 size={16} />
                         </button>
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  memoryIDs.filter(m => m.load_identifier.includes(searchTerm)).map((m, idx) => (
                     <motion.tr 
                      key={m.load_identifier} 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.01 }}
                      className="group hover:bg-white/[0.03] transition-all"
                    >
                       <td className="px-8 py-5 text-white font-black">{m.load_identifier}</td>
                       <td className="px-8 py-5 text-center text-gray-500 text-[10px] font-bold font-mono">
                          {new Date(m.registered_at + (m.registered_at.endsWith('Z') ? '' : 'Z')).toLocaleString('pt-BR')}
                       </td>
                       <td className="px-8 py-5">
                          <span className="px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase">PROCESSADO PELO RPA</span>
                       </td>
                       <td className="px-8 py-5 text-center">
                         <button 
                           onClick={() => handleDeleteMemory(m.load_identifier)}
                           className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all border border-red-500/10"
                         >
                            <Trash2 size={16} />
                         </button>
                       </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-black/40 border-t border-white/5 flex items-center justify-between">
           <div className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">
              Exibindo {viewMode === "all" ? "amostra das cargas totais" : "todos os registros de exclusão"}
           </div>
           
           <div className="flex items-center gap-2">
              <button className="p-2.5 glass border-white/5 text-gray-500 hover:text-white disabled:opacity-20 rounded-2xl">
                <ChevronLeft size={20} />
              </button>
              <button className="p-2.5 glass border-white/5 text-gray-500 hover:text-white rounded-2xl">
                <ChevronRight size={20} />
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
