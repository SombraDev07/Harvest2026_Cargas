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
  Upload,
  UserCheck,
  HelpCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const RULES = [
  { id: 1, name: "Romaneios Duplicados", filter: "duplicado", icon: "📋", color: "text-red-400", statsKey: "duplicado", description: "Detecta documentos com o mesmo número para o mesmo produtor nesta visita (exceto em rateios)." },
  { id: 2, name: "Romaneio fora de padrão", filter: "padrão", icon: "🔍", color: "text-orange-400", statsKey: "documento", description: "Identifica romaneios que divergem do padrão de prefixo ou quantidade de dígitos predominante no grupo." },
  { id: 3, name: "Campos Obrigatórios", filter: "não preenchido", icon: "❗", color: "text-amber-400", statsKey: "campos", description: "Verifica se campos essenciais como Produtor, Romaneio ou Pesos estão preenchidos na planilha." },
  { id: 4, name: "Placa Inválida", filter: "Placa inválida", icon: "🚗", color: "text-rose-400", statsKey: "placa", description: "Valida se a placa segue o formato Mercosul ou antigo e se não está vazia." },
  { id: 5, name: "Excesso de Peso", filter: "acima do limite", icon: "⚖️", color: "text-purple-400", statsKey: "peso_limite", description: "Detecta cargas individuais que ultrapassam o limite técnico ou legal permitido (ex: 52k kg)." },
  { id: 6, name: "Peso Fictício", filter: "peso fictício", icon: "🔢", color: "text-pink-400", statsKey: "peso_ficticio", description: "Identifica pesos terminados em padrões como 000 ou 999, indicando possível preenchimento manual." },
  { id: 7, name: "Desconto Excessivo", filter: "Desconto excessivo", icon: "📉", color: "text-yellow-400", statsKey: "desconto", description: "Alerta quando a diferença entre Peso Bruto e Líquido ultrapassa 25% (fora de casos de rateio)." },
  { id: 8, name: "Rateio: Peso Inválido (PLCD > PL)", filter: "Divergência Grupo Rateio", icon: "⚖️", color: "text-blue-400", statsKey: "rateio_peso", description: "Valida se a soma dos pesos com desconto (PLCD) é superior à soma dos pesos líquidos (PL) no grupo de rateio." },
  { id: 9, name: "Rateio: Sem Parceiro (SIM isolado)", filter: "Rateio sem parceiro", icon: "👤", color: "text-indigo-400", statsKey: "rateio_parceiro", description: "Cargas marcadas com Rateio SIM que não possuem outro parceiro no mesmo grupo de 50 minutos." },
  { id: 10, name: "Rateio: Tecnologias Diferentes", filter: "Regra Rateio 3", icon: "🧬", color: "text-cyan-400", statsKey: "rateio_tech", description: "Identifica grupos de rateio onde as cargas possuem tecnologias de pesagem divergentes no cadastro." },
  { id: 11, name: "Possível Rateio (Aviso 20min)", filter: "Possível Rateio", icon: "🔔", color: "text-sky-400", statsKey: "rateio_possivel", description: "Alerta para cargas de mesma placa/tech pesadas com menos de 20min de intervalo, mas sem marcação de rateio." },
  { id: 12, name: "Pesos Duplicados (Mesma Visita)", filter: "Peso duplicado", icon: "👯", color: "text-emerald-400", statsKey: "peso_duplicado", description: "Detecta cargas onde o PAR de pesos (Líquido e Líquido com Desconto) se repete na mesma visita, independentemente de ser rateio ou não." },
  { id: 13, name: "Rateio: Mesmo Produtor", filter: "Rateio mesma conta", icon: "👤", color: "text-violet-400", statsKey: "rateio_mesmo_pdr", description: "Detecta grupos de rateio onde o produtor é o mesmo para todas as cargas, o que é um uso incorreto." },
];

