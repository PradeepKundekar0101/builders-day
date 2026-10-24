"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { captureAuthenticatedAppVisit, identifyAnalyticsUser } from "@/lib/analytics";

export function AnalyticsIdentity({ userId }: { userId: string | null }) {
  const pathname = usePathname();
  const lastVisit = useRef<string | null>(null);

  useEffect(() => {
    identifyAnalyticsUser(userId);
    const visit =
      userId && (pathname === "/apps" || pathname.startsWith("/apps/"))
        ? `${userId}:${pathname}`
        : null;
    if (visit && lastVisit.current !== visit) captureAuthenticatedAppVisit();
    lastVisit.current = visit;
  }, [userId, pathname]);

  return null;
}
