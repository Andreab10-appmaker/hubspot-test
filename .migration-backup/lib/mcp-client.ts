import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// Singleton: avvia `@hubspot/mcp-server` (stdio) una sola volta e lo riusa fra
// le richieste. Se il processo figlio muore, la cache viene azzerata e la
// richiesta successiva ricrea la connessione.
let clientPromise: Promise<Client> | null = null;

// StdioClientTransport vuole un env di tipo Record<string, string>. process.env
// contiene valori `string | undefined`, quindi lo ripuliamo e ci assicuriamo che
// PATH (necessario per npx) e il token HubSpot siano presenti.
function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  if (process.env.HUBSPOT_ACCESS_TOKEN) {
    env.HUBSPOT_ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
  }
  return env;
}

async function connect(): Promise<Client> {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    throw new Error('HUBSPOT_ACCESS_TOKEN non impostato');
  }

  const transport = new StdioClientTransport({
    command: 'npx',
    // `@hubspot/mcp-server` è anche una dipendenza del progetto: npx usa la copia
    // locale in node_modules, quindi nessun download a runtime.
    args: ['-y', '@hubspot/mcp-server'],
    env: buildEnv(),
  });

  const client = new Client(
    { name: 'hubspot-demo-client', version: '1.0.0' },
    { capabilities: {} }
  );

  // Se il processo figlio termina, scarta il client così la prossima richiesta
  // riconnette da zero.
  transport.onclose = () => {
    console.warn('[MCP] transport chiuso — riconnetto alla prossima richiesta');
    clientPromise = null;
  };
  transport.onerror = (err) => {
    console.error('[MCP] transport error:', err);
  };

  await client.connect(transport);
  console.log('[MCP] Connesso a @hubspot/mcp-server');
  return client;
}

export function getMCPClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
      // Permette un nuovo tentativo alla richiesta successiva.
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export async function getMCPTools() {
  const client = await getMCPClient();
  const { tools } = await client.listTools();
  return tools;
}

export async function callMCPTool(name: string, args: Record<string, unknown>) {
  const client = await getMCPClient();
  return client.callTool({ name, arguments: args });
}
