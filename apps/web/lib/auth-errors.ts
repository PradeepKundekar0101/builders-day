const MESSAGES: Record<string, string> = {
  over_email_send_rate_limit: "We just sent you a link. Wait a minute, then try again.",
  over_request_rate_limit: "We just sent you a link. Wait a minute, then try again.",
  email_address_invalid: "That email address doesn't look right. Check it and try again.",
};

const FALLBACK = "We couldn't send the link. Try again in a moment.";

/** Supabase's raw auth messages are for developers; users see these instead. */
export function friendlyAuthError(error: { code?: string; message: string }): string {
  return (error.code && MESSAGES[error.code]) || FALLBACK;
}
