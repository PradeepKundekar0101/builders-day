import { saveStudio, studioError } from "@/lib/prompt-studio/server";
export async function POST(request: Request) {
  try {
    return await saveStudio(request);
  } catch (error) {
    return studioError(error);
  }
}
