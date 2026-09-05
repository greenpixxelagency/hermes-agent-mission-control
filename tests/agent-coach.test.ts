import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentCoachRecommendations } from '../src/lib/agent-coach'

test('M21 produces bounded, transparent human-review proposals only', () => {
  const recommendations = buildAgentCoachRecommendations([{
    employee: { assignmentId: 'assignment-alpha', name: 'Alpha', role: 'Operations', employmentStatus: 'ACTIVE' },
    assignedWork: { assignedInRange: 2, completedInRange: 0 },
    runtimeAttempts: { createdInRange: 1, succeededInRange: 0, acceptedInRange: 0 },
    governedToolExecutions: { createdInRange: 3, succeededInRange: 1, failedInRange: 2 },
  }])

  assert.deepEqual(recommendations.map(item => item.kind), ['WORK_ASSIGNMENT_REVIEW', 'RUNTIME_OUTCOME_REVIEW', 'TOOL_FAILURE_REVIEW'])
  assert.equal(recommendations.every(item => item.employee.assignmentId === 'assignment-alpha'), true)
  assert.equal(JSON.stringify(recommendations).match(/credential|token|prompt|resultText|provider payload/i), null)
  assert.equal(recommendations.every(item => item.safeguards.some(safeguard => safeguard.includes('No permission, Skill, policy, SOUL, runtime, billing, provider, or task state is changed.'))), true)
})

test('M21 does not recommend changes from healthy or absent evidence', () => {
  const recommendations = buildAgentCoachRecommendations([{
    employee: { assignmentId: 'assignment-beta', name: 'Beta', role: 'Research', employmentStatus: 'ACTIVE' },
    assignedWork: { assignedInRange: 2, completedInRange: 2 },
    runtimeAttempts: { createdInRange: 2, succeededInRange: 2, acceptedInRange: 2 },
    governedToolExecutions: { createdInRange: 2, succeededInRange: 2, failedInRange: 0 },
  }])
  assert.deepEqual(recommendations, [])
})

test('M21 bounds its deterministic review queue', () => {
  const recommendations = buildAgentCoachRecommendations(Array.from({ length: 101 }, (_, index) => ({
    employee: { assignmentId: `assignment-${index}`, name: `Worker ${index}`, role: 'Operations', employmentStatus: 'ACTIVE' },
    assignedWork: { assignedInRange: 1, completedInRange: 0 },
    runtimeAttempts: { createdInRange: 0, succeededInRange: 0, acceptedInRange: 0 },
    governedToolExecutions: { createdInRange: 0, succeededInRange: 0, failedInRange: 0 },
  })))
  assert.equal(recommendations.length, 100)
  assert.equal(recommendations[0].employee.assignmentId, 'assignment-0')
  assert.equal(recommendations.at(-1)?.employee.assignmentId, 'assignment-99')
})
