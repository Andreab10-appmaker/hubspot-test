/**
 * Configura la pipeline "default" dei deal in HubSpot per riprodurre lo schema
 * richiesto (stesse fasi e probabilità dello screenshot di riferimento), via
 * API REST CRM Pipelines. Il connettore MCP gestisce solo i RECORD (deal,
 * contatti): la configurazione delle FASI di una pipeline è un'operazione di
 * settings, quindi va fatta con l'endpoint /crm/v3/pipelines/deals.
 *
 * Requisiti:
 *  - Variabile d'ambiente HUBSPOT_ACCESS_TOKEN = token App Privata (`pat-...`)
 *    con scope `crm.objects.deals` e `crm.schemas.deals` (lettura+scrittura).
 *
 * Uso:
 *   HUBSPOT_ACCESS_TOKEN=pat-... pnpm --filter @workspace/scripts setup:pipeline
 *   # anteprima senza scrivere nulla:
 *   HUBSPOT_ACCESS_TOKEN=pat-... DRY_RUN=1 pnpm --filter @workspace/scripts setup:pipeline
 *
 * Lo script è IDEMPOTENTE: riusa le fasi esistenti (per id interno o per label),
 * così rilanciarlo non duplica nulla. Le fasi standard esistenti vengono
 * rinominate (IT → EN) preservando il loro id, quindi i deal già presenti
 * restano associati alla fase corretta.
 */

const HUBSPOT_API = "https://api.hubapi.com";
const PIPELINE_ID = "default"; // "Sales Pipeline"

interface StageMetadata {
  isClosed?: string;
  probability?: string;
}
interface Stage {
  id?: string;
  label: string;
  displayOrder: number;
  metadata: StageMetadata;
}
interface Pipeline {
  id: string;
  label: string;
  displayOrder: number;
  stages: Stage[];
}

/** Schema desiderato: ordine, label EN, probabilità (0–1) e flag di chiusura. */
interface DesiredStage {
  /** id interno standard HubSpot da riusare se presente (preserva i deal). */
  reuseId: string | null;
  label: string;
  probability: number;
  isClosed: boolean;
}

