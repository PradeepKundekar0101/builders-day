import { db } from "../../../lib/server";
import product from "../../../product.json";
type Entity = { name: string; fields: { name: string; type: string; required: boolean }[] };
async function handle(request: Request) {
  try {
    const method = request.method;
    if (
      method !== "GET" &&
      request.headers.get("origin") !== new URL(process.env.SITE_URL ?? request.url).origin
    )
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    const raw = method === "GET" ? "" : await request.text();
    if (raw.length > 32000) return Response.json({ error: "Request too large" }, { status: 413 });
    const body =
      method === "GET"
        ? { entity: new URL(request.url).searchParams.get("entity") }
        : JSON.parse(raw);
    const client = await db();
    if (method === "POST" && body.action === "signin") {
      if (!product.spec.auth.enabled || typeof body.email !== "string" || body.email.length > 254)
        return Response.json({ error: "Invalid email" }, { status: 400 });
      const { error } = await client.auth.signInWithOtp({
        email: body.email,
        options: {
          emailRedirectTo: new URL(
            "/auth/confirm?next=%2F",
            process.env.SITE_URL ?? request.url,
          ).toString(),
        },
      });
      if (error) throw new Error("Could not send sign-in link. Try again later.");
      return Response.json({ ok: true });
    }
    if (method === "POST" && body.action === "signout") {
      await client.auth.signOut({ scope: "local" });
      return Response.json({ ok: true });
    }
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return Response.json({ error: "Sign in to access your records." }, { status: 401 });
    const entity = (product.spec.entities as Entity[]).find((e) => e.name === body.entity);
    if (!entity) return Response.json({ error: "Unknown entity" }, { status: 400 });
    if (method === "GET") {
      const { data, error } = await client
        .from(entity.name)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error("Unable to load data. Check the generated migration.");
      return Response.json({ rows: data });
    }
    if (
      ["PATCH", "DELETE"].includes(method) &&
      !/^([a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12})$/i.test(body.id)
    )
      return Response.json({ error: "Invalid record" }, { status: 400 });
    if (method === "DELETE") {
      const { error } = await client
        .from(entity.name)
        .delete()
        .eq("id", body.id)
        .eq("user_id", user.id);
      if (error) throw new Error("Delete failed");
      return Response.json({ ok: true });
    }
    const data: Record<string, unknown> = {};
    for (const f of entity.fields) {
      let v = body.data?.[f.name];
      if (v === "" || v === undefined || v === null) {
        if (f.required) throw new Error("Complete required fields");
        v = null;
      } else if (f.type === "number") {
        v = Number(v);
        if (!Number.isFinite(v)) throw new Error("Invalid number");
      } else if (f.type === "boolean") {
        if (!["true", "false"].includes(v)) throw new Error("Use true or false");
        v = v === "true";
      } else if (typeof v !== "string" || v.length > 10000) throw new Error("Invalid field");
      data[f.name] = v;
    }
    const query =
      method === "PATCH"
        ? client.from(entity.name).update(data).eq("id", body.id).eq("user_id", user.id)
        : client.from(entity.name).insert({ ...data, user_id: user.id });
    const { error } = await query;
    if (error) throw new Error("Unable to save record");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400 },
    );
  }
}
export const GET = handle,
  POST = handle,
  PATCH = handle,
  DELETE = handle;
