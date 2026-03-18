"use client";

import { useState, useRef, useEffect } from "react";
import {
  FileUp,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  CloudUpload,
  Info,
  Clock,
  ArrowRight,
  Zap,
  MapPin,
  Play
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

interface UploadResult {
  message?: string;
  total_rows?: number;
  imported_new?: number;
  districts?: string[];
  status?: string;
}

export default function SpreadsheetPage() {
  const [isUploading, setIsUploading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string>("");
  const [validationMessage, setValidationMessage] = useState<string>("");
  const [shouldWipe, setShouldWipe] = useState(true);
  const [isRegisteringMemory, setIsRegisteringMemory] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState("");
  const [systemConfig, setSystemConfig] = useState<any>({});
  const [systemStatus, setSystemStatus] = useState<any>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const memoryInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/system/status`);
      setSystemStatus(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/config`);
      setSystemConfig(res.data);
    } catch (e) {
      console.error("Failed to fetch config", e);
    }
  };

  useEffect(() => {
    const init = async () => {
      await fetchConfig();
      await fetchStatus();
    };
    init();

    // Poll status every 3 seconds to catch the background validation progress
    const interval = setInterval(() => {
      fetchStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSystemReset = async () => {
    if (!confirm("⚠️ ATENÇÃO: Isso apagará todas as cargas, erros e análises atuais. O banco de IDs Registrados será preservado. Deseja continuar?")) return;

    try {
      await axios.delete(`${API_BASE_URL}/system/reset`);
      alert("Sistema reiniciado com sucesso!");
      setUploadResult(null);
      window.location.reload();
    } catch (error) {
      alert("Erro ao reiniciar sistema.");
    }
  };

  const handleRegisterMemory = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRegisteringMemory(true);
    setMemoryMessage("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(`${API_BASE_URL}/loads/register-memory`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000
      });
      setMemoryMessage(response.data.message);
    } catch (error: any) {
      console.error("Memory registration failed", error);
      alert("Falha ao registrar memória: " + (error.response?.data?.detail || error.message));
    } finally {
      setIsRegisteringMemory(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadResult(null);
    setSelectedDistrict("");

    try {
      // 1. UPLOAD DIRECT TO SUPABASE STORAGE
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      // Import the dynamic supabase client
      const { supabase } = await import("@/lib/supabase");

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('planilhas')
        .upload(filePath, file);

      if (uploadError) throw new Error(`Supabase Storage Error: ${uploadError.message}`);

      // 2. TRIGGER BACKEND IMPORT FROM STORAGE
      const response = await axios.post(`${API_BASE_URL}/upload/supabase`, {
        file_path: filePath,
        file_name: file.name,
        wipe: shouldWipe
      }, {
        timeout: 900000 // 15 minutes
      });

      setUploadResult(response.data);
      await fetchStatus();
      await fetchConfig();
    } catch (error: any) {
      console.error("Cloud Upload failed", error);

      alert(`🚨 FALHA NO NOVO FLUXO CLOUD:\n\n` +
        `• Erro: ${error.message || 'Desconhecido'}\n\n` +
        `Certifique-on que o Bucket 'planilhas' foi criado no Supabase com acesso público.`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRunAnalysis = async () => {
    setIsValidating(true);
    setValidationMessage("");

    try {
      const params = selectedDistrict ? { district: selectedDistrict } : {};
      const response = await axios.post(`${API_BASE_URL}/validate-all`, null, { params });
      setValidationMessage(response.data.message);
      // Wait a bit to show success
      setTimeout(() => setValidationMessage(""), 5000);
    } catch (error) {
      console.error("Validation failed", error);
      alert("Falha ao rodar análise.");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {systemStatus?.is_processing && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: 50 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 50, x: 50 }}
            className="fixed bottom-8 right-8 z-50 glass p-6 rounded-2xl border border-blue-500/30 shadow-[0_0_40px_rgba(59,130,246,0.15)] flex flex-col gap-4 w-80 pointer-events-none"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/20 rounded-2xl">
                <Loader2 size={24} className="text-blue-400 animate-spin" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Auditoria em Massa</p>
                <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Motor RPA Rodando</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-blue-400">Progresso</span>
                <span className="text-white">{systemStatus.processing_progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-600 to-emerald-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${systemStatus.processing_progress}%` }}
                  transition={{ ease: "linear", duration: 0.5 }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="space-y-12">
        <header className="flex flex-col gap-2 relative">
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-500/10 blur-[80px] -z-10" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-4xl font-bold tracking-tight text-white italic">Inteligência de <span className="text-gray-500">Dados RPA</span></h2>
              <p className="text-gray-400 max-w-xl">Motor de processamento centralizado. Gerencie distritos e valide grandes volumes em segundos.</p>
            </div>
            <div className="text-right flex flex-col items-end gap-2">
              <div>
                <p className="text-[10px] font-black uppercase text-blue-500 tracking-widest mb-1">Status de Atualização</p>
                <p className="text-xs font-bold text-white flex items-center gap-2 justify-end">
                  <Clock size={12} className="text-gray-600" />
                  Última Planilha: <span className="text-gray-400 font-mono">{systemStatus.last_upload_at || "N/A"}</span>
                </p>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-2 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-tight">Ativa:</span>
                <span className="text-[10px] font-black text-white truncate max-w-[200px]">{systemStatus.active_filename || "Nenhuma"}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Container */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            {/* Upload Zone */}
            <motion.div
              whileHover={!isUploading ? { scale: 1.005 } : {}}
              whileTap={!isUploading ? { scale: 0.995 } : {}}
              className={`relative group h-80 glass rounded-[2.5rem] border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center overflow-hidden cursor-pointer
              ${isUploading ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 hover:border-blue-500/30 bg-white/[0.01] hover:bg-white/[0.02]'}
            `}
              onClick={() => !isUploading && fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileUpload}
                accept=".csv,.xlsx"
              />
              <AnimatePresence mode="wait">
                {isUploading ? (
                  <motion.div
                    key="uploading"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-6 text-center px-10"
                  >
                    <Loader2 className="animate-spin text-blue-500" size={64} />
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Processando Planilha Real...</h3>
                      <p className="text-xs text-gray-500 font-medium">O motor Python está indexando as linhas e extraindo distritos.</p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center text-center p-10"
                  >
                    <div className="w-20 h-20 rounded-[1.5rem] bg-gradient-to-br from-blue-600/20 to-emerald-600/20 flex items-center justify-center border border-white/5 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 mb-6 shadow-2xl">
                      <CloudUpload size={32} className="text-blue-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Importar Nova Planilha</h3>
                    <p className="text-gray-500 max-w-sm text-sm leading-relaxed">Arraste ou clique para selecionar seu arquivo <span className="text-white font-bold">CSV ou XLSX</span>.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Upload Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShouldWipe(!shouldWipe)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${shouldWipe ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-white/5 border-white/10 text-gray-500'}`}
                >
                  <Trash2 size={14} />
                  Limpar dados anteriores ao importar
                  <div className={`w-8 h-4 rounded-full relative transition-all ${shouldWipe ? 'bg-orange-500' : 'bg-gray-700'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${shouldWipe ? 'left-4.5' : 'left-0.5'}`} />
                  </div>
                </button>
              </div>

              <button
                onClick={handleSystemReset}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
              >
                <Trash2 size={14} /> Reiniciar Sistema
              </button>
            </div>

            {/* Results Analysis Area */}
            <AnimatePresence>
              {uploadResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass rounded-[2rem] p-8 border border-white/10 space-y-8"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <CheckCircle2 size={24} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          {uploadResult.status === "background_started" ? "Upload Recebido" : "Planilha Processada"}
                        </h3>
                        <p className="text-xs text-gray-500 italic">
                          {uploadResult.status === "background_started" ? "O motor RPA iniciou o processamento em segundo plano." : "Detecção de colunas e registros concluída."}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black text-white tabular-nums">
                        {uploadResult.status === "background_started" ? "---" : (uploadResult.total_rows?.toLocaleString() || "0")}
                      </p>
                      <p className="text-[10px] font-black uppercase text-gray-600 tracking-widest">Cargas Totais</p>
                    </div>
                  </div>

                  {uploadResult.status === "background_started" && (
                    <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold text-center animate-pulse">
                      {uploadResult.message}
                    </div>
                  )}

                  <div className="h-[1px] bg-white/5 w-full" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase text-gray-500 tracking-[.2em] flex items-center gap-2">
                        <MapPin size={12} /> Filtrar por Distrito
                      </label>
                      <select
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer hover:bg-black/60 transition-colors"
                        value={selectedDistrict}
                        onChange={(e) => setSelectedDistrict(e.target.value)}
                      >
                        <option value="">
                          {uploadResult.status === "background_started" ? "Aguardando processamento..." : `Todos os Distritos (${uploadResult.districts?.length || 0})`}
                        </option>
                        {uploadResult.districts?.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col justify-end">
                      <button
                        onClick={handleRunAnalysis}
                        disabled={isValidating}
                        className={`h-12 w-full rounded-xl flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest transition-all shadow-lg
                        ${isValidating
                            ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20 active:scale-95'}
                      `}
                      >
                        {isValidating ? (
                          <>Validando Dados... <Loader2 className="animate-spin" size={16} /></>
                        ) : (
                          <>Rodar Análise <Play size={16} fill="currentColor" /></>
                        )}
                      </button>
                    </div>
                  </div>

                  {validationMessage && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col gap-4"
                    >
                      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold text-center">
                        {validationMessage}
                      </div>
                      <a
                        href="/database"
                        className="flex items-center justify-center gap-2 text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 transition-colors tracking-widest"
                      >
                        Ver detalhes no Banco de Dados <ArrowRight size={12} />
                      </a>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Info Sidebar */}
          <div className="space-y-6">
            <div className="glass-card bg-emerald-500/[0.03] border-emerald-500/20">
              <div className="flex items-center gap-3 mb-4 text-emerald-400">
                <Zap size={20} />
                <h4 className="text-sm font-black uppercase tracking-widest">Aceleração RPA</h4>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed mb-6">
                Nosso motor local (Ohio-1) está rodando scripts em Python para limpar e desduplicar ID's em tempo real.
              </p>
              <div className="space-y-3">
                {[
                  { label: 'Detecção de Distrito', status: 'Ativo' },
                  { label: 'Map-Reduce Validation', status: 'Pronto' },
                  { label: 'Exportação AWS RDS', status: 'Sync' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between text-[10px] font-bold">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="text-emerald-500 uppercase">{item.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 rounded-[2rem] bg-gradient-to-br from-blue-600/10 to-indigo-600/10 border border-white/5 space-y-6">
              <div>
                <p className="text-[10px] font-black text-blue-400 uppercase mb-4 tracking-[.3em]">Carga de Trabalho</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-gray-400 uppercase">Processador</span>
                    <span className="text-white">{isUploading || isValidating ? '94%' : '4%'}</span>
                  </div>
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full ${isUploading || isValidating ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-gray-600'}`}
                      initial={{ width: 0 }}
                      animate={{ width: isUploading || isValidating ? '94%' : '4%' }}
                      transition={{ type: 'spring', stiffness: 50 }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 space-y-4">
                <div className="flex items-center gap-2 text-blue-400">
                  <Clock size={16} />
                  <h4 className="text-[10px] font-black uppercase tracking-widest">Registro de Memória RPA</h4>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed font-bold">
                  Upe aqui as planilhas de ONTEM ou anteriores para gravar os IDs no banco de dados.
                  IDs registrados aqui <span className="text-white">NÃO</span> irão para a Fila de Urgência em futuros uploads.
                </p>
                <input
                  type="file"
                  ref={memoryInputRef}
                  className="hidden"
                  onChange={handleRegisterMemory}
                  accept=".csv,.xlsx"
                />
                <button
                  onClick={() => memoryInputRef.current?.click()}
                  disabled={isRegisteringMemory}
                  className={`w-full py-3 rounded-xl border border-blue-500/30 bg-blue-500/5 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/10 transition-all
                    ${isRegisteringMemory ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {isRegisteringMemory ? "Registrando..." : "Registrar IDs da Memória"}
                </button>
                {memoryMessage && (
                  <p className="text-[10px] text-emerald-400 font-bold text-center animate-pulse">{memoryMessage}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div >
    </>
  );
}
