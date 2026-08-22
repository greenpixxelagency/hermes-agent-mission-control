import test from 'node:test'
import assert from 'node:assert/strict'
import { OrganizationRole, PrismaClient, ProjectRole } from '@prisma/client'

import { botProfileId } from '../src/lib/hermes-bots'
import type { HermesBot, HermesBotIdentitySpec, HermesBotSkill, HermesRuntimeAdapter } from '../src/lib/hermes-runtime-adapter'
import { assignSkill, listAvailableSkills, listEmployeeSkills, removeSkill } from '../src/lib/skills'

const prisma = new PrismaClient()
const suffix = `m15-${Date.now()}`
const timestamp = new Date().toISOString()
const hasCode = (error: unknown, code: string) => Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?:unknown }).code === code)

function adapterHarness() {
  let bot: HermesBot | null = null
  let observed: HermesBotSkill[] = [{ key: 'bundled-core', name: 'Bundled core', bundled: true }]
  let reconcileCalls = 0
  const desired: string[][] = []
  const adapter: HermesRuntimeAdapter = {
    health: async()=>({adapter:'m15-test',hermesReachable:true,hermesVersion:'0.20.5',runtimeIdentity:'isolated-test',timestamp}),
    ensureProfile:async()=>({status:'READY'}), dispatchExecution:async({executionId})=>({externalExecutionId:executionId,status:'SUCCEEDED',startedAt:timestamp,completedAt:timestamp,result:'ROGEROS_M15_SKILL_OK'}), getExecutionStatus:async externalExecutionId=>({externalExecutionId,status:'SUCCEEDED',startedAt:timestamp,completedAt:timestamp,result:'ROGEROS_M15_SKILL_OK'}),
    listBots:async()=>bot?[bot]:[], getBot:async profileId=>bot??{profileId,displayName:profileId,state:'ACTIVE'}, getBotRuntimeStatus:async profileId=>({profileId,assignmentState:'ACTIVE',healthy:true,skillsAvailable:true,botChatAvailable:true}),
    listBotSkills:async()=>observed, listBotRoutines:async()=>[], listBotSessions:async()=>[], getBotCapabilityFingerprint:async()=>({fingerprint:`m15-${reconcileCalls}`,skillCount:observed.length,botChatAvailable:true,routinesAvailable:true}),
    ensureBot:async(spec:HermesBotIdentitySpec)=>{bot={profileId:spec.profileId,displayName:spec.profileId,state:'ACTIVE'};return bot}, updateBotIdentity:async(profileId,metadata)=>({profileId,state:'ACTIVE',...metadata}), updateBotSoul:async profileId=>({profileId,displayName:profileId,state:'ACTIVE'}), updateBotRuntimeConfig:async(profileId,config)=>({profileId,displayName:profileId,state:'ACTIVE',modelProvider:config.provider,modelId:config.modelId}),
    reconcileBotSkills:async(_profileId,approvedSkills)=>{reconcileCalls+=1;desired.push([...approvedSkills]);observed=[{key:'bundled-core',name:'Bundled core',bundled:true},...approvedSkills.map(key=>({key,name:key,bundled:false}))];return observed}, suspendBotAssignment:async profileId=>({profileId,state:'SUSPENDED'}),resumeBotAssignment:async profileId=>({profileId,state:'ACTIVE'}),sendBotMessage:async(profileId,_message,correlationId)=>({profileId,correlationId,result:'ROGEROS_M15_SKILL_OK',completedAt:timestamp}),
  }
  return {adapter,desired,observed:()=>observed,reconcileCalls:()=>reconcileCalls}
}

