import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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

async function connect(): Promise<Client> {
  if (!process.env.HUBSPOT_ACCESS_TOKEN) {
    throw new Error('HUBSPOT_ACCESS_TOKEN non impostato');
  }

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@hubspot/mcp-server'],
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
