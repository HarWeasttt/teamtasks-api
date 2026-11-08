import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

export async function createTestApp(): Promise<{
  app: INestApplication<App>;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** Wipes all data; CASCADE follows foreign keys to every dependent table. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User", "Workspace" CASCADE');
}

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(app: INestApplication<App>, name: string): Promise<TestUser> {
  const email = `${name.toLowerCase()}@example.com`;
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, name, password: 'Str0ngPassw0rd!' })
    .expect(201);
  return { id: res.body.user.id, email, ...res.body.tokens };
}
