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
import { mask } from "@buildwise/masker";
import type { IntakeRepo, QuoteRecord } from "./repo";

export const MAX_QUESTIONS = 4;

export type IntakeErrorCode =
  "invalid_idea" | "question_limit" | "not_found" | "invalid_spec" | "wrong_state";

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

const randomSlug = () => randomBytes(9).toString("base64url");

const quoteNumbers = (result: Estimate) => ({
  costUsd: result.costUsd,
  lowUsd: result.lowUsd,
  highUsd: result.highUsd,
  hours: result.hours,
  modelBudgetUsd: result.modelBudgetUsd,
  weightsVersion: result.version,
  costCredits: Math.round(result.costUsd * 100),
  lowCredits: Math.round(result.lowUsd * 100),
  highCredits: Math.round(result.highUsd * 100),
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
    const result = estimate(inputFromSelection(spec.spec, selection));
    return this.repo.updateQuote(quoteId, { selection, ...quoteNumbers(result) });
  }
}
