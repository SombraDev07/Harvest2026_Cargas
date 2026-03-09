"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, User, ArrowRight, Wheat } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) throw new Error("Usuário ou senha inválidos");

      const data = await res.json();
      localStorage.setItem("user", JSON.stringify(data));
      router.push("/analytics");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 -left-20 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-blue-900/10 rounded-full blur-[120px]" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass p-10 rounded-[40px] border border-white/10 relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-2xl shadow-blue-500/20">
            <Wheat className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">
            Harvest <span className="text-blue-500">2026</span>
          </h1>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-2">Plataforma de Auditoria RPA</p>
        </div>

        <form onSubmit={handleLogin} noValidate className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4">E-mail Corporativo</label>
            <div className="relative group">
              <User className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="email"
                id="username"
                name="username"
                autoComplete="email"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="exemplo@viter.com"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4">Senha</label>
            <div className="relative group">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={18} />
              <input 
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-6 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all"
              />
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-bold uppercase tracking-widest p-4 rounded-xl text-center"
            >
              {error}
            </motion.div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-3 group"
          >
            {loading ? "AUTENTICANDO..." : (
              <>
                ENTRAR NO SISTEMA
                <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
              </>
            )}
          </button>
        </form>

        <div className="mt-10 pt-8 border-t border-white/5 text-center">
          <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em]">
            © 2026 Harvest Intelligence Systems
          </p>
        </div>
      </motion.div>
    </div>
  );
}
