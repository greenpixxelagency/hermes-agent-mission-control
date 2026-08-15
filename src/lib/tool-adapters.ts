import { googleDriveAdapter } from '@/lib/google-drive-adapter'

// Server-only, code-owned adapters. Database values select a known key; they
// can never supply a module path, command, credential, or arbitrary action.
export type ToolAdapterInput = { projectId: string; connectionId: string; capabilityKey: string; actionKey: 'read' | 'execute'; request: Record<string, unknown> }
export type ToolAdapterResult = { resultText: string; metadata?: Record<string, unknown> }
export type ToolAdapter = { execute(input: ToolAdapterInput): Promise<ToolAdapterResult> }

const referenceAdapter: ToolAdapter = {
  async execute(input) {
    if (input.capabilityKey === 'reference_read' && input.actionKey === 'read') return { resultText: 'REFERENCE_READ_OK', metadata: { mode: 'synthetic', connectionStatus: 'connected' } }
    if (input.capabilityKey === 'reference_execute' && input.actionKey === 'execute') return { resultText: 'REFERENCE_EXECUTE_APPROVED_OK', metadata: { mode: 'synthetic', outcome: 'recorded' } }
    throw new Error('UNSUPPORTED_REFERENCE_CAPABILITY')
  },
}

const adapters: Record<string, ToolAdapter> = { reference_connector: referenceAdapter, google_drive: googleDriveAdapter }
export function toolAdapterFor(key: string) { const adapter = adapters[key]; if (!adapter) throw new Error('TRUSTED_ADAPTER_NOT_FOUND'); return adapter }
