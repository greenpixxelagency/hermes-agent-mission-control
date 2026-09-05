import assert from 'node:assert/strict'
import test from 'node:test'

import { canUseDriveWorkspace, driveWorkspaceState, humanReadPolicyAllows } from '../src/lib/drive-workspace.ts'

test('M19 human Drive access is explicit and does not turn project membership into employee access', () => {
  assert.deepEqual(['OWNER', 'ADMIN', 'OPERATOR', 'APPROVER', 'VIEWER'].map(canUseDriveWorkspace), [true, true, false, false, false])
})

test('M19 workspace state never treats disabled, uninstalled, or unavailable credentials as connected', () => {
  assert.equal(driveWorkspaceState({}), 'UNINSTALLED')
  assert.equal(driveWorkspaceState({ installation: 'UNINSTALLED' }), 'UNINSTALLED')
  assert.equal(driveWorkspaceState({ installation: 'DISABLED' }), 'DISABLED')
  assert.equal(driveWorkspaceState({ installation: 'CONNECTED', tool: 'CONNECTED', connection: 'CONNECTED', enabled: true, credential: 'NEEDS_ATTENTION' }), 'NEEDS_ATTENTION')
  assert.equal(driveWorkspaceState({ installation: 'CONNECTED', tool: 'CONNECTED', connection: 'CONNECTED', enabled: true, credential: 'ACTIVE' }), 'CONNECTED')
})

test('M19 human Drive reads honor active block and approval policies before provider access', () => {
  assert.equal(humanReadPolicyAllows([{ enforcement: 'ADVISE', rule: { action: 'read' } }]), true)
  assert.equal(humanReadPolicyAllows([{ enforcement: 'BLOCK', rule: { action: 'read' } }]), false)
  assert.equal(humanReadPolicyAllows([{ enforcement: 'REQUIRE_APPROVAL', rule: { action: 'read' } }]), false)
  assert.equal(humanReadPolicyAllows([{ enforcement: 'BLOCK', rule: { action: 'execute' } }]), true)
})
