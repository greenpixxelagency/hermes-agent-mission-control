import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { activeDriveTokens } from '@/lib/drive-oauth'
import type { ToolAdapter, ToolAdapterInput, ToolAdapterResult } from '@/lib/tool-adapters'

const supported = new Set(['application/vnd.google-apps.document', 'text/plain', 'text/markdown', 'application/pdf'])
type DriveItem = { id: string; name: string; mimeType: string; modifiedTime?: string | null; webViewLink?: string | null; parents?: string[] | null }
async function driveClient(projectId: string, connectionId: string) {
  const tokens = await activeDriveTokens(projectId, connectionId)
  const auth = new google.auth.OAuth2(); auth.setCredentials({ access_token: tokens.accessToken })
  return google.drive({ version: 'v3', auth })
}
/** Owner-only scope selection may inspect metadata, but never file contents. */
export async function inspectGoogleDriveItem(projectId: string, connectionId: string, fileId: string): Promise<DriveItem> {
  const drive = await driveClient(projectId, connectionId)
  const file = await drive.files.get({ fileId, fields: 'id,name,mimeType,modifiedTime,webViewLink,parents' })
  if (!file.data.id || !file.data.name || !file.data.mimeType) throw new Error('DRIVE_ITEM_NOT_FOUND')
  return file.data as DriveItem
}
async function scoped(projectId: string, connectionId: string, fileId: string) {
  const direct = await prisma.projectConnectionScope.findFirst({ where: { projectId, connectionId, type: 'FILE', externalId: fileId, active: true } })
  if (direct) return direct
  // A selected folder authorizes only files whose stored parent was observed
  // through the adapter. Caller-provided parent IDs can never widen access.
  const source = await prisma.driveSource.findFirst({ where: { projectId, connectionId, externalFileId: fileId, scope: { is: { type: 'FOLDER', active: true } } } })
  if (source) return source
  return null
}
function text(files: Array<{ name?: string | null; id?: string | null; mimeType?: string | null }>) { return files.map(file => `${file.name ?? 'Untitled'}\t${file.id ?? ''}\t${file.mimeType ?? ''}`).join('\n') || 'No matching items.' }
export const googleDriveAdapter: ToolAdapter = { async execute(input: ToolAdapterInput): Promise<ToolAdapterResult> {
  if (!['drive_health', 'drive_list', 'drive_metadata', 'drive_read', 'drive_search'].includes(input.capabilityKey) || input.actionKey !== 'read') throw new Error('UNSUPPORTED_DRIVE_CAPABILITY')
  const drive = await driveClient(input.projectId, input.connectionId)
  if (input.capabilityKey === 'drive_health') { const about = await drive.about.get({ fields: 'user(displayName,emailAddress)' }); return { resultText: 'GOOGLE_DRIVE_CONNECTION_OK', metadata: { account: about.data.user?.emailAddress ? 'connected' : 'connected' } } }
  const id = typeof input.request.fileId === 'string' ? input.request.fileId : ''
  if (input.capabilityKey === 'drive_list' || input.capabilityKey === 'drive_search') {
    const parentId = typeof input.request.parentId === 'string' ? input.request.parentId : ''
    if (!parentId || !await prisma.projectConnectionScope.findFirst({ where: { projectId: input.projectId, connectionId: input.connectionId, type: 'FOLDER', externalId: parentId, active: true } })) throw new Error('DRIVE_SCOPE_DENIED')
    const q = input.capabilityKey === 'drive_search' && typeof input.request.query === 'string' ? `name contains '${input.request.query.replace(/'/g, "\\'")}' and trashed = false` : parentId ? `'${parentId.replace(/'/g, "\\'")}' in parents and trashed = false` : 'trashed = false'
    const result = await drive.files.list({ q, pageSize: 50, fields: 'files(id,name,mimeType,modifiedTime,webViewLink,parents)' })
    return { resultText: text(result.data.files ?? []), metadata: { count: result.data.files?.length ?? 0 } }
  }
  if (!id || !await scoped(input.projectId, input.connectionId, id)) throw new Error('DRIVE_SCOPE_DENIED')
  const file = await drive.files.get({ fileId: id, fields: 'id,name,mimeType,modifiedTime,webViewLink,parents' })
  if (input.capabilityKey === 'drive_metadata') return { resultText: `Metadata available for ${file.data.name ?? id}`, metadata: { fileId: file.data.id, name: file.data.name, mimeType: file.data.mimeType } }
  if (!file.data.mimeType || !supported.has(file.data.mimeType)) throw new Error('DRIVE_FILE_UNSUPPORTED')
  const response = file.data.mimeType === 'application/vnd.google-apps.document' ? await drive.files.export({ fileId: id, mimeType: 'text/plain' }, { responseType: 'text' }) : await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'text' })
  return { resultText: String(response.data).slice(0, 20_000), metadata: { fileId: file.data.id, name: file.data.name, mimeType: file.data.mimeType, parentId: file.data.parents?.[0] ?? null, webUrl: file.data.webViewLink ?? null, modifiedAt: file.data.modifiedTime ?? null } }
} }
