// This module is imported only from server runtime services and API routes.
// Its adapter credentials deliberately remain private server configuration.
export type HermesAdapterStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
export type HermesAdapterExecution = { externalExecutionId: string; status: HermesAdapterStatus; startedAt: string | null; completedAt: string | null; result?: string; error?: string }
export type HermesRuntimeAdapter = {
  health: () => Promise<{ adapter: string; hermesReachable: boolean; hermesVersion: string; runtimeIdentity: string; timestamp: string }>
  ensureProfile: (input: { projectKey: 'rogeros-vhalam'; runtimeProfileKey: 'rogeros-vhalam-chief-of-staff'; employeeKey: 'chief-of-staff' }) => Promise<{ status: 'READY' }>
  dispatchExecution: (input: { executionId: string; projectKey: 'rogeros-vhalam'; runtimeProfileKey: 'rogeros-vhalam-chief-of-staff'; employeeKey: 'chief-of-staff'; taskInstruction: string }) => Promise<HermesAdapterExecution>
  getExecutionStatus: (executionId: string) => Promise<HermesAdapterExecution>
}

const url = () => process.env.HERMES_STAGING_ADAPTER_URL?.replace(/\/$/, '')
const token = () => process.env.ROGEROS_HERMES_STAGING_ADAPTER_TOKEN
function config() { const base = url(); const secret = token(); if (!base || !secret) throw new Error('HERMES_ADAPTER_NOT_CONFIGURED'); return { base, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' } } }
async function request<T>(path: string, init?: RequestInit): Promise<T> { const c = config(); const response = await fetch(`${c.base}${path}`, { ...init, headers: { ...c.headers, ...init?.headers }, cache: 'no-store' }); if (!response.ok) throw new Error(`HERMES_ADAPTER_${response.status}`); return response.json() as Promise<T> }

export const hermesRuntimeAdapter: HermesRuntimeAdapter = {
  health: () => request<{ adapter: string; hermesReachable: boolean; hermesVersion: string; runtimeIdentity: string; timestamp: string }>('/health', { headers: {} }),
  ensureProfile: (input: { projectKey: 'rogeros-vhalam'; runtimeProfileKey: 'rogeros-vhalam-chief-of-staff'; employeeKey: 'chief-of-staff' }) => request<{ status: 'READY' }>('/profiles/ensure', { method: 'POST', body: JSON.stringify(input) }),
  dispatchExecution: (input: { executionId: string; projectKey: 'rogeros-vhalam'; runtimeProfileKey: 'rogeros-vhalam-chief-of-staff'; employeeKey: 'chief-of-staff'; taskInstruction: string }) => request<HermesAdapterExecution>('/executions', { method: 'POST', body: JSON.stringify(input) }),
  getExecutionStatus: (executionId: string) => request<HermesAdapterExecution>(`/executions/${encodeURIComponent(executionId)}`),
}
