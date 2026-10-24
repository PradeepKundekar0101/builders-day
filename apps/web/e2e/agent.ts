import { expect, type APIRequestContext } from "@playwright/test";

export const CLEAN_SPEC = {
  name: "Tiffin tracker",
  summary: "Weekly tiffin orders for a home kitchen",
  pages: [
    { name: "Home", purpose: "This week's menu", mustHave: true },
    { name: "About", purpose: "The kitchen's story", mustHave: false },
  ],
  entities: [
    {
      name: "order",
      ownerScoped: true,
      mustHave: true,
      fields: [
        { name: "meal", type: "text", required: true },
        { name: "day", type: "date", required: true },
      ],
    },
  ],
  auth: { enabled: true, providers: ["email"] },
  integrations: [{ kind: "email", mustHave: false, notes: "Order confirmations" }],
};

export const PAYMENT_SPEC = {
  ...CLEAN_SPEC,
  integrations: [{ kind: "payment_pinelabs", mustHave: true }],
};

/** Plays the intake agent through the same bearer-token API the real runner uses. */
export class FakeAgent {
  constructor(
    private readonly request: APIRequestContext,
    private readonly token = process.env.AGENT_API_TOKEN ?? "",
  ) {}

  private headers() {
    return { authorization: `Bearer ${this.token}` };
  }

  async submittedIdeas() {
    const response = await this.request.get("/api/agent/ideas", { headers: this.headers() });
    expect(response.status()).toBe(200);
    return ((await response.json()) as { ideas: { id: string; text: string }[] }).ideas;
  }

  async ask(ideaId: string, question: string) {
    return this.request.post(`/api/agent/ideas/${ideaId}/questions`, {
      headers: this.headers(),
      data: { question },
    });
  }

  async askOk(ideaId: string, question: string): Promise<string> {
    const response = await this.ask(ideaId, question);
    expect(response.status()).toBe(201);
    return ((await response.json()) as { id: string }).id;
  }

  async answers(ideaId: string, after: string) {
    const response = await this.request.get(`/api/agent/ideas/${ideaId}/answers?after=${after}`, {
      headers: this.headers(),
    });
    expect(response.status()).toBe(200);
    return ((await response.json()) as { answers: { content: string }[] }).answers;
  }

  async submitSpec(ideaId: string, spec: unknown) {
    return this.request.post(`/api/agent/ideas/${ideaId}/spec`, {
      headers: this.headers(),
      data: { spec },
    });
  }
}
