import { notFound } from 'next/navigation'
import { ProjectContextError, requireProjectContextBySlug } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'
import { canDecideApproval } from '@/lib/approval-rules'
import { ApprovalWorkspace } from '@/components/approval-workspace'

export default async function ApprovalsPage({ params }: { params: Promise<{ projectSlug: string }> }) { try { const { projectSlug } = await params; const context = await requireProjectContextBySlug(projectSlug); const [approvals,events]=await Promise.all([prisma.approvalRequest.findMany({where:{projectId:context.project.id},include:{requestedByEmployee:{include:{employee:true}},projectTool:{include:{tool:true}},task:true,auditEvents:{orderBy:{createdAt:'asc'}}},orderBy:{requestedAt:'desc'}}),prisma.auditEvent.findMany({where:{projectId:context.project.id},include:{actorProjectMember:{include:{organizationMember:{include:{user:true}}}},actorEmployeeAssignment:{include:{employee:true}}},orderBy:{createdAt:'desc'},take:200})]); return <ApprovalWorkspace project={context.project} canDecide={canDecideApproval(context.project.role)} initialApprovals={approvals} initialEvents={events} /> } catch(error) { if(error instanceof ProjectContextError) notFound(); throw error } }
