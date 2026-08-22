// Server-only typed client for the isolated staging Hermes adapter. No caller
// can choose a URL, token, command, filesystem path, or arbitrary adapter path.
export type HermesAdapterStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
export type HermesAdapterExecution = { externalExecutionId: string; status: HermesAdapterStatus; startedAt: string | null; completedAt: string | null; result?: string; error?: string }
export type HermesBotState = 'ACTIVE' | 'SUSPENDED'
export type HermesBot = { profileId: string; displayName: string; description?: string | null; state: HermesBotState; soulHash?: string | null; modelProvider?: string | null; modelId?: string | null }
export type HermesBotRuntimeStatus = { profileId: string; assignmentState?: HermesBotState; runtime?: string; state?: HermesBotState; healthy?: boolean; hermesVersion?: string; botModeAvailable?: boolean; botChatAvailable?: boolean; skillsAvailable?: boolean; routinesAvailable?: boolean }
export type HermesBotSkill = { key: string; name: string; bundled?: boolean }
export type HermesBotSkillProvision = { skillId: string; provisioned: boolean; idempotent?: boolean }
export type HermesBotRoutine = { id: string; name: string; enabled: boolean }
export type HermesBotSession = { id: string; status: string; updatedAt?: string | null }
export type HermesBotCapability = { fingerprint?: string; capabilityFingerprint?: string; skillCount?: number; botChatAvailable?: boolean; routinesAvailable?: boolean }
export type HermesBotSpec = { profileId: string; projectKey: string; employeeKey: string; displayName: string; description: string; soul: { revision: number; hash: string; content: string }; runtime: { provider: string; modelId: string }; approvedSkills: string[] }
export type HermesBotIdentitySpec = Pick<HermesBotSpec, 'profileId'>
export type HermesBotMessageResult = { correlationId: string; profileId: string; result: string; sessionId?: string | null; completedAt: string }
type RawHermesBotMessageResult = Partial<HermesBotMessageResult> & { correlationId?: string; profileId?: string; output?: string }

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
  updateBotSoul: (profileId: string, soul: { revision: number; content: string }) => Promise<HermesBot>
  updateBotRuntimeConfig: (profileId: string, config: { provider: string; modelId: string }) => Promise<HermesBot>
  provisionBotSkill: (profileId: string, skillId: string) => Promise<HermesBotSkillProvision>
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
  const serialized = JSON.stringify(payload)
  for (const field of ['profileId', 'projectKey', 'runtimeProfileKey', 'employeeKey', 'displayName', 'description', 'soul', 'runtime', 'approvedSkills']) {
    if (new RegExp(`(^|[^a-zA-Z0-9])${field}([^a-zA-Z0-9]|$)`).test(serialized)) values.push(field)
  }
  return [...new Set(values)].join('_').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 160)
}
function adapterOperation(path: string) {
  if (path.endsWith('/identity')) return 'IDENTITY'
  if (path.endsWith('/soul')) return 'SOUL'
  if (path.endsWith('/runtime')) return 'RUNTIME'
  if (path.endsWith('/skills')) return 'SKILLS'
  if (path.endsWith('/skills/provision')) return 'SKILL_PROVISION'
  if (path.endsWith('/capability-fingerprint')) return 'CAPABILITIES'
  if (path.endsWith('/status')) return 'STATUS'
  if (path.endsWith('/routines')) return 'ROUTINES'
  if (path.endsWith('/sessions')) return 'SESSIONS'
  if (path.endsWith('/messages')) return 'MESSAGES'
  if (path.includes('/bots/')) return 'BOT'
  return 'ADAPTER'
}
async function request<T>(path: string, init?: RequestInit): Promise<T> { const c = config(); const response = await fetch(`${c.base}${path}`, { ...init, headers: { ...c.headers, ...init?.headers }, cache: 'no-store' }); if (!response.ok) { const payload=await response.json().catch(()=>null) as null|Record<string,unknown>;const hint=safeAdapterErrorHint(payload);throw new Error(`HERMES_ADAPTER_${response.status}_${adapterOperation(path)}${hint?`_${hint}`:''}`) } return response.json() as Promise<T> }
const botPath = (profileId: string, suffix = '') => `/bots/${encodeURIComponent(profileId)}${suffix}`
function unwrap<T>(value: unknown, key: string): T {
  if (value && typeof value === 'object' && !Array.isArray(value) && key in value) return (value as Record<string, T>)[key]
  return value as T
}
function unwrapList<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (Array.isArray(record[key])) return record[key] as T[]
    const arrays = Object.values(record).filter(Array.isArray)
    if (arrays.length === 1) return arrays[0] as T[]
  }
  return value as T[]
}
function unwrapSkillList(value: unknown): HermesBotSkill[] {
  const items = unwrapList<unknown>(value, 'skills')
  return items.flatMap(item => {
    if (typeof item === 'string') return [{ key: item, name: item, bundled: false }]
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const key = typeof record.key === 'string' ? record.key : typeof record.skillId === 'string' ? record.skillId : null
    if (!key) return []
    return [{ key, name: typeof record.name === 'string' ? record.name : key, bundled: record.bundled === true }]
  })
}
function unwrapRoutineList(value: unknown): HermesBotRoutine[] {
  const structured = unwrapList<HermesBotRoutine>(value, 'routines')
  if (Array.isArray(structured)) return structured
  if (value && typeof value === 'object' && typeof (value as Record<string, unknown>).output === 'string') {
    const output = (value as Record<string, string>).output.trim()
    if (!output) return []
    try {
      const parsed = JSON.parse(output) as unknown
      const parsedList = unwrapList<HermesBotRoutine>(parsed, 'routines')
      if (Array.isArray(parsedList)) return parsedList
    } catch { /* The adapter may expose human-readable CLI output only. */ }
    return []
  }
  return structured
}
export function normalizeHermesBotMessageResult(value: RawHermesBotMessageResult): HermesBotMessageResult {
  const rawResult = (value.result || value.output || '').replace(/\x1b\[[0-9;]*m/g, '').trim()
  const lines = rawResult.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const result = lines[0]?.startsWith('┌─ Reasoning') ? (lines.at(-1) || '') : rawResult
  return {
    correlationId: value.correlationId || '',
    profileId: value.profileId || '',
    result,
    sessionId: value.sessionId || null,
    completedAt: value.completedAt || new Date().toISOString(),
  }
}

export const hermesRuntimeAdapter: HermesRuntimeAdapter = {
  health: () => request('/health', { headers: {} }),
  ensureProfile: input => request('/profiles/ensure', { method: 'POST', body: JSON.stringify(input) }),
  dispatchExecution: input => request('/executions', { method: 'POST', body: JSON.stringify(input) }),
  getExecutionStatus: executionId => request(`/executions/${encodeURIComponent(executionId)}`),
  listBots: () => request('/bots'),
  getBot: async profileId => unwrap<HermesBot>(await request<unknown>(botPath(profileId)), 'bot'),
  getBotRuntimeStatus: async profileId => unwrap<HermesBotRuntimeStatus>(await request<unknown>(botPath(profileId, '/status')), 'status'),
  listBotSkills: async profileId => unwrapSkillList(await request<unknown>(botPath(profileId, '/skills'))),
  listBotRoutines: async profileId => unwrapRoutineList(await request<unknown>(botPath(profileId, '/routines'))),
  listBotSessions: async profileId => unwrapList<HermesBotSession>(await request<unknown>(botPath(profileId, '/sessions')), 'sessions'),
  getBotCapabilityFingerprint: async profileId => unwrap<HermesBotCapability>(await request<unknown>(botPath(profileId, '/capability-fingerprint')), 'capability'),
  // M14B adopts the deterministic profile already provisioned and verified by M14A.
  // A read through the typed Bot endpoint proves its existence without risking a duplicate.
  ensureBot: spec => request(botPath(spec.profileId)),
  updateBotIdentity: (profileId, metadata) => request(botPath(profileId, '/identity'), { method: 'PUT', body: JSON.stringify(metadata) }),
  updateBotSoul: (profileId, soul) => request(botPath(profileId, '/soul'), { method: 'PUT', body: JSON.stringify({ revision: String(soul.revision), content: soul.content }) }),
  updateBotRuntimeConfig: (profileId, configValue) => request(botPath(profileId, '/runtime'), { method: 'PUT', body: JSON.stringify(configValue) }),
  provisionBotSkill: (profileId, skillId) => request(botPath(profileId, '/skills/provision'), { method: 'POST', body: JSON.stringify({ skillId }) }),
  reconcileBotSkills: async (profileId, approvedSkills) => unwrapSkillList(await request<unknown>(botPath(profileId, '/skills'), { method: 'PUT', body: JSON.stringify({ approvedSkills }) })),
  suspendBotAssignment: profileId => request(botPath(profileId, '/suspend'), { method: 'POST' }),
  resumeBotAssignment: profileId => request(botPath(profileId, '/resume'), { method: 'POST' }),
  sendBotMessage: async (profileId, message, correlationId) => normalizeHermesBotMessageResult(await request<RawHermesBotMessageResult>(botPath(profileId, '/messages'), { method: 'POST', body: JSON.stringify({ message, correlationId }) })),
}
