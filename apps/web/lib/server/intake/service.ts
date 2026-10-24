import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  flagReasons as flagReasonsFor,
  IDEA_TEXT_MAX,
  IDEA_TEXT_MIN,
  INTEGRATION_KINDS,
  SpecSchema,
  type FlagReason,
} from "@buildwise/shared";
import {
  defaultSelection,
  estimate,
  validatedInputFromSelection as inputFromSelection,
  type Estimate,
  type Selection,
} from "@buildwise/estimator";
import { mask, unmask } from "@buildwise/masker";
import type { Spec } from "@buildwise/shared";
import type { IdeaStatus, IntakeRepo, QuoteRecord, SpecRecord } from "./repo";

export const MAX_QUESTIONS = 4;

export type IntakeErrorCode =
  | "invalid_idea"
  | "invalid_selection"
  | "question_limit"
  | "not_found"
  | "invalid_spec"
  | "wrong_state";

export class IntakeError extends Error {
  constructor(
    readonly code: IntakeErrorCode,
    message: string,
    readonly issues?: unknown,
  ) {
    super(message);
    this.name = "IntakeError";
  }
}

export const SelectionSchema = z.object({
  pages: z.array(z.string()).max(50),
  entities: z.array(z.string()).max(50),
  auth: z.boolean(),
  integrations: z.array(z.enum(INTEGRATION_KINDS)),
});

export type IdeaView = {
  id: string;
  text: string;
  status: IdeaStatus;
  questionCount: number;
  messages: { id: string; role: "agent" | "user"; content: string }[];
  /** True while the agent's latest question has no answer. */
  awaitingAnswer: boolean;
  review: SpecRecord["operatorStatus"] | null;
  /** Shown only once no operator review is pending or refused. */
  estimate: { spec: Spec; quote: QuoteRecord } | null;
};

export type IdeaSummary = {
  id: string;
  title: string;
  status: IdeaStatus;
  review: SpecRecord["operatorStatus"] | null;
  costUsd: number | null;
};

export type PendingApproval = {
  id: string;
  requestedAt: string;
  ideaId: string;
  specName: string;
  flagReasons: FlagReason[];
  costUsd: number | null;
};

const randomSlug = () => randomBytes(9).toString("base64url");

/** One credit is one US cent. */
export const creditsFromUsd = (usd: number) => Math.round(usd * 100);

const quoteNumbers = (result: Estimate) => ({
  costUsd: result.costUsd,
  lowUsd: result.lowUsd,
  highUsd: result.highUsd,
  hours: result.hours,
  modelBudgetUsd: result.modelBudgetUsd,
  weightsVersion: result.version,
  costCredits: creditsFromUsd(result.costUsd),
  lowCredits: creditsFromUsd(result.lowUsd),
  highCredits: creditsFromUsd(result.highUsd),
});

/** The intake flow: idea, up to four agent questions, a validated spec and a draft quote. */
export class IntakeService {
  constructor(private readonly repo: IntakeRepo) {}

  async submitIdea(userId: string, text: string, links: string[]) {
    const trimmed = text.trim();
    if (trimmed.length < IDEA_TEXT_MIN || trimmed.length > IDEA_TEXT_MAX) {
      throw new IntakeError(
        "invalid_idea",
        `Describe your idea in ${IDEA_TEXT_MIN} to ${IDEA_TEXT_MAX} characters.`,
      );
    }
    const masked = mask(trimmed);
    return this.repo.createIdea({ userId, text: masked.text, links, maskMap: masked.map });
  }

  async askQuestion(ideaId: string, question: string) {
    const idea = await this.repo.getIdea(ideaId);
    if (!idea) throw new IntakeError("not_found", "Idea not found.");
    if (idea.status === "spec_ready" || idea.status === "failed") {
      throw new IntakeError("wrong_state", "This idea already has a spec.");
    }
    if (!(await this.repo.claimQuestionSlot(ideaId, MAX_QUESTIONS))) {
      throw new IntakeError("question_limit", `At most ${MAX_QUESTIONS} questions per idea.`);
    }
    const masked = mask(question, idea.maskMap);
    await this.repo.updateIdea(ideaId, { status: "in_intake", maskMap: masked.map });
    return this.repo.addMessage({ ideaId, role: "agent", kind: "question", content: masked.text });
  }

  async answer(userId: string, ideaId: string, answer: string) {
    const idea = await this.repo.getIdea(ideaId);
    if (!idea || idea.userId !== userId) throw new IntakeError("not_found", "Idea not found.");
    const last = (await this.repo.listMessages(ideaId)).at(-1);
    if (last?.kind !== "question") {
      throw new IntakeError("wrong_state", "There is no question waiting for an answer.");
    }
    const masked = mask(answer.trim(), idea.maskMap);
    await this.repo.updateIdea(ideaId, { maskMap: masked.map });
    return this.repo.addMessage({ ideaId, role: "user", kind: "answer", content: masked.text });
  }

