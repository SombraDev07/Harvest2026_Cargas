import pandas as pd
import re

def validar_romaneios(df):
    """
    Valida romaneios conforme regras estritas:
    - Regra 0: Duplicados (mesmo número em mesmo código visita)
    - Regra 1: Contém letras ou formato inválido
    - Regra 2: Salto maior que 100
    """
    erros_list = []

    # Normalizar nomes das colunas
    df.columns = [str(c).strip().upper() for c in df.columns]

    # Verificar colunas necessárias
    col_visita = 'CÓDIGO VISITA'
    col_doc = 'NÚMERO DOCUMENTO'
    col_rateio = 'RATEIO' # Opcional

    if col_visita not in df.columns or col_doc not in df.columns:
        return {'erro': f'Colunas obrigatórias não encontradas. Necessário: {col_visita}, {col_doc}'}

    # --- REGRA 0: ROMANEIO DUPLICADO ---
    # Se existir mais de um registro com o mesmo NÚMERO DOCUMENTO dentro do mesmo CÓDIGO VISITA.
    # Apenas os registros duplicados são exibidos.
    
    duplicados = df[df.duplicated(subset=[col_visita, col_doc], keep=False)].copy()
    if not duplicados.empty:
        duplicados['STATUS'] = 'ERRO - ROMANEIO DUPLICADO'
        duplicados['TIPO_ERRO'] = 'Regra 0'
        erros_list.append(duplicados)

    # Agrupar por visita para Regras 1 e 2
    grupos = df.groupby(col_visita)

    for visita, grupo in grupos:
        # Pega docs como string e remove NaNs
        # Usar o índice original para mapear de volta ao DataFrame completo
        docs_series = grupo[col_doc].dropna().astype(str)
        
        numericos_validos_info = [] # Lista de (numero, original_index) para Regra 2
        
        for original_index, doc_str in docs_series.items():
            # --- REGRA 1: CONTÉM LETRAS / FORMATO INVÁLIDO ---
            # Tentar converter para inteiro
            s_val = doc_str.strip()
            is_valid_num = False
            num_val = 0
            
            try:
                # Tenta float primeiro para pegar casos como "51449.0"
                f_val = float(s_val)
                # Verifica se é inteiro
                if f_val.is_integer():
                    num_val = int(f_val)
                    is_valid_num = True
                else:
                    # Se for float não inteiro (ex: 123.45), consideramos inválido para Romaneio?
                    # Assumindo que romaneios são inteiros.
                    is_valid_num = False
            except ValueError:
                 is_valid_num = False

            if not is_valid_num:
                # Encontrar a linha original no df
                original_row = df.loc[original_index]
                erros_list.append(pd.DataFrame([{
                    'CÓDIGO VISITA': original_row[col_visita],
                    'NÚMERO DOCUMENTO': original_row[col_doc],
                    'STATUS': 'ERRO - CONTÉM LETRAS OU FORMATO INVÁLIDO',
                    'TIPO_ERRO': 'Regra 1',
                    'RATEIO': original_row[col_rateio] if col_rateio in df.columns else None
                }]))
            else:
                numericos_validos_info.append((num_val, original_index))

        # --- REGRA 2: VALOR FORA DO PADRÃO (MEDIANA) ---
        # Substitui a antiga regra de "Salto > 100".
        # Calcula a mediana dos romaneios numéricos da visita.
        # Se um romaneio estiver muito distante da mediana (ex: > 500), é considerado erro (typo ou fora de sequência).
        
        if len(numericos_validos_info) > 0:
            import statistics
            
            # Extrair apenas os valores numéricos para cálculo da mediana
            valores = [x[0] for x in numericos_validos_info]
            mediana = statistics.median(valores)
            
            # Limite de tolerância para distância da mediana
            # Romaneios geralmente são sequenciais. Um erro de digitação (ex: 12804 vs 128044) gera um desvio enorme.
            # Um limite de 500 cobre sequências longas sem falsos positivos para operações normais, 
            # mas pega erros de dígito (milhares de diferença).
            TOLERANCIA_MEDIANA = 500
            
            for val, original_idx in numericos_validos_info:
                distancia = abs(val - mediana)
                
                if distancia > TOLERANCIA_MEDIANA:
                    # Encontrar a linha original no df
                    original_row = df.loc[original_idx]
                    erros_list.append(pd.DataFrame([{
                        'CÓDIGO VISITA': original_row[col_visita],
                        'NÚMERO DOCUMENTO': original_row[col_doc],
                        'STATUS': f'ERRO - ROMANEIO FORA DO PADRÃO (Valor: {val}, Mediana: {int(mediana)})',
                        'TIPO_ERRO': 'Regra 2',
                        'RATEIO': original_row[col_rateio] if col_rateio in df.columns else None
                    }]))
    
    # Processar retorno
    out_erros = {
        'regra0': [],
        'regra1': [],
        'regra2': []
    }

    if erros_list:
        final_erros_df = pd.concat(erros_list, ignore_index=True)
        # Remover duplicatas exatas
        final_erros_df = final_erros_df.drop_duplicates(subset=[col_visita, col_doc, 'STATUS'])
        
        for _, row in final_erros_df.iterrows():
            tipo = row['TIPO_ERRO']
            item = {
                'CÓDIGO VISITA': row[col_visita],
                'NÚMERO DOCUMENTO': row[col_doc],
                'MOTIVO': row['STATUS'], # Usar STATUS como MOTIVO para consistência
                'RATEIO': row['RATEIO']
            }
            if tipo == 'Regra 0':
                out_erros['regra0'].append(item)
            elif tipo == 'Regra 1':
                out_erros['regra1'].append(item)
            elif tipo == 'Regra 2':
                out_erros['regra2'].append(item)

    return {'erros': out_erros}
