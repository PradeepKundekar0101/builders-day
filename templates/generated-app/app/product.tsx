"use client";
import { useState } from "react";
import product from "../product.json";
type Entity = { name: string; fields: { name: string; type: string; required: boolean }[] };
const spec = product.spec as { name: string; auth: { enabled: boolean }; entities: Entity[] };
const colors = { blue: "#2855d9", violet: "#7144b9", green: "#16744a", orange: "#b75c18" };
export default function Product() {
  const [page, setPage] = useState(0),
    [entity, setEntity] = useState<Entity | null>(null),
    [rows, setRows] = useState<Record<string, unknown>[]>([]),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState<string | null>(null);
  async function request(method: string, body: unknown) {
    const res = await fetch("/api/records", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    return json;
  }
  async function load(e: Entity) {
    try {
      setEntity(e);
      setEditing(null);
      const res = await fetch("/api/records?entity=" + encodeURIComponent(e.name));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRows(data.rows);
      setNotice("");
    } catch (err) {
      setRows([]);
      setNotice(err instanceof Error ? err.message : "Unable to load records");
    }
  }
  return (
    <main
      style={
        { "--accent": colors[product.design.accent as keyof typeof colors] } as React.CSSProperties
      }
    >
      <header>
        <strong>{spec.name}</strong>
        <nav>
          {product.design.pages.map((p, i) => (
            <button
              key={i}
              onClick={() => {
                setPage(i);
                setEntity(null);
                setNotice("");
              }}
            >
              {p.title}
            </button>
          ))}
          {spec.entities.map((e) => (
            <button key={e.name} onClick={() => void load(e)}>
              {e.name.replaceAll("_", " ")}
            </button>
          ))}
        </nav>
      </header>
      <section className="hero">
        <span>YOUR WORKSPACE</span>
        <h1>{product.design.headline}</h1>
        <p>{product.design.description}</p>
      </section>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {entity ? (
        <section className="card">
          <h2>{entity.name.replaceAll("_", " ")}</h2>
          <form
            key={entity.name + editing}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const data = Object.fromEntries(new FormData(e.currentTarget));
                await request(editing ? "PATCH" : "POST", {
                  entity: entity.name,
                  id: editing,
                  data,
                });
                await load(entity);
              } catch (err) {
                setNotice(err instanceof Error ? err.message : "Save failed");
              }
            }}
          >
            {entity.fields.map((f) => (
              <label key={f.name}>
                {f.name.replaceAll("_", " ")}
                <input
                  name={f.name}
                  required={f.required}
                  type={
                    f.type === "number"
                      ? "number"
                      : f.type === "date"
                        ? "date"
                        : f.type === "email"
                          ? "email"
                          : f.type === "url" || f.type === "image"
                            ? "url"
                            : "text"
                  }
                  placeholder={f.type === "boolean" ? "true or false" : undefined}
                  defaultValue={
                    editing ? String(rows.find((r) => r.id === editing)?.[f.name] ?? "") : ""
                  }
                />
              </label>
            ))}
            <button type="submit">{editing ? "Update" : "Create"}</button>
            {editing && (
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            )}
          </form>
          <div className="records">
            {rows.map((row) => (
              <article key={String(row.id)}>
                {entity.fields.map((f) => (
                  <p key={f.name}>
                    <strong>{f.name}: </strong>
                    {String(row[f.name] ?? "")}
                  </p>
                ))}
                <button onClick={() => setEditing(String(row.id))}>Edit</button>
                <button
                  onClick={async () => {
                    try {
                      await request("DELETE", { entity: entity.name, id: row.id });
                      await load(entity);
                    } catch (err) {
                      setNotice(err instanceof Error ? err.message : "Delete failed");
                    }
                  }}
                >
                  Delete
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>{product.design.pages[page].title}</h2>
          <p className="copy">{product.design.pages[page].body}</p>
        </section>
      )}
      {spec.auth.enabled && (
        <section className="card">
          <h2>Email sign-in</h2>
          <p>Sign in to access your private records.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await request("POST", {
                  action: "signin",
                  email: new FormData(e.currentTarget).get("email"),
                });
                setNotice("Check your email for a sign-in link.");
              } catch (err) {
                setNotice(err instanceof Error ? err.message : "Sign-in failed");
              }
            }}
          >
            <label>
              Email
              <input type="email" name="email" required />
            </label>
            <button>Send sign-in link</button>
          </form>
          <button
            onClick={async () => {
              try {
                await request("POST", { action: "signout" });
                setRows([]);
                setNotice("Signed out.");
              } catch {
                setNotice("Unable to sign out.");
              }
            }}
          >
            Sign out
          </button>
        </section>
      )}
      <footer>Built with PROVN · Review the generated app before production use.</footer>
    </main>
  );
}
