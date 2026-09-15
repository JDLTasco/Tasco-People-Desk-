import { prisma } from "../prisma";
import { newCorrelationId } from "../correlation";

// §12: "Each job is idempotent, generates a correlation_id at entry, and
// writes a job_runs row." One wrapper so every job does this identically --
// §12.1's liveness alert depends on job_runs actually being written
// consistently, so this isn't optional per-job boilerplate to skip.
export async function runJob<T>(jobName: string, fn: (correlationId: string) => Promise<T>): Promise<T> {
  const correlationId = newCorrelationId();
  const jobRun = await prisma.jobRun.create({
    data: { jobName, correlationId, status: "RUNNING" },
  });

  try {
    const result = await fn(correlationId);
    const itemsProcessed =
      typeof result === "object" && result !== null && "processed" in result
        ? Number((result as { processed: unknown }).processed)
        : undefined;
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "SUCCEEDED", completedAt: new Date(), itemsProcessed },
    });
    return result;
  } catch (err) {
    await prisma.jobRun.update({
      where: { id: jobRun.id },
      data: { status: "FAILED", completedAt: new Date(), error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
