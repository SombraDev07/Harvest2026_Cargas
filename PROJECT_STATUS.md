# Projeto Harvest 2026 - Relatório de Status e Migração

Este documento serve como a "memória" do projeto para o Bruno e para a IA (Antigravity/Cursor) ao retomar os trabalhos após a formatação e migração.

## 🚀 Status Atual do Projeto

- **Código:** 100% sincronizado com o GitHub (Branch: `master`).
- **Arquitetura:** O projeto agora utiliza um **Proxy de API (Túnel Interno)** via Next.js Rewrites.
  - Chamadas frontend para `/api/*` são roteadas automaticamente para o container `backend:8000`.
  - Isso elimina erros de CORS e a necessidade de abrir a porta 8000 publicamente.
- **Ambiente Local (PC anterior):** Windows.
- **Ambiente Produção (Atual):** AWS Lightsail (1GB RAM) - Insuficiente para o volume de dados.

## 🛠️ Próximos Passos (Após Formatação/Fedora)

### 1. Preparação do Fedora (PC Local)

- Instalar `git`, `docker` e `docker-compose`.
- Instalar VS Code e a extensão do Antigravity/Cursor.
- Clonar o repositório e rodar `docker-compose up` localmente para garantir o ambiente de dev.

### 2. Migração para HostGator (Plano KVM 2 - 8GB RAM)

- Contratar o plano VPS KVM 2.
- Configurar a nova máquina (Instalar Docker).
- Configurar o Banco de Dados **PostgreSQL** (Migrar de SQLite para Postgres real).
- Apontar o domínio `harvest2026cargas.com.br` para o novo IP da HostGator.

## 🐞 Bugs/Pendências Conhecidas

1.  **Erro 500 no Upload (AWS):** Provável falta de RAM (OOM) ou Timeout do servidor ao processar 100k+ linhas.
    - _Solução planejada:_ Migrar para 8GB de RAM e otimizar o `pd.read_excel` para ler em chunks se necessário.
2.  **SSL (HTTPS):** Configurar Certbot Nginx na HostGator para garantir que o site rode via `https`.

## 📌 Links e Referências

- GitHub: [SombraDev07/Harvest2026_Cargas](https://github.com/SombraDev07/Harvest2026_Cargas)
- Banco de Dados: Atualmente usando SQLite local no container, mas preparado para PostgreSQL via `DATABASE_URL`.

---

_Assinado: Antigravity AI (11/03/2026)_
