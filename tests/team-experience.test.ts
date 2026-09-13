import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { composerAction, fallbackAvatarPresetKey, isModelCommand, isTeamAvatarPresetKey, teamAvatarPresets } from "../src/lib/team-ui-logic";
import { setTeamAvatarPreset } from "../src/lib/team-avatar";

test("T1 composer sends Enter, preserves Shift+Enter and IME, and intercepts /model", () => {
  assert.equal(composerAction({ key: "Enter", shiftKey: false, isComposing: false, sending: false, value: "hello" }), "send");
  assert.equal(composerAction({ key: "Enter", shiftKey: true, isComposing: false, sending: false, value: "hello" }), "newline");
  assert.equal(composerAction({ key: "Enter", shiftKey: false, isComposing: true, sending: false, value: "変換中" }), "newline");
  assert.equal(composerAction({ key: "Enter", shiftKey: false, isComposing: false, sending: true, value: "hello" }), "newline");
  assert.equal(composerAction({ key: "Enter", shiftKey: false, isComposing: false, sending: false, value: " /MODEL " }), "model");
  assert.equal(isModelCommand(" /model "), true);
});

test("T1 avatar catalog is bounded, stable, local, and deterministic", () => {
  assert.equal(teamAvatarPresets.length, 8);
  assert.equal(new Set(teamAvatarPresets.map((preset) => preset.key)).size, teamAvatarPresets.length);
  assert.equal(teamAvatarPresets.every((preset) => preset.name && !JSON.stringify(preset).includes("http")), true);
  assert.equal(isTeamAvatarPresetKey("fox"), true);
  assert.equal(isTeamAvatarPresetKey("https://example.invalid/avatar.png"), false);
  assert.equal(fallbackAvatarPresetKey("default"), fallbackAvatarPresetKey("default"));
});

test("T1 avatar persistence enforces manager authority and project isolation", async (t) => {
  const prisma = new PrismaClient();
  const suffix = randomUUID().replaceAll("-", "");
  const organization = await prisma.organization.create({ data: { name: `T1 ${suffix}`, slug: `t1-${suffix}` } });
  const [owner, viewer] = await Promise.all([
    prisma.user.create({ data: { email: `t1-owner-${suffix}@example.invalid` } }),
    prisma.user.create({ data: { email: `t1-viewer-${suffix}@example.invalid` } }),
  ]);
  const [ownerMember, viewerMember] = await Promise.all([
    prisma.organizationMember.create({ data: { userId: owner.id, organizationId: organization.id, role: "OWNER" } }),
    prisma.organizationMember.create({ data: { userId: viewer.id, organizationId: organization.id, role: "VIEWER" } }),
  ]);
  const [alpha, beta] = await Promise.all([
    prisma.project.create({ data: { organizationId: organization.id, name: "Alpha", slug: `alpha-${suffix}` } }),
    prisma.project.create({ data: { organizationId: organization.id, name: "Beta", slug: `beta-${suffix}` } }),
  ]);
  const [alphaOwner, alphaViewer] = await Promise.all([
    prisma.projectMember.create({ data: { projectId: alpha.id, organizationId: organization.id, organizationMemberId: ownerMember.id, role: "OWNER" } }),
    prisma.projectMember.create({ data: { projectId: alpha.id, organizationId: organization.id, organizationMemberId: viewerMember.id, role: "VIEWER" } }),
  ]);
  const employee = await prisma.employee.create({ data: { name: "Reusable employee", role: "Operations", type: "SYSTEM" } });
  const [alphaAssignment, betaAssignment] = await Promise.all([
    prisma.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: alpha.id } }),
    prisma.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: beta.id } }),
  ]);
  const context = (user: typeof owner, role: "OWNER" | "VIEWER") => ({ user: { id: user.id, email: user.email! }, organization: { id: organization.id, name: organization.name, slug: organization.slug, role }, project: { id: alpha.id, name: alpha.name, slug: alpha.slug, role } });
  t.after(async () => { await prisma.organization.delete({ where: { id: organization.id } }); await prisma.employee.delete({ where: { id: employee.id } }); await prisma.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } }); await prisma.$disconnect(); });

  await setTeamAvatarPreset(context(owner, "OWNER"), alphaAssignment.id, "owl");
  assert.equal((await prisma.employeeProjectAssignment.findUniqueOrThrow({ where: { id: alphaAssignment.id } })).avatarPresetKey, "owl");
  assert.equal((await prisma.employeeProjectAssignment.findUniqueOrThrow({ where: { id: betaAssignment.id } })).avatarPresetKey, null);
  await assert.rejects(setTeamAvatarPreset(context(viewer, "VIEWER"), alphaAssignment.id, "fox"), /FORBIDDEN/);
  await assert.rejects(setTeamAvatarPreset(context(owner, "OWNER"), betaAssignment.id, "fox"), /ASSIGNMENT_NOT_FOUND/);
  assert.equal(await prisma.auditEvent.count({ where: { projectId: alpha.id, actorProjectMemberId: alphaOwner.id, eventType: "team.avatar.updated" } }), 1);
  assert.equal(await prisma.auditEvent.count({ where: { actorProjectMemberId: alphaViewer.id, eventType: "team.avatar.updated" } }), 0);
});
