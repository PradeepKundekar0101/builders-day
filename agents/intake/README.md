# Prompt Studio intake adapter

Prompt Studio currently uses an explicitly labeled mock adapter. It produces an editable suggested Spec in the existing schema. No model provider is contacted and no model credits are spent.

The integration port accepts `{ input, signal }` and resolves a canonical PromptStudioDraft. AgenticOrg can implement this port by creating an idea, waiting for question events, collecting answers, and retrieving a validated Spec. The host must persist every conversational message and enforce authentication, ownership, masking, provider limits, and operator review outside the model.

Prompt Studio review is not operator approval, payment, an estimate, or authorization to execute a build. The downstream estimator should consume only `review.spec` after its own server-side checks.
