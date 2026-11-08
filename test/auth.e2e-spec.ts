import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, registerUser, resetDatabase } from './utils';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('registers, returns tokens and never exposes the password hash', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ email: '  Anna@Example.com ', name: 'Anna', password: 'Str0ngPassw0rd!' })
      .expect(201);

    expect(res.body.user).toEqual({
      id: expect.any(String),
      email: 'anna@example.com', // normalized
      name: 'Anna',
      createdAt: expect.any(String),
    });
    expect(res.body.tokens).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: 900,
    });
  });

  it('rejects a duplicate email with 409', async () => {
    await http()
      .post('/auth/register')
      .send({ email: 'anna@example.com', name: 'Anna 2', password: 'Str0ngPassw0rd!' })
      .expect(409);
  });

  it('validates the body and rejects unknown fields', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ email: 'not-an-email', name: 'A', password: 'short', isAdmin: true })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: '/auth/register',
    });
    expect(res.body.message).toEqual(
      expect.arrayContaining(['property isAdmin should not exist', 'email must be an email']),
    );
  });

  it('protects routes and accepts a valid access token', async () => {
    await http().get('/auth/me').expect(401);
    await http().get('/auth/me').set('Authorization', 'Bearer garbage').expect(401);

    const login = await http()
      .post('/auth/login')
      .send({ email: 'anna@example.com', password: 'Str0ngPassw0rd!' })
      .expect(200);
    const me = await http()
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.tokens.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe('anna@example.com');
  });

  it('rejects a wrong password with 401', async () => {
    await http()
      .post('/auth/login')
      .send({ email: 'anna@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('rotates refresh tokens and kills the session family on reuse', async () => {
    const user = await registerUser(app, 'Rotator');

    const first = await http()
      .post('/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(200);
    const newRefresh: string = first.body.refreshToken;
    expect(newRefresh).not.toBe(user.refreshToken);

    // the old token was already used -> treated as stolen
    await http().post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    // ...and that also revoked the legitimately rotated one
    await http().post('/auth/refresh').send({ refreshToken: newRefresh }).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const user = await registerUser(app, 'Leaver');
    await http().post('/auth/logout').send({ refreshToken: user.refreshToken }).expect(204);
    await http().post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
  });
});
