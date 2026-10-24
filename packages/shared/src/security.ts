const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/** Returns every JWT-shaped substring whose payload claims the Supabase service_role. */
export function findServiceRoleJwts(text: string): string[] {
  return [...text.matchAll(JWT_PATTERN)]
    .map((m) => m[0])
    .filter((token) => {
      try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
        return payload?.role === "service_role";
      } catch {
        return false;
      }
    });
}
