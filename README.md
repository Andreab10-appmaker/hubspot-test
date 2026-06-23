# HubSpot AI Chat Interface — MCP Demo

Interfaccia chat AI che si collega al CRM HubSpot tramite **Model Context
Protocol (MCP)**. Claude (via `@anthropic-ai/sdk`) esegue un *agentic loop* nel
backend Next.js: scopre i tool esposti da `@hubspot/mcp-server` (avviato come
processo figlio in **stdio**), li chiama per leggere/scrivere dati reali nel CRM
e poi risponde in italiano in streaming (SSE) all'interfaccia.

```
Browser (React Chat)
  │  POST /api/chat (messaggio + history)
  ▼
Next.js API Route (/api/chat)  ── runtime Node.js
  ├── avvia @hubspot/mcp-server (stdio, singleton)
  ├── tools/list via MCP
  ├── agentic loop: Claude → tool_use → callTool(MCP) → tool_result → ripeti
  └── streaming SSE della risposta finale
```

## Stack

- **Next.js 14** (App Router) + React + Tailwind CSS
- **Backend**: Next.js API Route (Node.js)
- **AI**: `@anthropic-ai/sdk` — modello `claude-sonnet-4-6` (configurabile in
  `app/api/chat/route.ts`, costante `MODEL`)
- **MCP client**: `@modelcontextprotocol/sdk` (`StdioClientTransport`)
- **MCP server**: `@hubspot/mcp-server` (npm, avviato via `npx`)

---

## 1. Setup locale

Richiede **Node.js >= 18.17**.

```bash
# 1. Installa le dipendenze
npm install

# 2. Crea il file dei secret locali
cp .env.local.example .env.local
#   poi apri .env.local e inserisci i valori reali:
#   ANTHROPIC_API_KEY=sk-ant-...
#   HUBSPOT_ACCESS_TOKEN=pat-na1-...

# 3. Avvia in sviluppo
npm run dev
# apri http://localhost:3000
```

> `@hubspot/mcp-server` è una dipendenza del progetto, quindi `npx` usa la copia
> locale in `node_modules` (nessun download a runtime).

---

## 2. Scope HubSpot necessari

Nel Private App Token (`pat-na1-...`) servono questi ambiti
(HubSpot → Impostazioni → Integrazioni → App private → la tua app → **Ambiti**):

**Lettura**
- `crm.objects.contacts.read`
- `crm.objects.companies.read`
- `crm.objects.deals.read`
- `crm.objects.tickets.read`
- `crm.objects.notes.read`
- `crm.schemas.contacts.read`
- `crm.schemas.deals.read`

**Scrittura** (per creare deal/contatti/note)
- `crm.objects.contacts.write`
- `crm.objects.deals.write`
- `crm.objects.notes.write`

Dopo aver aggiornato gli scope **non serve un nuovo token**: il PAT esistente
acquisisce automaticamente i nuovi permessi.

---

## 3. Deploy su Replit — come impostare i Secret

Su Replit **non** usare `.env.local` (è in `.gitignore` e non viene caricato).
Le chiavi vanno messe nei **Secrets**, che Replit espone come variabili
d'ambiente (`process.env`) — esattamente i nomi che il codice si aspetta.

### Passi

1. Importa il repo su Replit (**Create Repl → Import from GitHub**) oppure carica
   i file.
2. Apri la tab **Secrets** (icona 🔒, nel pannello *Tools* a sinistra; in
   alternativa il comando `Secrets` dalla palette).
3. Aggiungi **due** secret, uno alla volta — il **nome deve essere identico**:

   | Key (nome)             | Value (valore)        |
   | ---------------------- | --------------------- |
   | `ANTHROPIC_API_KEY`    | `sk-ant-...`          |
   | `HUBSPOT_ACCESS_TOKEN` | `pat-na1-...`         |

4. **Run** per testare in sviluppo. Per pubblicare: **Deploy**
   - *Build command*: `npm install && npm run build`
   - *Run command*: `npm run start`
   - I Secret impostati sono disponibili anche nei Deployment (verifica che
     compaiano nella sezione Secrets del deployment).

> **Tipo di deployment** — consigliata una **Reserved VM** (always-on): il
> server MCP gira come processo figlio persistente, quindi la connessione resta
> calda. Con **Autoscale** funziona comunque, ma a ogni cold start il processo
> `@hubspot/mcp-server` viene riavviato (solo la prima richiesta è più lenta).

> Le porte e l'avvio su `0.0.0.0` sono già configurati in `.replit` e negli
> script `npm` (`next dev/start -H 0.0.0.0`); Next legge automaticamente `PORT`.

---

## 4. Test rapidi

- `"Mostra i deal aperti"` → test di lettura
- `"Crea un deal da 15.000€ chiamato 'AiPow - Progetto CRM' in fase 'Proposta inviata'"`
  → test di scrittura (compare il badge arancione del tool; poi verifica su
  HubSpot CRM → Deal)
- `"Crea un contatto mario.rossi@example.com di nome Mario Rossi"` → scrittura
- `"Aggiungi una nota 'Call lunedì' al deal che hai appena creato"` → multi-step

---

## 5. Troubleshooting

| Errore | Causa probabile | Soluzione |
|---|---|---|
| `HubSpot MCP non disponibile` (503) | `HUBSPOT_ACCESS_TOKEN` mancante o npx non avvia il server | Verifica il secret; controlla i log del server |
| `401 Unauthorized` da HubSpot | Token scaduto o scope mancanti | Vedi sezione 2 |
| `permission denied` creando un deal | Manca `crm.objects.deals.write` | Aggiungi lo scope in HubSpot |
| Streaming che non scorre | Proxy che bufferizza | Header `X-Accel-Buffering: no` già impostato nella route |
| MCP si disconnette | Processo figlio terminato | Il singleton si auto-riconnette alla richiesta successiva |

---

## Struttura

```
.
├── .env.local.example       # template dei secret (locale)
├── .replit                  # config Replit (run/deploy/porte)
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/chat/route.ts    # agentic loop + bridge MCP (SSE)
├── components/
│   ├── ChatInterface.tsx
│   ├── MessageBubble.tsx
│   ├── ToolCallBadge.tsx
│   └── QuickActions.tsx
└── lib/
    ├── mcp-client.ts        # singleton: avvia/gestisce @hubspot/mcp-server
    └── types.ts
```
