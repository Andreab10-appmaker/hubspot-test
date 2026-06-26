import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

let clientPromise: Promise<Client> | null = null;

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

// Determina come avviare l'@hubspot/mcp-server.
// In produzione NON c'è accesso al registry npm, quindi `npx -y @hubspot/mcp-server`
// fallisce (scarica il pacchetto a runtime → timeout MCP -32001). Il pacchetto è già
// una dipendenza installata: lo risolviamo e lo lanciamo direttamente con `node`,
// senza alcun accesso di rete.
function resolveServerLaunch(): { command: string; args: string[] } {
  const entry = nodeRequire.resolve('@hubspot/mcp-server');
  return { command: process.execPath, args: [entry] };
}

async function connect(): Promise<Client> {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    throw new Error('HUBSPOT_ACCESS_TOKEN non impostato');
  }

  const { command, args } = resolveServerLaunch();
  const transport = new StdioClientTransport({
    command,
    args,
    env: buildEnv(),
  });

  const client = new Client(
    { name: 'hubspot-demo-client', version: '1.0.0' },
    { capabilities: {} }
  );

  transport.onclose = () => {
    clientPromise = null;
  };
  transport.onerror = (err: unknown) => {
    console.error('[MCP] transport error:', err);
  };

  await client.connect(transport);
  return client;
}

export function getMCPClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = connect().catch((err) => {
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
