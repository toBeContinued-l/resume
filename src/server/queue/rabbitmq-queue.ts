import {
  generationTaskMessageSchema,
  type GenerationQueue,
  type GenerationTaskMessage,
} from "@/types/queue";

export const RABBITMQ_GENERATION_EXCHANGE = "resume.generation";
export const RABBITMQ_GENERATION_QUEUE = "resume.generation.tasks";
export const RABBITMQ_GENERATION_ROUTING_KEY = "generation.requested";

export type RabbitGenerationQueueOptions = {
  url: string;
  exchange?: string;
  queueName?: string;
  routingKey?: string;
  prefetch?: number;
  amqp?: AmqpModuleLike;
};

type ConsumeMessageLike = {
  content: Buffer;
};

type ChannelLike = {
  publish(exchange: string, routingKey: string, body: Buffer, options: PublishOptions): boolean;
  consume(queueName: string, handler: (message: ConsumeMessageLike | null) => Promise<void>): Promise<unknown>;
  ack(message: ConsumeMessageLike): void;
  nack(message: ConsumeMessageLike, allUpTo: boolean, requeue: boolean): void;
  close(): Promise<void>;
  assertExchange(exchange: string, type: "direct", options: { durable: boolean }): Promise<unknown>;
  assertQueue(queueName: string, options: { durable: boolean }): Promise<unknown>;
  bindQueue(queueName: string, exchange: string, routingKey: string): Promise<unknown>;
  prefetch(count: number): Promise<unknown>;
};

type ConnectionLike = {
  createChannel(): Promise<ChannelLike>;
  close(): Promise<void>;
};

type AmqpModuleLike = {
  connect(url: string): Promise<ConnectionLike>;
};

type PublishOptions = {
  contentType: string;
  deliveryMode: number;
  persistent: boolean;
};

export class RabbitGenerationQueue implements GenerationQueue {
  private connection: ConnectionLike | null = null;
  private channel: ChannelLike | null = null;

  private readonly exchange: string;
  private readonly queueName: string;
  private readonly routingKey: string;

  constructor(private readonly options: RabbitGenerationQueueOptions) {
    this.exchange = options.exchange ?? RABBITMQ_GENERATION_EXCHANGE;
    this.queueName = options.queueName ?? RABBITMQ_GENERATION_QUEUE;
    this.routingKey = options.routingKey ?? RABBITMQ_GENERATION_ROUTING_KEY;
  }

  async publish(message: GenerationTaskMessage): Promise<void> {
    const channel = await this.ensureChannel();
    const parsed = generationTaskMessageSchema.parse(message);
    const body = Buffer.from(JSON.stringify(parsed));
    channel.publish(this.exchange, this.routingKey, body, persistentMessageOptions);
  }

  async consume(handler: (message: GenerationTaskMessage) => Promise<void>): Promise<void> {
    const channel = await this.ensureChannel();
    await channel.consume(this.queueName, async (rawMessage) => {
      if (!rawMessage) {
        return;
      }

      const parsed = this.parseMessage(rawMessage);
      if (!parsed) {
        channel.ack(rawMessage);
        return;
      }

      try {
        await handler(parsed);
        channel.ack(rawMessage);
      } catch {
        channel.nack(rawMessage, false, true);
      }
    });
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
    this.channel = null;
    this.connection = null;
  }

  private async ensureChannel(): Promise<ChannelLike> {
    if (this.channel) {
      return this.channel;
    }

    const amqp = this.options.amqp ?? (await loadAmqpModule());
    this.connection = await amqp.connect(this.options.url);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(this.exchange, "direct", { durable: true });
    await this.channel.assertQueue(this.queueName, { durable: true });
    await this.channel.bindQueue(this.queueName, this.exchange, this.routingKey);
    if (this.options.prefetch && this.options.prefetch > 0) {
      await this.channel.prefetch(this.options.prefetch);
    }
    return this.channel;
  }

  private parseMessage(message: ConsumeMessageLike): GenerationTaskMessage | null {
    try {
      const decoded = JSON.parse(message.content.toString("utf8")) as unknown;
      return generationTaskMessageSchema.parse(decoded);
    } catch {
      return null;
    }
  }
}

async function loadAmqpModule(): Promise<AmqpModuleLike> {
  try {
    const amqpImport = (await import(/* webpackIgnore: true */ "amqplib")) as {
      connect?: unknown;
      default?: unknown;
    };
    const candidate = amqpImport.connect ? amqpImport : amqpImport.default;
    if (!isAmqpModule(candidate)) {
      throw new Error("Loaded amqplib module does not expose connect().");
    }
    return candidate;
  } catch (error) {
    throw new Error(
      "RabbitMQ queue requires the 'amqplib' package. Install it before using RabbitGenerationQueue.",
      { cause: error },
    );
  }
}

function isAmqpModule(value: unknown): value is AmqpModuleLike {
  return typeof value === "object" && value !== null && "connect" in value && typeof value.connect === "function";
}

const persistentMessageOptions: PublishOptions = {
  contentType: "application/json",
  deliveryMode: 2,
  persistent: true,
};
