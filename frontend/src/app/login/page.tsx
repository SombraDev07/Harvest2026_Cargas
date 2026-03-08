"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Database, 
  Lock, 
  User, 
  ArrowRight, 
  ChevronRight, 
  ShieldCheck, 
  Cpu, 
  Zap,
  Mail
} from "lucide-react";

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("harvest_authenticated", "true");
    localStorage.setItem("harvest_user_name", "Bruno S."); // Default for demo
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen w-full bg-[#030303] flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[150px] rounded-full animate-pulse" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-600/10 blur-[150px] rounded-full" />
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff03_1px,transparent_1px)] [background-size:32px_32px] opacity-40" />

      {/* Main Container */}
      <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-0 relative z-10 glass rounded-[3rem] border border-white/5 overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)]">
        
        {/* Left Side: Brand & Visuals */}
        <div className="p-10 lg:pl-16 lg:pr-12 lg:py-20 bg-gradient-to-br from-blue-600/10 to-transparent flex flex-col justify-between border-r border-white/5 relative group">
           <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
           
           <div>
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 mb-12"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                  <Database className="text-white" size={32} />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tighter text-white uppercase italic">
                    Harvest <span className="text-blue-500">2026</span>
                  </h1>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-6"
              >
                <h2 className="text-5xl font-black text-white leading-tight tracking-tight uppercase italic drop-shadow-2xl">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Monitoramento</span> <br />
                  de Cargas
                </h2>
                <p className="text-gray-400 text-lg max-w-sm leading-relaxed font-medium opacity-80">
                  Central de inteligência Harvest 2026. <br />
                  Gestão avançada e validação de dados em tempo real.
                </p>
              </motion.div>
           </div>

           <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             transition={{ delay: 0.4 }}
             className="grid grid-cols-2 gap-4 mt-12"
           >
              <div className="glass-card p-4 rounded-3xl border border-white/5 bg-white/[0.02]">
                 <Cpu size={20} className="text-blue-400 mb-2" />
                 <p className="text-[10px] font-black text-white uppercase tracking-widest">Motor Pro</p>
                 <p className="text-[9px] text-gray-500 font-bold uppercase mt-1">Validação Realtime</p>
              </div>
              <div className="glass-card p-4 rounded-3xl border border-white/5 bg-white/[0.02]">
                 <Zap size={20} className="text-emerald-400 mb-2" />
                 <p className="text-[10px] font-black text-white uppercase tracking-widest">Fast Track</p>
                 <p className="text-[9px] text-gray-500 font-bold uppercase mt-1">Urgência 48h</p>
              </div>
           </motion.div>
        </div>

        {/* Right Side: Form */}
        <div className="p-12 lg:p-20 bg-black/40 backdrop-blur-xl flex flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={isLogin ? "login" : "signup"}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <div className="mb-10 text-center lg:text-left">
                <h3 className="text-3xl font-black text-white uppercase italic tracking-tight mb-2">
                  {isLogin ? "BEM-VINDO" : "NOVA CONTA"}
                </h3>
                <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">
                  {isLogin ? "Insira suas credenciais" : "Crie seu acesso exclusivo"}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2 group">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-4 group-focus-within:text-blue-400 transition-colors">E-mail Corporativo</label>
                  <div className="relative group">
                    <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={18} />
                    <input 
                      type="email" 
                      placeholder="seu@email.com"
                      className="w-full bg-white/[0.03] border border-white/5 focus:border-blue-500/50 focus:bg-white/[0.06] rounded-2xl py-4 pl-14 pr-6 text-white text-sm outline-none transition-all placeholder:text-gray-600 font-medium"
                      required
                    />
                  </div>
                </div>

                {!isLogin && (
                   <div className="space-y-2 group">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-4 group-focus-within:text-emerald-400 transition-colors">Nome de Usuário</label>
                    <div className="relative">
                      <User className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-emerald-400 transition-colors" size={18} />
                      <input 
                        type="text" 
                        placeholder="Nome Completo"
                        className="w-full bg-white/[0.03] border border-white/5 focus:border-emerald-500/50 focus:bg-white/[0.06] rounded-2xl py-4 pl-14 pr-6 text-white text-sm outline-none transition-all placeholder:text-gray-600 font-medium"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2 group">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-4 group-focus-within:text-blue-400 transition-colors">Senha Segura</label>
                  <div className="relative">
                    <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-400 transition-colors" size={18} />
                    <input 
                      type="password" 
                      placeholder="••••••••"
                      className="w-full bg-white/[0.03] border border-white/5 focus:border-blue-500/50 focus:bg-white/[0.06] rounded-2xl py-4 pl-14 pr-6 text-white text-sm outline-none transition-all placeholder:text-gray-600 font-medium"
                      required
                    />
                  </div>
                </div>

                <div className="pt-6">
                  <button 
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-400 hover:from-blue-500 hover:to-blue-300 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98] uppercase tracking-widest text-xs"
                  >
                    {isLogin ? "Acessar Plataforma" : "Confirmar Criação"}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </form>

              <div className="mt-10 flex flex-col items-center gap-4">
                 {isLogin && (
                   <button className="text-[10px] font-black text-gray-500 hover:text-white uppercase tracking-widest transition-colors">
                     Esqueceu sua senha?
                   </button>
                 )}
                 <div className="h-px w-20 bg-white/5" />
                 <button 
                   onClick={() => setIsLogin(!isLogin)}
                   className="text-[11px] font-bold text-blue-400/80 hover:text-blue-300 uppercase tracking-tight flex items-center gap-2 group transition-all"
                 >
                   {isLogin ? "Não possui conta? Crie aqui" : "Já tem conta? Volte ao login"}
                   <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                 </button>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="mt-auto pt-10 flex items-center justify-center gap-2 opacity-30">
             <ShieldCheck size={14} className="text-gray-400" />
             <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Certificado Harvest RSA-4096</span>
          </div>
        </div>
      </div>

      {/* Decorative Blur Orbs */}
      <div className="fixed bottom-10 right-10 text-[10px] font-black text-white/10 uppercase tracking-[.5em] pointer-events-none select-none italic">
         © 2026 Harvest Systems
      </div>
    </div>
  );
}
