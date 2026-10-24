/** Orbital P: a continuous stem, rising orbit and a small proof point. */
export function ProvnLogo() {
  return (
    <>
      <svg
        className="provn-logo-mark"
        width="38"
        height="38"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M12 32V9h10a8 8 0 0 1 0 16H12"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <ellipse
          cx="21"
          cy="19"
          rx="17"
          ry="7"
          transform="rotate(-35 21 19)"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <circle cx="33" cy="9" r="2.5" fill="currentColor" />
      </svg>
      <span className="provn-logo-word">PROVN</span>
    </>
  );
}
