"use client";

import React, { useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Building2, 
  Lock, 
  Mail, 
  ArrowRight, 
  ShieldCheck, 
  Loader2,
  Sparkles,
  Database
} from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const res = await axios.post(`${API_BASE_URL}/login`, {
        username: email,
        password: password
      });
      localStorage.setItem("user", JSON.stringify(res.data));
      window.location.href = "/";
    } catch (err: any) {
      setError(err.response?.data?.detail || "E-mail ou senha incorretos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 relative overflow-hidden bg-[#020202]">
      {/* --- PREMIUM BACKGROUND EFFECTS --- */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-blue-600/10 blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-emerald-600/5 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:32px_32px] opacity-40" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
           <motion.div 
             whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
             className="w-20 h-20 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(59,130,246,0.4)] mb-6 ring-1 ring-white/20"
           >
              <Database className="text-white fill-white/10" size={36} />
           </motion.div>
           <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             transition={{ delay: 0.3 }}
             className="text-center"
           >
              <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">
                Harvest <span className="text-blue-500">2026</span>
              </h1>
              <div className="flex items-center justify-center gap-2 mt-1">
                <Sparkles size={12} className="text-blue-400" />
                <p className="text-[10px] font-black uppercase text-gray-500 tracking-[0.3em]">Plataforma de Auditoria RPA</p>
                <Sparkles size={12} className="text-blue-400" />
              </div>
           </motion.div>
        </div>

        <div className="glass shadow-[0_30px_100px_rgba(0,0,0,0.8)] rounded-[3rem] p-10 relative border border-white/5 backdrop-blur-3xl overflow-hidden">
          {/* Internal Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 blur-[60px] pointer-events-none" />
          
          <form onSubmit={handleLogin} className="space-y-8 relative z-10" noValidate>
            <div className="space-y-6">
              {/* Email Input */}
              <div className="space-y-2 group">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4 group-focus-within:text-blue-400 transition-colors">E-mail Corporativo</label>
                <div className="relative">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={18} />
                  <input 
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/5 rounded-2xl py-4 pl-14 pr-6 text-sm text-white placeholder-gray-600 focus:bg-blue-500/5 focus:border-blue-500/30 transition-all outline-none ring-offset-black"
                    placeholder="bruno@bureauveritas.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2 group">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4 group-focus-within:text-blue-400 transition-colors">Senha de Acesso</label>
                <div className="relative">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={18} />
                  <input 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/5 rounded-2xl py-4 pl-14 pr-6 text-sm text-white placeholder-gray-600 focus:bg-blue-500/5 focus:border-blue-500/30 transition-all outline-none"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400"
                >
                  <ShieldCheck size={16} />
                  <p className="text-xs font-bold uppercase tracking-tight">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-2xl py-5 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-3 shadow-[0_15px_30px_rgba(59,130,246,0.3)] disabled:opacity-50 transition-all italic"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  Entrar no Sistema
                  <ArrowRight size={18} />
                </>
              )}
            </motion.button>
          </form>

          <p className="text-center mt-10 text-[9px] font-bold text-gray-600 uppercase tracking-[0.2em]">
            &copy; 2026 Harvest Intelligence Systems
          </p>
        </div>

        {/* --- SECURITY BADGE --- */}
        <div className="mt-8 flex justify-center opacity-30 group hover:opacity-100 transition-opacity">
           <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md">
              <ShieldCheck size={14} className="text-blue-400" />
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Criptografia RSA Ativa</span>
           </div>
        </div>
      </motion.div>
    </div>
  );
}
