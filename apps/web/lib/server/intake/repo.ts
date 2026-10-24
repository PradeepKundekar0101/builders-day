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
};

export type SpecRecord = {
  id: string;
  ideaId: string;
  userId: string;
  spec: Spec;
  flagReasons: FlagReason[];
  operatorStatus: "not_needed" | "pending" | "approved" | "rejected";
};

export type QuoteStatus = "draft" | "locked" | "paid" | "expired";

export type QuoteRecord = {
  id: string;
  specId: string;
  userId: string;
  selection: Selection;
  costUsd: number;
  costCredits: number;
  lowCredits: number;
  highCredits: number;
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
  updateIdea(id: string, patch: Partial<Pick<IdeaRecord, "status" | "maskMap">>): Promise<void>;
  /** Atomically bumps the question count; false when it is already at max. */
  claimQuestionSlot(ideaId: string, max: number): Promise<boolean>;
  addMessage(message: Omit<MessageRecord, "id">): Promise<MessageRecord>;
  createSpec(spec: Omit<SpecRecord, "id">): Promise<SpecRecord>;
  getSpec(id: string): Promise<SpecRecord | null>;
  createQuote(quote: Omit<QuoteRecord, "id">): Promise<QuoteRecord>;
  getQuote(id: string): Promise<QuoteRecord | null>;
  updateQuote(id: string, patch: Partial<Omit<QuoteRecord, "id">>): Promise<QuoteRecord>;
  createApproval(approval: { kind: "flagged_spec"; subjectId: string }): Promise<void>;
}
