// content.js - Motor de Extração e Validação Determinística (Premium v1.1)

(async function() {
    'use strict';
    const CURRENT_VERSION = "2.1.6";
    
    // Guard: Impede múltiplas instâncias idênticas
    if (window.auditMotorVersion === CURRENT_VERSION && !window.forceAuditReload) {
        return;
    }
    window.auditMotorVersion = CURRENT_VERSION;
    console.log("=== Harvest Auditor 2026: Motor v" + CURRENT_VERSION + " ===");

    // Whitelists e Configurações
    const TECH_WHITELIST = ["DECLARADA", "TESTADA NEGATIVA", "TESTADA POSITIVA", "PARTICIPANTE"];
    const SINGLE_NAMES = ["SOLO", "TERRA", "AGRO", "BRASIL", "SAFRA", "MILHO", "SOJA", "VALE", "HORTO", "VIVA", "VERDE", "OURO", "WARPOL"];

    const API_KEYS_POOL = [
        "AIzaSyBzHGTzqb4relfK8NE7CDWxUnSWxHZGuoE", 
        "AIzaSyDfPYfDueomZwOhDmV5R5nUbKi1G-26qHQ",
        "AIzaSyDtBWUiA9DIn4KCsB_LtgOhIjEGIGDeAYw",
        "AIzaSyCtiNh1qYe1HeLLYiS2JmeUkJbm-X3OI78"
    ];

    let chatHistory = [];
    let auditData = { alerts: [], charges: [], fullReport: "" };
    
    // Telemetria (v1.8.0)
    let iaUsedInVisit = false;
    let foundErrorsCount = 0;
    let telemetryStats = { "Página1": false, "Página2": false };

    async function validarStatusGlobal() {
        try {
            const config = await chrome.storage.local.get(['googleSheetsUrl']);
            const url = config.googleSheetsUrl;
            if (!url) return true; // Se não tem URL, não bloqueia (ainda não configurado)

            // Faz o GET (Script doGet)
            const resp = await fetch(url + "?check=1");
            const data = await resp.json();
            
            if (data.status === "OFF") {
                console.error("⛔ Harvest Auditor: ACESSO DESATIVADO PELO ADMINISTRADOR.");
                window.harvestBlocked = true;
                const overlay = document.createElement('div');
                overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.9); z-index:1000000; display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:sans-serif;";
                overlay.innerHTML = `
                    <div style="text-align:center; padding: 40px; background:white; border-radius:12px; box-shadow:0 10px 25px rgba(0,0,0,0.1); border-top: 10px solid #DC2626;">
                        <h1 style="color:#DC2626; margin:0;">Acesso Desativado</h1>
                        <p style="color:#475569; font-size:16px; margin-top:15px;">Esta ferramenta foi desativada temporária ou permanentemente pelo administrador.</p>
                        <hr style="border:0; border-top:1px solid #E2E8F0; margin: 20px 0;">
                        <span style="font-size:12px; color:#94A3B8;">Harvest Auditor v2.1.6</span>
                    </div>
                `;
                document.body.appendChild(overlay);
                return false;
            }
        } catch (e) {
            console.warn("⚠️ Falha ao checar status de ativação:", e);
        }
        return true;
    }

    function extrairDadosVisita() {
        const meta = { itinerante: false, inputs: {}, els: {} }; // els guardará os elementos DOM para destaque
        try {
            const text = document.body.innerText;
            meta.itinerante = text.includes("ITINERANTE SIM") || text.includes("Itinerante: Sim");
            
            // Helper robusto para extrair o valor SELECIONADO (Retorna {val, el})
            const findSelectedValue = (labelCode, labelText) => {
                const elements = Array.from(document.querySelectorAll('label, b, strong, p, span, div, h1, h2, h3, h4'));
                
                // 1. Localiza o rótulo
                let target = elements.find(el => {
                    const txt = el.innerText.trim().toUpperCase();
                    if (!txt.startsWith(labelCode.toUpperCase())) return false;
                    const charAfter = txt.charAt(labelCode.length);
                    return !/\d/.test(charAfter); 
                });

                if (!target && labelText) {
                    target = elements.find(el => {
                        const txt = el.innerText.trim().toUpperCase();
                        return txt.includes(labelText.toUpperCase()) && txt.length < labelText.length + 30;
                    });
                }
                
                if (!target) return { val: "", el: null };
                
                const container = target.closest('.form-group') || target.closest('.row') || target.closest('.panel-body') || target.parentElement;

                // 2. EXTRAÇÃO
                
                // A. Checkbox/Radio/Botões (Bootstrap Active State)
                const buttons = Array.from(container.querySelectorAll('.btn, .active, .btn-primary, .btn-success, .btn-info, label.active'));
                const activeBtn = buttons.find(b => {
                    const hasActiveClass = b.classList.contains('active') || 
                                           b.classList.contains('btn-primary') || 
                                           b.classList.contains('btn-success') || 
                                           b.classList.contains('btn-info');
                    return b !== target && !target.contains(b) && hasActiveClass;
                });
                if (activeBtn) return { val: activeBtn.innerText.trim(), el: activeBtn };
                
                // B. Rádio Nativo
                const checkedRadio = container.querySelector('input[type="radio"]:checked');
                if (checkedRadio) {
                    const radioLabel = container.querySelector(`label[for="${checkedRadio.id}"]`);
                    return { val: radioLabel ? radioLabel.innerText.trim() : checkedRadio.value, el: checkedRadio };
                }
                
                // C. Select / Bootstrap Select
                const filterOption = container.querySelector('.filter-option-inner-inner, .filter-option');
                if (filterOption) return { val: filterOption.innerText.trim(), el: filterOption };
                const select = container.querySelector('select');
                if (select) return { val: select.options[select.selectedIndex]?.text.trim() || select.value, el: select };
                
                // D. Input de Texto / Texto Estático / Help Block
                const inputs = Array.from(container.querySelectorAll('input:not([type="hidden"]), .form-control-static, p.form-control-static, p.help-block, div, span'));
                const valInput = inputs.find(i => {
                    const val = (i.value || i.innerText || "").trim();
                    // Deve ser diferente do label e não conter o label (para evitar pegar o container pai)
                    return i !== target && !i.contains(target) && val.length > 0 && val !== labelCode;
                });
                if (valInput) return { val: (valInput.value || valInput.innerText).trim(), el: valInput };

                return { val: "", el: null };
            };

            // 2.1, 3.1, 3.2, 3.3, 3.8
            const r21 = findSelectedValue("2.1.", "INÍCIO");
            meta.inputs.v21 = r21.val;
            meta.els.v21 = r21.el;

            const r31 = findSelectedValue("3.1.", "HOUVE RECEBIMENTO");
            meta.inputs.v31 = r31.val;
            meta.els.v31 = r31.el;

            const r32 = findSelectedValue("3.2.", "REALIZA OS TESTES");
            meta.inputs.v32 = r32.val;
            meta.els.v32 = r32.el;

            const r33 = findSelectedValue("3.3.", "CONFORMIDADE COM AS INSTRUÇÕES");
            meta.inputs.v33 = r33.val;
            meta.els.v33 = r33.el;

            const r38 = findSelectedValue("3.8.", "Quantas caixas de fita");
            meta.inputs.v38 = parseNumeric(r38.val);
            meta.els.v38 = r38.el;

            const r41 = findSelectedValue("4.1.", "SAFRA ATUAL");
            meta.inputs.v41 = r41.val;
            meta.els.v41 = r41.el;

            const r42 = findSelectedValue("4.2.", "DIA ANTERIOR");
            meta.inputs.v42 = r42.val;
            meta.els.v42 = r42.el;

            const rItinerante = findSelectedValue("Itinerante", "Itinerante");
            meta.itinerante = (rItinerante.val || "").toUpperCase().trim().startsWith("SIM");
            meta.els.itinerante = rItinerante.el;
            
            // Extração da Data da Visita (para conferência com as cargas)
            const rDataVisita = findSelectedValue("DATA", "DATA DA VISITA") || { val: "" };
            meta.dt_visita = rDataVisita.val.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || "";

            // Extração de Entrada e Saída (v2.1.8 - Mais robusto para Harvest)
            const rEntrada = findSelectedValue("Entrada", "Data/Hora Entrada");
            const rSaida = findSelectedValue("Saída", "Data/Hora Saida");
            
            meta.hr_entrada = (rEntrada.val.match(/\d{2}:\d{2}/) || [])[0] || "";
            meta.hr_saida = (rSaida.val.match(/\d{2}:\d{2}/) || [])[0] || "";
            meta.dt_entrada = (rEntrada.val.match(/\d{2}\/\d{2}\/\d{4}/) || [])[0] || "";
            
            meta.els.hr_entrada = rEntrada.el;
            meta.els.hr_saida = rSaida.el;

            // 5.1 e 5.2 (TOTAIS) - Buscando na tabela de totais
            const resumoRows = Array.from(document.querySelectorAll('tr'));
            
            // Helper para encontrar totais em tabelas de resumo (Retorna {val, el})
            const findTotalInContext = (sectionMarker, rowLabel) => {
                const upMarker = sectionMarker.toUpperCase();
                const upLabel = rowLabel.toUpperCase();

                // 0. ESTRATÉGIA DE ID (Prioridade Absoluta)
                const ID_MAPS = {
                    "4.1.1": {
                        "TOTAL SEM PARTICIPANTE": "kg_total_sem_part_acumulado",
                        "TOTAL COM PARTICIPANTE": "kg_total_acumulado",
                        "TESTADA NEGATIVA": "kg_testada_negativa_acumulado",
                        "TESTADA POSITIVA": "kg_positiva_acumulado",
                        "DECLARADA": "kg_declarada_acumulado"
                    },
                    "4.2.1": {
                        "TOTAL SEM PARTICIPANTE": "kg_total_sem_part_dia_anterior",
                        "TOTAL COM PARTICIPANTE": "kg_total_dia_anterior",
                        "TESTADA NEGATIVA": "kg_testada_negativa_dia_anterior",
                        "TESTADA POSITIVA": "kg_testada_positiva_dia_anterior"
                    },
                    "5.1": {
                        "TESTADA NEGATIVA": "kg_testada_negativa_durante_visita",
                        "TESTADA POSITIVA": "kg_positiva_durante_visita",
                        "DECLARADA": "kg_declarada_durante_visita",
                        "TOTAL SEM PARTICIPANTE": "kg_total_durante_visita_sem_part",
                        "TOTAL COM PARTICIPANTE": "kg_total_durante_visita"
                    },
                    "5.2": {
                        "TESTADA NEGATIVA": "nr_testada_negativa_durante_visita",
                        "TESTADA POSITIVA": "nr_positiva_durante_visita",
                        "DECLARADA": "nr_declarada_durante_visita",
                        "TOTAL SEM PARTICIPANTE": "nr_total_durante_visita_sem_part",
                        "TOTAL COM PARTICIPANTE": "nr_total_durante_visita"
                    }
                };

                const mappedId = (ID_MAPS[sectionMarker] || {})[upLabel];
                if (mappedId) {
                    const el = document.getElementById(mappedId);
                    if (el) {
                        const val = parseNumeric(el.value || el.innerText);
                        return { val, el };
                    }
                }

                // 1. Localiza o cabeçalho de seção (Anchor)
                const headers = Array.from(document.querySelectorAll('div, b, p, h1, h2, h3, h4, th, td, label, strong'));
                const sectionHeader = headers.find(h => {
                    const txt = h.innerText.trim().toUpperCase();
                    return txt === upMarker || txt.startsWith(upMarker + " ") || txt.startsWith(upMarker + ".") || txt.includes(upMarker + ".");
                });
                if (!sectionHeader) return { val: 0, el: null };

                const headerRect = sectionHeader.getBoundingClientRect();
                const isHeaderVisible = sectionHeader.offsetParent !== null && headerRect.height > 0;
                const container = sectionHeader.closest('.tab-pane, .panel, .panel-body, form') || sectionHeader.parentElement;

                // 2. Busca o Rótulo (Target)
                let targetLabel = null;
                const MAX_VERTICAL_SEARCH = 600; 

                if (isHeaderVisible) {
                    const allNodes = Array.from(document.querySelectorAll('tr, .row, .form-group, td, th, div, label, span, b, strong, p'));
                    const labels = allNodes.filter(n => {
                        const r = n.getBoundingClientRect();
                        const distY = r.top - headerRect.top;
                        const txt = n.innerText.toUpperCase();
                        const isAfterHeader = n.compareDocumentPosition(sectionHeader) & Node.DOCUMENT_POSITION_PRECEDING;
                        return n.offsetParent !== null && isAfterHeader && txt.includes(upLabel) && txt.length < upLabel.length + 12 && distY > -10 && distY < MAX_VERTICAL_SEARCH;
                    });
                    if (labels.length > 0) {
                        labels.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
                        targetLabel = labels[0];
                    }
                }

                if (!targetLabel && container) {
                    // Restrição de busca estrutural: rótulo DEVE vir após o header na ordem do DOM
                    const labels = Array.from(container.querySelectorAll('label, b, strong, td, th, span, div, p'));
                    targetLabel = labels.find(l => {
                        const t = l.innerText.trim().toUpperCase();
                        const isAfterHeader = l.compareDocumentPosition(sectionHeader) & Node.DOCUMENT_POSITION_PRECEDING;
                        return isAfterHeader && (t === upLabel || t.startsWith(upLabel) && t.length < upLabel.length + 12);
                    });
                }

                if (!targetLabel) return { val: 0, el: null };

                // 3. Busca o Valor (Value) - Estratégia de Proximidade Radial/Horizontal
                const lRect = targetLabel.getBoundingClientRect();
                const ly = lRect.top + lRect.height / 2;
                const lx = lRect.left + lRect.width / 2;

                const scope = isHeaderVisible ? document : container;
                const candidates = Array.from(scope.querySelectorAll('input:not([type="hidden"]), .form-control-static, span, b, strong, p, td'))
                    .map(c => {
                        const cr = c.getBoundingClientRect();
                        const dY = Math.abs(cr.top + cr.height/2 - ly);
                        const dX = Math.abs(cr.left + cr.width/2 - lx);
                        return { el: c, dY, dX };
                    })
                    .filter(c => {
                        if (c.el === targetLabel || c.el.contains(targetLabel)) return false;
                        const isAfterHeader = c.el.compareDocumentPosition(sectionHeader) & Node.DOCUMENT_POSITION_PRECEDING;
                        
                        const txt = (c.el.value || c.el.innerText || "").trim().toUpperCase();
                        const isIrrelevant = ["SIM", "NÃO", "N/A", "?", "VER"].includes(txt);

                        return isAfterHeader && c.dY < 18 && c.dX < 400 && !isIrrelevant;
                    });

                if (candidates.length > 0) {
                    candidates.sort((a, b) => {
                        const isInputA = a.el.tagName === 'INPUT' ? 0 : 1;
                        const isInputB = b.el.tagName === 'INPUT' ? 0 : 1;
                        if (isInputA !== isInputB) return isInputA - isInputB;
                        return a.dX - b.dX;
                    });

                    const best = candidates[0].el;
                    const val = parseNumeric(best.value || best.innerText);
                    return { val, el: best };
                }

                return { val: 0, el: null };
            };

            // 4.1.1 (SAFRA ACUMULADA) - Foco exclusivo nos Totais para validação
            const fields411 = ["Total sem participante", "Total com participante"];
            meta.inputs.v411Sum = 0;
            meta.els.v411Fields = [];
            console.log("--- Debug 4.1.1 ---");
            fields411.forEach(f => {
                const res = findTotalInContext("4.1.1", f);
                console.log(`Campo [${f}]: ${res.val}`);
                meta.inputs.v411Sum += res.val;
                if (res.el) meta.els.v411Fields.push(res.el);
            });

            // 4.2.1 (DIA ANTERIOR) - Foco exclusivo nos Totais para validação
            const fields421 = ["Total sem participante", "Total com participante"];
            meta.inputs.v421Sum = 0;
            meta.els.v421Fields = [];
            console.log("--- Debug 4.2.1 ---");
            fields421.forEach(f => {
                const res = findTotalInContext("4.2.1", f);
                console.log(`Campo [${f}]: ${res.val}`);
                meta.inputs.v421Sum += res.val;
                if (res.el) meta.els.v421Fields.push(res.el);
            });
            
            const r51 = findTotalInContext("5.1", "Total sem participante");
            meta.inputs.v51Total = r51.val;
            meta.els.v51Total = r51.el;

            const r52Neg = findTotalInContext("5.2", "Testada negativa");
            meta.inputs.v52Neg = r52Neg.val;
            meta.els.v52Neg = r52Neg.el;

            const r52Pos = findTotalInContext("5.2", "Testada positiva");
            meta.inputs.v52Pos = r52Pos.val;
            meta.els.v52Pos = r52Pos.el;

            console.log("Audit Extraction Debug:", meta.inputs);

            // EXTRAÇÃO DO HISTÓRICO ACUMULADO (NOVO v1.6.0)
            meta.history = [];
            try {
                // Localiza a aba "Histórico acumulado" ou container equivalente
                const tabAcumulado = Array.from(document.querySelectorAll('.tab-pane')).find(t => {
                    const id = t.id || "";
                    return id.includes('acumulado') || id.includes('historico');
                }) || document; // Fallback para document se não achar container específico

                const historyTable = Array.from(tabAcumulado.querySelectorAll('table')).find(table => {
                    const head = table.innerText.toUpperCase();
                    return head.includes("TESTADA NEGATIVA") && head.includes("DECLARADA");
                });

                if (historyTable) {
                    const rows = Array.from(historyTable.querySelectorAll('tbody tr'));
                    meta.history = rows.map(tr => {
                        const cells = Array.from(tr.querySelectorAll('td'));
                        if (cells.length < 7) return null;
                        
                        // Mapeamento baseado na ordem visual: Data/Hora, Status, Negativa, Declarada, Positiva, Participante, Total
                        return { 
                            data_hora: cells[0].innerText.trim(),
                            data_iso: cells[0].innerText.trim().split(" ")[0], // DD/MM/YYYY
                            status: cells[1].innerText.trim(),
                            negativa: parseNumeric(cells[2].innerText),
                            declarada: parseNumeric(cells[3].innerText),
                            positiva: parseNumeric(cells[4].innerText),
                            participante: parseNumeric(cells[5].innerText),
                            total: parseNumeric(cells[6].innerText),
                            el: tr // Para destaque visual se necessário
                        };
                    }).filter(r => r !== null);
                    console.log(`Extraídas ${meta.history.length} linhas de histórico acumulado.`);
                }

                // --- NOVO: Extração Histórico Dia Anterior (v1.8.2) ---
                meta.historyDiaAnterior = [];
                const tabDiaAnterior = Array.from(document.querySelectorAll('.tab-pane')).find(t => {
                    const id = t.id || "";
                    const txt = t.innerText.toUpperCase();
                    return id.includes('anterior') || (id.includes('historico') && txt.includes("HISTÓRICO DIA ANTERIOR"));
                });

                if (tabDiaAnterior) {
                    const diaTable = Array.from(tabDiaAnterior.querySelectorAll('table')).find(table => {
                        const head = table.innerText.toUpperCase();
                        return head.includes("TESTADA NEGATIVA") && head.includes("DECLARADA");
                    });

                    if (diaTable) {
                        const diaRows = Array.from(diaTable.querySelectorAll('tbody tr'));
                        meta.historyDiaAnterior = diaRows.map(tr => {
                            const cells = Array.from(tr.querySelectorAll('td'));
                            if (cells.length < 7) return null;
                            return { 
                                data_hora: cells[0].innerText.trim(),
                                data_iso: cells[0].innerText.trim().split(" ")[0],
                                status: cells[1].innerText.trim(),
                                negativa: parseNumeric(cells[2].innerText),
                                declarada: parseNumeric(cells[3].innerText),
                                positiva: parseNumeric(cells[4].innerText),
                                participante: parseNumeric(cells[5].innerText),
                                total: parseNumeric(cells[6].innerText),
                                el: tr
                            };
                        }).filter(r => r !== null);
                        console.log(`Extraídas ${meta.historyDiaAnterior.length} linhas de histórico dia anterior.`);
                    }
                }
            } catch (e) {
                console.error("Erro ao extrair históricos:", e);
            }

        } catch (e) { console.error("Erro extração visita:", e); }
        return meta;
    }

    function parseNumeric(val) {
        if (val === null || val === undefined) return 0;
        let s = val.toString().trim().replace(/\s/g, "");
        if (!s) return 0;
        // Se houver pontos e uma vírgula no final (ex: 1.234,56)
        if (s.includes(".") && s.includes(",")) {
            s = s.replace(/\./g, "").replace(",", ".");
        } 
        // Se houver apenas pontos (ex: 3.675.164)
        else if (s.includes(".") && !s.includes(",")) {
            s = s.replace(/\./g, "");
        }
        // Se houver apenas vírgula (ex: 1234,56)
        else if (s.includes(",")) {
            s = s.replace(",", ".");
        }
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    function parseTimeMinutes(hr) {
        if (!hr || typeof hr !== 'string') return null;
        let hrStr = hr.trim();
        // v2.1.6: Suporte robusto a ISO e horários técnicos
        if (hrStr.includes("T")) {
            hrStr = hrStr.split("T")[1].split(".")[0];
        } else if (hrStr.includes(" ")) {
            hrStr = hrStr.split(" ")[1].split(".")[0];
        }
        
        const parts = hrStr.split(':');
        if (parts.length < 2) return null;
        const h = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        if (isNaN(h) || isNaN(m)) return null;
        return (h * 60) + m;
    }

    function formatTimeDisplay(hr) {
        if (!hr || typeof hr !== 'string') return "--:--";
        let hrStr = hr.trim();
        if (hrStr.includes("T")) {
            hrStr = hrStr.split("T")[1].substring(0, 5); 
        } else if (hrStr.includes(" ") && hrStr.includes(":")) {
            hrStr = hrStr.split(" ")[1].substring(0, 5);
        } else {
            hrStr = hrStr.substring(0, 5);
        }
        return hrStr;
    }

    function normalizeCarga(data) {
        if (!data) return {};
        // Normalização de campos com aliases conhecidos
        const nProd = data.nm_produtor || data.produtor || data.nmProdutor || "";
        const nPlaca = data.placa_caminhao || data.placa || data.placa_veiculo || "";
        const nRomaneio = data.nr_documento || data.romaneio || data.nr_romaneio || "";
        const nTech = data.tp_soja_declarado_entrega || data.tp_soja || data.tecnologia || data.nm_tecnologia || "";
        const nTime = data.hr_carga || data.hr_entrada || data.dt_acompanhamento || data.data_hora || data.dt_gravacao || data.created_at || "";
        const nRateioRaw = data.rateio || data.fl_rateio || data.rateio_carga || "";

        return {
            ...data,
            id: data.id || nRomaneio,
            nm_produtor: String(nProd).trim(),
            placa_caminhao: String(nPlaca).replace(/[-\s]/g, "").toUpperCase(),
            nr_documento: nRomaneio,
            tp_soja_declarado_entrega: String(nTech).trim(),
            hr_carga: String(nTime).trim(),
            vl_liquido: parseNumeric(data.vl_liquido || data.peso || data.peso_liquido || 0),
            vl_liquido_com_desconto: parseNumeric(data.vl_liquido_com_desconto || data.plcd || data.peso_liquido_com_desconto || 0),
            rateio: (nRateioRaw === true || nRateioRaw === 1 || nRateioRaw === "1" || String(nRateioRaw).toUpperCase().trim() === "SIM" || String(nRateioRaw).toUpperCase().trim() === "S" || String(nRateioRaw).toUpperCase().trim() === "Y" || String(nRateioRaw).toUpperCase().trim() === "YES" || nRateioRaw === "true"),
            dt_carga: String(nTime).split(" ")[0]
        };
    }

    function extrairCargas() {
        const cargasMap = new Map();
        document.querySelectorAll(".editCarga").forEach(el => {
            try {
                const data = JSON.parse(el.getAttribute("data-carga"));
                const normalized = normalizeCarga(data);
                if (normalized.id) {
                    // Previne duplicados reais (mesmo ID no banco)
                    cargasMap.set(normalized.id, normalized);
                }
            } catch (e) {
                console.error("Erro ao dar parse em carga:", e, el);
            }
        });
        
        const cargas = Array.from(cargasMap.values());
        
        // NOVO v1.9.0: Ordenação Ascendente por Horário
        cargas.sort((a, b) => {
            const timeA = parseTimeMinutes(a.hr_carga) || 0;
            const timeB = parseTimeMinutes(b.hr_carga) || 0;
            return timeA - timeB;
        });
        
        console.log(`Extraídas e ordenadas ${cargas.length} cargas únicas.`);
        return cargas;
    }

    // --- NOVO v1.9.0: Melhorias UI e Consolidação ---


    function injectConsolidatedErrorsTab() {
        // 1. Limpeza de localização antiga
        const navHistorico = document.getElementById('nav_historico_recebimento');
        if (navHistorico) {
            const oldLis = Array.from(navHistorico.querySelectorAll('li')).filter(li => 
                li.querySelector('.tab-divergencias-header') || li.querySelector('.tab-rateio-header')
            );
            oldLis.forEach(li => li.remove());
        }
        
        const oldPanes = ['tab_divergencias_carga', 'tab_rateio_carga'];
        oldPanes.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.parentElement && el.parentElement.id === 'tab_historico_recebimento') {
                el.remove();
            }
        });

        // 2. Nova localização: Seção 5 (Acompanhamento de Cargas)
        const nav = document.getElementById('nav_acompanhamento_carga');
        const content = document.getElementById('tab_acompanhamento_carga');
        if (!nav || !content) return;
        
        // Evitar duplicidade
        if (nav.querySelector('.tab-divergencias-header')) return;

        // Aba Divergências
        const liDiv = document.createElement('li');
        liDiv.innerHTML = `
            <a class="btn-sub-table tab-divergencias-header" style="cursor:pointer">Divergências ⚠️</a>
        `;
        nav.appendChild(liDiv);

        // Aba Rateio 🔗 (v2.1.0 Re-implementado)
        const liRateio = document.createElement('li');
        liRateio.innerHTML = `
            <a class="btn-sub-table tab-rateio-header" style="cursor:pointer">Grupos de Rateio 🔗</a>
        `;
        nav.appendChild(liRateio);

        // Pane Divergências
        const paneDiv = document.createElement('div');
        paneDiv.id = 'tab_divergencias_carga';
        paneDiv.className = 'tab-pane';
        paneDiv.innerHTML = `
            <div style="padding:15px; background:#fff;">
                <h4 style="color:#F43F5E; margin-bottom:10px; font-weight:700;">Consolidado de Divergências (Cargas)</h4>
                <table class="harvest-premium-table">
                    <thead>
                        <tr>
                            <th style="width:120px">Data/Hora</th>
                            <th style="width:100px">Romaneio</th>
                            <th style="width:200px">Produtor</th>
                            <th>Divergência / Apontamento</th>
                        </tr>
                    </thead>
                    <tbody id="body_divergencias_carga">
                        <tr><td colspan="4" style="text-align:center; padding:20px;">Nenhuma divergência detectada.</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        content.appendChild(paneDiv);

        // Pane Rateio (v2.1.0 Re-implementado)
        const paneRateio = document.createElement('div');
        paneRateio.id = 'tab_rateio_carga';
        paneRateio.className = 'tab-pane';
        paneRateio.innerHTML = `
            <div style="padding:15px; background:#fff;">
                <h4 style="color:#D97706; margin-bottom:10px; font-weight:700;">Grupos de Rateio Confirmados</h4>
                <p style="font-size:11px; color:#64748B; margin-bottom:15px;">Apenas casos confirmados (Mesma Placa, Tecnologia, Rateio SIM e janela de 10min).</p>
                <table class="harvest-premium-table">
                    <thead>
                        <tr>
                            <th style="width:150px">Placa / Tecnologia</th>
                            <th style="width:120px">Data/Hora</th>
                            <th style="width:100px">Romaneio</th>
                            <th>Produtor</th>
                            <th style="width:100px">Peso (Kg)</th>
                            <th style="width:100px">PLCD (Kg)</th>
                        </tr>
                    </thead>
                    <tbody id="body_rateio_carga">
                        <tr><td colspan="6" style="text-align:center; padding:20px;">Nenhum grupo de rateio confirmado na janela de 10min.</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        content.appendChild(paneRateio);

        // Eventos de Clique
        const allCustom = [
            { li: liDiv, pane: paneDiv },
            { li: liRateio, pane: paneRateio }
        ];

        allCustom.forEach(item => {
            item.li.querySelector('a').addEventListener('click', function(e) {
                e.preventDefault();
                nav.querySelectorAll('li').forEach(el => el.classList.remove('active-sub-tab', 'active'));
                content.querySelectorAll('.tab-pane').forEach(el => {
                    el.classList.remove('active', 'in');
                    el.style.display = 'none';
                });
                item.li.classList.add('active-sub-tab', 'active');
                item.pane.classList.add('active', 'in');
                item.pane.style.display = 'block';
            });
        });

        // Hook para abas originais esconderem as nossas
        nav.querySelectorAll('li a').forEach(anchor => {
            const isCustom = anchor.classList.contains('tab-divergencias-header') || anchor.classList.contains('tab-rateio-header');
            if (!isCustom) {
                anchor.addEventListener('click', function() {
                    allCustom.forEach(item => {
                        item.li.classList.remove('active-sub-tab', 'active');
                        item.pane.classList.remove('active', 'in');
                        item.pane.style.display = 'none';
                    });
                });
            }
        });
    }

    function updateConsolidatedErrorsTable(divergencias) {
        const body = document.getElementById('body_divergencias_carga');
        if (!body) return;

        if (divergencias.length === 0) {
            body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color:#64748B;">Nenhuma divergência detectada.</td></tr>';
            return;
        }

        body.innerHTML = divergencias.map(d => `
            <tr>
                <td style="font-weight:500; font-family:monospace;">${formatTimeDisplay(d.hr)}</td>
                <td style="font-family: monospace; font-weight: bold; color:#0F172A;">${d.romaneio}</td>
                <td style="font-size:10px;">${d.produtor}</td>
                <td class="${d.type === 'error' ? 'row-error-text' : 'row-warning-text'}">${d.msg}</td>
            </tr>
        `).join('');
    }

    /**
     * v2.1.0: Nova lógica de agrupamento em aba dedicada
     * Agrupa por Placa + Tech se Rateio for SIM e diferença <= 10min.
     */
    function updateRateioTable(cargas) {
        const body = document.getElementById('body_rateio_carga');
        if (!body) return;

        // 1. Filtrar apenas casos com Rateio SIM (v2.1.0 ultra-permissive)
        const rateios = cargas.filter(c => c.rateio === true || String(c.rateio).toUpperCase().trim() === "SIM");

        // 2. Agrupamento inicial por Placa + Tech (Normalizados)
        const ptGroups = {};
        rateios.forEach(c => {
            const plate = (c.placa_caminhao || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
            const tech = (c.tp_soja_declarado_entrega || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
            const key = `${plate}_${tech}`;
            if (!ptGroups[key]) ptGroups[key] = [];
            ptGroups[key].push(c);
        });

        const confirmed = [];
        Object.keys(ptGroups).forEach(key => {
            const rows = ptGroups[key];
            if (rows.length < 2) return;

            // Ordenar por hora dentro do grupo
            rows.sort((a, b) => (parseTimeMinutes(a.hr_carga) || 0) - (parseTimeMinutes(b.hr_carga) || 0));

            // Sub-divide se houver gaps > 10 min (v2.1.0)
            let currentSub = [rows[0]];
            for (let i = 1; i < rows.length; i++) {
                const prev = rows[i - 1];
                const curr = rows[i];
                if (getTimeDiffMinutes(prev.hr_carga, curr.hr_carga) <= 10) {
                    currentSub.push(curr);
                } else {
                    if (currentSub.length >= 2) confirmed.push([...currentSub]);
                    currentSub = [curr];
                }
            }
            if (currentSub.length >= 2) confirmed.push([...currentSub]);
        });

        if (confirmed.length === 0) {
            body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748B;">Nenhum grupo de rateio confirmado na janela de 10min.</td></tr>';
            return;
        }

        // Ordenar blocos confirmados pelo horário do primeiro item do bloco
        confirmed.sort((a, b) => (parseTimeMinutes(a[0].hr_carga) || 0) - (parseTimeMinutes(b[0].hr_carga) || 0));

        let html = '';
        confirmed.forEach(group => {
            const first = group[0];
            const plate = (first.placa_caminhao || "").toUpperCase();
            const tech = first.tp_soja_declarado_entrega;

            let totalPeso = 0;
            let totalPLCD = 0;
            group.forEach(r => {
                totalPeso += (r.vl_liquido || 0);
                totalPLCD += (r.vl_liquido_com_desconto || 0);
            });

            const diff = totalPeso - totalPLCD;
            const isAlert = (totalPLCD > totalPeso) || (Math.abs(diff) <= 10);

            group.forEach((r, idx) => {
                html += `
                    <tr>
                        ${idx === 0 ? `<td rowspan="${group.length + 1}" style="background:#F8FAFC; font-weight:700; border-right:2px solid #E2E8F0; vertical-align:top; border-left:4px solid #D97706;">
                            <div style="font-size:11px; color:#1E293B;">${plate}</div>
                            <div style="font-size:9px; color:#D97706; font-weight:600;">${tech}</div>
                        </td>` : ''}
                        <td style="font-family:monospace;">${formatTimeDisplay(r.hr_carga)}</td>
                        <td style="font-family:monospace; font-weight:700; color:#2563EB;">${r.nr_documento}</td>
                        <td style="font-size:10px;">${r.nm_produtor}</td>
                        <td style="font-weight:700; color:#0F172A;">${(r.vl_liquido || 0).toLocaleString()}</td>
                        <td style="font-weight:700; color:#16A34A;">${(r.vl_liquido_com_desconto || 0).toLocaleString()}</td>
                    </tr>
                `;
            });

            // Linha de Total do Grupo (v2.1.2)
            html += `
                <tr style="background:${isAlert ? '#FEF2F2' : '#F1F5F9'}; transition: 0.3s all;">
                    <td colspan="3" style="text-align:right; font-size:10px; font-weight:700; color:#475569; padding-right:10px;">TOTAL DO GRUPO:</td>
                    <td style="font-weight:800; color:${isAlert ? '#DC2626' : '#0F172A'};">${totalPeso.toLocaleString()}</td>
                    <td style="font-weight:800; color:${isAlert ? '#DC2626' : '#16A34A'};">${totalPLCD.toLocaleString()}</td>
                </tr>
            `;
        });
        body.innerHTML = html;
    }

    function getTimeDiffMinutes(h1, h2) {
        if (!h1 || !h2) return 999;
        try {
            const t1 = parseTimeMinutes(h1);
            const t2 = parseTimeMinutes(h2);
            if (t1 === null || t2 === null) return 999;
            return Math.abs(t2 - t1);
        } catch(e) { return 999; }
    }


    function validarLocal(cargas, meta) {
        // Inicializa Tab se necessário
        injectConsolidatedErrorsTab();

        // Limpa destaques antigos
        document.querySelectorAll('[data-audit-error]').forEach(el => {
            el.style.border = "";
            el.style.boxShadow = "";
            el.removeAttribute('data-audit-error');
        });
        // Limpa cores de rateio antigas
        document.querySelectorAll('.rateio-group-1, .rateio-group-2, .rateio-group-3, .rateio-group-4, .rateio-group-other').forEach(el => {
            el.className = el.className.replace(/rateio-group-\w+/g, "").trim();
            el.style.fontWeight = "";
        });

        const localResults = [];
        const inputAlerts = [];
        const consolidated = []; // Para a nova tabela v1.9.0
        const i = meta.inputs || {};
        const els = meta.els || {};

        const addInputAlert = (code, msg, elements = []) => {
            inputAlerts.push(`❌ Regra ${code}: ${msg}`);
            // Aplica destaque visual se houver elementos
            elements.forEach(el => {
                if (el) {
                    el.style.transition = "all 0.3s ease";
                    el.style.border = "3px solid #e74c3c";
                    el.style.boxShadow = "0 0 10px rgba(231, 76, 60, 0.5)";
                    el.setAttribute('data-audit-error', 'true');
                }
            });
        };

        // 2.1
        if (i.v21 && !i.v21.toUpperCase().trim().startsWith("SIM")) {
            addInputAlert("2.1", `Visita está como [${i.v21}], mas deve estar como INICIADA (SIM).`, [els.v21]);
        }

        // 3.1 e 5.1 (Consistência de Recebimento)
        if (i.v31) {
            const up31 = i.v31.toUpperCase().trim();
            const isSim = up31.startsWith("SIM");
            const totalSummary = i.v51Total || 0;
            const hasCargas = (cargas && cargas.length > 0);
            
            if (isSim && totalSummary <= 0 && !hasCargas) {
                addInputAlert("3.1/5.1", "Questionário indica SIM para recebimento, mas não há cargas.", [els.v31, els.v51Total]);
            } 
            else if (!isSim && (totalSummary > 0 || hasCargas)) {
                addInputAlert("3.1/5.1", "Questionário indica NÃO para recebimento, mas existem cargas registradas.", [els.v31, els.v51Total]);
            }
        }

        // 3.2 e 5.2 (Consistência de Testes)
        if (i.v32) {
            const up32 = i.v32.toUpperCase().trim();
            const isSim = up32.startsWith("SIM");
            const isNA = up32.startsWith("N/A") || up32.startsWith("NÃO");
            
            const summaryTests = (i.v52Neg || 0) + (i.v52Pos || 0);
            const hasCargasTestadas = (cargas || []).some(c => {
                const res = (c.resultado_teste || c.teste_resultado || c.biotecnologia_teste || "").toString().toUpperCase().trim();
                // Match estrito para evitar ruídos de sistema
                return res === "POSITIVO" || res === "NEGATIVO" || res === "SIM" || res === "CONFORME";
            });
            const hasAnyTestEvidence = summaryTests > 0 || hasCargasTestadas;

            if (isSim && !hasAnyTestEvidence) {
                addInputAlert("3.2/5.2", "4.2 - Marcado como REALIZADA TESTE - Mas não há cargas Testada Positiva ou Testada Negativa", [els.v32, els.v52Neg, els.v52Pos]);
            } else if (isNA && hasAnyTestEvidence) {
                addInputAlert("3.2/5.2", "4.2 - Marcado como \"NÃO/NA\" para testes - Mas existem evidências", [els.v32, els.v52Neg, els.v52Pos]);
            }
        }

        // 3.3
        if (i.v33) {
            const up = i.v33.toUpperCase().trim();
            if (!up.startsWith("SIM") && !up.startsWith("N/A")) {
                addInputAlert("3.3", `Procedimentos inconsistentes.`, [els.v33]);
            }
        }

        // 3.8
        if (i.v38 !== undefined) {
            if (i.v38 <= 0 || i.v38 > 100) {
                addInputAlert("3.8", `Número de caixas inconsistente (${i.v38}).`, [els.v38]);
            }
        }

        // 4.1 e 4.1.1 (Safra Acumulada - Estrito nos Totais)
        if (i.v41) {
            const isSim = i.v41.toUpperCase().trim().startsWith("SIM");
            const sum = i.v411Sum || 0;
            if (isSim && sum <= 0) {
                addInputAlert("4.1/4.1.1", "4.1 - Marcado para \"SIM\" - Mas não foi informado o acumulado", [els.v41, ...els.v411Fields]);
            } else if (!isSim && sum > 0) {
                addInputAlert("4.1/4.1.1", "4.1 - Marcado para \"NÃO\" - Mas foi informado acumulado", [els.v41, ...els.v411Fields]);
            }
        }

        // 4.2 e 4.2.1 (Dia Anterior - Estrito nos Totais)
        if (i.v42) {
            const isSim = i.v42.toUpperCase().trim().startsWith("SIM");
            const sum = i.v421Sum || 0;
            if (isSim && sum <= 0) {
                addInputAlert("4.2/4.2.1", "4.2 - Marcado como \"SIM\" - Mas não foi informado dados em dia anterior", [els.v42, ...els.v421Fields]);
            } else if (!isSim && sum > 0) {
                addInputAlert("4.2/4.2.1", "4.2 - Marcado como \"Não\" - Mas foi informado dia anterior", [els.v42, ...els.v421Fields]);
            }
        }

        // --- VALIDAÇÃO DE HISTÓRICO ACUMULADO (v1.6.0) ---
        if (meta.history && meta.history.length > 0) {
            const validHistory = meta.history.filter(h => 
                (h.negativa > 0 || h.declarada > 0 || h.positiva > 0 || h.participante > 0)
            );

            // Regra 1 e 3: Crescimento Monotônico e Salto Elevado
            validHistory.forEach((h, idx) => {
                if (idx === 0) return; // Ignora a primeira linha (não há anterior para comparar)
                
                const prev = validHistory[idx - 1];
                const techs = ["negativa", "declarada", "positiva", "participante"];
                
                techs.forEach(tech => {
                    const currentVal = h[tech];
                    const prevVal = prev[tech];
                    
                    // A. Decréscimo (Menor que o anterior)
                    if (currentVal < prevVal) {
                        addInputAlert("HistAcum", `Decréscimo detectado no acumulado (${tech.toUpperCase()}): ${prevVal} -> ${currentVal} [${h.data_hora}]`, [h.el]);
                    }
                    
                    // B. Crescimento Incoerente (> 10M)
                    const growth = currentVal - prevVal;
                    if (growth > 10000000) {
                        addInputAlert("HistAcum", `Acumulado com crescimento maior que o padrão na tecnologia ${tech.toUpperCase()} (+${growth.toLocaleString()}kg)`, [h.el]);
                    }
                });
            });

            // Regra 2: Duplicidade no mesmo dia
            const daysMap = {};
            validHistory.forEach(h => {
                const day = h.data_iso;
                if (!daysMap[day]) daysMap[day] = [];
                daysMap[day].push(h);
            });

            Object.keys(daysMap).forEach(day => {
                const entries = daysMap[day];
                if (entries.length > 1) {
                    addInputAlert("HistAcum", `Acumulado duplicado detectado para a data ${day}`, entries.map(e => e.el));
                }
            });
        }

        // --- VALIDAÇÃO HISTÓRICO DIA ANTERIOR (v1.8.2) ---
        if (meta.historyDiaAnterior && meta.historyDiaAnterior.length > 0) {
            const daysMapDia = {};
            
            meta.historyDiaAnterior.forEach(h => {
                const techs = ["negativa", "declarada", "positiva", "participante"];
                
                // Regra 4.3: Limite 999.000 kg
                techs.forEach(tech => {
                    if (h[tech] > 999000) {
                        addInputAlert("HistDiaAnt", `🔴 REGRA 4.3: Valor elevado (>999.000kg) na tecnologia ${tech.toUpperCase()} no Dia Anterior [${h.data_hora}]`, [h.el]);
                    }
                });

                // Regra 4.4: Duplicidade no dia (> 0)
                const hasValue = techs.some(tech => h[tech] > 0);
                if (hasValue) {
                    const day = h.data_iso;
                    if (!daysMapDia[day]) daysMapDia[day] = [];
                    daysMapDia[day].push(h);
                }
            });

            // Alerta Duplicidade 4.4
            Object.keys(daysMapDia).forEach(day => {
                if (daysMapDia[day].length > 1) {
                    daysMapDia[day].forEach(h => {
                        addInputAlert("HistDiaAnt", `⚠️ REGRA 4.4: Duplicidade de data (${day}) com pesos informados no Histórico do Dia Anterior.`, [h.el]);
                    });
                }
            });
        }

        // 2. REGRAS DE CARGA (TABELA)
        
        const romData = cargas
            .map(c => {
                const raw = (c.nr_documento || "").toString().trim();
                // Extrai prefixo: Apenas se contiver letras ou separadores (/ - .)
                // Se for puramente numérico, o prefixo é vazio.
                const prefixMatch = raw.match(/^([^0-9]+|[0-9]+[\/\-.])/);
                const prefix = prefixMatch ? prefixMatch[0] : "";

                return { 
                    id: c.id, 
                    prefix: prefix,
                    num: parseInt(raw.replace(/\D/g, "")), 
                    raw: raw, 
                    hr: c.hr_carga 
                };
            })
            .filter(r => !isNaN(r.num))
            .sort((a, b) => (a.hr || "").localeCompare(b.hr || ""));

        const romaneioErrors = new Map(); // ID da carga -> Array de erros

        if (romData.length > 0) {
            // 1. Identifica o Comprimento Predominante (Moda)
            const lens = romData.map(r => r.raw.length);
            const modeLen = lens.sort((a,b) => lens.filter(v => v===a).length - lens.filter(v => v===b).length).pop();

            // 2. Identifica o Prefixo Predominante (Moda)
            const prefixes = romData.map(r => r.prefix);
            const modePrefix = prefixes.sort((a,b) => prefixes.filter(v => v===a).length - prefixes.filter(v => v===b).length).pop();

            romData.forEach((r, idx) => {
                const errs = [];
                const prev = idx > 0 ? romData[idx-1] : null;
                const next = idx < romData.length - 1 ? romData[idx+1] : null;

                // A. Unicidade (Baseada na string raw completa)
                const dups = romData.filter(x => x.raw === r.raw);
                if (dups.length > 1) {
                    const myCarga = cargas.find(c => c.id === r.id);
                    // Regra R5: Refinamento de Duplicidade vs Rateio
                    if (myCarga && !myCarga.rateio) {
                        errs.push({ type: 'error', msg: `🚨 DUPLICIDADE GRAVE: Romaneio ${r.raw} sem marcação de Rateio.` });
                    } else {
                        errs.push({ type: 'warning', msg: `Número de Romaneio Duplicado (Rateio OK): ${r.raw}` });
                    }
                }

                // B. Salto Numérico (Delta Máximo 500)
                if (prev) {
                    const delta = Math.abs(r.num - prev.num);
                    if (delta > 500) {
                        errs.push({ type: 'error', msg: `Salto de Romaneio suspeito (${prev.raw} -> ${r.raw}).` });
                    }
                }

                // C. Padrão de Comprimento (Tolerando virada de casa decimal 9 -> 10)
                if (r.raw.length !== modeLen) {
                    const dPrev = prev ? Math.abs(r.num - prev.num) : Infinity;
                    const dNext = next ? Math.abs(next.num - r.num) : Infinity;
                    // Se o número for "sozinho" no novo comprimento e longe dos vizinhos, é erro
                    if (dPrev > 10 && dNext > 10) {
                        errs.push({ type: 'error', msg: `Romaneio fora do padrão de dígitos (${r.raw}).` });
                    }
                }

                // D. Divergência de Prefixo (Detecta se um romaneio inicia diferente da maioria)
                if (r.prefix !== modePrefix && romData.length > 2) {
                    errs.push({ type: 'error', msg: `Prefixo fora do padrão (${r.raw}). Esperado: ${modePrefix}` });
                }

                // DEDUPLICAÇÃO DE MENSAGENS DE PADRÃO (v1.7.0)
                // Se houver erro de Prefixo, Digitos e Salto no mesmo romaneio, mantemos apenas o mais descritivo.
                let finalErrs = errs;
                const hasFormatError = errs.some(e => e.msg.includes("fora do padrão") || e.msg.includes("Salto"));
                if (hasFormatError) {
                    // Priorizamos Mensagem de Prefixo se existir, senão Digitos, senão Salto.
                    const pref = errs.find(e => e.msg.includes("Prefixo"));
                    const dig = errs.find(e => e.msg.includes("dígitos"));
                    const salto = errs.find(e => e.msg.includes("Salto"));
                    const other = errs.filter(e => !e.msg.includes("fora do padrão") && !e.msg.includes("Salto"));
                    
                    finalErrs = [...other];
                    if (pref) finalErrs.push(pref);
                    else if (dig) finalErrs.push(dig);
                    else if (salto) finalErrs.push(salto);
                }

                if (finalErrs.length > 0) romaneioErrors.set(r.id, finalErrs);
            });
        }

        // Agrupamento para Rateio (Cálculo Agregado) - v2.1.4 (Mais permissivo com horários)
        const ptGroups = {};
        cargas.forEach(c => {
            const placa = (c.placa_caminhao || "").replace(/[-\s]/g, "").toUpperCase();
            const tech = (c.tp_soja_declarado_entrega || "").trim().toUpperCase();
            const key = `${placa}_${tech}`;
            if (!ptGroups[key]) ptGroups[key] = [];
            ptGroups[key].push(c);
        });

        const groups = {};
        const chargeToGroup = {};
        const plateGroups = {}; 

        Object.keys(ptGroups).forEach(key => {
            const rows = ptGroups[key];
            rows.sort((a, b) => (parseTimeMinutes(a.hr_carga) || 0) - (parseTimeMinutes(b.hr_carga) || 0));

            let currentSub = [rows[0]];
            const finalizeSub = (sub) => {
                const groupKey = `G_${sub[0].id}`;
                groups[groupKey] = { rows: sub, totalPeso: 0, totalPLCD: 0 };
                sub.forEach(r => {
                    groups[groupKey].totalPeso += (r.vl_liquido || 0);
                    groups[groupKey].totalPLCD += (r.vl_liquido_com_desconto || 0);
                    chargeToGroup[r.id] = groupKey;
                    
                    const placa = (r.placa_caminhao || "").replace(/[-\s]/g, "").toUpperCase();
                    if (placa) {
                        if (!plateGroups[placa]) plateGroups[placa] = [];
                        plateGroups[placa].push(r);
                    }
                });
            };

            for (let i = 1; i < rows.length; i++) {
                const prev = rows[i - 1];
                const curr = rows[i];
                if (getTimeDiffMinutes(prev.hr_carga, curr.hr_carga) <= 30) {
                    currentSub.push(curr);
                } else {
                    finalizeSub(currentSub);
                    currentSub = [curr];
                }
            }
            finalizeSub(currentSub);
        });

        sortAndColorTable(groups); 

        cargas.forEach(carga => {
            const errors = romaneioErrors.get(carga.id) || [];
            const prod = (carga.nm_produtor || "").trim();
            const placa = (carga.placa_caminhao || "").replace(/[-\s]/g, "").toUpperCase();
            const pesoLiq = carga.vl_liquido;
            const plcd = carga.vl_liquido_com_desconto;
            const isRateio = carga.rateio;
            const tech = (carga.tp_soja_declarado_entrega || "").trim().toUpperCase();

            const groupKey = chargeToGroup[carga.id];
            const groupData = groups[groupKey];

            // 1. Placa (Mandatório)
            if (!placa) {
                errors.push({ type: 'error', msg: `Placa não informada.` });
            } else if (placa.length !== 7) {
                errors.push({ type: 'error', msg: `Placa [${carga.placa_caminhao}] inválida.` });
            }

            // 2. Romaneio e Produtor (Mandatórios)
            if (!carga.nr_documento) errors.push({ type: 'error', msg: `Número de Romaneio não informado.` });
            if (!prod) errors.push({ type: 'error', msg: `Produtor não informado.` });

            // 3. Pesos e Percentual
            if (pesoLiq > 52000) errors.push({ type: 'warning', msg: `Peso (${pesoLiq}kg) > 52t.` });
            
            const perc = pesoLiq > 0 ? ((1 - (plcd / pesoLiq)) * 100) : 0;
            if (perc > 25 && !isRateio) {
                errors.push({ type: 'error', msg: `Percentual elevado (${perc.toFixed(2)}%) sem ser Rateio.` });
            }

            if (isRateio) {
                // v2.1.3: Tenta encontrar parceiro na mesma placa + same tech + janela de 30min
                let foundPartner = false;
                if (placa && plateGroups[placa]) {
                    const myTime = parseTimeMinutes(carga.hr_carga);
                    plateGroups[placa].forEach(other => {
                        if (other.id === carga.id) return;
                        if (!other.rateio) return;
                        const otherTech = (other.tp_soja_declarado_entrega || "").toUpperCase();
                        if (tech !== otherTech) return;

                        const otherTime = parseTimeMinutes(other.hr_carga);
                        if (myTime !== null && otherTime !== null) {
                            if (Math.abs(myTime - otherTime) <= 30) {
                                foundPartner = true;
                            }
                        }
                    });
                }

                if (!foundPartner) {
                    errors.push({ type: 'error', msg: `Divergência: Marcado Rateio (SIM) mas não foi encontrado seu parceiro (outro romaneio marcado como SIM na mesma placa/tech em até 30min).` });
                } else if (groupData && groupData.totalPLCD > (groupData.totalPeso + 1)) { // Margem de 1kg
                    errors.push({ type: 'error', msg: `Divergência: Total PLCD (${groupData.totalPLCD}) > Total Peso (${groupData.totalPeso}) no grupo de rateio.` });
                }
            } else if (pesoLiq > 0 && plcd > (pesoLiq + 1)) {
                errors.push({ type: 'error', msg: `Divergência: PLCD (${plcd}) > Peso (${pesoLiq}).` });
            }

            // Regras de Proximidade de Placa (6.4, 6.5 e 6.6)
            if (placa && plateGroups[placa]) {
                const myTime = parseTimeMinutes(carga.hr_carga);
                const myDate = carga.dt_carga;

                plateGroups[placa].forEach(other => {
                    if (other.id === carga.id) return;
                    
                    // Só valida proximidade se as cargas forem no MESMO DIA
                    if (myDate && other.dt_carga && myDate !== other.dt_carga) return;

                    const otherTime = parseTimeMinutes(other.hr_carga);
                    
                    // Só valida se ambos tiverem horário válido
                    if (myTime !== null && otherTime !== null) {
                        const diff = Math.abs(myTime - otherTime);
                        const otherTech = (other.tp_soja_declarado_entrega || "").toUpperCase();

                        // 6.4 Rateio com Tecnologia Diferente (15 min)
                        if (diff <= 15 && tech !== otherTech) {
                            const msg = `🔔 Possível Rateio com Tecnologia Diferente (Placa ${placa} em ${formatTimeDisplay(other.hr_carga)}).`;
                            if (!errors.some(e => e.msg === msg)) {
                                errors.push({ type: 'warning', msg });
                            }
                        }

                        // 6.5 Rateio Não Marcado (15 min)
                        if (diff <= 15 && !isRateio) {
                            const msg = `🔔 Possível Rateio marcado como NÃO (Placa ${placa} em ${formatTimeDisplay(other.hr_carga)}).`;
                            if (!errors.some(e => e.msg === msg)) {
                                errors.push({ type: 'warning', msg });
                            }
                        }

                        // 6.6 Rateio Mesmo Produtor (15 min + Mesmo Produtor + Mesma Tech)
                        if (diff <= 15) {
                            const otherProd = (other.nm_produtor || "").trim();
                            if (prod === otherProd && tech === otherTech) {
                                const msg = `⚠️ Possível Rateio com o mesmo Produtor (${prod}) e Tecnologia (${tech}) em ${formatTimeDisplay(other.hr_carga)}.`;
                                if (!errors.some(e => e.msg === msg)) {
                                    errors.push({ type: 'warning', msg });
                                }
                            }
                        }
                    }
                });
            }

            // 5.3 Possível Peso Fictício
            const suspWeights = [999, 1000, 1999, 2999, 3999, 4999, 5999, 6999, 7999, 8999, 9999, 19999, 29999, 39999, 49999, 59999];
            if (suspWeights.includes(pesoLiq)) {
                errors.push({ type: 'warning', msg: `Possível Peso Fictício detectado no Peso Líquido (${pesoLiq}).` });
            }
            if (suspWeights.includes(plcd)) {
                errors.push({ type: 'warning', msg: `Possível Peso Fictício detectado no PLCD (${plcd}).` });
            }

            // 4. Data da Carga vs Data da Visita
            if (meta.dt_visita && carga.dt_carga && meta.dt_visita !== carga.dt_carga) {
                errors.push({ type: 'error', msg: `Data da Carga (${carga.dt_carga}) diverge da Data da Visita (${meta.dt_visita}).` });
            }

            // 5. Produtor (Qualidade do Nome)
            if (prod) {
                if (prod === prod.toLowerCase() && /[a-z]/.test(prod)) errors.push({ type: 'error', msg: `Produtor todo em minúsculo.` });
                
                if (!/\s/.test(prod) && !SINGLE_NAMES.includes(prod.toUpperCase())) {
                    errors.push({ type: 'error', msg: `Nome único detectado (${prod}).` });
                }
                if (/\d/.test(prod)) errors.push({ type: 'error', msg: `Nome do produtor contém números.` });

                // v2.1.5: Novas regras de qualidade de nome
                if (/[.!?;:,]/.test(prod)) errors.push({ type: 'error', msg: `Nome contém pontuação (ponto, vírgula, etc).` });
                if (/\s\s+/.test(prod)) errors.push({ type: 'error', msg: `Nome contém espaços duplos.` });
                if (/[À-ÿ]/.test(prod)) errors.push({ type: 'error', msg: `Nome contém acentos ou caracteres especiais.` });
            }

            // 7. Validação de Janela de Horário (v2.1.8)
            const hrEntrada = meta.hr_entrada;
            const hrSaida = meta.hr_saida;
            const dtVisita = meta.dt_entrada || meta.dt_visita;

            if (hrEntrada && hrSaida && carga.hr_carga) {
                const tEntrada = parseTimeMinutes(hrEntrada);
                const tSaida = parseTimeMinutes(hrSaida);
                const tCarga = parseTimeMinutes(carga.hr_carga);
                const dtCarga = (carga.hr_carga.match(/\d{2}\/\d{2}\/\d{4}/) || [])[0] || carga.dt_carga;

                if (tEntrada !== null && tSaida !== null && tCarga !== null) {
                    const bufferExit = tSaida + 60; // 1 hora de tolerância
                    
                    // Validação de Data + Horário
                    let isWithinWindow = (tCarga >= tEntrada && tCarga <= bufferExit);
                    if (dtVisita && dtCarga && dtVisita !== dtCarga) {
                        isWithinWindow = false; // Se a data for diferente, está fora da janela deste dia
                    }

                    if (!isWithinWindow) {
                        const fmtWindow = `${hrEntrada} às ${hrSaida} (+1h)`;
                        if (meta.itinerante) {
                            errors.push({ type: 'warning', msg: `⚠️ CARGAS FORA DE HORARIO - MAS É ITINERANTE (${formatTimeDisplay(carga.hr_carga)} fora de [${fmtWindow}])` });
                        } else {
                            errors.push({ type: 'error', msg: `🚨 CARGA FORA DE HORÁRIO: ${formatTimeDisplay(carga.hr_carga)} não está entre ${fmtWindow}.` });
                        }
                    }
                }
            }

            // 6. Tecnologia
            if (!TECH_WHITELIST.includes((carga.tp_soja_declarado_entrega || "").toUpperCase())) {
                errors.push({ type: 'error', msg: `Tech [${carga.tp_soja_declarado_entrega}] inválida.` });
            }

            if (errors.length > 0) {
                highlightRow(carga.id, errors.some(e => e.type === 'error') ? 'error' : 'warning', errors, isRateio ? groupKey : null);
                localResults.push({ carga, errors });
                
                // Consolidação para v1.9.0 - Com Deduplicação Inteligente (v2.1.6)
                errors.forEach(e => {
                    const isDup = consolidated.some(c => c.romaneio === carga.nr_documento && c.msg === e.msg);
                    if (!isDup) {
                        consolidated.push({
                            hr: carga.hr_carga,
                            romaneio: carga.nr_documento,
                            produtor: carga.nm_produtor,
                            msg: e.msg,
                            type: e.type
                        });
                    }
                });
            }
        });

        // Ordenar consolidado por horário e atualizar tabela injetada
        consolidated.sort((a, b) => (parseTimeMinutes(a.hr) || 0) - (parseTimeMinutes(b.hr) || 0));
        updateConsolidatedErrorsTable(consolidated);
        updateRateioTable(cargas); 

        return { local: localResults, inputAlerts };
    }

    function sortAndColorTable(groups) {
        if (!groups) return;
        const tbody = document.querySelector(".editCarga")?.closest('tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        
        // Ordenação estritamente por horário (Cronológica)
        rows.sort((a, b) => {
            const dataA = getRowCargaData(a);
            const dataB = getRowCargaData(b);
            if (!dataA || !dataB) return 0;
            // Compara hora de forma simples (HH:MM:SS)
            return (dataA.hr_carga || "").localeCompare(dataB.hr_carga || "");
        });

        // Re-anexar linhas ordenadas
        rows.forEach(tr => tbody.appendChild(tr));
    }

function getRowCargaData(tr) {
    const el = tr.querySelector('.editCarga');
    if (!el) return null;
    try {
        return JSON.parse(el.getAttribute("data-carga"));
    } catch(e) { return null; }
}


    // --- INJEÇÃO DE ESTILOS ---
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("harvest_styles.css");
    document.head.appendChild(link);

    let currentTooltip = null;

    // Eventos globais de clique fora removidos

    function showQuickView(url) {
        const overlay = document.createElement('div');
        overlay.className = 'harvest-modal-overlay';
        overlay.innerHTML = `
            <div class="harvest-modal-content">
                <img src="${url}" class="harvest-modal-img">
                <div style="text-align:center; padding-top:10px; font-weight:bold; color:#00049E">Visualização Rápida</div>
            </div>
        `;
        overlay.onclick = () => overlay.remove();
        document.body.appendChild(overlay);
    }

    // --- EXTRAÇÃO DE IMAGENS E CONTEXTO (Baseado no IA_Visita) ---

    async function baixarImagemInterna(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            const blob = await response.blob();
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(",")[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            return { base64, mime: blob.type };
        } catch (e) { return null; }
    }

    async function coletarFotosContexto() {
        const imagens = [];
        const rows = document.querySelectorAll("tr");
        for (const row of rows) {
            const imgEl = row.querySelector(".img-carga[data-url]");
            if (!imgEl) continue;

            const url = imgEl.getAttribute("data-url");
            const dEl = row.querySelector("[data-carga]");
            let contexto = row.innerText.replace(/\s+/g, " ").trim();
            
            if (dEl) {
                try {
                    const d = normalizeCarga(JSON.parse(dEl.getAttribute("data-carga")));
                    // Normalização para a IA não se perder com espaços ou traços
                    const placaLimpa = (d.placa_caminhao || "").replace(/[-\s]/g, "").toUpperCase();
                    contexto = `Romaneio: ${d.nr_documento} | Placa: ${placaLimpa} | Produtor: ${d.nm_produtor} | Peso: ${d.vl_liquido}`;
                } catch(e) {}
            }

            const imgData = await baixarImagemInterna(url);
            if (imgData) {
                imagens.push({ ...imgData, contexto });
            }
        }
        return imagens;
    }

    // --- MOTOR DE IA E AUDITORIA ---

    async function chamarGeminiComPool(prompt, imagens = []) {
        for (const key of API_KEYS_POOL) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
                const body = {
                    contents: [{
                        parts: [
                            { text: prompt },
                            ...imagens.map(img => ({
                                inline_data: { mime_type: img.mime, data: img.base64 }
                            }))
                        ]
                    }]
                };
                const res = await fetch(url, { method: "POST", body: JSON.stringify(body) });
                const data = await res.json();
                if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    return data.candidates[0].content.parts[0].text;
                }
            } catch (e) { console.warn(`Chave ${key.slice(0, 6)} falhou, tentando próxima...`); }
        }
        throw new Error("Esgotadas as chaves do pool de IA.");
    }

    function montarRelatorioFinal(results, dadosIA, itinerante) {
        let rep = `AUDITORIA HARVEST - v1.7 PREMIUM\n`;
        rep += `-----------------------------------\n`;
        rep += `STATUS: ${itinerante ? "ITINERANTE" : "FIXO"}\n\n`;
        
        if (results.inputAlerts.length > 0) {
            rep += `[!] ALERTAS DE FORMULÁRIO:\n`;
            results.inputAlerts.forEach(a => rep += `- ${a}\n`);
            rep += `\n`;
        }

        if (results.local.length > 0) {
            rep += `[!] DIVERGÊNCIAS DE CARGA:\n`;
            
            const categorized = {};
            results.local.forEach(r => {
                r.errors.forEach(e => {
                    let category = "Outros";
                    if (e.msg.includes("fora do padrão") || e.msg.includes("Salto")) category = "Romaneio fora de padrão";
                    if (e.msg.includes("Nome único")) category = "Nome fora de padrão";
                    if (e.msg.includes("Placa não informada")) category = "Placa não informada";
                    if (e.msg.includes("Produtor não informado")) category = "Produtor não informado";
                    if (e.msg.includes("Duplicado")) category = "Romaneio Duplicado";

                    if (!categorized[category]) categorized[category] = [];
                    categorized[category].push({ doc: r.carga.nr_documento, fullMsg: e.msg });
                });
            });

            for (const [cat, items] of Object.entries(categorized)) {
                rep += `${cat}:\n`;
                items.forEach(it => {
                    const extra = (it.fullMsg.includes(cat) || cat === "Outros") ? "" : ` | ${it.fullMsg}`;
                    rep += `- Doc: ${it.doc}${extra}\n`;
                });
                rep += `\n`;
            }
        }

        if (dadosIA && dadosIA.analise_fotos) {
            rep += `[!] ANÁLISE DE FOTOS (IA):\n`;
            dadosIA.analise_fotos.forEach(f => {
                rep += `- Romaneio: ${f.romaneio} | Result: ${f.resultado}\n`;
                if (f.divergencia) rep += `  * ${f.divergencia}\n`;
            });
        }

        if (results.inputAlerts.length === 0 && results.local.length === 0 && (!dadosIA || !dadosIA.analise_fotos)) {
            rep += `✅ Nenhuma irregularidade técnica detectada.`;
        }
        return rep;
    }

    // --- HANDLER DE MENSAGENS ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "ping") {
            sendResponse({ success: true, pong: true, version: CURRENT_VERSION });
            return false;
        }

        if (request.action === "request_extraction") {
            let segment = "init";
            try {
                iaUsedInVisit = true;
                
                segment = "extrairDadosVisita";
                const meta = extrairDadosVisita() || { itinerante: false, inputs: {}, els: {} };
                
                segment = "extrairCargas";
                const charges = extrairCargas() || [];
                
                segment = "validarLocal";
                const results = validarLocal(charges, meta);
                
                if (!results) throw new Error("Validation returned null results");
                
                segment = "telemetry";
                foundErrorsCount = ((results.local || []).length || 0) + ((results.inputAlerts || []).length || 0);
                sendTelemetry("ANALISE");

                segment = "response";
                sendResponse({ success: true, results, meta });
            } catch (e) {
                console.error(`Extraction failed at ${segment}:`, e);
                sendResponse({ success: false, error: `${e.message} (at ${segment})` });
            }
            return false;
        }

        if (request.action === "request_photos") {
            coletarFotosContexto().then(fotos => {
                sendResponse({ success: true, fotos });
            }).catch(err => {
                sendResponse({ success: false, error: err.message });
            });
            return true; // Resposta assíncrona
        }
        
        if (request.action === "preencher_obs") {
            const obs = document.getElementById('obs_certificacao') || document.querySelector('textarea[name="obs_certificacao"]');
            if (obs) {
                obs.value = request.text;
                obs.dispatchEvent(new Event('input', { bubbles: true }));
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: "Campo não encontrado" });
            }
            return false;
        }

        return false;
    });

    function highlightRow(id, type, errors, groupKey) {
        document.querySelectorAll('.editCarga').forEach(el => {
            try {
                const d = JSON.parse(el.getAttribute("data-carga"));
                if (String(d.id) === String(id)) {
                    const tr = el.closest('tr');
                    if (tr) {
                        // Destaque visual leve: Vermelho claro para erro, Amarelo claro para warning
                        tr.style.transition = "background-color 0.5s ease";
                        tr.style.backgroundColor = type === 'error' ? '#ffeeee' : '#fffde7';
                        
                        // Tooltip com os motivos (Dica visual ao passar o mouse)
                        tr.setAttribute('title', errors.map(e => e.msg).join(" | "));

                        // Ativa QuickView nas imagens se houver
                        tr.querySelectorAll('.img-carga').forEach(img => {
                            img.style.cursor = 'zoom-in';
                            img.onclick = (e) => {
                                e.stopPropagation();
                                showQuickView(img.getAttribute('data-url'));
                            };
                        });
                    }
                }
            } catch(e){}
        });
    }

    // --- TELEMETRIA (GOOGLE SHEETS) ---
    function getAnalystName() {
        // Tenta pegar do dropdown do menu
        const el = document.querySelector('#dropdownUser1 p') || 
                   document.querySelector('.cultura-logo p') ||
                   document.querySelector('.dropdown-toggle p');
        return el ? el.innerText.trim() : "Anônimo";
    }

    function getVisitCode() {
        try {
            // Estratégia 1: Procura pelo rótulo "Cód" e pega o texto do help-block vizinho
            const labels = Array.from(document.querySelectorAll('p.form-control-static'));
            const codLabel = labels.find(l => l.innerText.trim().toUpperCase() === "CÓD");
            if (codLabel) {
                const helpBlock = codLabel.parentElement.querySelector('.help-block');
                if (helpBlock) {
                    const text = helpBlock.innerText.trim().split('\n')[0].trim();
                    if (text && !isNaN(text)) return text;
                }
            }

            // Estratégia 2: Pela URL (vários sistemas usam ?id= ou /show/123)
            const urlMatch = window.location.href.match(/[?&]id=(\d+)/) || window.location.href.match(/show\/(\d+)/);
            if (urlMatch) return urlMatch[1];

            // Estratégia 3: Input hidden com ID (Bruno mencionou <input id="id">)
            const inputId = document.getElementById('id');
            if (inputId && inputId.value && inputId.value.length < 10) return inputId.value;

            return "---";
        } catch (e) { return "---"; }
    }

    async function sendTelemetry(actionType = "ANALISE") {
        try {
            const config = await chrome.storage.local.get(['googleSheetsUrl']);
            const url = config.googleSheetsUrl;
            if (!url) {
                console.warn("⚠️ Telemetria: URL não encontrada no storage local.");
                return;
            }

            const cod = getVisitCode();
            
            // Persistência: Se for ANALISE, salva o estado. Se for FINALIZACAO, tenta recuperar.
            if (actionType === "ANALISE") {
                const sessionData = { 
                    iaUsed: iaUsedInVisit, 
                    errors: foundErrorsCount,
                    timestamp: Date.now()
                };
                chrome.storage.local.set({ [`visit_state_${cod}`]: sessionData });
            } else if (actionType === "FINALIZACAO" && cod !== "---") {
                const stored = await chrome.storage.local.get([`visit_state_${cod}`]);
                const data = stored[`visit_state_${cod}`];
                // Só recupera se os dados locais estiverem resetados e o dado guardado for recente (12h)
                if (data) {
                    const isRecent = (Date.now() - data.timestamp) < 1000 * 60 * 60 * 12;
                    if (isRecent) {
                        iaUsedInVisit = iaUsedInVisit || data.iaUsed;
                        foundErrorsCount = foundErrorsCount || data.errors;
                    }
                }
            }

            const payload = {
                usuario: getAnalystName(),
                uso: actionType, // ANALISE ou FINALIZACAO
                erros: foundErrorsCount,
                uso_ia: iaUsedInVisit ? "SIM" : "NÃO",
                cod: cod,
                version: CURRENT_VERSION
            };

            console.log(`📡 Telemetria [${actionType}] -> Enviando via background para: ${url}`, payload);

            // Envia para o background.js (para burlar CSP)
            chrome.runtime.sendMessage({
                action: "SEND_TELEMETRY",
                url: url,
                payload: payload
            }, (resp) => {
                if (chrome.runtime.lastError) {
                    console.error("❌ Erro de comunicação com o Background Script:", chrome.runtime.lastError);
                } else if (resp && resp.success) {
                    console.log("✅ Telemetria enviada com sucesso ao Background Relay.");
                } else {
                    console.warn("⚠️ Falha no Background Relay:", resp ? resp.error : "Sem resposta");
                }
            });

        } catch (e) {
            console.warn("Falha no motor de telemetria:", e);
        }
    }

    // Interceptação de Botões de Finalização
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button, a, input[type="button"], input[type="submit"]');
        if (!btn) return;

        const txt = (btn.innerText || btn.value || "").toUpperCase();
        const finalizers = ["SALVAR", "CERTIFICAR", "ENVIAR", "FINALIZAR", "CONCLUIR"];
        
        if (finalizers.some(f => txt.includes(f))) {
            sendTelemetry("FINALIZACAO");
        }
    }, true);

    // --- INICIALIZAÇÃO ---
    const isActive = await validarStatusGlobal();
    if (isActive) {
        validarLocal(); // Inicia a validação e injeção da UI
        console.log("✅ Harvest Auditor 2026: Motor Sidebar Ativo.");
    }
})();