test('M15 governs trusted employee skills, isolation, reconciliation, removal, and audit', async t => {
  const organization=await prisma.organization.create({data:{name:'M15 Test',slug:suffix}})
  const users=await Promise.all(['owner','operator'].map(role=>prisma.user.create({data:{email:`${suffix}-${role}@example.invalid`}})))
  const members=await Promise.all(users.map((user,index)=>prisma.organizationMember.create({data:{userId:user.id,organizationId:organization.id,role:(index?'OPERATOR':'OWNER') as OrganizationRole}})))
  const [vhalam,buddhaji]=await Promise.all(['vhalam','buddhaji'].map(name=>prisma.project.create({data:{organizationId:organization.id,name:`${name}-${suffix}`,slug:`${name}-${suffix}`}})))
  await Promise.all(members.map((member,index)=>prisma.projectMember.create({data:{projectId:vhalam.id,organizationId:organization.id,organizationMemberId:member.id,role:(index?'OPERATOR':'OWNER') as ProjectRole}})))
  await prisma.projectMember.create({data:{projectId:buddhaji.id,organizationId:organization.id,organizationMemberId:members[0].id,role:'OWNER'}})
  const employee=await prisma.employee.create({data:{systemKey:`chief-${suffix}`,name:'Chief of Staff',role:'Chief of Staff',type:'SYSTEM'}})
  const [vhalamEmployee,buddhajiEmployee]=await Promise.all([vhalam,buddhaji].map(project=>prisma.employeeProjectAssignment.create({data:{employeeId:employee.id,projectId:project.id}})))
  const runtime=await prisma.hermesRuntime.create({data:{key:`runtime-${suffix}`,name:'M15 isolated runtime'}})
  await prisma.hermesRuntimeAssignment.create({data:{projectId:vhalam.id,runtimeId:runtime.id,employeeProjectAssignmentId:vhalamEmployee.id,profileKey:botProfileId(vhalam.slug,employee.systemKey!)}})
  const trusted=await prisma.skill.create({data:{slug:`grounded-${suffix}`,name:'Grounded Research',description:'Safe cited research.',category:'Research',sourceIdentifier:`grounded-${suffix}`}})
  const untrusted=await prisma.skill.create({data:{slug:`untrusted-${suffix}`,name:'Untrusted',description:'Denied.',category:'Test',sourceIdentifier:`untrusted-${suffix}`,trustStatus:'UNTRUSTED'}})
  const disabled=await prisma.skill.create({data:{slug:`disabled-${suffix}`,name:'Disabled',description:'Denied.',category:'Test',sourceIdentifier:`disabled-${suffix}`,isEnabled:false}})
  const unsafe=await prisma.skill.create({data:{slug:`unsafe-${suffix}`,name:'Unsafe path',description:'Denied.',category:'Test',sourceIdentifier:'../arbitrary-skill'}})
  const context=(index:number,project=vhalam)=>({user:{id:users[index].id,email:users[index].email!},organization:{id:organization.id,name:organization.name,slug:organization.slug,role:(index?'OPERATOR':'OWNER') as OrganizationRole},project:{id:project.id,name:project.name,slug:project.slug,role:(index?'OPERATOR':'OWNER') as ProjectRole}})
  const harness=adapterHarness()
  t.after(async()=>{
    await prisma.organization.delete({where:{id:organization.id}})
    await prisma.skill.deleteMany({where:{id:{in:[trusted.id,untrusted.id,disabled.id,unsafe.id]}}})
    await prisma.hermesRuntime.delete({where:{id:runtime.id}})
    await prisma.employee.delete({where:{id:employee.id}})
    await prisma.user.deleteMany({where:{id:{in:users.map(user=>user.id)}}})
    await prisma.$disconnect()
  })

  assert.equal((await listAvailableSkills(context(0))).some(skill=>skill.id===trusted.id),true)
  assert.equal((await listAvailableSkills(context(0))).some(skill=>skill.id===untrusted.id||skill.id===disabled.id),false)
  await assert.rejects(assignSkill(context(1),vhalamEmployee.id,trusted.id,harness.adapter),error=>hasCode(error,'FORBIDDEN'))
  await assert.rejects(assignSkill(context(0),vhalamEmployee.id,'unknown-skill',harness.adapter),error=>hasCode(error,'SKILL_NOT_AVAILABLE'))
  await assert.rejects(assignSkill(context(0),vhalamEmployee.id,untrusted.id,harness.adapter),error=>hasCode(error,'SKILL_NOT_AVAILABLE'))
  await assert.rejects(assignSkill(context(0),vhalamEmployee.id,disabled.id,harness.adapter),error=>hasCode(error,'SKILL_NOT_AVAILABLE'))
  await assert.rejects(assignSkill(context(0),vhalamEmployee.id,unsafe.id,harness.adapter),error=>hasCode(error,'SKILL_NOT_AVAILABLE'))
  await assert.rejects(assignSkill(context(0,buddhaji),vhalamEmployee.id,trusted.id,harness.adapter),error=>hasCode(error,'EMPLOYEE_ASSIGNMENT_NOT_FOUND'))

  const assigned=await assignSkill(context(0),vhalamEmployee.id,trusted.id,harness.adapter)
  assert.equal(assigned.state,'ACTIVE');assert.equal(assigned.reconciliationStatus,'IN_SYNC')
  assert.deepEqual(harness.desired.at(-1),[trusted.sourceIdentifier])
  assert.equal(harness.observed().some(skill=>skill.key==='bundled-core'&&skill.bundled),true)
  assert.equal((await listEmployeeSkills(context(0),vhalamEmployee.id)).length,1)
  const revision=(await prisma.hermesRuntimeAssignment.findFirstOrThrow({where:{employeeProjectAssignmentId:vhalamEmployee.id}})).desiredSkillRevision
  const duplicate=await assignSkill(context(0),vhalamEmployee.id,trusted.id,harness.adapter)
  assert.equal(duplicate.id,assigned.id)
  assert.equal((await prisma.hermesRuntimeAssignment.findFirstOrThrow({where:{employeeProjectAssignmentId:vhalamEmployee.id}})).desiredSkillRevision,revision)

  const removed=await removeSkill(context(0),vhalamEmployee.id,trusted.id,harness.adapter)
  assert.equal(removed.state,'REMOVED');assert.equal(removed.reconciliationStatus,'IN_SYNC')
  assert.deepEqual(harness.desired.at(-1),[])
  assert.equal(harness.observed().some(skill=>skill.key==='bundled-core'&&skill.bundled),true)
  await assert.rejects(removeSkill(context(0),buddhajiEmployee.id,trusted.id,harness.adapter),error=>hasCode(error,'EMPLOYEE_ASSIGNMENT_NOT_FOUND'))
  const audits=await prisma.auditEvent.findMany({where:{projectId:vhalam.id,targetId:assigned.id}})
  for(const type of ['skill.assigned','skill.removed','skill.reconcile.requested','skill.reconcile.succeeded'])assert.equal(audits.some(event=>event.eventType===type),true)
  assert.equal(/authorization|bearer|password|token|secret/i.test(JSON.stringify(audits)),false)
})
