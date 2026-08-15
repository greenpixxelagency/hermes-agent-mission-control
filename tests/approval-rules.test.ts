import test from 'node:test'
import assert from 'node:assert/strict'
import { canDecideApproval, canTransitionApproval, isSafeActionContext } from '../src/lib/approval-rules.ts'

test('only owner admin and approver can decide', () => {
  assert.equal(canDecideApproval('OWNER'), true); assert.equal(canDecideApproval('ADMIN'), true); assert.equal(canDecideApproval('APPROVER'), true)
  assert.equal(canDecideApproval('OPERATOR'), false); assert.equal(canDecideApproval('VIEWER'), false)
})
test('only pending requests transition once and never after expiry', () => {
  for (const next of ['APPROVED','REJECTED','CANCELLED'] as const) assert.equal(canTransitionApproval('PENDING', next), true)
  assert.equal(canTransitionApproval('APPROVED','REJECTED'), false); assert.equal(canTransitionApproval('REJECTED','APPROVED'), false); assert.equal(canTransitionApproval('CANCELLED','APPROVED'), false); assert.equal(canTransitionApproval('PENDING','APPROVED',true), false)
})
test('approval action context rejects secret-bearing metadata', () => {
  assert.equal(isSafeActionContext({ form: 'staging', title: 'safe' }), true)
  assert.equal(isSafeActionContext({ accessToken: 'never-store' }), false); assert.equal(isSafeActionContext({ DATABASE_URL: 'never-store' }), false); assert.equal(isSafeActionContext(['bad']), false)
})
