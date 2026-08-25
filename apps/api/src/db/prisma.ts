import { PrismaClient } from "@prisma/client";

export interface DatabaseHealth {
  check(): Promise<"ok" | "unavailable">;
  disconnect(): Promise<void>;
}

export function createDatabaseHealth(
  client = new PrismaClient(),
): DatabaseHealth {
  return {
    async check() {
      try {
        await client.$queryRaw`SELECT 1`;
        return "ok";
      } catch {
        return "unavailable";
      }
    },
    async disconnect() {
      await client.$disconnect();
    },
  };
}
