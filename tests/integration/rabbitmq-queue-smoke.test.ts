import { afterAll, describe, expect, it } from "vitest";
import amqp from "amqplib";
import { RabbitGenerationQueue } from "@/server/queue/rabbitmq-queue";
import type { GenerationTaskMessage } from "@/types/queue";

const shouldRun = Boolean(process.env.RABBITMQ_URL && process.env.RUN_RABBITMQ_INTEGRATION === "1");
const runWithRabbitMq = shouldRun ? describe : describe.skip;

runWithRabbitMq("RabbitGenerationQueue smoke", () => {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const exchange = `resume.generation.it.${suffix}`;
  const queueName = `resume.generation.tasks.it.${suffix}`;
  const routingKey = `generation.requested.it.${suffix}`;
  const queue = new RabbitGenerationQueue({
    url: process.env.RABBITMQ_URL!,
    exchange,
    queueName,
    routingKey,
    prefetch: 1,
  });

  afterAll(async () => {
    await queue.close().catch(() => undefined);
    await cleanupRabbitMqTopology(process.env.RABBITMQ_URL!, queueName, exchange);
  });

  it(
    "publishes and consumes a generation task through a real broker",
    async () => {
      const message: GenerationTaskMessage = {
        taskId: `${suffix}-task`,
        resumeId: `${suffix}-resume`,
        userId: `${suffix}-user`,
        attempt: 0,
        reason: "initial",
      };

      const consumed = new Promise<GenerationTaskMessage>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out waiting for RabbitMQ smoke message")), 10_000);

        queue
          .consume(async (received) => {
            clearTimeout(timeout);
            resolve(received);
          })
          .catch((error: unknown) => {
            clearTimeout(timeout);
            reject(error);
          });
      });

      await queue.publish(message);

      await expect(consumed).resolves.toMatchObject({
        taskId: message.taskId,
        resumeId: message.resumeId,
        userId: message.userId,
      });
    },
    15_000,
  );
});

async function cleanupRabbitMqTopology(url: string, queueName: string, exchange: string) {
  const connection = await amqp.connect(url);
  try {
    const channel = await connection.createChannel();
    try {
      await channel.deleteQueue(queueName, { ifUnused: false, ifEmpty: false }).catch(() => undefined);
      await channel.deleteExchange(exchange).catch(() => undefined);
    } finally {
      await channel.close().catch(() => undefined);
    }
  } finally {
    await connection.close().catch(() => undefined);
  }
}
