import type { FlagReason, Spec } from "@buildwise/shared";
import type { Selection } from "@buildwise/estimator";
import type { MaskMap } from "@buildwise/masker";

export type IdeaStatus = "submitted" | "in_intake" | "spec_ready" | "failed";

export type IdeaRecord = {
  id: string;
  userId: string;
  /** Masked text; the original values live only in maskMap. */
  text: string;
  links: string[];
  status: IdeaStatus;
  maskMap: MaskMap;
  questionCount: number;
};

export type MessageRecord = {
  id: string;
  ideaId: string;
  role: "agent" | "user";
  kind: "question" | "answer";
  content: string;
  createdAt: string;
};

export type SpecRecord = {
  id: string;
  ideaId: string;
  userId: string;
  spec: Spec;
  flagReasons: FlagReason[];
  operatorStatus: "not_needed" | "pending" | "approved" | "rejected";
};

export type ApprovalRecord = {
  id: string;
  kind: "flagged_spec";
  subjectId: string;
  requestedAt: string;
  decision: "approved" | "rejected" | null;
};

export type QuoteStatus = "draft" | "locked" | "paid" | "expired";

export type QuoteRecord = {
  id: string;
  specId: string;
  userId: string;
  selection: Selection;
  costUsd: number;
  lowUsd: number;
  highUsd: number;
  hours: number;
  modelBudgetUsd: number;
  weightsVersion: string;
  status: QuoteStatus;
  shareSlug: string;
};

/** Storage for the intake flow. The Supabase implementation uses the service role. */
export interface IntakeRepo {
  createIdea(idea: Omit<IdeaRecord, "id" | "status" | "questionCount">): Promise<IdeaRecord>;
  getIdea(id: string): Promise<IdeaRecord | null>;
  /** Newest first, at most 50. */
  listIdeasByStatus(status: IdeaStatus): Promise<IdeaRecord[]>;
  /** Newest first. */
  listIdeasForUser(userId: string): Promise<IdeaRecord[]>;
  updateIdea(id: string, patch: Partial<Pick<IdeaRecord, "status" | "maskMap">>): Promise<void>;
  /** Atomically bumps the question count; false when it is already at max. */
  claimQuestionSlot(ideaId: string, max: number): Promise<boolean>;
  addMessage(message: Omit<MessageRecord, "id" | "createdAt">): Promise<MessageRecord>;
  /** Oldest first. */
  listMessages(ideaId: string): Promise<MessageRecord[]>;
  createSpec(spec: Omit<SpecRecord, "id">): Promise<SpecRecord>;
  getSpec(id: string): Promise<SpecRecord | null>;
  getSpecForIdea(ideaId: string): Promise<SpecRecord | null>;
  updateSpec(id: string, patch: Pick<SpecRecord, "operatorStatus">): Promise<void>;
  createQuote(quote: Omit<QuoteRecord, "id">): Promise<QuoteRecord>;
  getQuote(id: string): Promise<QuoteRecord | null>;
  getQuoteForSpec(specId: string): Promise<QuoteRecord | null>;
  updateQuote(id: string, patch: Partial<Omit<QuoteRecord, "id">>): Promise<QuoteRecord>;
  createApproval(approval: { kind: "flagged_spec"; subjectId: string }): Promise<void>;
  listPendingApprovals(): Promise<ApprovalRecord[]>;
  /** Records the decision once; null when the approval is missing or already decided. */
  decideApproval(
    id: string,
    decidedBy: string,
    decision: "approved" | "rejected",
  ): Promise<ApprovalRecord | null>;
}
