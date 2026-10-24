import { randomUUID } from "node:crypto";
import type { IdeaRecord, IntakeRepo, MessageRecord, QuoteRecord, SpecRecord } from "./repo";

/** In-memory IntakeRepo for unit tests. */
export class MemoryIntakeRepo implements IntakeRepo {
  ideas = new Map<string, IdeaRecord>();
  messages: MessageRecord[] = [];
  specs = new Map<string, SpecRecord>();
  quotes = new Map<string, QuoteRecord>();
  approvals: { kind: "flagged_spec"; subjectId: string }[] = [];

  async createIdea(idea: Omit<IdeaRecord, "id" | "status" | "questionCount">) {
    const record: IdeaRecord = { ...idea, id: randomUUID(), status: "submitted", questionCount: 0 };
    this.ideas.set(record.id, record);
    return record;
  }
  async getIdea(id: string) {
    return this.ideas.get(id) ?? null;
  }
  async updateIdea(id: string, patch: Partial<Pick<IdeaRecord, "status" | "maskMap">>) {
    const idea = this.ideas.get(id);
    if (idea) this.ideas.set(id, { ...idea, ...patch });
  }
  async claimQuestionSlot(ideaId: string, max: number) {
    const idea = this.ideas.get(ideaId);
    if (!idea || idea.questionCount >= max) return false;
    idea.questionCount += 1;
    return true;
  }
  async addMessage(message: Omit<MessageRecord, "id">) {
    const record = { ...message, id: randomUUID() };
    this.messages.push(record);
    return record;
  }
  async createSpec(spec: Omit<SpecRecord, "id">) {
    const record = { ...spec, id: randomUUID() };
    this.specs.set(record.id, record);
    return record;
  }
  async getSpec(id: string) {
    return this.specs.get(id) ?? null;
  }
  async createQuote(quote: Omit<QuoteRecord, "id">) {
    const record = { ...quote, id: randomUUID() };
    this.quotes.set(record.id, record);
    return record;
  }
  async getQuote(id: string) {
    return this.quotes.get(id) ?? null;
  }
  async updateQuote(id: string, patch: Partial<Omit<QuoteRecord, "id">>) {
    const quote = this.quotes.get(id);
    if (!quote) throw new Error(`quote ${id} not found`);
    const updated = { ...quote, ...patch };
    this.quotes.set(id, updated);
    return updated;
  }
  async createApproval(approval: { kind: "flagged_spec"; subjectId: string }) {
    this.approvals.push(approval);
  }
}
