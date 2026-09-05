import assert from 'node:assert/strict'
import test from 'node:test'

import { isAllowedEmail, normalizeEmail } from '../src/lib/native-auth'

test('native authentication allowlist is default-deny and normalized', () => {
  const original = process.env.ALLOWED_EMAILS
  try {
    delete process.env.ALLOWED_EMAILS
    assert.equal(isAllowedEmail('person@example.com'), false)
    process.env.ALLOWED_EMAILS = ' Person@Example.com , another@example.com '
    assert.equal(isAllowedEmail('person@example.com'), true)
    assert.equal(isAllowedEmail('PERSON@example.com'), true)
    assert.equal(isAllowedEmail('outsider@example.com'), false)
    assert.equal(normalizeEmail(' Person@Example.com '), 'person@example.com')
  } finally {
    if (original === undefined) delete process.env.ALLOWED_EMAILS
    else process.env.ALLOWED_EMAILS = original
  }
})