const DESIRED: DesiredStage[] = [
  {
    reuseId: "appointmentscheduled",
    label: "Appointment Scheduled",
    probability: 0.1,
    isClosed: false,
  },
  {
    reuseId: "qualifiedtobuy",
    label: "Discovery call",
    probability: 0.2,
    isClosed: false,
  },
  {
    reuseId: "presentationscheduled",
    label: "Proposal/Demo",
    probability: 0.4,
    isClosed: false,
  },
  { reuseId: null, label: "Tenders", probability: 0.35, isClosed: false },
  {
    reuseId: "decisionmakerboughtin",
    label: "Decision maker brought-in",
    probability: 0.6,
    isClosed: false,
  },
  {
    reuseId: "contractsent",
    label: "Contract Sent",
    probability: 0.8,
    isClosed: false,
  },
  {
    reuseId: "closedwon",
    label: "Closed Won",
    probability: 1.0,
    isClosed: true,
  },
  {
    reuseId: "closedlost",
    label: "Closed Lost",
    probability: 0.0,
    isClosed: true,
  },
];

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function getPipeline(token: string): Promise<Pipeline> {
  const res = await fetch(
    `${HUBSPOT_API}/crm/v3/pipelines/deals/${PIPELINE_ID}`,
    {
      headers: authHeaders(token),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GET pipeline fallita: HTTP ${res.status} ${res.statusText}\n${body}`,
    );
  }
  return (await res.json()) as Pipeline;
}

async function putPipeline(token: string, body: unknown): Promise<Pipeline> {
  const res = await fetch(
    `${HUBSPOT_API}/crm/v3/pipelines/deals/${PIPELINE_ID}`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    let hint = "";
    if (res.status === 403 && /MISSING_SCOPES/i.test(text)) {
      hint =
        "\n\n👉 Il token App Privata può LEGGERE ma non MODIFICARE le fasi della pipeline.\n" +
        "   Aggiungi lo scope `crm.schemas.deals.write` (e `crm.schemas.deals.read`) all'App Privata:\n" +
        "   HubSpot → Impostazioni → Integrazioni → App private → [la tua app] → Ambiti → Salva, poi rilancia.\n" +
        "   In alternativa imposta le 6 fasi a mano da Impostazioni → Oggetti → Deal → Pipeline.";
    }
    throw new Error(
      `PUT pipeline fallita: HTTP ${res.status} ${res.statusText}\n${text}${hint}`,
    );
  }
  return (await res.json()) as Pipeline;
}

/** Risolve l'id da riusare per una fase desiderata (per reuseId, poi per label). */
function resolveStageId(
  desired: DesiredStage,
  current: Pipeline,
): string | undefined {
  const byId = new Map(current.stages.map((s) => [s.id, s]));
  if (desired.reuseId && byId.has(desired.reuseId)) return desired.reuseId;
  const byLabel = current.stages.find(
    (s) => s.label.trim().toLowerCase() === desired.label.trim().toLowerCase(),
  );
  return byLabel?.id;
}

function buildStages(current: Pipeline): Stage[] {
  return DESIRED.map((d, i) => {
    const id = resolveStageId(d, current);
    return {
      ...(id ? { id } : {}),
      label: d.label,
      displayOrder: i,
      metadata: {
        isClosed: String(d.isClosed),
        probability: String(d.probability),
      },
    };
  });
}

async function main(): Promise<void> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.error(
      "❌ HUBSPOT_ACCESS_TOKEN non impostato.\n" +
        "   Serve un token App Privata (pat-...) con scope crm.objects.deals + crm.schemas.deals.\n" +
        "   Esempio: HUBSPOT_ACCESS_TOKEN=pat-... pnpm --filter @workspace/scripts setup:pipeline",
    );
    process.exit(1);
    return;
  }

  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

  console.log(`🔎 Leggo la pipeline "${PIPELINE_ID}"...`);
  const current = await getPipeline(token);
  console.log(
    `   Pipeline attuale: "${current.label}" (${current.stages.length} fasi)`,
  );
  for (const s of [...current.stages].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  )) {
    console.log(
      `     • ${s.label} [${s.id}] — prob ${s.metadata?.probability ?? "?"}`,
    );
  }

  const stages = buildStages(current);
  const newCount = stages.filter((s) => !s.id).length;
  console.log(
    `\n🎯 Schema desiderato (${stages.length} fasi, ${newCount} nuove):`,
  );
  for (const s of stages) {
    const pct = `${Math.round(Number(s.metadata.probability) * 100)}%`;
    console.log(
      `     ${s.displayOrder + 1}. ${s.label}  (${pct}${s.metadata.isClosed === "true" ? ", chiusa" : ""})` +
        `${s.id ? `  [riusa ${s.id}]` : "  [NUOVA]"}`,
    );
  }

  const body = {
    label: current.label || "Sales Pipeline",
    displayOrder: current.displayOrder ?? 0,
    stages,
  };

  if (dryRun) {
    console.log("\n🟡 DRY_RUN attivo: nessuna modifica inviata a HubSpot.");
    return;
  }

  console.log("\n✏️  Aggiorno la pipeline su HubSpot...");
  const updated = await putPipeline(token, body);
  console.log(
    `✅ Fatto. Pipeline "${updated.label}" aggiornata con ${updated.stages.length} fasi:`,
  );
  for (const s of [...updated.stages].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  )) {
    const pct = `${Math.round(Number(s.metadata?.probability ?? 0) * 100)}%`;
    console.log(`     ${s.displayOrder + 1}. ${s.label}  (${pct})  [${s.id}]`);
  }
}

main().catch((err) => {
  console.error("\n❌ Errore:", err instanceof Error ? err.message : err);
  process.exit(1);
});

export {};
