// Stand-in for Pine Labs with the same interface as createPineLabsClient, for demos and tests.
// Links point at this server's /mock/checkout page, which "pays" and fires a signed webhook.
import { randomBytes } from "node:crypto";

export function createMockPineLabsClient({ publicBaseUrl }) {
  const links = new Map();
  const id = () => "pl-mock-" + randomBytes(6).toString("hex");

  return {
    links,
    async createPaymentLink(req) {
      const link = {
        payment_link_id: id(),
        payment_link: "",
        status: "CREATED",
        amount: req.amount,
        amount_due: req.amount,
        merchant_payment_link_reference: req.merchant_payment_link_reference,
        description: req.description,
        expire_by: req.expire_by,
        callback_url: req.callback_url,
        customer: req.customer,
        created_at: new Date().toISOString(),
      };
      link.payment_link = `${publicBaseUrl}/mock/checkout/${link.payment_link_id}`;
      links.set(link.payment_link_id, link);
      return structuredClone(link);
    },
    async getPaymentLink(paymentLinkId) {
      const link = links.get(paymentLinkId);
      if (!link) throw Object.assign(new Error("Mock: unknown payment link"), { status: 404 });
      return structuredClone(link);
    },
    async cancelPaymentLink(paymentLinkId) {
      const link = links.get(paymentLinkId);
      if (link) link.status = "CANCELLED";
      return structuredClone(link);
    },
    /** Called by the mock checkout page. */
    markPaid(paymentLinkId) {
      const link = links.get(paymentLinkId);
      if (!link) return null;
      link.status = "PROCESSED";
      link.amount_due = { ...link.amount, value: 0 };
      link.order_id = "v1-mock-" + randomBytes(5).toString("hex");
      return structuredClone(link);
    },
  };
}