  async submitSpec(
    ideaId: string,
    raw: unknown,
  ): Promise<{ specId: string; quote: QuoteRecord; flagReasons: FlagReason[] }> {
    const idea = await this.repo.getIdea(ideaId);
    if (!idea) throw new IntakeError("not_found", "Idea not found.");
    if (idea.status === "spec_ready") {
      throw new IntakeError("wrong_state", "This idea already has a spec.");
    }
    const parsed = SpecSchema.safeParse(raw);
    if (!parsed.success) {
      throw new IntakeError(
        "invalid_spec",
        "The spec does not match the schema.",
        parsed.error.issues,
      );
    }
    const spec = parsed.data;
    const selection = defaultSelection(spec);
    const result = estimate(inputFromSelection(spec, selection));
    const flagReasons = flagReasonsFor(spec, result.costUsd);

    const specRecord = await this.repo.createSpec({
      ideaId,
      userId: idea.userId,
      spec,
      flagReasons,
      operatorStatus: flagReasons.length > 0 ? "pending" : "not_needed",
    });
    const quote = await this.repo.createQuote({
      specId: specRecord.id,
      userId: idea.userId,
      selection,
      status: "draft",
      shareSlug: randomSlug(),
      ...quoteNumbers(result),
    });
    if (flagReasons.length > 0) {
      await this.repo.createApproval({ kind: "flagged_spec", subjectId: specRecord.id });
    }
    await this.repo.updateIdea(ideaId, { status: "spec_ready" });
    return { specId: specRecord.id, quote, flagReasons };
  }

  /** Recomputes on the server from the stored spec; client numbers are never trusted. */
  async updateSelection(userId: string, quoteId: string, raw: unknown): Promise<QuoteRecord> {
    const quote = await this.repo.getQuote(quoteId);
    if (!quote || quote.userId !== userId) throw new IntakeError("not_found", "Quote not found.");
    if (quote.status !== "draft") {
      throw new IntakeError("wrong_state", "This quote is locked and can no longer change.");
    }
    const selection: Selection = SelectionSchema.parse(raw);
    const spec = await this.repo.getSpec(quote.specId);
    if (!spec) throw new IntakeError("not_found", "Spec not found.");
    if (!priceVisible(spec)) {
      throw new IntakeError("wrong_state", "This estimate is waiting for review.");
    }
    let input;
    try {
      input = inputFromSelection(spec.spec, selection);
    } catch (error) {
      // Core features cannot be switched off, and names must exist in the spec.
      throw new IntakeError("invalid_selection", (error as Error).message);
    }
    return this.repo.updateQuote(quoteId, { selection, ...quoteNumbers(estimate(input)) });
  }

  /** For the agent: submitted ideas, masked. */
  async listSubmittedIdeas() {
    const ideas = await this.repo.listIdeasByStatus("submitted");
    return ideas.map(({ id, text, links }) => ({ id, text, links }));
  }

  /** For the agent: the founder's answers after a given question, masked. */
  async answersAfter(ideaId: string, afterMessageId: string) {
    const messages = await this.repo.listMessages(ideaId);
    const index = messages.findIndex((message) => message.id === afterMessageId);
    if (index === -1) throw new IntakeError("not_found", "Question not found.");
    return messages
      .slice(index + 1)
      .filter((message) => message.kind === "answer")
      .map(({ id, content }) => ({ id, content }));
  }

  /** For the owner: their ideas, newest first, titled by the spec name once there is one. */
  async listIdeas(userId: string): Promise<IdeaSummary[]> {
    const ideas = await this.repo.listIdeasForUser(userId);
    return Promise.all(
      ideas.map(async (idea) => {
        const spec = await this.repo.getSpecForIdea(idea.id);
        const quote = spec && priceVisible(spec) ? await this.repo.getQuoteForSpec(spec.id) : null;
        const text = unmask(idea.text, idea.maskMap).replace(/\s+/g, " ");
        return {
          id: idea.id,
          title: spec?.spec.name ?? (text.length > 80 ? `${text.slice(0, 79)}…` : text),
          status: idea.status,
          review: spec?.operatorStatus ?? null,
          costUsd: quote?.costUsd ?? null,
        };
      }),
    );
  }

  /** For the owner: everything on the idea page, with personal data restored. */
  async ideaView(userId: string, ideaId: string): Promise<IdeaView> {
    const idea = await this.repo.getIdea(ideaId);
    if (!idea || idea.userId !== userId) throw new IntakeError("not_found", "Idea not found.");
    const messages = await this.repo.listMessages(ideaId);
    const spec = await this.repo.getSpecForIdea(ideaId);
    const quote = spec && priceVisible(spec) ? await this.repo.getQuoteForSpec(spec.id) : null;
    return {
      id: idea.id,
      text: unmask(idea.text, idea.maskMap),
      status: idea.status,
      questionCount: idea.questionCount,
      messages: messages.map(({ id, role, content }) => ({
        id,
        role,
        content: unmask(content, idea.maskMap),
      })),
      awaitingAnswer: messages.at(-1)?.kind === "question",
      review: spec?.operatorStatus ?? null,
      estimate: spec && quote ? { spec: spec.spec, quote } : null,
    };
  }

  async pendingApprovals(): Promise<PendingApproval[]> {
    const approvals = await this.repo.listPendingApprovals();
    const rows = await Promise.all(
      approvals.map(async (approval): Promise<PendingApproval | null> => {
        const spec = await this.repo.getSpec(approval.subjectId);
        if (!spec) return null;
        const quote = await this.repo.getQuoteForSpec(spec.id);
        return {
          id: approval.id,
          requestedAt: approval.requestedAt,
          ideaId: spec.ideaId,
          specName: spec.spec.name,
          flagReasons: spec.flagReasons,
          costUsd: quote?.costUsd ?? null,
        };
      }),
    );
    return rows.filter((row) => row !== null);
  }

  /** Operator decision on a flagged spec; each approval is decided once. */
  async decide(staffId: string, approvalId: string, decision: "approved" | "rejected") {
    const approval = await this.repo.decideApproval(approvalId, staffId, decision);
    if (!approval) throw new IntakeError("not_found", "Approval not found or already decided.");
    await this.repo.updateSpec(approval.subjectId, { operatorStatus: decision });
  }
}

const priceVisible = (spec: SpecRecord) =>
  spec.operatorStatus === "not_needed" || spec.operatorStatus === "approved";
