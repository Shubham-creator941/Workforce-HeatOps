import type { PrismaClient } from "@prisma/client";
import {
  PlanningRunSchema,
  type PlanningRun,
  type PlanningRunStatus,
} from "@heatops/contracts";

export class PlanningPersistenceError extends Error {
  constructor() {
    super("Planning run persistence failed");
  }
}
export interface PlanningRunStore {
  create(run: PlanningRun): Promise<void>;
  save(run: PlanningRun, expectedStatus: PlanningRunStatus): Promise<void>;
  get(id: string): Promise<PlanningRun | null>;
}
export function createPrismaPlanningRunStore(
  client: PrismaClient,
): PlanningRunStore {
  return {
    async create(run) {
      try {
        const payload = JSON.stringify(PlanningRunSchema.parse(run));
        await client.planningRun.create({
          data: { id: run.id, status: run.status, payload },
        });
      } catch {
        throw new PlanningPersistenceError();
      }
    },
    async save(run, expectedStatus) {
      try {
        const payload = JSON.stringify(PlanningRunSchema.parse(run));
        const saved = await client.planningRun.updateMany({
          where: { id: run.id, status: expectedStatus },
          data: { status: run.status, payload },
        });
        if (saved.count !== 1) throw new PlanningPersistenceError();
      } catch {
        throw new PlanningPersistenceError();
      }
    },
    async get(id) {
      try {
        const row = await client.planningRun.findUnique({ where: { id } });
        if (!row) return null;
        const run = PlanningRunSchema.parse(JSON.parse(row.payload));
        if (run.id !== row.id || run.status !== row.status)
          throw new PlanningPersistenceError();
        return run;
      } catch {
        throw new PlanningPersistenceError();
      }
    },
  };
}
