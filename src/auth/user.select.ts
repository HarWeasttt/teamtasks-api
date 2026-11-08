import { Prisma } from '@prisma/client';

/** Fields that are safe to return to clients (never passwordHash). */
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
