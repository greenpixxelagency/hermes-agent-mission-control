import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ManagedAssetError,
  createManagedAsset,
  readManagedAsset,
  retireManagedAsset,
  setUploadedAvatar,
} from "../src/lib/managed-assets.ts";
import { prisma } from "../src/lib/prisma.ts";
import type { ProjectContext } from "../src/lib/project-context.ts";

test("message attachments cannot cross project ownership", async () => {
  const membership = await prisma.organizationMember.findFirst({
    include: { user: true },
  });
  assert.ok(
    membership,
    "local test database must contain an organization member",
  );
  const suffix = randomUUID().slice(0, 8);
  const first = await prisma.project.create({
    data: {
      organizationId: membership.organizationId,
      name: `Asset isolation A ${suffix}`,
      slug: `asset-a-${suffix}`,
    },
  });
  const second = await prisma.project.create({
    data: {
      organizationId: membership.organizationId,
      name: `Asset isolation B ${suffix}`,
      slug: `asset-b-${suffix}`,
    },
  });
  const storageRoot = await mkdtemp(
    path.join(os.tmpdir(), "rogeros-assets-db-"),
  );
  process.env.ROGEROS_ASSET_STORAGE_PROVIDER = "local";
  process.env.ROGEROS_ASSET_LOCAL_ROOT = storageRoot;
  try {
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: membership.organizationId },
    });
    const [memberA, memberB] = await Promise.all([
      prisma.projectMember.create({
        data: {
          projectId: first.id,
          organizationId: membership.organizationId,
          organizationMemberId: membership.id,
          role: "OWNER",
        },
      }),
      prisma.projectMember.create({
        data: {
          projectId: second.id,
          organizationId: membership.organizationId,
          organizationMemberId: membership.id,
          role: "OWNER",
        },
      }),
    ]);
    assert.ok(memberA.id && memberB.id);
    const context = (project: typeof first): ProjectContext => ({
      user: {
        id: membership.userId,
        email: membership.user.email || "test@example.invalid",
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: membership.role,
      },
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        role: "OWNER",
      },
    });
    const [conversationA, conversationB] = await Promise.all([
      prisma.conversation.create({
        data: {
          projectId: first.id,
          type: "DIRECT",
          createdById: membership.userId,
        },
      }),
      prisma.conversation.create({
        data: {
          projectId: second.id,
          type: "DIRECT",
          createdById: membership.userId,
        },
      }),
    ]);
    const [messageA, messageB] = await Promise.all([
      prisma.message.create({
        data: {
          projectId: first.id,
          conversationId: conversationA.id,
          authorUserId: membership.userId,
          body: "A",
        },
      }),
      prisma.message.create({
        data: {
          projectId: second.id,
          conversationId: conversationB.id,
          authorUserId: membership.userId,
          body: "B",
        },
      }),
    ]);
    const asset = await createManagedAsset(
      context(first),
      "DOCUMENT",
      new File(["safe"], "safe.txt", { type: "text/plain" }),
    );
    await prisma.messageAttachment.create({
      data: { projectId: first.id, messageId: messageA.id, assetId: asset.id },
    });
    await assert.rejects(
      prisma.messageAttachment.create({
        data: {
          projectId: second.id,
          messageId: messageB.id,
          assetId: asset.id,
        },
      }),
    );
    assert.equal(
      await prisma.messageAttachment.count({ where: { projectId: second.id } }),
      0,
    );
    await assert.rejects(
      readManagedAsset(context(second), asset.id),
      (error: unknown) =>
        error instanceof ManagedAssetError && error.code === "ASSET_NOT_FOUND",
    );
    const employee = await prisma.employee.findFirstOrThrow();
    const assignmentB = await prisma.employeeProjectAssignment.create({
      data: { projectId: second.id, employeeId: employee.id },
    });
    await assert.rejects(
      setUploadedAvatar(context(first), assignmentB.id, asset.id),
      (error: unknown) =>
        error instanceof ManagedAssetError && error.code === "NOT_FOUND",
    );
    await retireManagedAsset(asset.id);
  } finally {
    await prisma.project.deleteMany({
      where: { id: { in: [first.id, second.id] } },
    });
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test.after(async () => prisma.$disconnect());
