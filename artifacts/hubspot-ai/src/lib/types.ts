export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
}

export type ChartType = 'bar' | 'line' | 'area' | 'pie';
export type ValueFormat = 'number' | 'currency' | 'percent';

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartSpec {
  id: string;
  type: ChartType;
  title: string;
  data: ChartDataPoint[];
  valueFormat?: ValueFormat;
  xLabel?: string;
  yLabel?: string;
}

export interface ConfirmAction {
  id: string;
  name: string;
  title: string;
  input: Record<string, unknown>;
}

export interface PendingConfirm {
  actions: ConfirmAction[];
  status: 'pending' | 'confirmed' | 'cancelled';
}

export interface DownloadFile {
  id: string;
  name: string;
  mimeType: string;
  dataBase64: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  charts?: ChartSpec[];
  files?: DownloadFile[];
  pendingConfirm?: PendingConfirm;
  isError?: boolean;
}

export interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  provider?: 'openai' | 'anthropic';
  model?: string;
}
