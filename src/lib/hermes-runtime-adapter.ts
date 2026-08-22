// Server-only typed client for the isolated staging Hermes adapter. No caller
// can choose a URL, token, command, filesystem path, or arbitrary adapter path.
export type HermesAdapterStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
export type HermesAdapterExecution = { externalExecutionId: string; status: HermesAdapterStatus; startedAt: string | null; completedAt: string | null; result?: string; error?: string }
export type HermesBotState = 'ACTIVE' | 'SUSPENDED'
export type HermesBot = { profileId: string; displayName: string; description?: string | null; state: HermesBotState; soulHash?: string | null; modelProvider?: string | null; modelId?: string | null }
export type HermesBotRuntimeStatus = { profileId: string; state: HermesBotState; healthy: boolean; hermesVersion: string; botModeAvailable: boolean; botChatAvailable: boolean; skillsAvailable: boolean; routinesAvailable: boolean }
export type HermesBotSkill = { key: string; name: string; bundled?: boolean }
export type HermesBotRoutine = { id: string; name: string; enabled: boolean }
export type HermesBotSession = { id: string; status: string; updatedAt?: string | null }
export type HermesBotCapability = { fingerprint: string; skillCount: number; botChatAvailable: boolean; routinesAvailable: boolean }
export type HermesBotSpec = { profileId: string; projectKey: string; employeeKey: string; displayName: string; description: string; soul: { revision: number; hash: string; content: string }; runtime: { provider: string; modelId: string }; approvedSkills: string[] }
export type HermesBotIdentitySpec = Pick<HermesBotSpec, 'profileId' | 'projectKey' | 'employeeKey'>
export type HermesBotMessageResult = { correlationId: string; profileId: string; result: string; sessionId?: string | null; completedAt: string }

export type HermesExecutionRuntimeAdapter = {
  health: () => Promise<{ adapter: string; hermesReachable: boolean; hermesVersion: string; runtimeIdentity: string; timestamp: string }>
  ensureProfile: (input: { projectKey: string; runtimeProfileKey: string; employeeKey: string }) => Promise<{ status: 'READY' }>
  dispatchExecution: (input: { executionId: string; projectKey: string; runtimeProfileKey: string; employeeKey: string; taskInstruction: string }) => Promise<HermesAdapterExecution>
  getExecutionStatus: (executionId: string) => Promise<HermesAdapterExecution>
}

export type HermesRuntimeAdapter = HermesExecutionRuntimeAdapter & {
  listBots: () => Promise<HermesBot[]>
  getBot: (profileId: string) => Promise<HermesBot>
  getBotRuntimeStatus: (profileId: string) => Promise<HermesBotRuntimeStatus>
  listBotSkills: (profileId: string) => Promise<HermesBotSkill[]>
  listBotRoutines: (profileId: string) => Promise<HermesBotRoutine[]>
  listBotSessions: (profileId: string) => Promise<HermesBotSession[]>
  getBotCapabilityFingerprint: (profileId: string) => Promise<HermesBotCapability>
  ensureBot: (spec: HermesBotIdentitySpec) => Promise<HermesBot>
  updateBotIdentity: (profileId: string, metadata: { displayName: string; description: string }) => Promise<HermesBot>
  updateBotSoul: (profileId: string, soul: { revision: number; hash: string; content: string }) => Promise<HermesBot>
  updateBotRuntimeConfig: (profileId: string, config: { provider: string; modelId: string }) => Promise<HermesBot>
  reconcileBotSkills: (profileId: string, approvedSkills: string[]) => Promise<HermesBotSkill[]>
  suspendBotAssignment: (profileId: string) => Promise<{ profileId: string; state: 'SUSPENDED' }>
  resumeBotAssignment: (profileId: string) => Promise<{ profileId: string; state: 'ACTIVE' }>
  sendBotMessage: (profileId: string, message: string, correlationId: string) => Promise<HermesBotMessageResult>
}

