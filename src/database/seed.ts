/**
 * Idempotent demo data: a demo account with one workspace, a project and a few tasks.
 * Safe to run on every deploy - it does nothing if the demo workspace already exists.
 */
import { PrismaClient, TaskPriority, TaskStatus, WorkspaceRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export const DEMO_EMAIL = 'demo@teamtasks.dev';
export const DEMO_PASSWORD = 'DemoPassw0rd!';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const demo = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: {},
      create: { email: DEMO_EMAIL, name: 'Demo User', passwordHash },
    });
    const teammate = await prisma.user.upsert({
      where: { email: 'kasia@teamtasks.dev' },
      update: {},
      create: { email: 'kasia@teamtasks.dev', name: 'Kasia Nowak', passwordHash },
    });

    const existing = await prisma.workspace.findFirst({
      where: { name: 'Demo Workspace', members: { some: { userId: demo.id } } },
    });
    if (existing) {
      console.log('Seed: demo data already present');
      return;
    }

    const day = 24 * 60 * 60 * 1000;
    await prisma.workspace.create({
      data: {
        name: 'Demo Workspace',
        members: {
          create: [
            { userId: demo.id, role: WorkspaceRole.OWNER },
            { userId: teammate.id, role: WorkspaceRole.MEMBER },
          ],
        },
        projects: {
          create: {
            name: 'Website relaunch',
            description: 'New marketing site and customer portal',
            tasks: {
              create: [
                {
                  title: 'Collect requirements',
                  status: TaskStatus.DONE,
                  priority: TaskPriority.HIGH,
                  creatorId: demo.id,
                },
                {
                  title: 'Design database schema',
                  status: TaskStatus.IN_REVIEW,
                  priority: TaskPriority.HIGH,
                  creatorId: demo.id,
                  assigneeId: teammate.id,
                },
                {
                  title: 'Implement login page',
                  status: TaskStatus.IN_PROGRESS,
                  priority: TaskPriority.URGENT,
                  creatorId: demo.id,
                  assigneeId: demo.id,
                  dueDate: new Date(Date.now() + 3 * day),
                },
                {
                  title: 'Set up CI pipeline',
                  status: TaskStatus.TODO,
                  priority: TaskPriority.MEDIUM,
                  creatorId: teammate.id,
                  assigneeId: teammate.id,
                  dueDate: new Date(Date.now() + 7 * day),
                },
                {
                  title: 'Write API documentation',
                  status: TaskStatus.TODO,
                  priority: TaskPriority.LOW,
                  creatorId: demo.id,
                },
              ],
            },
          },
        },
      },
    });
    console.log(`Seed: created demo data, log in as ${DEMO_EMAIL}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
