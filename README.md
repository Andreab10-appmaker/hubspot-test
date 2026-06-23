# HubSpot AI Chat Interface — MCP Demo

Interfaccia chat AI collegata al CRM **HubSpot** tramite **Model Context
Protocol (MCP)**. Il modello (OpenAI o Anthropic) esegue un *agentic loop* nel
backend Next.js: scopre i tool di `@hubspot/mcp-server` (processo figlio
**stdio**), li chiama per leggere/scrivere dati reali nel CRM, e risponde in
italiano in **streaming (SSE)** — con **grafici interattivi in tempo reale**.

```
Browser (React + Recharts)
  │  POST /api/chat (messaggi + provider + modello)
  ▼
Next.js API Route (Node.js)
  ├── avvia @hubspot/mcp-server (stdio, singleton)
  ├── tools/list via MCP  (+ tool "render_chart")
  ├── agentic loop (OpenAI o Anthropic):
  │     modello → tool_use → HubSpot MCP / render_chart → risultato → ripeti
  └── streaming SSE: testo, badge tool, e spec dei grafici
```

## Funzionalità

- **Due provider AI**, scelti dall'header in alto a destra:
  - **OpenAI** (default) — default model **`gpt-5.4-mini`**, con funzione di scelta
    del modello (`gpt-5.4`, `gpt-5.5`, `gpt-5.4-nano`, … o un ID custom digitato a mano).
  - **Anthropic** (opzionale) — default `claude-sonnet-4-6` (anche `claude-opus-4-8`).
- **Grafici in tempo reale** (Recharts): bar / line / area / pie, con formati
  valore € / % / numero. Il modello recupera i dati reali da HubSpot, li aggrega
  e chiama il tool `render_chart`; il grafico compare nella chat.
  Esempi: *"Qual è la mia pipeline per il 2026?"*, *"Incassi previsti questo
  mese?"*, *"Forecast prossimi 3 anni"*, *"Lead per fonte"*.
- **CRUD CRM**: leggere/creare deal, contatti, note, ecc. via i tool HubSpot MCP.

## Stack

- **Next.js 14** (App Router) + React + Tailwind + **Recharts**
- **AI**: `openai` (default) e `@anthropic-ai/sdk` (opzionale) — astrazione in `lib/providers/`
- **MCP client**: `@modelcontextprotocol/sdk` (`StdioClientTransport`)
- **MCP server**: `@hubspot/mcp-server` (npm, avviato via `npx`)

---

## 1. Setup locale

Richiede **Node.js >= 18.17**.

```bash
npm install
cp .env.local.example .env.local   # poi inserisci i valori reali
npm run dev                         # http://localhost:3000
```

`.env.local` (servono SOLO le chiavi del/i provider che usi):

```
OPENAI_API_KEY=sk-...            # provider di default
OPENAI_MODEL=gpt-5.4-mini        # opzionale: modello OpenAI di default
ANTHROPIC_API_KEY=sk-ant-...     # opzionale (solo se usi Anthropic)
ANTHROPIC_MODEL=claude-sonnet-4-6
HUBSPOT_ACCESS_TOKEN=pat-na1-... # obbligatorio
```

---

## 2. Scope HubSpot

Nel Private App Token (`pat-na1-...`) servono questi ambiti
(HubSpot → Impostazioni → Integrazioni → App private → la tua app → **Ambiti**):

**Lettura**: `crm.objects.contacts.read`, `crm.objects.companies.read`,
`crm.objects.deals.read`, `crm.objects.tickets.read`, `crm.objects.notes.read`,
`crm.schemas.contacts.read`, `crm.schemas.deals.read`

**Scrittura**: `crm.objects.contacts.write`, `crm.objects.deals.write`,
`crm.objects.notes.write`

Dopo aver aggiornato gli scope **non serve un nuovo token**.

---

## 3. Deploy su Replit — come impostare i Secret

Su Replit **non** usare `.env.local`. Le chiavi vanno nei **Secrets**, esposti
automaticamente come variabili d'ambiente (gli stessi nomi che legge il codice).

1. Apri la tab **Secrets** (icona 🔒, pannello *Tools*).
2. Aggiungi i secret — il **nome deve essere identico**:

   | Key | Obbligatorio? | Value |
   | --- | --- | --- |
   | `OPENAI_API_KEY` | ✅ se usi OpenAI (default) | `sk-...` |
   | `HUBSPOT_ACCESS_TOKEN` | ✅ sempre | `pat-na1-...` |
   | `ANTHROPIC_API_KEY` | solo se usi Anthropic | `sk-ant-...` |
   | `OPENAI_MODEL` | opzionale (default `gpt-5.4-mini`) | es. `gpt-5.4` |
   | `ANTHROPIC_MODEL` | opzionale | es. `claude-opus-4-8` |

   > Minimo per partire con i default: **`OPENAI_API_KEY`** + **`HUBSPOT_ACCESS_TOKEN`**.

3. **Run** per testare; per pubblicare **Deploy**
   - *Build*: `npm install && npm run build`
   - *Run*: `npm run start`
   - Verifica che i Secret siano disponibili anche nel Deployment.

> **Tipo di deployment** — consigliata una **Reserved VM** (always-on): il server
> MCP gira come processo figlio persistente. Su **Autoscale** funziona, ma a ogni
> cold start `@hubspot/mcp-server` viene riavviato (prima richiesta più lenta).
> Porte e bind su `0.0.0.0` sono già in `.replit` e negli script `npm`.

---

## 4. Test rapidi

- `"Qual è la mia pipeline per il 2026?"` → grafico a barre per fase
- `"Incassi previsti questo mese?"` → dato + grafico
- `"Forecast incassi prossimi 3 anni"` → grafico per anno
- `"Distribuzione lead per fonte"` → grafico a torta
- `"Crea un deal da 15.000€ 'AiPow - Progetto CRM' in fase 'Proposta inviata'"` → scrittura

Cambia **provider/modello** dal selettore in alto a destra (default OpenAI · `gpt-5.4-mini`).

---

## 5. Troubleshooting

| Errore | Causa | Soluzione |
|---|---|---|
| `OPENAI_API_KEY non impostato` (503) | Manca la key del provider scelto | Aggiungi il Secret, o cambia provider |
| `HubSpot MCP non disponibile` (503) | `HUBSPOT_ACCESS_TOKEN` mancante / npx KO | Verifica il Secret e i log |
| `401` da HubSpot | Token scaduto o scope mancanti | Vedi sezione 2 |
| Modello OpenAI non valido | ID modello errato | Digita un ID valido nel selettore o cambia `OPENAI_MODEL` |
| Grafico non compare | Il modello non ha chiamato `render_chart` | Chiedi esplicitamente "con un grafico"; verifica che ci siano dati |

---

## Struttura

```
app/
  ├── layout.tsx · page.tsx · globals.css
  └── api/chat/route.ts          # orchestrazione: MCP + dispatch provider (SSE)
components/
  ├── ChatInterface.tsx          # chat + selettore provider/modello
  ├── MessageBubble.tsx · ToolCallBadge.tsx · QuickActions.tsx
  └── ChartView.tsx              # rendering grafici (Recharts)
lib/
  ├── mcp-client.ts              # singleton @hubspot/mcp-server
  ├── types.ts
  └── providers/
      ├── config.ts              # provider/modelli (client+server)
      ├── shared.ts              # tool render_chart, system prompt, executeTool
      ├── openai.ts              # agentic loop OpenAI
      ├── anthropic.ts           # agentic loop Anthropic
      └── index.ts               # dispatch + resolveModel
```
