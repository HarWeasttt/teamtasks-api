import { ConflictException, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, hashToken } from './auth.service';

const config: Record<string, string | number> = {
  JWT_ACCESS_SECRET: 'unit-access-secret-unit-access-secret',
  JWT_REFRESH_SECRET: 'unit-refresh-secret-unit-refresh-secret',
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 3600,
};

const user = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'anna@example.com',
  name: 'Anna',
  createdAt: new Date(),
  updatedAt: new Date(),
  passwordHash: '',
};

function createPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeAll(async () => {
    Logger.overrideLogger(false); // keep test output clean
    user.passwordHash = await bcrypt.hash('Str0ngPassw0rd!', 4);
  });

  beforeEach(() => {
    prisma = createPrismaMock();
    const configService = { getOrThrow: (key: string) => config[key] } as unknown as ConfigService;
    service = new AuthService(prisma as unknown as PrismaService, new JwtService(), configService);
  });

  /** Logs in and returns the refresh token plus the DB row the service stored for it. */
  async function loginAndCaptureRefresh() {
    prisma.user.findUnique.mockResolvedValue(user);
    const { tokens } = await service.login({ email: user.email, password: 'Str0ngPassw0rd!' });
    const stored = prisma.refreshToken.create.mock.calls[0][0].data;
    return { tokens, stored };
  }

  describe('register', () => {
    it('rejects an email that is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      await expect(
        service.register({ email: user.email, name: 'Anna', password: 'Str0ngPassw0rd!' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('stores a bcrypt hash, never the plain password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: user.id, email: user.email });

      await service.register({ email: user.email, name: 'Anna', password: 'Str0ngPassw0rd!' });

      const { passwordHash } = prisma.user.create.mock.calls[0][0].data;
      expect(passwordHash).not.toBe('Str0ngPassw0rd!');
      await expect(bcrypt.compare('Str0ngPassw0rd!', passwordHash)).resolves.toBe(true);
    });
  });

  describe('login', () => {
    it('returns tokens and stores only a hash of the refresh token', async () => {
      const { tokens, stored } = await loginAndCaptureRefresh();
      expect(tokens.accessToken).toEqual(expect.any(String));
      expect(stored.tokenHash).toBe(hashToken(tokens.refreshToken));
      expect(stored.tokenHash).not.toBe(tokens.refreshToken);
    });

    it.each([
      ['unknown email', null],
      ['wrong password', 'wrong'],
    ])('rejects %s with the same 401', async (_case, variant) => {
      prisma.user.findUnique.mockResolvedValue(variant === null ? null : user);
      await expect(
        service.login({ email: user.email, password: 'wrong-password' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
    });
  });

  describe('refresh', () => {
    it('rotates: revokes the used token and issues a new pair', async () => {
      const { tokens, stored } = await loginAndCaptureRefresh();
      prisma.refreshToken.findUnique.mockResolvedValue({ ...stored, revokedAt: null });
      prisma.user.findUniqueOrThrow.mockResolvedValue(user);

      const next = await service.refresh(tokens.refreshToken);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(next.refreshToken).not.toBe(tokens.refreshToken);
    });

    it('detects reuse of a revoked token and revokes all user sessions', async () => {
      const { tokens, stored } = await loginAndCaptureRefresh();
      prisma.refreshToken.findUnique.mockResolvedValue({ ...stored, revokedAt: new Date() });

      await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects an expired token', async () => {
      const { tokens, stored } = await loginAndCaptureRefresh();
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...stored,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refresh(tokens.refreshToken)).rejects.toThrow('Refresh token expired');
    });

    it('rejects an access token used as a refresh token (different secret)', async () => {
      const { tokens } = await loginAndCaptureRefresh();
      await expect(service.refresh(tokens.accessToken)).rejects.toThrow('Invalid refresh token');
    });
  });
});
