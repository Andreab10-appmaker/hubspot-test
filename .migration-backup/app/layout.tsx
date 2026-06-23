import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HubSpot AI Interface — MCP Demo',
  description: 'Interfaccia AI per HubSpot CRM via Model Context Protocol',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
