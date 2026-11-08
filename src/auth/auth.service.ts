import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PublicUser, publicUserSelect } from './user.select';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** access token lifetime in seconds */
  expiresIn: number;
}

export interface AccessPayload {
  sub: string;
  email: string;
}

interface RefreshPayload {
  sub: string;
  jti: string;
}

const BCRYPT_ROUNDS = 10;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email is already registered');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      },
      select: publicUserSelect,
    });
    return { user, tokens: await this.issueTokens(user.id, user.email) };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Same error for "no such user" and "wrong password" - don't reveal which emails exist.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const { id, email, name, createdAt } = user;
    return { user: { id, email, name, createdAt }, tokens: await this.issueTokens(id, email) };
  }

  /**
   * Refresh token rotation: every refresh token is single-use.
   * Presenting an already-used token means it was probably stolen,
   * so all sessions of that user are revoked.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyRefresh(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { id: payload.jti } });

    if (
      !stored ||
      stored.userId !== payload.sub ||
      !this.hashMatches(refreshToken, stored.tokenHash)
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (stored.revokedAt) {
      this.logger.warn(`Refresh token reuse detected for user ${stored.userId}`);
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Conditional update guards against two parallel refreshes with the same token.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new UnauthorizedException('Refresh token has been revoked');

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    return this.issueTokens(user.id, user.email);
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = await this.verifyRefresh(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<PublicUser> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
  }

  private async issueTokens(userId: string, email: string): Promise<TokenPair> {
    const accessTtl = this.config.getOrThrow<number>('JWT_ACCESS_TTL');
    const refreshTtl = this.config.getOrThrow<number>('JWT_REFRESH_TTL');
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync({ sub: userId, email } satisfies AccessPayload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });
    const refreshToken = await this.jwt.signAsync({ sub: userId, jti } satisfies RefreshPayload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl,
    });

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });
    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  private async verifyRefresh(token: string): Promise<RefreshPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private hashMatches(token: string, expectedHash: string): boolean {
    const a = Buffer.from(hashToken(token));
    const b = Buffer.from(expectedHash);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
