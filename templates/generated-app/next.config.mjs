// PROVN sets PROVN_EMBED_ORIGIN on the deployed project so its Studio can show the live app; nothing else may frame it.
const embed = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(process.env.PROVN_EMBED_ORIGIN ?? "")
  ? process.env.PROVN_EMBED_ORIGIN
  : null;
export default {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          ...(embed ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors ${embed ?? "'none'"}; form-action 'self'`,
          },
        ],
      },
    ];
  },
};
