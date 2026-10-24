import { randomUUID } from "node:crypto";
import type {
  ApprovalRecord,
  IdeaRecord,
  IdeaStatus,
  IntakeRepo,
  MessageRecord,
  QuoteRecord,
  SpecRecord,
} from "./repo";

/** In-memory IntakeRepo for unit tests. */
export class MemoryIntakeRepo implements IntakeRepo {
  ideas = new Map<string, IdeaRecord>();
  messages: MessageRecord[] = [];
  specs = new Map<string, SpecRecord>();
  quotes = new Map<string, QuoteRecord>();
  approvals: ApprovalRecord[] = [];
  private clock = 0;

  private now() {
    return new Date(Date.UTC(2026, 9, 24) + this.clock++).toISOString();
  }

  async createIdea(idea: Omit<IdeaRecord, "id" | "status" | "questionCount">) {
    const record: IdeaRecord = { ...idea, id: randomUUID(), status: "submitted", questionCount: 0 };
    this.ideas.set(record.id, record);
    return record;
  }
  async getIdea(id: string) {
    return this.ideas.get(id) ?? null;
  }
  async listIdeasByStatus(status: IdeaStatus) {
    return [...this.ideas.values()].filter((idea) => idea.status === status);
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
  async addMessage(message: Omit<MessageRecord, "id" | "createdAt">) {
    const record = { ...message, id: randomUUID(), createdAt: this.now() };
    this.messages.push(record);
    return record;
  }
  async listMessages(ideaId: string) {
    return this.messages.filter((message) => message.ideaId === ideaId);
  }
  async createSpec(spec: Omit<SpecRecord, "id">) {
    if ([...this.specs.values()].some((existing) => existing.ideaId === spec.ideaId)) {
      throw new Error("duplicate spec for idea");
    }
    const record = { ...spec, id: randomUUID() };
    this.specs.set(record.id, record);
    return record;
  }
  async getSpec(id: string) {
    return this.specs.get(id) ?? null;
  }
  async getSpecForIdea(ideaId: string) {
    return [...this.specs.values()].find((spec) => spec.ideaId === ideaId) ?? null;
  }
  async updateSpec(id: string, patch: Pick<SpecRecord, "operatorStatus">) {
    const spec = this.specs.get(id);
    if (spec) this.specs.set(id, { ...spec, ...patch });
  }
  async createQuote(quote: Omit<QuoteRecord, "id">) {
    const record = { ...quote, id: randomUUID() };
    this.quotes.set(record.id, record);
    return record;
  }
  async getQuote(id: string) {
    return this.quotes.get(id) ?? null;
  }
  async getQuoteForSpec(specId: string) {
    return [...this.quotes.values()].find((quote) => quote.specId === specId) ?? null;
  }
  async updateQuote(id: string, patch: Partial<Omit<QuoteRecord, "id">>) {
    const quote = this.quotes.get(id);
    if (!quote) throw new Error(`quote ${id} not found`);
    const updated = { ...quote, ...patch };
    this.quotes.set(id, updated);
    return updated;
  }
  async createApproval(approval: { kind: "flagged_spec"; subjectId: string }) {
    this.approvals.push({ ...approval, id: randomUUID(), requestedAt: this.now(), decision: null });
  }
  async listPendingApprovals() {
    return this.approvals.filter((approval) => approval.decision === null);
  }
  async decideApproval(id: string, _decidedBy: string, decision: "approved" | "rejected") {
    const approval = this.approvals.find((a) => a.id === id && a.decision === null);
    if (!approval) return null;
    approval.decision = decision;
    return approval;
  }
}
