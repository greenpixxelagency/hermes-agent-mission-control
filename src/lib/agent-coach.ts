import type { ProjectContext } from '@/lib/project-context'
import { getWorkforceScorecard, type ScorecardRange } from '@/lib/workforce-scorecard'

const MAX_RECOMMENDATIONS = 100

type WorkforceWorker = {
  employee: { assignmentId: string; name: string; role: string; employmentStatus: string }
  assignedWork: { assignedInRange: number; completedInRange: number }
  runtimeAttempts: { createdInRange: number; succeededInRange: number; acceptedInRange: number }
  governedToolExecutions: { createdInRange: number; succeededInRange: number; failedInRange: number }
}

export type AgentCoachRecommendation = {
  id: string
  kind: 'WORK_ASSIGNMENT_REVIEW' | 'RUNTIME_OUTCOME_REVIEW' | 'TOOL_FAILURE_REVIEW'
  employee: WorkforceWorker['employee']
  observation: string
  evidence: Record<string, number>
  proposedReview: string
  safeguards: readonly string[]
}

function recommendationsFor(worker: WorkforceWorker): AgentCoachRecommendation[] {
  const common = [
    'This is a human-review proposal, not an instruction or an authorization.',
    'No permission, Skill, policy, SOUL, runtime, billing, provider, or task state is changed.',
    'Any later governed change must use its existing project-scoped authorization and audit workflow.',
  ] as const
  const prefix = `${worker.employee.assignmentId}:`
  const recommendations: AgentCoachRecommendation[] = []

  if (worker.assignedWork.assignedInRange > 0 && worker.assignedWork.completedInRange === 0) {
    recommendations.push({
      id: `${prefix}assignment`, kind: 'WORK_ASSIGNMENT_REVIEW', employee: worker.employee,
      observation: `${worker.assignedWork.assignedInRange} assigned work item${worker.assignedWork.assignedInRange === 1 ? '' : 's'} and no completed assigned work were observed in the selected range.`,
      evidence: { assignedInRange: worker.assignedWork.assignedInRange, completedInRange: worker.assignedWork.completedInRange },
      proposedReview: 'Review task scope, dependencies, and the current assignment with the project team before considering any configuration change.', safeguards: common,
    })
  }
  if (worker.runtimeAttempts.createdInRange > 0 && worker.runtimeAttempts.acceptedInRange === 0) {
    recommendations.push({
      id: `${prefix}runtime`, kind: 'RUNTIME_OUTCOME_REVIEW', employee: worker.employee,
      observation: `${worker.runtimeAttempts.createdInRange} runtime attempt${worker.runtimeAttempts.createdInRange === 1 ? '' : 's'} and no human-accepted runtime result were observed in the selected range.`,
      evidence: { createdInRange: worker.runtimeAttempts.createdInRange, succeededInRange: worker.runtimeAttempts.succeededInRange, acceptedInRange: worker.runtimeAttempts.acceptedInRange },
      proposedReview: 'Review the task and its human-review outcomes. Do not infer a Skill, SOUL, model, or runtime change from this aggregate alone.', safeguards: common,
    })
  }
  if (worker.governedToolExecutions.failedInRange > 0 && worker.governedToolExecutions.failedInRange >= worker.governedToolExecutions.succeededInRange) {
    recommendations.push({
      id: `${prefix}tool`, kind: 'TOOL_FAILURE_REVIEW', employee: worker.employee,
      observation: `${worker.governedToolExecutions.failedInRange} governed Tool execution failure${worker.governedToolExecutions.failedInRange === 1 ? '' : 's'} and ${worker.governedToolExecutions.succeededInRange} success${worker.governedToolExecutions.succeededInRange === 1 ? '' : 'es'} were observed in the selected range.`,
      evidence: { succeededInRange: worker.governedToolExecutions.succeededInRange, failedInRange: worker.governedToolExecutions.failedInRange },
      proposedReview: 'Review the governed execution history and connection health. Do not add or broaden a permission, capability, connection, or policy exception from this aggregate.', safeguards: common,
    })
  }
  return recommendations
}

/**
 * A transparent, read-only projection of M20 evidence.  It deliberately has
 * no mutation path, AI/provider call, durable recommendation record, or link
 * to an approval executor.
 */
export function buildAgentCoachRecommendations(workers: WorkforceWorker[]) {
  return workers
    .flatMap(worker => recommendationsFor(worker))
    .slice(0, MAX_RECOMMENDATIONS)
}

export async function getAgentCoachRecommendations(context: ProjectContext, range: ScorecardRange) {
  const scorecard = await getWorkforceScorecard(context, range)
  const recommendations = buildAgentCoachRecommendations(scorecard.workers)

  return {
    projectId: scorecard.projectId,
    generatedAt: new Date().toISOString(),
    range: scorecard.range,
    access: scorecard.access,
    source: {
      type: 'M20_READ_ONLY_WORKFORCE_SCORECARD',
      statement: 'Recommendations are deterministic projections of redacted M20 aggregates. They are not ratings, predictions, provider analysis, or billing evidence.',
      actualProviderCost: { availability: 'UNKNOWN' as const, reason: 'NO_PROVIDER_USAGE_RECORD' as const },
    },
    limits: { maxRecommendations: MAX_RECOMMENDATIONS, returned: recommendations.length },
    recommendations,
  }
}
