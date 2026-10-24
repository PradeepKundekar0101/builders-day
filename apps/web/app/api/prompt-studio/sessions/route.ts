import { saveStudio, studioError, studioUser, studioDb } from "@/lib/prompt-studio/server";
export async function POST(request: Request) {
  try {
    return await saveStudio(request);
  } catch (error) {
    return studioError(error);
  }
}

export async function GET() {
  try {
    const userId = await studioUser();
    const { data, error } = await studioDb()
      .from("prompt_studio_sessions")
      .select("id, revision, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error)
      return Response.json({ error: "Saved drafts are temporarily unavailable." }, { status: 503 });
    return Response.json({ sessions: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return studioError(error);
  }
}
