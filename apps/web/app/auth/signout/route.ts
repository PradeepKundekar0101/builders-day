import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  // Only our own pages may sign a user out; a form on another site must not.
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return new NextResponse("Cross-site sign-out refused", { status: 403 });
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
