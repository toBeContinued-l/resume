import { describe, expect, it } from "vitest";
import { RabbitGenerationQueue } from "@/server/queue/rabbitmq-queue";
import type { GenerationTaskMessage } from "@/types/queue";

type FakeRawMessage = { content: Buffer };

class FakeChannel {
  published: Array<{ exchange: string; routingKey: string; body: Buffer; options: Record<string, unknown> }> = [];
  consumedQueue: string | null = null;
  consumer: ((message: FakeRawMessage | null) => Promise<void>) | null = null;
  acked: FakeRawMessage[] = [];
  nacked: Array<{ message: FakeRawMessage; requeue: boolean }> = [];
  assertions: string[] = [];
  prefetchCount: number | null = null;

  publish(exchange: string, routingKey: string, body: Buffer, options: Record<string, unknown>): boolean {
    this.published.push({ exchange, routingKey, body, options });
    return true;
  }

  async consume(queueName: string, handler: (message: FakeRawMessage | null) => Promise<void>) {
    this.consumedQueue = queueName;
    this.consumer = handler;
  }

  ack(message: FakeRawMessage) {
    this.acked.push(message);
  }

  nack(message: FakeRawMessage, _allUpTo: boolean, requeue: boolean) {
    this.nacked.push({ message, requeue });
  }

  async close() {}

  async assertExchange(exchange: string, type: "direct", options: { durable: boolean }) {
    this.assertions.push(`exchange:${exchange}:${type}:${options.durable}`);
  }

  async assertQueue(queueName: string, options: { durable: boolean }) {
    this.assertions.push(`queue:${queueName}:${options.durable}`);
  }

  async bindQueue(queueName: string, exchange: string, routingKey: string) {
    this.assertions.push(`bind:${queueName}:${exchange}:${routingKey}`);
  }

  async prefetch(count: number) {
    this.prefetchCount = count;
  }
}

function createQueue() {
  const channel = new FakeChannel();
  const amqp = {
    async connect() {
      return {
        async createChannel() {
          return channel;
        },
        async close() {},
      };
    },
  };
  const queue = new RabbitGenerationQueue({ url: "amqp://example", prefetch: 2, amqp });
  return { channel, queue };
}

const message: GenerationTaskMessage = {
  taskId: "task-1",
  resumeId: "resume-1",
  userId: "user-1",
  attempt: 0,
  reason: "initial",
};

describe("RabbitGenerationQueue", () => {
  it("declares durable topology and publishes persistent JSON messages", async () => {
    const { channel, queue } = createQueue();

    await queue.publish(message);

    expect(channel.assertions).toContain("exchange:resume.generation:direct:true");
    expect(channel.assertions).toContain("queue:resume.generation.tasks:true");
    expect(channel.assertions).toContain("bind:resume.generation.tasks:resume.generation:generation.requested");
    expect(channel.prefetchCount).toBe(2);
    expect(channel.published[0]?.exchange).toBe("resume.generation");
    expect(channel.published[0]?.routingKey).toBe("generation.requested");
    expect(channel.published[0]?.options).toMatchObject({ persistent: true, deliveryMode: 2, contentType: "application/json" });
    expect(JSON.parse(channel.published[0]?.body.toString("utf8") ?? "{}")).toEqual(message);
  });

  it("acks valid consumed messages and nacks handler failures with requeue", async () => {
    const { channel, queue } = createQueue();
    const raw = { content: Buffer.from(JSON.stringify(message)) };

    await queue.consume(async () => undefined);
    await channel.consumer?.(raw);

    expect(channel.acked).toEqual([raw]);

    await queue.consume(async () => {
      throw new Error("downstream failed");
    });
    const failed = { content: Buffer.from(JSON.stringify(message)) };
    await channel.consumer?.(failed);

    expect(channel.nacked).toEqual([{ message: failed, requeue: true }]);
  });
});