function RuleTable({ rule, totalCount, selectedDistrict }: { rule: typeof RULES[0], totalCount?: number, selectedDistrict: string }) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
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
      if (!isOpen) return; // Only fetch if expanded
      
      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/loads`, {
          params: { 
            status: 'error',
            error_type: rule.statsKey, 
            district: selectedDistrict !== 'GERAL' ? selectedDistrict : undefined,
            limit: 200 // Reduced from 20000 to save data/CPU
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
  }, [rule.filter, isOpen, selectedDistrict]); // Re-fetch if district changes too

  const startAnalysis = async () => {
    let userName = localStorage.getItem("harvest_user_name");
    if (!userName) {
      userName = prompt("Digite seu nome para iniciar a análise:");
      if (!userName) return;
      localStorage.setItem("harvest_user_name", userName);
    }

    try {
      await axios.post(`${API_BASE_URL}/analysis/start`, {
        rule_filter: rule.filter,
        user_name: userName
      });
      fetchStatus();
    } catch (e) {
      alert("Erro ao iniciar análise");
    }
  };

  const finishAnalysis = async () => {
    try {
      await axios.post(`${API_BASE_URL}/analysis/finish`, null, {
        params: { rule_filter: rule.filter }
      });
      fetchStatus();
    } catch (e) {
      alert("Erro ao finalizar análise");
    }
  };

  const handleRegisterID = async (item: any) => {
    const reason = prompt(`Motivo para registrar ID ${item.load_identifier} no banco de dados:`);
    if (!reason) return;

    try {
      await axios.post(`${API_BASE_URL}/registered-loads`, {
        visit_code: item.visit_code || 'N/A',
        load_identifier: item.load_identifier,
        error_type: rule.statsKey,
        column_name: rule.name,
        user_name: localStorage.getItem("harvest_user_name") || "Sistema",
        reason: reason
      });
      alert("ID registrado com sucesso! Refaça a auditoria para que ele suma desta lista.");
    } catch (e) {
      console.error(e);
      alert("Erro ao registrar ID.");
    }
  };

  const handleSendOperation = async (cod: string) => {
    if (!confirm(`Enviar visita ${cod} para caixa de OPERAÇÃO?`)) return;
    try {
      await axios.post(`${API_BASE_URL}/loads/operation`, { visit_code: cod });
      alert("Visita enviada para Operação!");
    } catch (e) {
      console.error(e);
      alert("Erro ao enviar para operação.");
    }
  };

  const downloadCSV = () => {
    window.open(`${API_BASE_URL}/loads/export?rule_filter=${rule.filter}`, "_blank");
  };

  // No longer returning null to ensure ALL tables are visible even if empty

  // Helper to group Rateio entries (ONLY for Peso Inválido and Duplicate Weights per user request)
  const getGroupedData = () => {
    if (rule.statsKey !== "rateio_peso" && rule.statsKey !== "peso_duplicado") return { isGrouped: false, groups: [] };
    
    const groupMap: Record<string, any[]> = {};
    data.forEach(item => {
      let key = "";
      if (rule.statsKey === "rateio_peso") {
        key = `${item.truck_plate}-${item.technology}-${item.visit_code}`;
      } else {
        // Group by weight pair to match the backend pair-based logic
        // Using toFixed(2) to ensure consistent grouping regardless of small float variations
        const pl = Number(item.weight_gross || 0).toFixed(2);
        const plcd = Number(item.weight_net || 0).toFixed(2);
        key = `PL:${pl}-PLCD:${plcd}-VISIT:${item.visit_code}`;
      }

      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(item);
    });

    return { 
      isGrouped: true, 
      groups: Object.entries(groupMap)
        .filter(([_, items]) => items.length > 1 || rule.statsKey === "rateio_peso") // Filter to show ONLY partners for duplicates
        .map(([key, items]) => ({
          key,
          items,
          totalPL: items.reduce((sum, i) => sum + i.weight_gross, 0),
          totalPLCD: items.reduce((sum, i) => sum + i.weight_net, 0)
        }))
    };
  };

  const groupedInfo = getGroupedData();

  return (
    <div className="glass rounded-3xl border border-white/10 overflow-hidden mb-6 shadow-2xl">
      <div 
        className="p-5 flex items-center justify-between bg-black/40 cursor-pointer hover:bg-black/60 transition-all border-b border-white/5"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-4">
          <span className="text-2xl">{rule.icon}</span>
          <div>
            <h3 className={`text-lg font-black tracking-tight ${rule.color} uppercase flex items-center gap-2`}>
              {rule.name}
              <button 
                onClick={(e) => { e.stopPropagation(); setShowHelp(!showHelp); }}
                className={`transition-all p-1 rounded-full ${showHelp ? 'bg-white text-black' : 'hover:text-white bg-white/5 cursor-help'}`}
              >
                <HelpCircle size={14} />
              </button>
              {totalCount !== undefined && (
                <span className="ml-3 px-2 py-0.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-bold tabular-nums">
                  {totalCount.toLocaleString()} ocorrências
                </span>
              )}
            </h3>
            <p className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">Resultados Totais do Motor RPA</p>
          </div>
        </div>
        
        <AnimatePresence>
          {showHelp && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="px-5 py-3 bg-blue-500/10 border-t border-white/5 overflow-hidden"
            >
              <div className="flex gap-3 items-start">
                <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400 mt-1">
                  <HelpCircle size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-blue-100 uppercase tracking-tighter mb-1">Entenda a Regra: {rule.name}</h4>
                  <p className="text-xs text-blue-200/70 leading-relaxed font-medium">
                    {rule.description}
                  </p>
                </div>
                <button 
                  onClick={() => setShowHelp(false)}
                  className="ml-auto text-[10px] font-black text-blue-400/50 hover:text-blue-400 uppercase tracking-widest"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-4 pr-5">
          {analysis ? (
            <div className="flex items-center gap-3">
              <motion.div 
                animate={{ opacity: [1, 0.4, 1] }} 
                transition={{ duration: 1.5, repeat: Infinity }}
                className="bg-yellow-500/20 border border-yellow-500/40 px-3 py-1.5 rounded-full flex items-center gap-2"
              >
                <div className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                <span className="text-[10px] font-black text-yellow-200 uppercase tracking-tighter">
                  Analisando - {analysis.user_name}
                </span>
              </motion.div>
              <button 
                onClick={(e) => { e.stopPropagation(); finishAnalysis(); }}
                className="bg-red-500/20 hover:bg-red-500/40 text-red-400 p-2 rounded-xl border border-red-500/20 transition-all"
                title="Finalizar Análise"
              >
                <CheckCircle2 size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={(e) => { e.stopPropagation(); startAnalysis(); }}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white/60 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-white/10 transition-all hover:text-white"
            >
              <User size={14} /> Analisar
            </button>
          )}

          {data.length > 0 && (
            <button 
              onClick={(e) => { e.stopPropagation(); downloadCSV(); }}
              className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-500/20 transition-all"
            >
              <Download size={14} /> Baixar Planilha Completa
            </button>
          )}
          <motion.div animate={{ rotate: isOpen ? 0 : -90 }}>
            <ChevronDown size={20} className="text-gray-500" />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
      <div className="overflow-x-auto max-h-[450px] overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="animate-spin text-blue-500/40" size={32} />
          </div>
        ) : data.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center gap-4 bg-emerald-500/5">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="text-emerald-400" size={32} />
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-400">Parabéns! Nenhuma inconsistência</p>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-black">Este distrito está 100% em conformidade com esta regra</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-[11px] border-collapse sticky-header">
            <thead className="sticky top-0 z-20 bg-[#0a0a0a]">
              <tr className="bg-white/[0.02] text-gray-400 uppercase tracking-tighter text-[9px]">
                <th className="px-3 py-4 font-bold border-b border-white/5">COD</th>
                <th className="px-3 py-4 font-bold border-b border-white/5">Distrito</th>
                <th className="px-3 py-4 font-bold border-b border-white/5">ID</th>
                <th className="px-3 py-4 font-bold border-b border-white/5">Doc</th>
                <th className="px-3 py-4 font-bold border-b border-white/5">Placa</th>
                <th className="px-3 py-4 font-bold border-b border-white/5">Tecnologia</th>
                <th className="px-3 py-4 font-bold border-b border-white/5">Produtor</th>
                <th className="px-3 py-4 font-bold text-center border-b border-white/5">PL (kg)</th>
                <th className="px-3 py-4 font-bold text-center border-b border-white/5">PLCD (kg)</th>
                <th className="px-3 py-4 font-bold border-b border-white/5">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {groupedInfo.isGrouped ? (
                groupedInfo.groups.map(group => (
                  <React.Fragment key={group.key}>
                    {/* Header da Placa / Grupo */}
                    <tr className="bg-blue-500/5 border-l-2 border-blue-500">
                      <td colSpan={11} className="px-4 py-2 text-[10px] font-black text-blue-300 uppercase tracking-widest">
                         <div className="flex items-center gap-2">
                           {rule.statsKey === "peso_duplicado" ? <User size={12} /> : <Clock size={12} />} 
                           {rule.statsKey === "peso_duplicado" ? `PARCEIROS DE PESO: ${group.key}` : `GRUPO: ${group.key}`}
                         </div>
                      </td>
                    </tr>
                    {group.items.map(item => (
                      <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-3 py-3 text-blue-400 font-bold">{item.visit_code || 'N/A'}</td>
                        <td className="px-3 py-3 text-gray-400">{item.district || 'N/A'}</td>
                        <td className="px-3 py-3 text-gray-400 font-bold">{item.load_identifier}</td>
                        <td className="px-3 py-3 text-gray-500">{item.doc_number || 'N/A'}</td>
                        <td className="px-3 py-3">
                           <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white font-mono">
                             {item.truck_plate || 'N/A'}
                           </span>
                        </td>
                        <td className="px-3 py-3 text-cyan-400/80 italic">{item.technology || 'N/A'}</td>
                        <td className="px-3 py-3 max-w-[200px] truncate text-gray-400 uppercase font-medium">{item.product || 'CARGA GERAL'}</td>
                        <td className="px-3 py-3 text-center text-gray-300">{(item.weight_gross || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-center text-emerald-400 font-bold">{(item.weight_net || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-[10px] text-red-500/70 italic max-w-[150px] truncate">{item.error_message}</td>
                        <td className="px-3 py-3">
                           <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => handleRegisterID(item)}
                                className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20"
                                title="Enviar para БД"
                              >
                                 <Database size={14} />
                              </button>
                              <button 
                                onClick={() => handleSendOperation(item.visit_code)}
                                className="p-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20"
                                title="Enviar p/ Operação"
                              >
                                 <Truck size={14} />
                              </button>
                           </div>
                        </td>
                      </tr>
                    ))}
                    {/* Linha de Total do Grupo (ONLY for Rateio) */}
                    {rule.statsKey === "rateio_peso" && (
                      <tr className="bg-white/[0.01]">
                        <td colSpan={7} className="px-3 py-2 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Total do Grupo:</td>
                        <td className="px-3 py-2 text-center text-[10px] font-black text-white">{group.totalPL.toLocaleString()} kg</td>
                        <td className="px-3 py-2 text-center text-[10px] font-black text-amber-400">{group.totalPLCD.toLocaleString()} kg</td>
                        <td colSpan={2} className="px-3 py-2 text-[10px] font-bold text-red-400 tracking-tighter">
                          {group.totalPLCD > group.totalPL ? '⚠️ DIVERGENTE' : 'OK'}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              ) : (
                data.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-3 py-3 text-blue-400 font-bold">{item.visit_code || 'N/A'}</td>
                    <td className="px-3 py-3 text-gray-400">{item.district || 'N/A'}</td>
                    <td className="px-3 py-3 text-gray-400 font-bold">{item.load_identifier}</td>
                    <td className="px-3 py-3 text-gray-500">{item.doc_number || 'N/A'}</td>
                    <td className="px-3 py-3">
                       <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white font-mono">
                         {item.truck_plate || 'N/A'}
                       </span>
                    </td>
                    <td className="px-3 py-3 text-cyan-400/80 italic">{item.technology || 'N/A'}</td>
                    <td className="px-3 py-3 max-w-[200px] truncate text-gray-400 uppercase font-medium">{item.product || 'CARGA GERAL'}</td>
                    <td className="px-3 py-3 text-center text-gray-300">{(item.weight_gross || 0).toLocaleString()}</td>
                    <td className="px-3 py-3 text-center text-emerald-400 font-bold">{(item.weight_net || 0).toLocaleString()}</td>
                    <td className="px-3 py-3">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => handleRegisterID(item)}
                            className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20"
                            title="Enviar para BD"
                          >
                             <Database size={14} />
                          </button>
                          <button 
                            onClick={() => handleSendOperation(item.visit_code)}
                            className="p-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20"
                            title="Enviar p/ Operação"
                          >
                             <Truck size={14} />
                          </button>
                       </div>
                    </td>
                  </tr>
                ))
              )}
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

export default function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState('GERAL');

  const fetchStats = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/analytics`);
      setStats(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Auto-refresh logic: Poll if manually validating OR if there are pending loads from a recent upload
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const shouldPoll = isValidating || (stats?.pending_loads > 0);
    
    if (shouldPoll) {
      interval = setInterval(() => {
        fetchStats();
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isValidating, stats?.pending_loads]);

  // If pending loads hit 0, we can assume auto-audit is done
  useEffect(() => {
    if (stats?.pending_loads === 0 && isValidating) {
      setIsValidating(false);
    }
  }, [stats?.pending_loads]);

  const triggerValidation = async () => {
    setIsValidating(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/validate`);
      // No alert needed if we have auto-polling, but good for confirmation
      console.log(res.data.message);
      await fetchStats();
    } catch (e) {
      console.error(e);
      alert("Erro ao iniciar auditoria.");
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 relative">
        <div className="flex flex-col gap-2">
          <div className="absolute -top-20 -left-20 w-60 h-60 bg-blue-600/5 blur-[120px] -z-10" />
          <div className="flex items-center gap-3">
             <div className="p-2 bg-blue-600/10 rounded-xl border border-blue-500/20">
                <TableIcon className="text-blue-400" size={20} />
             </div>
             <h2 className="text-4xl font-bold tracking-tight text-white uppercase italic">Análise de <span className="text-gray-500">Cargas RPA</span></h2>
          </div>
          <p className="text-gray-400 max-w-2xl leading-relaxed">
             Relatórios detalhados agrupados por Regra de Negócio. Identifique e baixe planilhas de erros específicos detectados pelo motor da Harvest.
          </p>
        </div>

        <div className="flex items-center gap-3">
           <button 
             onClick={() => document.getElementById('import-reg-ids')?.click()}
             className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border border-blue-500/20 transition-all"
           >
              <Upload size={18} /> Importar IDs
           </button>
           <input 
             id="import-reg-ids" 
             type="file" 
             className="hidden" 
             onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('file', file);
                try {
                   const res = await axios.post(`${API_BASE_URL}/loads/register/import`, formData);
                   alert(res.data.message);
                } catch (err: any) {
                   alert(err.response?.data?.detail || "Erro no import");
                }
             }}
           />

           <button 
             onClick={triggerValidation}
             disabled={isValidating}
             className="flex items-center gap-3 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest border border-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg shadow-emerald-500/5"
           >
             {isValidating ? (
               <Loader2 size={18} className="animate-spin" />
             ) : (
               <AlertTriangle size={18} className="group-hover:scale-110 transition-transform" />
             )}
             {isValidating ? 'Processando Auditoria...' : 'Refazer Auditoria RPA'}
           </button>
        </div>
      </header>

      {/* Top Metrics Cards (Expanded Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <div className="glass p-8 rounded-[2.5rem] border border-white/10 flex flex-col gap-4 bg-red-600/[0.03]">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-red-600/10 rounded-2xl border border-red-500/20">
                <AlertTriangle className="text-red-400" size={24} />
              </div>
              <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Total Erros</span>
            </div>
            <div className="flex flex-col">
              <span className="text-5xl font-black text-white tabular-nums tracking-tighter">
                {stats?.error_loads?.toLocaleString() || '0'}
              </span>
              <span className="text-gray-500 text-[10px] font-bold uppercase mt-1">Deteccões em Cargas</span>
            </div>
         </div>

         <div className="glass p-8 rounded-[2.5rem] border border-white/10 flex flex-col gap-4 bg-emerald-600/[0.03]">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-emerald-600/10 rounded-2xl border border-emerald-500/20">
                <UserCheck className="text-emerald-400" size={24} />
              </div>
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Validado</span>
            </div>
            <div className="flex flex-col">
              <span className="text-5xl font-black text-white tabular-nums tracking-tighter">
                {stats?.validated_loads?.toLocaleString() || '0'}
              </span>
              <span className="text-gray-500 text-[10px] font-bold uppercase mt-1">Conformidade Total</span>
            </div>
         </div>

         <div className="glass p-8 rounded-[2.5rem] border border-white/10 flex flex-col gap-4 bg-amber-600/[0.03]">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-amber-600/10 rounded-2xl border border-amber-500/20">
                <Clock className="text-amber-400" size={24} />
              </div>
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Aguardando Auditoria</span>
            </div>
            <div className="flex flex-col">
              <span className="text-5xl font-black text-white tabular-nums tracking-tighter">
                {stats?.pending_loads?.toLocaleString() || '0'}
              </span>
              <span className="text-gray-500 text-[10px] font-bold uppercase mt-1">Filas de Processamento</span>
            </div>
         </div>

         <div className="glass p-8 rounded-[2.5rem] border border-white/10 flex flex-col gap-4 bg-orange-600/[0.03]">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-orange-600/10 rounded-2xl border border-orange-500/20">
                <Truck className="text-orange-400" size={24} />
              </div>
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Aguardando Operação</span>
            </div>
            <div className="flex flex-col">
              <span className="text-5xl font-black text-white tabular-nums tracking-tighter">
                {stats?.operation_loads?.toLocaleString() || '0'}
              </span>
              <span className="text-gray-500 text-[10px] font-bold uppercase mt-1">Baú de Operação</span>
            </div>
         </div>
      </div>

      <div className="space-y-2">
         <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-[0.3em] mb-6 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Categorias de Erros Detectados
         </h4>
         
         {RULES.map(rule => (
           <RuleTable 
             key={rule.id} 
             rule={rule} 
             totalCount={stats?.rule_breakdown?.[rule.statsKey]} 
             selectedDistrict={selectedDistrict}
           />
         ))}
      </div>

      {/* Legacy/Info Grid Placeholder - Just for aesthetic balance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 opacity-30 pointer-events-none grayscale">
         {[1,2,3].map(i => (
           <div key={i} className="glass rounded-[2rem] h-32 border border-white/10" />
         ))}
      </div>
    </div>
  );
}
