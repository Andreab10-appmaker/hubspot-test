/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep these out of the server bundle. The MCP SDK spawns the HubSpot MCP
    // server as a child process (stdio) at runtime, so it must be loaded from
    // node_modules at runtime rather than bundled/transformed by Next.js.
    serverComponentsExternalPackages: [
      '@modelcontextprotocol/sdk',
      '@hubspot/mcp-server',
    ],
  },
};

module.exports = nextConfig;
