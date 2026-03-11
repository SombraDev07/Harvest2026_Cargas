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
        }); 
