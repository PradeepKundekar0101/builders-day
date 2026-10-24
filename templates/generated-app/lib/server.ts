import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function db() {
  const jar = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error("Connect a dedicated Supabase project before using authentication or data.");
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) =>
        values.forEach(({ name, value, options }) => jar.set(name, value, options)),
    },
  });
}
