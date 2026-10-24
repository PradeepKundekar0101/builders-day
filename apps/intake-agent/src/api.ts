export type SubmittedIdea = { id: string; text: string; links: string[] };

export type AskResult = { ok: true; messageId: string } | { ok: false; reason: "question_limit" };

export type SpecResult =
  | { ok: true; costUsd: number; flagged: boolean }
  | { ok: false; issues: { path: (string | number)[]; message: string }[] };

/** The PROVN agent tool API. AgenticOrg calls the same endpoints. */
export interface AgentApi {
  listSubmittedIdeas(): Promise<SubmittedIdea[]>;
  askQuestion(ideaId: string, question: string): Promise<AskResult>;
  /** Resolves with the founder's answer, or null if none arrives in time. */
  waitForAnswer(ideaId: string, afterMessageId: string): Promise<string | null>;
  submitSpec(ideaId: string, spec: unknown): Promise<SpecResult>;
}

const ANSWER_POLL_MS = 1500;
const ANSWER_TIMEOUT_MS = 10 * 60_000;

export class HttpAgentApi implements AgentApi {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request(path: string, init: RequestInit = {}) {
    return fetch(`${this.baseUrl}/api/agent${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
  }

  async listSubmittedIdeas() {
    const response = await this.request("/ideas?status=submitted");
    if (!response.ok) throw new Error(`list ideas failed: ${response.status}`);
    return ((await response.json()) as { ideas: SubmittedIdea[] }).ideas;
  }

  async askQuestion(ideaId: string, question: string): Promise<AskResult> {
    const response = await this.request(`/ideas/${ideaId}/questions`, {
      method: "POST",
      body: JSON.stringify({ question }),
    });
    if (response.status === 409) return { ok: false, reason: "question_limit" };
    if (!response.ok) throw new Error(`ask question failed: ${response.status}`);
    const { id } = (await response.json()) as { id: string };
    return { ok: true, messageId: id };
  }

  async waitForAnswer(ideaId: string, afterMessageId: string) {
    const deadline = Date.now() + ANSWER_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const response = await this.request(`/ideas/${ideaId}/answers?after=${afterMessageId}`);
      if (!response.ok) throw new Error(`read answers failed: ${response.status}`);
      const { answers } = (await response.json()) as { answers: { content: string }[] };
      if (answers[0]) return answers.map((answer) => answer.content).join("\n");
      await new Promise((resolve) => setTimeout(resolve, ANSWER_POLL_MS));
    }
    return null;
  }

  async submitSpec(ideaId: string, spec: unknown): Promise<SpecResult> {
    const response = await this.request(`/ideas/${ideaId}/spec`, {
      method: "POST",
      body: JSON.stringify({ spec }),
    });
    if (response.status === 422) {
      const body = (await response.json()) as Pick<SpecResult & { ok: false }, "issues">;
      return { ok: false, issues: body.issues };
    }
    if (!response.ok) throw new Error(`submit spec failed: ${response.status}`);
    const body = (await response.json()) as { costUsd: number; flagged: boolean };
    return { ok: true, costUsd: body.costUsd, flagged: body.flagged };
  }
}
