CREATE OR REPLACE FUNCTION validate_and_migrate_loads(p_upload_id UUID)
RETURNS TABLE (
    success_count INTEGER,
    error_count INTEGER
) AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
BEGIN

    -- 1. BASE DATA PREPARATION (Sanitized family keys)
    DROP TABLE IF EXISTS base_data_tmp;
    CREATE TEMP TABLE base_data_tmp AS
    SELECT 
        load_identifier, district, product, doc_number, visit_code, truck_plate, technology, rateio,
        UPPER(REGEXP_REPLACE(visit_code, '[^A-Z0-9]', '', 'g')) as visit_clean,
        UPPER(REGEXP_REPLACE(doc_number, '[^A-Z0-9]', '', 'g')) as doc_clean,
        UPPER(REGEXP_REPLACE(truck_plate, '[^A-Z0-9]', '', 'g')) as plate_clean,
        COALESCE(NULLIF(REGEXP_REPLACE(doc_number, '[^0-9]', '', 'g'), ''), '0')::BIGINT as doc_int,
        -- Extraímos o radical ALFABÉTICO para detectar mudança de série (ex: Série A vs B)
        COALESCE(NULLIF(REGEXP_REPLACE(doc_number, '[^A-Z]', '', 'g'), ''), 'S/R') as alpha_serie,
        -- Para o radical numérico, pegamos apenas para conferência visual se necessário
        substring(COALESCE(NULLIF(REGEXP_REPLACE(doc_number, '[^0-9]', '', 'g'), ''), '000'), 1, 3) as num_pref,
        NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(weight_gross, '.', ''), ',', '.'), '[^0-9.]', '', 'g'), '')::FLOAT8 as wg,
        NULLIF(REGEXP_REPLACE(REPLACE(REPLACE(weight_net, '.', ''), ',', '.'), '[^0-9.]', '', 'g'), '')::FLOAT8 as wn,
        CASE WHEN load_time ~ '^[0-9]{1,2}:[0-9]{1,2}$' THEN
            (split_part(load_time, ':', 1)::INT * 60 + split_part(load_time, ':', 2)::INT)
        ELSE 0 END as time_mins,
        weight_gross as wg_raw,
        weight_net as wn_raw,
        load_time as load_time_raw
    FROM staging_loads 
    WHERE upload_id = p_upload_id;

    -- 2. DOMINANT SERIES PER VISIT
    DROP TABLE IF EXISTS grp_pref;
    CREATE TEMP TABLE grp_pref AS
    SELECT DISTINCT ON (visit_clean) 
        visit_clean, alpha_serie as main_serie
    FROM (
        SELECT visit_clean, alpha_serie, COUNT(*) as cnt
        FROM base_data_tmp WHERE visit_clean != '' GROUP BY visit_clean, alpha_serie
    ) t ORDER BY visit_clean, cnt DESC;

    -- 3. SEQUENTIAL DATA CHECK
    DROP TABLE IF EXISTS seq_data;
    CREATE TEMP TABLE seq_data AS
    SELECT *, 
        LAG(doc_int) OVER (PARTITION BY visit_clean ORDER BY doc_int) as l_doc_int,
        LAG(doc_number) OVER (PARTITION BY visit_clean ORDER BY doc_int) as l_doc_raw,
        LAG(LENGTH(doc_clean)) OVER (PARTITION BY visit_clean ORDER BY doc_int) as l_len
    FROM base_data_tmp;

    -- 4. CLEAR PREVIOUS ERRORS
    DELETE FROM error_ledger WHERE load_identifier IN (SELECT load_identifier FROM base_data_tmp);

    -- 5. VALIDATION SUITE (13 RULES)
    INSERT INTO error_ledger (load_identifier, district, error_type, error_message, occurred_at)
    
    -- R1: ROMANEIOS DUPLICADOS
    (SELECT b.load_identifier, b.district, 'duplicado', 'Romaneio duplicado (' || b.doc_number || ') rateio NÃO', v_now
     FROM base_data_tmp b
     JOIN (SELECT visit_clean, doc_clean, COUNT(*) as cnt FROM base_data_tmp GROUP BY visit_clean, doc_clean) d 
       ON b.visit_clean = d.visit_clean AND b.doc_clean = d.doc_clean
     WHERE d.cnt > 1 AND UPPER(TRIM(b.rateio)) = 'NÃO')

    UNION ALL

    -- R2: ROMANEIO FORA DE PADRÃO (Objetivo e sem poluição)
    (SELECT s.load_identifier, s.district, 'padrao',
           CASE 
             WHEN s.alpha_serie != g.main_serie THEN 'Série dif. (Esperado: ' || g.main_serie || ')' 
             WHEN s.l_doc_int > 0 AND (s.doc_int - s.l_doc_int) > 800 THEN 'Salto > 800 (Anterior: ' || s.l_doc_raw || ')'
             WHEN s.l_len IS NOT NULL AND LENGTH(s.doc_clean) != s.l_len THEN 'Tam. dif. (' || s.l_len || ' vs ' || LENGTH(s.doc_clean) || ' ch)'
             ELSE 'Fora de padrão'
           END, v_now
     FROM seq_data s JOIN grp_pref g ON s.visit_clean = g.visit_clean
     WHERE (s.alpha_serie != g.main_serie)
        OR (s.l_doc_int > 0 AND (s.doc_int - s.l_doc_int) > 800)
        OR (s.l_len IS NOT NULL AND LENGTH(s.doc_clean) != s.l_len))

    UNION ALL

    -- R3: CAMPO INVÁLIDO - Produtor (NULL/NA)
    (SELECT load_identifier, district, 'campos', 'Produtor não preenchido', v_now
    FROM base_data_tmp
    WHERE (NULLIF(TRIM(product), '') IS NULL OR UPPER(TRIM(product)) IN ('N/A', 'NA')))
    
    UNION ALL

    -- R3: CAMPO INVÁLIDO - Produtor (Contém Números)
    (SELECT load_identifier, district, 'campos', 'Nome do produtor contém números', v_now
    FROM base_data_tmp
    WHERE product ~ '[0-9]')

    UNION ALL

    -- R3: CAMPO INVÁLIDO - Romaneio
    (SELECT load_identifier, district, 'campos', 'Romaneio não preenchido', v_now
    FROM base_data_tmp
    WHERE (doc_clean = '' OR doc_clean IN ('NA', 'N/A')))

    UNION ALL

    -- R3: CAMPO INVÁLIDO - Pesos
    (SELECT load_identifier, district, 'campos', 'Pesos não preenchidos', v_now
    FROM base_data_tmp
    WHERE (wg IS NULL OR wn IS NULL))

    UNION ALL

    -- R4: PLACA INVALIDA
    (SELECT load_identifier, district, 'placa',
        CASE WHEN (plate_clean = '' OR plate_clean IN ('NA', 'N/A')) THEN 'Placa não preenchida' ELSE 'Placa inválida (Mínimo 7 caracteres)' END, v_now
    FROM base_data_tmp
    WHERE (plate_clean = '' OR plate_clean IN ('NA', 'N/A')) OR (LENGTH(plate_clean) < 7 AND plate_clean NOT IN ('NA', 'N/A')))

    UNION ALL

    -- R5: EXCESSO DE PESO (>= 50.000 KG)
    (SELECT load_identifier, district, 'excesso_peso', 'Excesso de Peso (Limite: 50.000 kg, Detectado: ' || wg || ' kg)', v_now
    FROM base_data_tmp WHERE wg >= 50000 OR wn >= 50000)

    UNION ALL

    -- R6: PESOS FICTÍCIOS
    (SELECT load_identifier, district, 'peso_ficticio', 'Peso fictício (' || floor(wg)::TEXT || ')', v_now
    FROM base_data_tmp WHERE floor(wg)::TEXT IN ('999','1000','1111','1222','1234','1333','1444','1555','1666','1777','1888','1999','2000','2111','2222','2333','2444','2555','2666','2777','2888','2999','3000','3222','3333','3444','3456','3555','3666','3777','3888','3999','4000','4333','4444','4555','4567','4666','4777','4888','4999','5000','5555','5678','5999','6000','6666','6789','6999','7000','7777','7999','8000','8888','8999','9000','9999','10000','10999','11111','12222','12345','13333','14444','14999','15000','15555','16666','17777','18888','19999','20000','21111','22222','23333','23456','24444','24999','25000','25555','26666','27777','28888','29999','30000','31111','32222','33333','34444','34567','34999','35000','35555','36666','37777','38888','39999','40000','41111','42222','43333','44444','44999','45000','45555','46666','47777','48888','49999','50000')
       OR floor(wn)::TEXT IN ('999','1000','1111','1222','1234','1333','1444','1555','1666','1777','1888','1999','2000','2111','2222','2333','2444','2555','2666','2777','2888','2999','3000','3222','3333','3444','3456','3555','3666','3777','3888','3999','4000','4333','4444','4555','4567','4666','4777','4888','4999','5000','5555','5678','5999','6000','6666','6789','6999','7000','7777','7999','8000','8888','8999','9000','9999','10000','10999','11111','12222','12345','13333','14444','14999','15000','15555','16666','17777','18888','19999','20000','21111','22222','23333','23456','24444','24999','25000','25555','26666','27777','28888','29999','30000','31111','32222','33333','34444','34567','34999','35000','35555','36666','37777','38888','39999','40000','41111','42222','43333','44444','44999','45000','45555','46666','47777','48888','49999','50000'))

    UNION ALL

    -- R7: DESCONTO EXCESSIVO (Individual - apenas se NÃO for rateio)
    (SELECT load_identifier, district, 'desconto', 'Desconto excessivo (' || ROUND(((wg - wn) / NULLIF(wg,0) * 100)::NUMERIC, 1) || '%)', v_now
    FROM base_data_tmp 
    WHERE wg > 0 AND wn > 0 AND (wg - wn) / wg > 0.25 AND UPPER(TRIM(rateio)) != 'SIM')

    UNION ALL

    -- R8: RATEIO: PESO INVÁLIDO
    (SELECT load_identifier, district, 'rateio_peso', 'Rateio: Soma PLCD >= Soma PL', v_now
    FROM (
        SELECT load_identifier, district,
            SUM(wg) OVER (PARTITION BY visit_clean, plate_clean, (time_mins / 50)) as g_gross,
            SUM(wn) OVER (PARTITION BY visit_clean, plate_clean, (time_mins / 50)) as g_net
        FROM base_data_tmp WHERE UPPER(TRIM(rateio)) = 'SIM' AND plate_clean != ''
    ) rg WHERE g_net >= g_gross AND g_gross > 0)
    
    UNION ALL

    -- R9: RATEIO SEM PARCEIRO
    (SELECT load_identifier, district, 'rateio_parceiro', 'Rateio sem parceiro na visita', v_now
    FROM (
        SELECT load_identifier, district, COUNT(*) OVER (PARTITION BY visit_clean, plate_clean, technology, (time_mins / 50)) as g_cnt
        FROM base_data_tmp WHERE UPPER(TRIM(rateio)) = 'SIM' AND plate_clean != ''
    ) r WHERE g_cnt = 1)
    
    UNION ALL

    -- R10: RATEIO: TECNOLOGIAS DIFERENTES
    (SELECT load_identifier, district, 'rateio_tech', 'Rateio com tecnologias diferentes', v_now
    FROM (
        SELECT load_identifier, district,
            MIN(technology) OVER (PARTITION BY visit_clean, plate_clean, (time_mins / 50)) as t_min,
            MAX(technology) OVER (PARTITION BY visit_clean, plate_clean, (time_mins / 50)) as t_max
        FROM base_data_tmp WHERE UPPER(TRIM(rateio)) = 'SIM' AND plate_clean != ''
    ) r WHERE t_min != t_max AND t_min IS NOT NULL)
    
    UNION ALL

    -- R11: POSSIVEL RATEIO (AVISO 20MIN)
    (SELECT load_identifier, district, 'rateio_possivel', 'Possível rateio (Aviso 20min)', v_now
    FROM (
        SELECT load_identifier, district, rateio, COUNT(*) OVER (PARTITION BY visit_clean, plate_clean, technology, (time_mins / 20)) as p_cnt
        FROM base_data_tmp WHERE plate_clean != '' AND UPPER(TRIM(rateio)) = 'NÃO'
    ) r WHERE p_cnt > 1)

    UNION ALL

    -- R12: PESO DUPLICADOS (Ignorando se Rateio = SIM)
    (SELECT load_identifier, district, 'peso_duplicado', 'Pesos duplicados na visita', v_now
    FROM (
        SELECT load_identifier, district, rateio, COUNT(*) OVER (PARTITION BY visit_clean, wg, wn) as cnt
        FROM base_data_tmp WHERE wg > 0 AND wn > 0
    ) r WHERE cnt > 1 AND UPPER(TRIM(rateio)) != 'SIM')
    UNION ALL
    -- R14: DUPLICIDADE ENTRE VISITAS DIFERENTES (COD/COD)
    -- Detecta se (DOC, PL, PLCD) repetem em códigos de visita diferentes
    (SELECT b1.load_identifier, b1.district, 'duplicidade_cod', 'Duplicidade COD/COD: Mesmo Doc e Pesos em visita diferente', v_now
     FROM base_data_tmp b1
     WHERE EXISTS (
         SELECT 1 FROM base_data_tmp b2 
         WHERE b1.doc_clean = b2.doc_clean 
           AND b1.wg = b2.wg 
           AND b1.wn = b2.wn
           AND b1.visit_clean != b2.visit_clean
           AND b1.doc_clean != ''
     ));

    -- 6. MIGRATE TO PRODUCTION
    INSERT INTO loads (
        load_identifier, truck_plate, product, district, visit_code, doc_number, rateio, technology, load_time, weight_gross, weight_net, status
    )
    SELECT 
        b.load_identifier, b.plate_clean, b.product, b.district, b.visit_code, b.doc_number, b.rateio, b.technology, 
        substring(load_time_raw for 5), b.wg, b.wn,
        CASE WHEN EXISTS (SELECT 1 FROM error_ledger e WHERE e.load_identifier = b.load_identifier) THEN 'error' ELSE 'validated' END
    FROM base_data_tmp b
    ON CONFLICT (load_identifier) DO UPDATE SET
        truck_plate = EXCLUDED.truck_plate, product = EXCLUDED.product, district = EXCLUDED.district,
        visit_code = EXCLUDED.visit_code, doc_number = EXCLUDED.doc_number, rateio = EXCLUDED.rateio,
        technology = EXCLUDED.technology, load_time = EXCLUDED.load_time, weight_gross = EXCLUDED.weight_gross,
        weight_net = EXCLUDED.weight_net, status = EXCLUDED.status, updated_at = v_now;

    -- 7. RETURN STATS (Explicit Integer Cast to fix DatatypeMismatch)
    RETURN QUERY SELECT 
        (SELECT COUNT(*)::INTEGER FROM base_data_tmp bd JOIN loads l ON l.load_identifier = bd.load_identifier WHERE l.status = 'validated'),
        (SELECT COUNT(DISTINCT load_identifier)::INTEGER FROM error_ledger WHERE occurred_at = v_now);
END;
$$ LANGUAGE plpgsql;
