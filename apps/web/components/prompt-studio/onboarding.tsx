"use client";
import { useState, useEffect, useRef } from "react";
import { DEFAULT_PROFILE, PLANS, type BuilderProfile } from "@/lib/provn-demo";
export function BuilderOnboarding({
  onComplete,
  onClose,
}: {
  onComplete: (profile: BuilderProfile) => void;
  onClose: () => void;
}) {
  const modal = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    modal.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [error, setError] = useState("");
  return (
    <div className="provn-onboard-backdrop">
      <section
        ref={modal}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const controls = modal.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input, select",
          );
          if (!controls?.length) return;
          const first = controls[0],
            last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        className="provn-onboard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <button className="onboard-close" onClick={onClose} aria-label="Close onboarding">
          ×
        </button>
        <p className="studio-kicker">PROVN / YOUR STARTING POINT</p>
        <h2 id="onboarding-title">A workspace that fits you.</h2>
        <p>Choose how you build. You can change these defaults in Cost Guard.</p>
        <div className="onboard-personas">
          {(
            [
              {
                id: "non-tech",
                name: "I have an idea",
                description: "Plain English, guided templates.",
              },
              {
                id: "indie",
                name: "I build for myself or clients",
                description: "Dev mode, optional bring-your-own key.",
              },
              {
                id: "team",
                name: "We’re a product team",
                description: "Shared budgets and security sign-off.",
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-pressed={profile.persona === item.id}
              onClick={() =>
                setProfile({
                  ...profile,
                  persona: item.id,
                  mode: item.id === "non-tech" ? "plain" : "dev",
                  plan: item.id === "team" ? "team" : "free",
                })
              }
            >
              <strong>{item.name}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </div>
        <div className="onboard-settings">
          <label>
            Hard cap per run (credits)
            <input
              type="number"
              min="1"
              max="100000"
              value={profile.budgetCap}
              onChange={(e) => setProfile({ ...profile, budgetCap: Number(e.target.value) })}
            />
          </label>
          <label>
            Ask approval above (credits)
            <input
              type="number"
              min="0"
              max="100000"
              value={profile.approvalThreshold}
              onChange={(e) =>
                setProfile({ ...profile, approvalThreshold: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Demo plan
            <select
              value={profile.plan}
              onChange={(e) =>
                setProfile({ ...profile, plan: e.target.value as BuilderProfile["plan"] })
              }
            >
              {Object.entries(PLANS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.label} · {p.credits.toLocaleString()} demo credits
                </option>
              ))}
            </select>
          </label>
          <label>
            Working mode
            <select
              value={profile.mode}
              onChange={(e) =>
                setProfile({ ...profile, mode: e.target.value as BuilderProfile["mode"] })
              }
            >
              <option value="plain">Plain English</option>
              <option value="dev">Dev mode</option>
            </select>
          </label>
        </div>
        <label className="onboard-check">
          <input
            type="checkbox"
            checked={profile.privateMode}
            onChange={(e) => setProfile({ ...profile, privateMode: e.target.checked })}
          />
          Private routing: use local models only (Lib 3)
        </label>
        {profile.persona !== "non-tech" && (
          <label className="onboard-check">
            <input
              type="checkbox"
              checked={profile.byok}
              onChange={(e) => setProfile({ ...profile, byok: e.target.checked })}
            />
            I plan to bring my own API key
          </label>
        )}
        <p className="onboard-footnote">
          Demo settings only. No plan purchase or real credits. API keys must be connected through a
          secure server integration; don’t paste them into chat.
        </p>
        {error && <p role="alert">{error}</p>}
        <button
          className="studio-button"
          onClick={() => {
            if (
              !Number.isInteger(profile.budgetCap) ||
              profile.budgetCap < 1 ||
              profile.budgetCap > 100000 ||
              !Number.isInteger(profile.approvalThreshold) ||
              profile.approvalThreshold < 0 ||
              profile.approvalThreshold > 100000
            ) {
              setError("Enter valid whole-number credit limits.");
              return;
            }
            onComplete(profile);
          }}
        >
          Continue to my workspace →
        </button>
      </section>
    </div>
  );
}
