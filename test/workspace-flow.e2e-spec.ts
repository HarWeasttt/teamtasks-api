import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, registerUser, resetDatabase, TestUser } from './utils';

/**
 * One realistic scenario across modules:
 * owner creates workspace + project, adds a member, both work on tasks,
 * an outsider cannot see anything.
 */
describe('Workspaces, projects, tasks, comments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let workspaceId: string;
  let projectId: string;

  const as = (user: TestUser) => {
    const server = request(app.getHttpServer());
    const auth = { Authorization: `Bearer ${user.accessToken}` };
    return {
      get: (url: string) => server.get(url).set(auth),
      post: (url: string) => server.post(url).set(auth),
      patch: (url: string) => server.patch(url).set(auth),
      delete: (url: string) => server.delete(url).set(auth),
    };
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
    [owner, member, outsider] = await Promise.all([
      registerUser(app, 'Owner'),
      registerUser(app, 'Member'),
      registerUser(app, 'Outsider'),
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('owner creates a workspace and becomes OWNER', async () => {
    const ws = await as(owner).post('/workspaces').send({ name: 'Acme' }).expect(201);
    workspaceId = ws.body.id;

    const detail = await as(owner).get(`/workspaces/${workspaceId}`).expect(200);
    expect(detail.body).toMatchObject({ name: 'Acme', myRole: 'OWNER' });
  });

  it('owner adds a member by email; duplicates are rejected', async () => {
    await as(owner)
      .post(`/workspaces/${workspaceId}/members`)
      .send({ email: member.email })
      .expect(201);
    await as(owner)
      .post(`/workspaces/${workspaceId}/members`)
      .send({ email: member.email })
      .expect(409);

    const members = await as(member).get(`/workspaces/${workspaceId}/members`).expect(200);
    expect(members.body.meta.total).toBe(2);
  });

  it('outsiders get 404, members without rights get 403', async () => {
    await as(outsider).get(`/workspaces/${workspaceId}`).expect(404);
    await as(member)
      .post(`/workspaces/${workspaceId}/projects`)
      .send({ name: 'Not allowed' })
      .expect(403);
    await as(member).delete(`/workspaces/${workspaceId}`).expect(403);
  });

  it('admin creates a project', async () => {
    const project = await as(owner)
      .post(`/workspaces/${workspaceId}/projects`)
      .send({ name: 'Backend', description: 'API v2' })
      .expect(201);
    projectId = project.body.id;
    await as(outsider).get(`/projects/${projectId}`).expect(404);
  });

  it('members create tasks; assignee must belong to the workspace', async () => {
    const tasks = [
      { title: 'Design schema', priority: 'HIGH', status: 'DONE', dueDate: '2026-11-01T00:00:00Z' },
      {
        title: 'Login endpoint',
        priority: 'URGENT',
        assigneeId: member.id,
        dueDate: '2026-11-10T00:00:00Z',
      },
      { title: 'Swagger docs', priority: 'LOW', status: 'IN_PROGRESS' },
      {
        title: 'Refresh tokens',
        priority: 'HIGH',
        assigneeId: member.id,
        description: 'rotate + login reuse check',
      },
    ];
    for (const t of tasks) {
      await as(member).post(`/projects/${projectId}/tasks`).send(t).expect(201);
    }

    await as(owner)
      .post(`/projects/${projectId}/tasks`)
      .send({ title: 'Sneaky', assigneeId: outsider.id })
      .expect(400);
  });

  it('paginates task lists', async () => {
    const page1 = await as(owner).get(`/projects/${projectId}/tasks?limit=3&page=1`).expect(200);
    expect(page1.body.data).toHaveLength(3);
    expect(page1.body.meta).toEqual({ page: 1, limit: 3, total: 4, totalPages: 2 });

    const page2 = await as(owner).get(`/projects/${projectId}/tasks?limit=3&page=2`).expect(200);
    expect(page2.body.data).toHaveLength(1);
  });

  it('filters by status, priority, assignee, search and due date', async () => {
    const base = `/projects/${projectId}/tasks`;
    const titles = async (qs: string) =>
      (await as(owner).get(`${base}?${qs}`).expect(200)).body.data.map(
        (t: { title: string }) => t.title,
      );

    expect(await titles('status=TODO')).toHaveLength(2);
    expect(await titles('status=DONE,IN_PROGRESS&sortBy=title&order=asc')).toEqual([
      'Design schema',
      'Swagger docs',
    ]);
    expect(await titles(`assigneeId=${member.id}&priority=URGENT`)).toEqual(['Login endpoint']);
    // search matches title OR description, case-insensitive
    expect((await titles('search=LOGIN')).sort()).toEqual(['Login endpoint', 'Refresh tokens']);
    expect(await titles('dueBefore=2026-11-05T00:00:00Z')).toEqual(['Design schema']);
    expect(await titles('sortBy=priority&order=desc&limit=1')).toEqual(['Login endpoint']);

    await as(owner).get(`${base}?status=WRONG`).expect(400);
    await as(owner).get(`${base}?limit=1000`).expect(400);
  });

  it('project detail shows task counts per status', async () => {
    const res = await as(member).get(`/projects/${projectId}`).expect(200);
    expect(res.body.taskStats).toEqual({ TODO: 2, DONE: 1, IN_PROGRESS: 1 });
  });

  it('updates, comments on and deletes tasks with the right permissions', async () => {
    const created = await as(owner)
      .post(`/projects/${projectId}/tasks`)
      .send({ title: 'Owner task' })
      .expect(201);
    const taskId: string = created.body.id;

    const updated = await as(member)
      .patch(`/tasks/${taskId}`)
      .send({ status: 'IN_REVIEW', assigneeId: member.id })
      .expect(200);
    expect(updated.body).toMatchObject({ status: 'IN_REVIEW', assignee: { id: member.id } });

    const comment = await as(member)
      .post(`/tasks/${taskId}/comments`)
      .send({ body: 'On it' })
      .expect(201);
    const list = await as(owner).get(`/tasks/${taskId}/comments`).expect(200);
    expect(list.body.data[0]).toMatchObject({ body: 'On it', author: { id: member.id } });
    await as(outsider).get(`/tasks/${taskId}/comments`).expect(404);

    // member is not the creator and not an admin
    await as(member).delete(`/tasks/${taskId}`).expect(403);
    // owner (admin+) can delete comments and tasks
    await as(owner).delete(`/comments/${comment.body.id}`).expect(204);
    await as(owner).delete(`/tasks/${taskId}`).expect(204);
    await as(owner).get(`/tasks/${taskId}`).expect(404);
  });

  it('rejects malformed ids with 400', async () => {
    await as(owner).get('/tasks/not-a-uuid').expect(400);
  });

  it('member can leave; owner cannot be removed', async () => {
    await as(member).delete(`/workspaces/${workspaceId}/members/${owner.id}`).expect(400);
    await as(member).delete(`/workspaces/${workspaceId}/members/${member.id}`).expect(204);
    await as(member).get(`/workspaces/${workspaceId}`).expect(404);
  });
});
