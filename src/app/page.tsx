import { redirect } from 'next/navigation'

import { ProjectContextError, requirePersistentUser } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'

export default async function RogerOSHome() {
  let user
  try {
    user = await requirePersistentUser()
  } catch (error) {
    if (error instanceof ProjectContextError && error.code === 'UNAUTHENTICATED') redirect('/login')
    throw error
  }
  const project = await prisma.project.findFirst({
    where: { members: { some: { organizationMember: { userId: user.id } } } },
    select: { slug: true },
    orderBy: { name: 'asc' },
  })
  if (project) redirect(`/p/${project.slug}`)
  return <main className="rogeros-entry"><div className="rogeros-entry-mark" aria-hidden>R</div><p className="eyebrow">RogerOS by Green Pixxel</p><h1>Your workspace is ready for a project.</h1><p>Ask an organization owner to add you to a project, then return here.</p></main>
}
