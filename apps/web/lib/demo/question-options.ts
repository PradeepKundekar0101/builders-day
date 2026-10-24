import type { Plan } from "./plan";

const lower = (word: string) => word.toLowerCase();
const one = (word: string) => lower(word).replace(/ies$/, "y").replace(/s$/, "");
const list = (words: string[]) =>
  words.length < 2
    ? words.map(lower).join("")
    : `${words.slice(0, -1).map(lower).join(", ")} and ${lower(words.at(-1)!)}`;

/** Clickable answers for the guide's questions, tailored to the idea. The user can still type. */
export function questionOptions(questionId: string, plan: Plan): string[] {
  const main = plan.entities[0] ?? "Records";
  const pays = plan.features.some((f) => f.key === "payments");
  const things = list(plan.entities);

  switch (questionId) {
    case "audience":
      return [
        `Just me. I'm the only person using it to manage ${lower(main)}.`,
        `Customers sign in and see only their own ${lower(main)}.`,
        `Customers see their own ${lower(main)}; my team manages all of them.`,
        `Anyone can browse; only signed-in users can add ${lower(main)}.`,
      ];
    case "journey":
      return [
        `Sign up and create their first ${one(main)}.`,
        pays
          ? `Browse ${lower(main)}, add to cart and pay online.`
          : `Browse ${lower(main)} and send a request.`,
        `Open a ${one(main)}, review it and approve it or request changes.`,
        `Find a ${one(main)} and update its status.`,
      ];
    case "data":
      return [
        `Save ${things}. Email sign-in only.`,
        `Save ${things}. Add email notifications.`,
        `Save ${things}. Add file uploads and email notifications.`,
        `Save ${things}. Add online payments.`,
      ];
    default:
      return [];
  }
}
