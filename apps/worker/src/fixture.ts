import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateProduct } from "./generate";
const directory = resolve(process.argv[2] ?? "/tmp/provn-generated-fixture");
const spec = {
  name: "Studio projects",
  summary: "Track personal product projects",
  pages: [{ name: "Home", purpose: "Project overview", mustHave: true }],
  entities: [
    {
      name: "projects",
      ownerScoped: true,
      mustHave: true,
      fields: [
        { name: "title", type: "text", required: true },
        { name: "progress", type: "number", required: false },
      ],
    },
  ],
  auth: { enabled: true, providers: ["email"] },
  integrations: [],
};
await generateProduct({
  spec,
  design: {
    headline: "A home for your next product",
    description: "Keep your projects and progress together.",
    accent: "violet",
    pages: [
      {
        title: "Home",
        body: "Create a project, record its progress, and keep your work private to your account.",
      },
    ],
  },
  directory,
  template: fileURLToPath(new URL("../../../templates/generated-app/", import.meta.url)),
  onStep: async (message) => {
    process.stdout.write(message + "\n");
  },
});
process.stdout.write(
  `Fixture product built at ${directory}. No model call or production writes.\n`,
);
