import type { AgentApi } from "./api";

/** Tool body for ask_user: posts the question, then waits for the founder's reply. */
export async function askUser(api: AgentApi, ideaId: string, question: string): Promise<string> {
  const asked = await api.askQuestion(ideaId, question);
  if (!asked.ok) {
    return "You have used all your questions. Ask no more questions; call submit_spec now with your best spec.";
  }
  const answer = await api.waitForAnswer(ideaId, asked.messageId);
  return (
    answer ??
    "The founder did not answer in time. Make a reasonable assumption, note it in the summary, and continue."
  );
}

/** Tool body for submit_spec: returns a confirmation or the validation issues to fix. */
export async function submitSpec(api: AgentApi, ideaId: string, spec: unknown): Promise<string> {
  const result = await api.submitSpec(ideaId, spec);
  if (result.ok) {
    return `Spec accepted. Default estimate $${result.costUsd.toFixed(2)}${
      result.flagged ? "; held for operator review" : ""
    }. You are done.`;
  }
  const issues = result.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  return `The spec was rejected. Fix these and call submit_spec again:\n${issues.join("\n")}`;
}
