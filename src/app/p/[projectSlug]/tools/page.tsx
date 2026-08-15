/* eslint-disable react-hooks/error-boundaries */
import { notFound } from 'next/navigation'
import { ProjectContextError, requireProjectContextBySlug } from '@/lib/project-context'
import { ToolWorkspace } from '@/components/tool-workspace'
import { prisma } from '@/lib/prisma'
import { ensureBuiltInToolCatalog } from '@/lib/tool-permissions'

export default async function ToolsPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  try { const { projectSlug } = await params; const context = await requireProjectContextBySlug(projectSlug); await ensureBuiltInToolCatalog(); const [catalog,tools,assignments,connections,executions]=await Promise.all([prisma.toolDefinition.findMany({where:{builtIn:true},orderBy:{name:'asc'}}),prisma.projectTool.findMany({where:{projectId:context.project.id},include:{tool:true,_count:{select:{permissions:true}}},orderBy:{tool:{name:'asc'}}}),prisma.employeeProjectAssignment.findMany({where:{projectId:context.project.id},include:{employee:true},orderBy:{employee:{name:'asc'}}}),prisma.projectConnection.findMany({where:{projectId:context.project.id},include:{projectTool:{include:{tool:true}}},orderBy:{name:'asc'}}),prisma.toolExecution.findMany({where:{projectId:context.project.id},include:{projectTool:{include:{tool:true}}},orderBy:{createdAt:'desc'},take:8})]); return <ToolWorkspace project={context.project} canManage={context.project.role === 'OWNER' || context.project.role === 'ADMIN'} initialCatalog={catalog} initialTools={tools} initialAssignments={assignments} initialConnections={connections} initialExecutions={executions} /> } catch (error) { if (error instanceof ProjectContextError) notFound(); throw error }
}
