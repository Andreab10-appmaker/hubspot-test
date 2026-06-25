# HubSpot AI Interface

Chat AI in italiano per il CRM HubSpot: legge e scrive deal/contatti/note via Model Context Protocol (MCP) e genera **grafici interattivi in tempo reale** (pipeline, forecast incassi, distribuzione lead). Provider AI commutabile (OpenAI di default, Anthropic opzionale).

## Run & Operate

- `pnpm install` — installa le dipendenze del workspace (pnpm obbligatorio).
- `pnpm run build` — typecheck + build di tutti i pacchetti (frontend → `artifacts/hubspot-ai/dist/public`, API → `artifacts/api-server/dist/index.mjs`).
- `pnpm run typecheck` — typecheck su tutto il workspace.
- **Avvio locale (single-origin):** `pnpm run build` poi `PORT=5000 pnpm --filter @workspace/api-server start` → apri `http://localhost:5000` (l'API serve anche la SPA).
- `pnpm --filter @workspace/api-spec run codegen` — rigenera client React + schemi Zod dall'OpenAPI (`lib/api-spec/openapi.yaml`).
- `HUBSPOT_ACCESS_TOKEN=pat-... pnpm --filter @workspace/scripts setup:pipeline` — configura le **fasi** della pipeline `default` dei deal allo schema ufficiale (Appointment Scheduled 10% → Discovery call 20% → Proposal/Demo 40% → Tenders 35% → Decision maker brought-in 60% → Contract Sent 80% + Closed Won/Lost). Idempotente; `DRY_RUN=1` per la sola anteprima.
- **Env runtime:** `PORT` (obbligatorio, fornito da Replit), `OPENAI_API_KEY` (provider di default), `HUBSPOT_ACCESS_TOKEN` (token **App Privata** `pat-...`), `ANTHROPIC_API_KEY` (opzionale). `DATABASE_URL` **non serve** (vedi Gotchas).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (SSE) — bundle ESM con esbuild
- Frontend: Vite 7 + React 19 + shadcn/ui + Tailwind 4 + Recharts
- AI: `openai` (default) e `@anthropic-ai/sdk` (opzionale); HubSpot via `@hubspot/mcp-server` (stdio)
- API codegen: Orval (da OpenAPI) → `lib/api-client-react`, `lib/api-zod`
- DB: Drizzle ORM (scaffolding, **non in uso** — vedi Gotchas)

## Where things live

- `artifacts/api-server/` — backend. Chat SSE `POST /api/chat/completions`, `GET /api/healthz`; serve la SPA buildata (single-origin). Logica in `src/lib/providers/*` (astrazione provider) e `src/lib/mcp-client.ts` (singleton MCP). `src/app.ts` = Express + static SPA.
- `artifacts/hubspot-ai/` — frontend. Chat UI + selettore provider/modello + grafici. `src/components/ChatInterface.tsx` (stream SSE), `ChartView.tsx` (Recharts). Build → `dist/public`.
- `artifacts/mockup-sandbox/` — sandbox mockup di Replit (NON fa parte del prodotto).
- `lib/api-spec/` — **contratto OpenAPI** (source of truth) + config Orval.
- `lib/api-client-react/`, `lib/api-zod/` — generati dall'OpenAPI (non editare a mano).
- `lib/db/` — schema Drizzle (scaffolding, non importato).
- `scripts/` — script di workspace (incl. `setup-pipeline.ts`: configura le fasi della pipeline deal via API REST `/crm/v3/pipelines/deals`, perché il connettore MCP gestisce solo i record, non le fasi).

## Architecture decisions

- **Single-origin**: l'API server serve il frontend buildato (`hubspot-ai/dist/public`) con fallback SPA Express 5; il frontend usa `fetch('/api/...')` same-origin. Niente CORS/proxy in produzione.
- **Astrazione provider** (`src/lib/providers/`): OpenAI (default `gpt-5.4-mini`) e Anthropic condividono lo stesso agentic loop e lo stesso contratto di eventi SSE; si sceglie provider/modello dall'header della UI o via `OPENAI_MODEL`/`ANTHROPIC_MODEL`.
- **HubSpot via MCP locale**: `@hubspot/mcp-server` avviato come processo figlio stdio (`npx`), riusato come singleton; richiede un token App Privata.
- **Grafici lato client**: il modello chiama il tool `render_chart` con dati reali aggregati; il backend invia la spec via SSE e il frontend la renderizza con Recharts (nessuna immagine generata server-side).
- **Pipeline Export**: il tool di output `create_pipeline_export` (`lib/pipeline-export.ts`) genera un `.xlsx` che riproduce il template finanziario ufficiale (intestazione gruppo "Revenue", colonne anno fisse 2023B/2023A/2025–2030, formati € contabili, riga TOTALE con `=SUM`). L'AI recupera i deal reali da HubSpot e li passa grezzi; il codice colloca ogni importo nella colonna dell'anno di chiusura. La configurazione delle **fasi** della pipeline, invece, non passa dal connettore MCP ma dallo script `setup-pipeline.ts` (vedi Gotchas).
- **`lib/db` non è collegato**: nessun import nel codice in esecuzione, quindi non serve un Postgres per buildare o avviare.

## Product

L'utente chiede in linguaggio naturale (es. "Qual è la mia pipeline per il 2026?", "Incassi previsti questo mese?", "Lead per fonte"): l'assistente recupera i dati reali da HubSpot, risponde in italiano e mostra grafici interattivi. Supporta anche operazioni di scrittura (creare deal, contatti, note).

## User preferences

- Risposte **sempre in italiano**.
- Provider di default **OpenAI**, modello **`gpt-5.4-mini`**; Anthropic come opzione.
- Token HubSpot: usare un **token App Privata** (`pat-...`), NON la chiave sviluppatore né la chiave di accesso personale.

## Gotchas

- **`HUBSPOT_ACCESS_TOKEN` deve essere un Private App token (`pat-...`)** — da *Impostazioni → Integrazioni → App private*. Developer API key / Personal Access Key danno `404 Not Found` / `EXPIRED_AUTHENTICATION` sul tool MCP.
- **`PORT` è obbligatorio a runtime**: l'api-server lancia un errore se manca. Replit lo fornisce; in locale passalo (`PORT=5000`).
- **Builda prima di avviare in locale**: l'api-server serve la SPA da `hubspot-ai/dist/public`; senza build vedi solo `/api` (warning nei log) e `GET /` non mostra la UI.
- **`DATABASE_URL` non serve**: `lib/db` non è importato. Non eseguire `db push` finché non colleghi davvero il DB.
- **Le fasi della pipeline NON si configurano via MCP**: i tool del connettore HubSpot gestiscono solo i *record* (deal/contatti), non lo *schema* delle fasi. Per impostare nomi/probabilità delle fasi usa lo script `setup:pipeline` (API REST Pipelines): il token App Privata deve avere anche lo scope `crm.schemas.deals`.
- **Deploy Replit (autoscale)**: Build `pnpm install && pnpm run build`, Run `pnpm --filter @workspace/api-server start` (già in `.replit`).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
