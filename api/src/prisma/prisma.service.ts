import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function createPrismaMock() {
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    findUniqueOrThrow: async () => null,
    count: async () => 0,
    create: async (d?: { data?: Record<string, unknown> }) => d?.data ?? {},
    update: async (d?: { data?: Record<string, unknown> }) => d?.data ?? {},
    updateMany: async () => ({ count: 0 }),
    upsert: async (d?: { create?: Record<string, unknown> }) => d?.create ?? {},
    delete: async () => ({}),
    deleteMany: async () => ({ count: 0 }),
  };
  return new Proxy(
    {
      $connect: async () => undefined,
      $disconnect: async () => undefined,
    },
    {
      get(target, prop) {
        if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
        return noOp;
      },
    },
  );
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly fallback = createPrismaMock();

  constructor() {
    super();
    try {
      // Allow graceful fallback when DATABASE_URL is absent or unreachable.
      if (!process.env.DATABASE_URL) {
        console.warn('[AI Studio] DATABASE_URL not configured — using in-memory Prisma mock');
        return this.fallback as unknown as PrismaService;
      }
    } catch {
      console.warn('[AI Studio] Database not connected — using mock');
      return this.fallback as unknown as PrismaService;
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch {
      console.warn('[AI Studio] Database not connected — using mock');
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {
      /* ignore */
    }
  }
}
