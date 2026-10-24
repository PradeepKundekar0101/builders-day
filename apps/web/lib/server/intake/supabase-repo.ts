import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@buildwise/db";
import type { FlagReason, Spec } from "@buildwise/shared";
import type { Selection } from "@buildwise/estimator";
import type { MaskMap } from "@buildwise/masker";
import { decryptJson, encryptJson } from "../crypto";
import type {
  ApprovalRecord,
  IdeaRecord,
  IdeaStatus,
  IntakeRepo,
  MessageRecord,
  QuoteRecord,
  SpecRecord,
} from "./repo";

type Tables = Database["public"]["Tables"];
type IdeaRow = Tables["ideas"]["Row"];
type MessageRow = Tables["intake_messages"]["Row"];
type SpecRow = Tables["specs"]["Row"];
type QuoteRow = Tables["quotes"]["Row"];
type ApprovalRow = Tables["approvals"]["Row"];

const IDEA_COLUMNS = "id, user_id, text, links, status, question_count, mask_map_enc";

type Result<T> = { data: T; error: { message: string } | null };

/** Throws on a Supabase error or a missing result. */
function must<T>(result: Result<T>): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error("Expected a result from Supabase");
  return result.data;
}

/** Throws on a Supabase error; null means no row. */
function maybe<T>(result: Result<T>): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/** Throws on a Supabase error, for writes that return nothing. */
function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

/** IntakeRepo on Supabase with the service role. Mask maps are sealed before they leave the server. */
export class SupabaseIntakeRepo implements IntakeRepo {
  constructor(
    private readonly db: SupabaseClient<Database>,
    private readonly maskMapKey: string,
  ) {}

  private toIdea(
    row: Pick<
      IdeaRow,
      "id" | "user_id" | "text" | "links" | "status" | "question_count" | "mask_map_enc"
    >,
  ): IdeaRecord {
    return {
      id: row.id,
      userId: row.user_id,
      text: row.text,
      links: row.links,
      status: row.status as IdeaStatus,
      questionCount: row.question_count,
      maskMap: row.mask_map_enc ? decryptJson<MaskMap>(row.mask_map_enc, this.maskMapKey) : {},
    };
  }

  /**
   * An idea whose mask map cannot be opened can never be processed. Lists mark it failed and
   * leave it out, so it neither breaks the list nor sits in the agent's queue forever.
   */
  private async readableIdeas(
    rows: Parameters<SupabaseIntakeRepo["toIdea"]>[0][],
  ): Promise<IdeaRecord[]> {
    const ideas: IdeaRecord[] = [];
    for (const row of rows) {
      try {
        ideas.push(this.toIdea(row));
      } catch (error) {
        console.error(`Idea ${row.id} failed: its mask map cannot be opened`, error);
        check(await this.db.from("ideas").update({ status: "failed" }).eq("id", row.id));
      }
    }
    return ideas;
  }

  private seal(map: MaskMap) {
    return Object.keys(map).length ? encryptJson(map, this.maskMapKey) : "";
  }

  async createIdea(idea: Omit<IdeaRecord, "id" | "status" | "questionCount">) {
    const row = must(
      await this.db
        .from("ideas")
        .insert({
          user_id: idea.userId,
          text: idea.text,
          links: idea.links,
          mask_map_enc: this.seal(idea.maskMap),
        })
        .select(IDEA_COLUMNS)
        .single(),
    );
    return this.toIdea(row);
  }

  async getIdea(id: string) {
    const row = maybe(await this.db.from("ideas").select(IDEA_COLUMNS).eq("id", id).maybeSingle());
    return row ? this.toIdea(row) : null;
  }

  async listIdeasByStatus(status: IdeaStatus) {
    const rows = must(
      await this.db
        .from("ideas")
        .select(IDEA_COLUMNS)
        .eq("status", status)
        // Newest first: the founder waiting on the page right now comes before stale ideas.
        .order("created_at", { ascending: false })
        .limit(50),
    );
    return await this.readableIdeas(rows);
  }

