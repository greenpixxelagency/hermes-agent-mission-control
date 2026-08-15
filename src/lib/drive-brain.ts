import { createHash } from 'crypto'
import { BrainSourceType, DriveSourceStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type DriveProvenance = { sourceId: string; fileId: string; name: string; webUrl: string | null; modifiedAt: Date | null }

/** Persist bounded, selected source content. Drive remains authoritative. */
export async function upsertDriveBrainSource(input: { projectId: string; connectionId: string; scopeId?: string; externalFileId: string; parentExternalId?: string; name: string; mimeType: string; webUrl?: string; modifiedAt?: Date; content: string }) {
  const preview = input.content.slice(0, 20_000)
  const existing = await prisma.driveSource.findUnique({ where: { projectId_connectionId_externalFileId: { projectId: input.projectId, connectionId: input.connectionId, externalFileId: input.externalFileId } }, select: { knowledgeSourceId: true } })
  const sourceId = existing?.knowledgeSourceId ?? (await prisma.knowledgeSource.create({ data: { projectId: input.projectId, type: BrainSourceType.INTEGRATION, label: `Google Drive: ${input.name}`, reference: input.webUrl?.slice(0, 2000) } })).id
  return prisma.driveSource.upsert({ where: { projectId_connectionId_externalFileId: { projectId: input.projectId, connectionId: input.connectionId, externalFileId: input.externalFileId } }, create: { projectId: input.projectId, connectionId: input.connectionId, scopeId: input.scopeId, knowledgeSourceId: sourceId, externalFileId: input.externalFileId, parentExternalId: input.parentExternalId, name: input.name.slice(0, 500), mimeType: input.mimeType.slice(0, 240), webUrl: input.webUrl?.slice(0, 2000), modifiedAt: input.modifiedAt, contentPreview: preview, contentHash: createHash('sha256').update(preview).digest('hex'), status: DriveSourceStatus.READY, lastFetchedAt: new Date() }, update: { scopeId: input.scopeId, parentExternalId: input.parentExternalId, name: input.name.slice(0, 500), mimeType: input.mimeType.slice(0, 240), webUrl: input.webUrl?.slice(0, 2000), modifiedAt: input.modifiedAt, contentPreview: preview, contentHash: createHash('sha256').update(preview).digest('hex'), status: DriveSourceStatus.READY, lastFetchedAt: new Date() } })
}

/** Bounded, project-only retrieval seam for a future Hermes task prompt. */
export async function getProjectBrainContextForTask(input: { projectId: string; query: string; maxSources?: number; maxCharacters?: number }) {
  const terms = input.query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)
  const records = await prisma.driveSource.findMany({ where: { projectId: input.projectId, status: DriveSourceStatus.READY, ...(terms.length ? { OR: terms.flatMap(term => [{ name: { contains: term, mode: 'insensitive' as const } }, { contentPreview: { contains: term, mode: 'insensitive' as const } }]) } : {}) }, include: { knowledgeSource: { select: { reference: true } } }, orderBy: { updatedAt: 'desc' }, take: Math.min(input.maxSources ?? 4, 8) })
  let remaining = Math.min(input.maxCharacters ?? 8_000, 12_000)
  return records.map(record => {
    const content = (record.contentPreview ?? '').slice(0, Math.max(0, remaining)); remaining -= content.length
    return { content, provenance: { sourceId: record.id, fileId: record.externalFileId, name: record.name, webUrl: record.webUrl ?? record.knowledgeSource.reference, modifiedAt: record.modifiedAt } satisfies DriveProvenance }
  }).filter(item => item.content)
}
