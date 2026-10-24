import { useState } from "react";
import { ProvnLogo } from "@/components/provn-logo";
export type WorkspaceView =
  "chat" | "brief" | "preview" | "cost" | "route" | "launch" | "shield" | "proof" | "wallet";
const groups = [
  {
    title: "WORKSPACE",
    items: [
      ["chat", "Agent chat", "M4 4h16v12H9l-5 4V4"],
      ["brief", "Brief & prompts", "M6 3h9l4 4v14H6V3 M9 11h7 M9 15h7"],
      ["preview", "App preview", "M3 4h18v14H3V4 M8 22h8 M12 18v4"],
    ],
  },
  {
    title: "BUILD & SHIP",
    items: [
      ["cost", "Cost Guard", "M5 3h14v18H5V3 M8 7h8 M8 11h2 M14 11h2 M8 15h2 M14 15h2"],
      ["route", "Model routing", "M5 5h5v5H5V5 M14 14h5v5h-5v-5 M10 7h7v7 M7 10v7h7"],
      ["launch", "Deployment", "M12 3v14 M6 9l6-6 6 6 M4 17v4h16v-4"],
      ["shield", "Security & Guild", "M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4 M8 12l3 3 5-6"],
      ["proof", "Proof report", "M6 3h12v18H6V3 M9 8h6 M9 12h6 M9 16h4"],
    ],
  },
] as const;
function Icon({ path }: { path: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}
export function WorkspaceNav({
  active,
  onSelect,
  project,
}: {
  active?: WorkspaceView;
  onSelect: (view: WorkspaceView) => void;
  project: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={`provn-left-nav ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Workspace sidebar"
    >
      <a href="/prompt-studio-demo" className="provn-nav-brand" aria-label="PROVN home">
        <ProvnLogo />
      </a>
      <button
        className="provn-nav-collapse"
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Icon path="M3 4h18v16H3V4 M9 4v16" />
        <span className="provn-nav-label">Collapse sidebar</span>
      </button>
      <a className="provn-nav-new" href="/prompt-studio-demo" title="New build">
        <Icon path="M12 5v14 M5 12h14" />
        <span className="provn-nav-label">New build</span>
      </a>
      <a className="provn-nav-item" href="/apps" title="My projects">
        <Icon path="M3 6h7l2 3h9v11H3V6" />
        <span className="provn-nav-label">My projects</span>
      </a>
      <div className="provn-nav-project provn-nav-label" title={project}>
        <span className="provn-nav-project-dot" />
        {project}
      </div>
      <nav aria-label="Project navigation">
        {groups.map((group) => (
          <div className="provn-nav-group" key={group.title}>
            <p className="provn-nav-label">{group.title}</p>
            {group.items.map(([id, label, path]) => (
              <button
                key={id}
                className="provn-nav-item"
                aria-label={label}
                aria-current={active === id ? "page" : undefined}
                title={label}
                onClick={() => onSelect(id)}
              >
                <Icon path={path} />
                <span className="provn-nav-label">{label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="provn-nav-bottom">
        <a className="provn-nav-item" href="/credits" title="Buy credits"><span className="provn-nav-label">Buy credits</span></a>
        <button
          className="provn-nav-item"
          aria-current={active === "wallet" ? "page" : undefined}
          title="Credits & plan"
          aria-label="Credits & plan"
          onClick={() => onSelect("wallet")}
        >
          <Icon path="M3 6h18v14H3V6 M16 11h5v5h-5v-5 M3 6l14-3v3" />
          <span className="provn-nav-label">Credits & plan</span>
        </button>
        <span className="provn-nav-label provn-nav-status">Demo workspace</span>
      </div>
    </aside>
  );
}