const url = () => process.env.HERMES_STAGING_ADAPTER_URL?.replace(/\/$/, '')
const token = () => process.env.ROGEROS_HERMES_STAGING_ADAPTER_TOKEN
function config() { const base = url(); const secret = token(); if (!base || !secret) throw new Error('HERMES_ADAPTER_NOT_CONFIGURED'); return { base, headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' } } }
export function safeAdapterErrorHint(payload: null | Record<string, unknown>) {
  if (!payload) return ''
  const values: string[] = []
  for (const key of ['code', 'error', 'field', 'missingField', 'requiredField', 'unknownField']) {
    const value = payload[key]
    if (typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_.-]{0,80}$/.test(value)) values.push(value)
  }
  for (const key of ['fields', 'missingFields', 'requiredFields', 'unknownFields']) {
    const value = payload[key]
    if (Array.isArray(value)) values.push(...value.filter((item): item is string => typeof item === 'string' && /^[a-zA-Z][a-zA-Z0-9_.-]{0,80}$/.test(item)))
  }
  return [...new Set(values)].join('_').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 160)
}
async function request<T>(path: string, init?: RequestInit): Promise<T> { const c = config(); const response = await fetch(`${c.base}${path}`, { ...init, headers: { ...c.headers, ...init?.headers }, cache: 'no-store' }); if (!response.ok) { const payload=await response.json().catch(()=>null) as null|Record<string,unknown>;const hint=safeAdapterErrorHint(payload);throw new Error(`HERMES_ADAPTER_${response.status}${hint?`_${hint}`:''}`) } return response.json() as Promise<T> }
const botPath = (profileId: string, suffix = '') => `/bots/${encodeURIComponent(profileId)}${suffix}`

export const hermesRuntimeAdapter: HermesRuntimeAdapter = {
  health: () => request('/health', { headers: {} }),
  ensureProfile: input => request('/profiles/ensure', { method: 'POST', body: JSON.stringify(input) }),
  dispatchExecution: input => request('/executions', { method: 'POST', body: JSON.stringify(input) }),
  getExecutionStatus: executionId => request(`/executions/${encodeURIComponent(executionId)}`),
  listBots: () => request('/bots'),
  getBot: profileId => request(botPath(profileId)),
  getBotRuntimeStatus: profileId => request(botPath(profileId, '/status')),
  listBotSkills: profileId => request(botPath(profileId, '/skills')),
  listBotRoutines: profileId => request(botPath(profileId, '/routines')),
  listBotSessions: profileId => request(botPath(profileId, '/sessions')),
  getBotCapabilityFingerprint: profileId => request(botPath(profileId, '/capabilities')),
  ensureBot: async spec => {
    await request('/profiles/ensure', { method: 'POST', body: JSON.stringify({ projectKey: spec.projectKey, runtimeProfileKey: spec.profileId, employeeKey: spec.employeeKey }) })
    return request(botPath(spec.profileId))
  },
  updateBotIdentity: (profileId, metadata) => request(botPath(profileId, '/identity'), { method: 'PUT', body: JSON.stringify(metadata) }),
  updateBotSoul: (profileId, soul) => request(botPath(profileId, '/soul'), { method: 'PUT', body: JSON.stringify(soul) }),
  updateBotRuntimeConfig: (profileId, configValue) => request(botPath(profileId, '/runtime'), { method: 'PUT', body: JSON.stringify(configValue) }),
  reconcileBotSkills: (profileId, approvedSkills) => request(botPath(profileId, '/skills'), { method: 'PUT', body: JSON.stringify({ approvedSkills }) }),
  suspendBotAssignment: profileId => request(botPath(profileId, '/suspend'), { method: 'POST' }),
  resumeBotAssignment: profileId => request(botPath(profileId, '/resume'), { method: 'POST' }),
  sendBotMessage: (profileId, message, correlationId) => request(botPath(profileId, '/messages'), { method: 'POST', body: JSON.stringify({ message, correlationId }) }),
}
