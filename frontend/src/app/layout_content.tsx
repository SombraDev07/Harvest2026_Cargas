"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  BarChart3, 
  Database, 
  FileSpreadsheet, 
  LayoutDashboard,
  LogOut,
  Settings,
  Circle,
  Zap
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const sidebarItems = [
  { name: "Painel Geral", icon: LayoutDashboard, href: "/" },
  { name: "Fila de Urgência", icon: Zap, href: "/fast-track" },
  { name: "Análise de Cargas", icon: BarChart3, href: "/analytics" },
  { name: "Banco de Dados", icon: Database, href: "/database" },
  { name: "Planilha", icon: FileSpreadsheet, href: "/spreadsheet" },
];

export default function RootLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const auth = localStorage.getItem("harvest_authenticated");
    if (!auth && pathname !== "/login") {
      window.location.href = "/login";
    } else {
      setIsAuthenticated(!!auth);
    }
  }, [pathname]);

  const isLoginPage = pathname === "/login";

  if (isLoginPage) return <>{children}</>;
  if (isAuthenticated === null && pathname !== "/login") return null; // Loading state

  return (
    <div className="flex h-screen overflow-hidden bg-[#030303] text-gray-200">
      {/* Sidebar */}
      <aside className="w-72 glass-nav flex flex-col z-30">
        <div className="p-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]">
               <Database className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                Harvest <span className="text-blue-400">2026</span>
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                 <Circle size={6} className="fill-emerald-500 text-emerald-500 animate-pulse" />
                 <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500/80">RPA Ativo</span>
              </div>
            </div>
          </motion.div>
        </div>

        <nav className="flex-1 px-4 space-y-1.5 mt-4">
          {sidebarItems.map((item, idx) => {
            const isActive = pathname === item.href;
            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <Link
                  href={item.href}
                  className={`relative flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium transition-all group ${
                    isActive 
                      ? "text-white bg-white/5 shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]" 
                      : "text-gray-500 hover:text-gray-200 hover:bg-white/[0.02]"
                  }`}
                >
                  <item.icon 
                    size={20} 
                    className={isActive ? "text-blue-400" : "text-gray-500 group-hover:text-gray-300"} 
                  />
                  {item.name}
                  
                  {isActive && (
                    <motion.div 
                      layoutId="sidebar-active"
                      className="absolute right-0 w-1 h-6 bg-blue-500 rounded-l-full shadow-[0_0_10px_rgba(59,130,246,1)]"
                    />
                  )}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        <div className="p-6 space-y-2">
          <button className="flex items-center gap-3 px-4 py-2.5 w-full text-xs font-semibold text-gray-500 hover:text-gray-300 transition-colors bg-white/[0.02] border border-white/5 rounded-xl">
            <Settings size={16} />
            CONFIGURAÇÕES
          </button>
          <div className="p-4 glass rounded-2xl mt-4">
             <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Sessão Atual</p>
             <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs font-bold ring-1 ring-blue-500/30">
                  B
                </div>
                <div>
                   <p className="text-xs font-bold text-white">Bruno S.</p>
                   <p className="text-[10px] text-emerald-500/70">Admin Master</p>
                </div>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden bg-black">
        {/* Dynamic Backgrounds */}
        <div className="absolute top-0 left-0 w-full h-full -z-10 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[150px] rounded-full -z-10 animate-pulse" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-600/10 blur-[150px] rounded-full -z-10" />

        <div className="h-full overflow-y-auto custom-scrollbar pt-24 pb-12 px-12">
          <div className="fixed top-0 left-72 right-0 h-24 bg-gradient-to-b from-black via-black/80 to-transparent z-20 flex items-center justify-between px-12 backdrop-blur-sm">
             <div className="flex items-center gap-4">
                <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,1)]" />
                <span className="text-xs font-bold tracking-widest text-gray-500 uppercase">Status do Sistema: <span className="text-blue-400">Otimizado</span></span>
             </div>
             
             <div className="flex items-center gap-3">
                <div className="glass px-4 py-2 flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                   <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">AWS RDS Online</span>
                </div>
                <button className="glass p-2 hover:bg-white/10 transition-colors active:scale-95">
                   <LogOut size={16} className="text-red-400" />
                </button>
             </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="max-w-7xl mx-auto"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
