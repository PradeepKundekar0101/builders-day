import { expect, it } from "vitest";
import { studioNextStep } from "./journey-guidance";
it("keeps early decisions in the brief and asks for cost approval after review", () => {
  expect(studioNextStep(0, false, false, "idle").destination).toBe("brief");
  expect(studioNextStep(3, true, false, "idle").destination).toBe("cost");
});
it("ends on proof only after the security and smoke workflow completes", () => {
  for (const phase of ["deployed", "attacked", "triaged", "fixed"] as const)
    expect(studioNextStep(3, true, true, phase).destination).toBe("shield");
  expect(studioNextStep(3, true, true, "proven").destination).toBe("proof");
  expect(studioNextStep(3, true, false, "proven").destination).toBe("cost");
});
