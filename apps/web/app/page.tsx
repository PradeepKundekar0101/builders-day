import Link from "next/link";

const sampleLines = [
  { label: "Sign-in with email and Google", hours: "0.5 h" },
  { label: "3 data types, each with a form and a list", hours: "2.25 h" },
  { label: "Pine Labs checkout", hours: "1 h" },
  { label: "2 pages", hours: "0.5 h" },
];

const steps = [
  {
    title: "Describe your idea",
    body: "A few sentences in plain words. We ask up to four questions.",
  },
  {
    title: "See the price, then approve",
    body: "Turn features on or off and watch the price change.",
  },
  {
    title: "We build, check and deploy",
    body: "Your app goes live after a security check passes.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
      <section className="grid items-center gap-12 md:grid-cols-[1.1fr_1fr]">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Know the price before you build.
          </h1>
          <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-slate">
            Tell us your idea, see what it costs before you spend a rupee, approve it, and we build
            and deploy it securely.
          </p>
          <Link
            href="/signin"
            className="mt-8 inline-flex h-12 items-center rounded-lg bg-go px-6 text-base font-semibold text-white hover:bg-go-hover"
          >
            Price my idea
          </Link>
        </div>

        <figure aria-label="Sample estimate" className="relative">
          <div className="rounded-xl border border-rule bg-surface p-6 shadow-[0_1px_0_var(--color-rule),0_12px_32px_-16px_rgb(19_32_58/0.25)]">
            <figcaption className="text-sm text-slate">Sample estimate</figcaption>
            <p className="mt-1 text-xl font-bold">Tiffin order tracker</p>
            <ul className="mt-5 divide-y divide-dashed divide-rule border-y border-dashed border-rule">
              {sampleLines.map((line) => (
                <li key={line.label} className="flex justify-between gap-4 py-2.5 text-sm">
                  <span>{line.label}</span>
                  <span className="shrink-0 text-slate">{line.hours}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-slate">Estimated price</p>
                <p className="mt-1 text-4xl font-extrabold">
                  <span className="bg-marker px-1 [box-decoration-break:clone]">$4.96</span>
                </p>
              </div>
              <p className="text-right text-sm text-slate">
                about 4 to 5 hours
                <br />
                range $3.47 to $6.45
              </p>
            </div>
          </div>
        </figure>
      </section>

      <section aria-labelledby="how" className="mt-20 border-t border-rule pt-10">
        <h2 id="how" className="text-xl font-bold">
          How it works
        </h2>
        <ol className="mt-6 grid gap-8 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title}>
              <span className="text-3xl font-extrabold text-slate/45">{i + 1}</span>
              <p className="mt-2 font-semibold">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
