import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

function mockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/tasks/1' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test' });

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('keeps HttpException status and validation messages', () => {
    const { host, status, json } = mockHost();
    filter.catch(new BadRequestException(['title must be a string']), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        message: ['title must be a string'],
        path: '/tasks/1',
      }),
    );
  });

  it.each([
    ['P2002', 409],
    ['P2025', 404],
    ['P2003', 400],
  ])('maps Prisma %s to HTTP %i', (code, expected) => {
    expect(filter.resolve(prismaError(code)).status).toBe(expected);
  });

  it('hides internal error details behind a generic 500', () => {
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    const { host, json } = mockHost();
    filter.catch(new Error('connection string leaked: postgres://secret'), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Internal server error' }),
    );
  });

  it('uses the exception message for simple HttpExceptions', () => {
    expect(filter.resolve(new NotFoundException('Task not found'))).toEqual({
      status: 404,
      message: 'Task not found',
    });
  });
});
