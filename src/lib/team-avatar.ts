import { AuditActorType, ProjectRole } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import type { ProjectContext } from "@/lib/project-context";
import { prisma } from "@/lib/prisma";
import { isTeamAvatarPresetKey } from "@/lib/team-ui-logic";

export class TeamAvatarError extends Error {
  constructor(public code: "FORBIDDEN" | "INVALID_AVATAR" | "ASSIGNMENT_NOT_FOUND") { super(code); }
}

const managers = new Set<ProjectRole>(["OWNER", "ADMIN"]);

export async function setTeamAvatarPreset(context: ProjectContext, assignmentId: string, presetKey: unknown) {
  if (!managers.has(context.project.role)) throw new TeamAvatarError("FORBIDDEN");
  if (!isTeamAvatarPresetKey(presetKey) || !assignmentId || assignmentId.length > 160) throw new TeamAvatarError("INVALID_AVATAR");
  const [assignment, actor] = await Promise.all([
    prisma.employeeProjectAssignment.findFirst({ where: { id: assignmentId, projectId: context.project.id }, select: { id: true, avatarPresetKey: true } }),
    prisma.projectMember.findFirst({ where: { projectId: context.project.id, organizationMember: { userId: context.user.id } }, select: { id: true } }),
  ]);
  if (!assignment || !actor) throw new TeamAvatarError("ASSIGNMENT_NOT_FOUND");
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.employeeProjectAssignment.update({ where: { id: assignment.id }, data: { avatarPresetKey: presetKey }, select: { id: true, avatarPresetKey: true } });
    await recordAuditEvent({ projectId: context.project.id, eventType: "team.avatar.updated", actor: { type: AuditActorType.HUMAN, projectMemberId: actor.id }, targetType: "EmployeeProjectAssignment", targetId: assignment.id, summary: "Employee avatar preset updated", metadata: { previousPresetKey: assignment.avatarPresetKey, presetKey } }, tx);
    return result;
  });
  return updated;
}
