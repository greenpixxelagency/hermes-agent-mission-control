import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'

// This test is deliberately provider-mocked. It never needs a Google client,
// account, token, or write scope, but exercises the encrypted DB boundary.
process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64url')
process.env.GOOGLE_DRIVE_CLIENT_ID = 'test-client'
process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'test-secret'
process.env.NEXTAUTH_URL = 'https://example.invalid'

test('M13 protects encrypted credentials, scopes, and project provenance', async t => {
  const [{ encryptDriveCredential, decryptDriveCredential }, { beginDriveOAuth, consumeDriveOAuthState }, { prisma }, { BrainSourceType, ConnectionCredentialStatus, ConnectionStatus, DriveScopeType, DriveSourceStatus, PermissionLevel, ProjectToolStatus }, { resolveToolAuthorization }] = await Promise.all([
    import('../src/lib/drive-crypto'), import('../src/lib/drive-oauth'), import('../src/lib/prisma'), import('@prisma/client'), import('../src/lib/tool-permissions'),
  ])
  const suffix = `m13-${Date.now()}`
  const encrypted = encryptDriveCredential({ accessToken: 'never-serialize-me', refreshToken: 'also-secret' })
  assert.doesNotMatch(encrypted, /never-serialize-me|also-secret/)
  assert.deepEqual(decryptDriveCredential<{ accessToken: string }>(encrypted), { accessToken: 'never-serialize-me', refreshToken: 'also-secret' })
  assert.throws(() => decryptDriveCredential(`${encrypted}x`), /DRIVE_CREDENTIAL_INVALID/)
  const org = await prisma.organization.create({ data: { name: suffix, slug: suffix } })
  const user = await prisma.user.create({ data: { email: `${suffix}@example.invalid` } })
  const member = await prisma.organizationMember.create({ data: { userId: user.id, organizationId: org.id, role: 'OWNER' } })
  const [vhalam, buddhaji] = await Promise.all(['vhalam', 'buddhaji'].map(slug => prisma.project.create({ data: { organizationId: org.id, name: slug, slug: `${slug}-${suffix}` } })))
  await Promise.all([prisma.projectMember.create({ data: { projectId: vhalam.id, organizationId: org.id, organizationMemberId: member.id, role: 'OWNER' } }), prisma.projectMember.create({ data: { projectId: buddhaji.id, organizationId: org.id, organizationMemberId: member.id, role: 'OWNER' } })])
  const employee = await prisma.employee.create({ data: { name: suffix, role: 'Test', type: 'SYSTEM' } })
  const assignment = await prisma.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: vhalam.id } })
  const authorizationUrl = await beginDriveOAuth({ projectId: vhalam.id, userId: user.id })
  const state = new URL(authorizationUrl).searchParams.get('state')!
  await assert.rejects(consumeDriveOAuthState({ state, userId: 'forged-user' }), /DRIVE_OAUTH_STATE_DENIED/)
  assert.equal((await consumeDriveOAuthState({ state, userId: user.id })).projectId, vhalam.id)
  await assert.rejects(consumeDriveOAuthState({ state, userId: user.id }), /DRIVE_OAUTH_STATE_DENIED/)
  const tool = await prisma.toolDefinition.upsert({ where: { key: 'google_drive' }, create: { key: 'google_drive', name: 'Google Drive', category: 'KNOWLEDGE' }, update: {} })
  await prisma.toolCapability.upsert({ where: { toolDefinitionId_key: { toolDefinitionId: tool.id, key: 'drive_read' } }, create: { toolDefinitionId: tool.id, key: 'drive_read', name: 'Read' }, update: {} })
  const projectTool = await prisma.projectTool.create({ data: { projectId: vhalam.id, toolDefinitionId: tool.id, status: ProjectToolStatus.CONNECTED } })
  const connection = await prisma.projectConnection.create({ data: { projectId: vhalam.id, projectToolId: projectTool.id, name: suffix, status: ConnectionStatus.CONNECTED } })
  await prisma.connectionCredential.create({ data: { projectId: vhalam.id, connectionId: connection.id, provider: 'google_drive', encryptedPayload: encrypted, status: ConnectionCredentialStatus.ACTIVE } })
  const scope = await prisma.projectConnectionScope.create({ data: { projectId: vhalam.id, connectionId: connection.id, type: DriveScopeType.FILE, externalId: 'allowed-file', displayName: 'Allowed' } })
  const brain = await prisma.knowledgeSource.create({ data: { projectId: vhalam.id, type: BrainSourceType.INTEGRATION, label: 'Google Drive: Allowed' } })
  await prisma.driveSource.create({ data: { projectId: vhalam.id, connectionId: connection.id, scopeId: scope.id, knowledgeSourceId: brain.id, externalFileId: 'allowed-file', name: 'Allowed', mimeType: 'text/plain', contentPreview: 'Scoped Drive context only', status: DriveSourceStatus.READY } })
  await prisma.employeeToolPermission.create({ data: { projectId: vhalam.id, employeeProjectAssignmentId: assignment.id, projectToolId: projectTool.id, capabilityKey: 'drive_read', level: PermissionLevel.READ } })
  t.after(async () => { await prisma.organization.delete({ where: { id: org.id } }); await prisma.employee.delete({ where: { id: employee.id } }); await prisma.user.delete({ where: { id: user.id } }); await prisma.$disconnect() })
  assert.equal(await prisma.projectConnectionScope.findFirst({ where: { projectId: buddhaji.id, id: scope.id } }), null)
  assert.equal(await prisma.driveSource.findFirst({ where: { projectId: buddhaji.id, externalFileId: 'allowed-file' } }), null)
  assert.equal(await resolveToolAuthorization({ projectId: vhalam.id, assignmentId: assignment.id, projectToolId: projectTool.id, action: 'read', capabilityKey: 'drive_read' }), 'ALLOW_READ')
  assert.equal(await resolveToolAuthorization({ projectId: buddhaji.id, assignmentId: assignment.id, projectToolId: projectTool.id, action: 'read', capabilityKey: 'drive_read' }), 'DENY')
  await prisma.policy.create({ data: { projectId: vhalam.id, title: 'Block Drive', description: 'test', status: 'ACTIVE', enforcement: 'BLOCK', rule: { action: 'read' } } })
  assert.equal(await resolveToolAuthorization({ projectId: vhalam.id, assignmentId: assignment.id, projectToolId: projectTool.id, action: 'read', capabilityKey: 'drive_read' }), 'DENY')
})
