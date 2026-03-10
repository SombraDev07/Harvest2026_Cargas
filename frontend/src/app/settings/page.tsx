"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { 
  Settings, 
  Save, 
  Mail, 
  User, 
  Sliders, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  Shield,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function SettingsPage() {
  const [config, setConfig] = useState<any>({
    corporate_email: "",
    user_display_name: "",
    rateio_delta_minutes: "20"
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/config`);
        setConfig((prev: any) => ({ ...prev, ...res.data }));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await axios.patch(`${API_BASE_URL}/config`, config);
      setMessage({ type: 'success', text: 'Configurações salvas com sucesso' });
      // Update local storage for display name if it changed
      const userStr = localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        user.username_display = config.user_display_name;
        localStorage.setItem("user", JSON.stringify(user));
      }
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      setMessage({ type: 'error', text: 'Erro ao salvar configurações' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-blue-500/40" size={40} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20">
      <header className="flex items-center gap-4 relative">
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-600/10 blur-[100px] -z-10" />
        <div className="p-4 bg-white/[0.03] rounded-3xl border border-white/5 shadow-2xl">
           <Settings className="text-blue-400" size={28} />
        </div>
        <div>
           <h2 className="text-4xl font-black tracking-tight text-white uppercase italic">
             Configurações do <span className="text-blue-500">Sistema</span>
           </h2>
           <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">
             Personalização e Ajuste de Regras RPA
           </p>
        </div>
      </header>

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Personalization Section */}
        <section className="glass p-8 rounded-[2.5rem] border border-white/5 space-y-6 flex flex-col justify-between">
           <div className="space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <User size={18} className="text-blue-400" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Personalização</h3>
              </div>
              
              <div className="space-y-4">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">E-mail Corporativo de Suporte</label>
                    <div className="relative">
                       <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
                       <input 
                         type="email"
                         value={config.corporate_email}
                         onChange={e => setConfig({...config, corporate_email: e.target.value})}
                         className="w-full bg-white/[0.02] border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:border-blue-500/50 focus:bg-blue-500/5 transition-all outline-none"
                         placeholder="exemplo@empresa.com"
                       />
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nome de Exibição (Usuário)</label>
                    <div className="relative">
                       <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
                       <input 
                         type="text"
                         value={config.user_display_name}
                         onChange={e => setConfig({...config, user_display_name: e.target.value})}
                         className="w-full bg-white/[0.02] border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:border-blue-500/50 focus:bg-blue-500/5 transition-all outline-none"
                         placeholder="Seu nome"
                       />
                    </div>
                 </div>
              </div>
           </div>

           <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl mt-4">
              <p className="text-[10px] text-blue-300 font-medium leading-relaxed italic">
                 "Estes dados são usados para assinar as auditorias e logs de operação."
              </p>
           </div>
        </section>

        {/* Rules Tuning Section */}
        <section className="glass p-8 rounded-[2.5rem] border border-white/5 space-y-6">
           <div className="flex items-center gap-3 mb-2">
             <Sliders size={18} className="text-emerald-400" />
             <h3 className="text-lg font-black text-white uppercase tracking-tight">Ajuste de Regras</h3>
           </div>

           <div className="space-y-6">
              <div className="space-y-3">
                 <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Janela de Sensibilidade (Rateio)</label>
                    <span className="text-xs font-black text-emerald-400">{config.rateio_delta_minutes} min</span>
                 </div>
                 <input 
                   type="range"
                   min="5"
                   max="120"
                   step="5"
                   value={config.rateio_delta_minutes}
                   onChange={e => setConfig({...config, rateio_delta_minutes: e.target.value})}
                   className="w-full h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                 />
                 <div className="flex justify-between text-[8px] font-black text-gray-600 uppercase tracking-tighter">
                    <span>Alta (5m)</span>
                    <span>Média (60m)</span>
                    <span>Baixa (120m)</span>
                 </div>
              </div>

              <div className="space-y-3 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                 <div className="flex gap-3">
                    <Clock size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                       <p className="text-[10px] font-black text-white uppercase mb-1">Impacto na Auditoria</p>
                       <p className="text-[10px] text-gray-500 font-medium leading-normal">
                          Configurar para <strong>{config.rateio_delta_minutes} minutos</strong> significa que o sistema buscará parceiros de rateio em uma janela total de {(parseInt(config.rateio_delta_minutes) * 2)} minutos (antes e depois).
                       </p>
                    </div>
                 </div>
              </div>

              <div className="space-y-4 pt-2">
                 <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.01] border border-white/5 opacity-50">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Regras de Placa (Mercosul/Antiga) ATIVAS</span>
                 </div>
                 <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.01] border border-white/5 opacity-50">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Detector de Peso Fictício ATIVO</span>
                 </div>
              </div>
           </div>
        </section>

        {/* Footer Actions */}
        <div className="md:col-span-2 flex items-center justify-between pt-4">
           <AnimatePresence>
             {message && (
               <motion.div 
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 exit={{ opacity: 0, x: -20 }}
                 className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
                   message.type === 'success' 
                     ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                     : 'bg-red-500/10 border-red-500/30 text-red-400'
                 }`}
               >
                 {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                 <span className="text-xs font-bold uppercase tracking-tight">{message.text}</span>
               </motion.div>
             )}
           </AnimatePresence>

           <button 
             type="submit"
             disabled={saving}
             className="ml-auto group relative flex items-center gap-3 px-10 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-2xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] active:scale-95"
           >
             {saving ? (
               <Loader2 size={18} className="animate-spin" />
             ) : (
               <>
                 <Save size={18} />
                 <span className="font-black text-sm uppercase tracking-tighter italic">Salvar Configurações</span>
               </>
             )}
           </button>
        </div>
      </form>
    </div>
  );
}
