import { db } from "../../../lib/server";
export async function GET(request: Request) {
  const url = new URL(request.url),
    client = await db();
  const code = url.searchParams.get("code"),
    token = url.searchParams.get("token_hash");
  const result = code
    ? await client.auth.exchangeCodeForSession(code)
    : token
      ? await client.auth.verifyOtp({ token_hash: token, type: "email" })
      : { error: true };
  return Response.redirect(
    new URL(result.error ? "/?auth=expired" : "/", process.env.SITE_URL ?? url.origin),
  );
}
