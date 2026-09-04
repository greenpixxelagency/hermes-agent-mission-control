import assert from 'node:assert/strict'
import test from 'node:test'

import { canManageAppMarket, canSetAppInstallationStatus } from '../src/lib/app-market-rules.ts'

test('M18 app market authority is restricted to project owners and admins', () => {
  assert.deepEqual(['OWNER', 'ADMIN', 'OPERATOR', 'APPROVER', 'VIEWER'].map(canManageAppMarket), [true, true, false, false, false])
})

test('M18 installation lifecycle is explicit and cannot be used to re-install or grant access', () => {
  assert.equal(canSetAppInstallationStatus('CONNECTING'), true)
  assert.equal(canSetAppInstallationStatus('CONNECTED'), true)
  assert.equal(canSetAppInstallationStatus('NEEDS_ATTENTION'), true)
  assert.equal(canSetAppInstallationStatus('DISABLED'), true)
  assert.equal(canSetAppInstallationStatus('UNINSTALLED'), true)
  assert.equal(canSetAppInstallationStatus('INSTALLED'), false)
  assert.equal(canSetAppInstallationStatus('FULL_EXECUTE'), false)
})
