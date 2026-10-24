export class StudioHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireStudioOrigin(request: Request, siteUrl: string) {
  if (request.headers.get("origin") !== new URL(siteUrl).origin)
    throw new StudioHttpError(403, "Request origin is not allowed.");
}
export async function readStudioJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new StudioHttpError(415, "Use JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new StudioHttpError(400, "Missing request body.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65_536) {
      await reader.cancel();
      throw new StudioHttpError(413, "Draft is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new StudioHttpError(400, "Invalid JSON.");
  }
}
