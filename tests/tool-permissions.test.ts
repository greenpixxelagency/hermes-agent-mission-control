import test from 'node:test'
import assert from 'node:assert/strict'
import { canManageToolPermissions, decidePermission } from '../src/lib/tool-permission-rules.ts'

test('default deny and malformed actions cannot escalate',()=>{assert.equal(decidePermission(null,'execute'),'DENY');assert.equal(decidePermission('FULL_EXECUTE','unknown'),'DENY')})
test('permission ladder is restrictive',()=>{assert.equal(decidePermission('READ','execute'),'DENY');assert.equal(decidePermission('DRAFT','execute'),'DENY');assert.equal(decidePermission('EXECUTE_WITH_APPROVAL','execute'),'REQUIRE_APPROVAL');assert.equal(decidePermission('FULL_EXECUTE','execute'),'ALLOW_EXECUTE')})
test('policy precedence is authoritative',()=>{assert.equal(decidePermission('FULL_EXECUTE','execute','REQUIRE_APPROVAL'),'REQUIRE_APPROVAL');assert.equal(decidePermission('FULL_EXECUTE','execute','BLOCK'),'DENY')})
test('human permission administration is owner/admin only',()=>{assert.equal(canManageToolPermissions('OWNER'),true);assert.equal(canManageToolPermissions('ADMIN'),true);assert.equal(canManageToolPermissions('OPERATOR'),false);assert.equal(canManageToolPermissions('VIEWER'),false)})
