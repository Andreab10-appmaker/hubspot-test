/**
 * Crea le proprietà custom dei DEAL necessarie alle analisi del funnel e alla
 * proiezione del fatturato. Idempotente: se una proprietà esiste già, la salta.
 *
 * Proprietà create:
 *  - deal_source         (enumeration)  Inbound / Outbound / Referral / Partner / Event
 *  - deal_country        (enumeration)  Italia / Francia / Spagna / Germania / Svizzera / UK
 *  - last_activity_date  (date)         data ultima attività
 *  - stage_history       (string/textarea, JSON) storico delle fasi attraversate
 *  - renewal_probability (number 0–1)   probabilità di rinnovo (proiezione)
 *
 * Requisiti: HUBSPOT_ACCESS_TOKEN = token App Privata (`pat-...`) con scope
 *  `crm.schemas.deals.write` (e `.read`).
 *
 * Uso:
 *   HUBSPOT_ACCESS_TOKEN=pat-... pnpm --filter @workspace/scripts setup:deal-fields
 *   HUBSPOT_ACCESS_TOKEN=pat-... DRY_RUN=1 pnpm --filter @workspace/scripts setup:deal-fields
 */

const HUBSPOT_API = "https://api.hubapi.com";
const GROUP = "dealinformation";

interface PropOption { label: string; value: string; displayOrder: number }
interface PropDef {
  name: string;
  label: string;
  type: "enumeration" | "date" | "number" | "string";
  fieldType: "select" | "date" | "number" | "textarea";
  description: string;
  options?: PropOption[];
}

const opts = (...labels: string[]): PropOption[] =>
  labels.map((label, i) => ({ label, value: label, displayOrder: i }));

const DESIRED: PropDef[] = [
  {
    name: "deal_source",
    label: "Deal Source",
    type: "enumeration",
    fieldType: "select",
    description: "Canale di origine del deal (per analisi velocità funnel).",
    options: opts("Inbound", "Outbound", "Referral", "Partner", "Event"),
  },
  {
    name: "deal_country",
    label: "Deal Country",
    type: "enumeration",
    fieldType: "select",
    description: "Paese del deal (per win rate per paese).",
    options: opts("Italia", "Francia", "Spagna", "Germania", "Svizzera", "UK"),
  },
  {
    // La label NON può essere "Last Activity Date": è già usata dalla proprietà
    // standard HubSpot `notes_last_updated` (le label devono essere uniche).
    name: "last_activity_date",
    label: "Deal Last Activity Date",
    type: "date",
    fieldType: "date",
    description: "Data dell'ultima attività registrata sul deal (per analisi deal inattivi).",
  },
  {
    name: "stage_history",
    label: "Stage History (JSON)",
    type: "string",
    fieldType: "textarea",
    description:
      'Storico fasi: JSON [{"stage","enteredAt","exitedAt"}]. Alimenta velocità funnel, fasi bloccate, ciclo di vendita, transizioni.',
  },
  {
    name: "renewal_probability",
    label: "Renewal Probability",
    type: "number",
    fieldType: "number",
    description: "Probabilità di rinnovo 0–1 (proiezione fatturato oltre il contratto).",
  },
];

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function propertyExists(token: string, name: string): Promise<boolean> {
  const res = await fetch(`${HUBSPOT_API}/crm/v3/properties/deals/${name}`, {
    headers: authHeaders(token),
  });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  const body = await res.text();
  throw new Error(`GET property ${name} fallita: HTTP ${res.status}\n${body}`);
}

async function createProperty(token: string, def: PropDef): Promise<void> {
  const body = {
    name: def.name,
    label: def.label,
    type: def.type,
    fieldType: def.fieldType,
    groupName: GROUP,
    description: def.description,
    ...(def.options ? { options: def.options } : {}),
  };
  const res = await fetch(`${HUBSPOT_API}/crm/v3/properties/deals`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let hint = "";
    if (res.status === 403)
      hint =
        "\n\n👉 Il token App Privata serve lo scope `crm.schemas.deals.write`. " +
        "HubSpot → Impostazioni → Integrazioni → App private → [app] → Ambiti.";
    throw new Error(`POST property ${def.name} fallita: HTTP ${res.status}\n${text}${hint}`);
  }
}

async function main(): Promise<void> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    console.error("❌ HUBSPOT_ACCESS_TOKEN non impostato (token App Privata pat-...).");
    process.exit(1);
    return;
  }
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  console.log(`🔧 Configuro ${DESIRED.length} proprietà custom sui deal...\n`);

  // Creazione RESILIENTE: un errore su un campo non blocca gli altri.
  const failures: string[] = [];
  for (const def of DESIRED) {
    try {
      const exists = await propertyExists(token, def.name);
      if (exists) {
        console.log(`   • ${def.name} — già presente, salto.`);
        continue;
      }
      if (dryRun) {
        console.log(`   • ${def.name} — DA CREARE (dry-run).`);
        continue;
      }
      await createProperty(token, def);
      console.log(`   ✅ ${def.name} — creata (${def.type}).`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ ${def.name} — ERRORE: ${msg.split("\n")[0]}`);
      failures.push(def.name);
    }
  }

  if (failures.length) {
    console.error(
      `\n❌ ${failures.length} proprietà non create: ${failures.join(", ")}. ` +
        "Risolvi (es. label duplicata) e rilancia — i campi già creati vengono saltati.",
    );
    process.exit(1);
  }
  console.log(
    dryRun
      ? "\n🟡 DRY_RUN: nessuna modifica inviata."
      : "\n✅ Fatto. Ora popola i dati: pnpm --filter @workspace/scripts seed:deals",
  );
}

main().catch((err) => {
  console.error("\n❌ Errore:", err instanceof Error ? err.message : err);
  process.exit(1);
});

export {};
