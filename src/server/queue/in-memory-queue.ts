import {
  generationTaskMessageSchema,
  type GenerationQueue,
  type GenerationTaskMessage,
} from "@/types/queue";

export class InMemoryGenerationQueue implements GenerationQueue {
  readonly publishedMessages: GenerationTaskMessage[] = [];
  readonly ackedMessages: GenerationTaskMessage[] = [];
  readonly failedMessages: Array<{ message: GenerationTaskMessage; error: unknown }> = [];

  private readonly messages: GenerationTaskMessage[] = [];
  private readonly handlers: Array<(message: GenerationTaskMessage) => Promise<void>> = [];
  private draining = false;

  async publish(message: GenerationTaskMessage): Promise<void> {
    const parsed = generationTaskMessageSchema.parse(message);
    this.publishedMessages.push(parsed);
    this.messages.push(parsed);
    await this.drain();
  }

  async consume(handler: (message: GenerationTaskMessage) => Promise<void>): Promise<void> {
    this.handlers.push(handler);
    await this.drain();
  }

  get queuedCount(): number {
    return this.messages.length;
  }

  private async drain(): Promise<void> {
    if (this.draining || this.handlers.length === 0) {
      return;
    }

    this.draining = true;
    try {
      while (this.messages.length > 0) {
        const message = this.messages.shift();
        if (!message) {
          return;
        }
        const handler = this.handlers[0];
        if (!handler) {
          this.messages.unshift(message);
          return;
        }
        try {
          await handler(message);
          this.ackedMessages.push(message);
        } catch (error) {
          this.failedMessages.push({ message, error });
          throw error;
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