  async listIdeasForUser(userId: string) {
    const rows = must(
      await this.db
        .from("ideas")
        .select(IDEA_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
    );
    return await this.readableIdeas(rows);
  }

  async updateIdea(id: string, patch: Partial<Pick<IdeaRecord, "status" | "maskMap">>) {
    check(
      await this.db
        .from("ideas")
        .update({
          ...(patch.status && { status: patch.status }),
          ...(patch.maskMap && { mask_map_enc: this.seal(patch.maskMap) }),
        })
        .eq("id", id),
    );
  }

  async claimQuestionSlot(ideaId: string, max: number): Promise<boolean> {
    // The cap lives in the database function and the column check; they must agree.
    if (max !== 4) throw new Error("claim_question_slot enforces a cap of 4");
    return must(await this.db.rpc("claim_question_slot", { p_idea_id: ideaId }));
  }

  private toMessage(row: MessageRow): MessageRecord {
    return {
      id: row.id,
      ideaId: row.idea_id,
      role: row.role as MessageRecord["role"],
      kind: row.kind as MessageRecord["kind"],
      content: row.content,
      createdAt: row.created_at,
    };
  }

  async addMessage(message: Omit<MessageRecord, "id" | "createdAt">) {
    const row = must(
      await this.db
        .from("intake_messages")
        .insert({
          idea_id: message.ideaId,
          role: message.role,
          kind: message.kind,
          content: message.content,
        })
        .select()
        .single(),
    );
    return this.toMessage(row);
  }

  async listMessages(ideaId: string) {
    const rows = must(
      await this.db
        .from("intake_messages")
        .select()
        .eq("idea_id", ideaId)
        .order("created_at")
        .order("id"),
    );
    return rows.map((row) => this.toMessage(row));
  }

  private toSpec(row: SpecRow): SpecRecord {
    return {
      id: row.id,
      ideaId: row.idea_id,
      userId: row.user_id,
      spec: row.spec as Spec,
      flagReasons: row.flag_reasons as FlagReason[],
      operatorStatus: row.operator_status as SpecRecord["operatorStatus"],
    };
  }

  async createSpec(spec: Omit<SpecRecord, "id">) {
    const row = must(
      await this.db
        .from("specs")
        .insert({
          idea_id: spec.ideaId,
          user_id: spec.userId,
          spec: spec.spec,
          flag_reasons: spec.flagReasons,
          operator_status: spec.operatorStatus,
        })
        .select()
        .single(),
    );
    return this.toSpec(row);
  }

  async getSpec(id: string) {
    const row = maybe(await this.db.from("specs").select().eq("id", id).maybeSingle());
    return row ? this.toSpec(row) : null;
  }

  async getSpecForIdea(ideaId: string) {
    const row = maybe(
      await this.db
        .from("specs")
        .select()
        .eq("idea_id", ideaId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    return row ? this.toSpec(row) : null;
  }

  async updateSpec(id: string, patch: Pick<SpecRecord, "operatorStatus">) {
    check(
      await this.db.from("specs").update({ operator_status: patch.operatorStatus }).eq("id", id),
    );
  }

  private toQuote(row: QuoteRow): QuoteRecord {
    return {
      id: row.id,
      specId: row.spec_id,
      userId: row.user_id,
      selection: row.selected_features as Selection,
      costUsd: Number(row.cost_usd),
      lowUsd: Number(row.low_usd),
      highUsd: Number(row.high_usd),
      hours: Number(row.hours),
      modelBudgetUsd: Number(row.model_budget_usd),
      weightsVersion: row.weights_version,
      status: row.status as QuoteRecord["status"],
      shareSlug: row.share_slug,
    };
  }

  private quoteColumns(quote: Partial<Omit<QuoteRecord, "id">>) {
    return {
      ...(quote.specId !== undefined && { spec_id: quote.specId }),
      ...(quote.userId !== undefined && { user_id: quote.userId }),
      ...(quote.selection !== undefined && { selected_features: quote.selection }),
      ...(quote.costUsd !== undefined && { cost_usd: quote.costUsd }),
      ...(quote.lowUsd !== undefined && { low_usd: quote.lowUsd }),
      ...(quote.highUsd !== undefined && { high_usd: quote.highUsd }),
      ...(quote.hours !== undefined && { hours: quote.hours }),
      ...(quote.modelBudgetUsd !== undefined && { model_budget_usd: quote.modelBudgetUsd }),
      ...(quote.weightsVersion !== undefined && { weights_version: quote.weightsVersion }),
      ...(quote.status !== undefined && { status: quote.status }),
      ...(quote.shareSlug !== undefined && { share_slug: quote.shareSlug }),
    };
  }

  async createQuote(quote: Omit<QuoteRecord, "id">) {
    const columns = this.quoteColumns(quote) as Tables["quotes"]["Insert"];
    const row = must(await this.db.from("quotes").insert(columns).select().single());
    return this.toQuote(row);
  }

  async getQuote(id: string) {
    const row = maybe(await this.db.from("quotes").select().eq("id", id).maybeSingle());
    return row ? this.toQuote(row) : null;
  }

  async getQuoteForSpec(specId: string) {
    const row = maybe(
      await this.db
        .from("quotes")
        .select()
        .eq("spec_id", specId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    return row ? this.toQuote(row) : null;
  }

  async updateQuote(id: string, patch: Partial<Omit<QuoteRecord, "id">>) {
    const row = must(
      await this.db.from("quotes").update(this.quoteColumns(patch)).eq("id", id).select().single(),
    );
    return this.toQuote(row);
  }

  async createApproval(approval: { kind: "flagged_spec"; subjectId: string }) {
    check(
      await this.db
        .from("approvals")
        .insert({ kind: approval.kind, subject_id: approval.subjectId }),
    );
  }

  private toApproval(row: ApprovalRow): ApprovalRecord {
    return {
      id: row.id,
      kind: row.kind as ApprovalRecord["kind"],
      subjectId: row.subject_id,
      requestedAt: row.requested_at,
      decision: row.decision as ApprovalRecord["decision"],
    };
  }

  async listPendingApprovals() {
    const rows = must(
      await this.db
        .from("approvals")
        .select()
        .eq("kind", "flagged_spec")
        .is("decision", null)
        .order("requested_at"),
    );
    return rows.map((row) => this.toApproval(row));
  }

  async decideApproval(id: string, decidedBy: string, decision: "approved" | "rejected") {
    // The decision filter makes a second decision a no-op instead of an overwrite.
    const row = maybe(
      await this.db
        .from("approvals")
        .update({ decision, decided_by: decidedBy, decided_at: new Date().toISOString() })
        .eq("id", id)
        .is("decision", null)
        .select()
        .maybeSingle(),
    );
    return row ? this.toApproval(row) : null;
  }
}
