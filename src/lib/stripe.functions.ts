import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STRIPE_BASE = "https://api.stripe.com/v1";

export type LineItemInput = {
  description: string;
  type: "one-time" | "monthly";
  amount: number;
};

function stripeHeaders() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

function formEncode(obj: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    params.append(k, String(v));
  }
  return params.toString();
}

async function stripeRequest(path: string, body?: Record<string, any>) {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: "POST",
    headers: stripeHeaders(),
    body: body ? formEncode(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `Stripe ${path} failed [${res.status}]: ${json?.error?.message || JSON.stringify(json)}`,
    );
  }
  return json;
}

async function sendResendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("RESEND_API_KEY not set, skipping email send");
    return { skipped: true };
  }
  const to = opts.to.filter(Boolean);
  if (!to.length) return { skipped: true };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PillarOS <onboarding@resend.dev>",
      to,
      subject: opts.subject,
      html: opts.html,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Resend send failed", json);
    throw new Error(`Email failed: ${json?.message || res.statusText}`);
  }
  return json;
}

function money(n: number) {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

function renderItemsTable(items: LineItemInput[]) {
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${escapeHtml(i.description)}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${i.type === "monthly" ? "Monthly" : "One-time"}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${money(i.amount)}${i.type === "monthly" ? "/mo" : ""}</td></tr>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead><tr><th style="text-align:left;padding:6px 10px;background:#f1f5f9">Description</th><th style="text-align:left;padding:6px 10px;background:#f1f5f9">Type</th><th style="text-align:right;padding:6px 10px;background:#f1f5f9">Amount</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function escapeHtml(s: string) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const createStripeInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      invoiceId: string;
      clientName: string;
      clientEmail: string;
      serviceDescription: string;
      items: LineItemInput[];
      salespersonEmail?: string;
      salespersonName?: string;
      invoiceNumber?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const customer = await stripeRequest("/customers", {
      name: data.clientName,
      email: data.clientEmail,
    });

    const invoice = await stripeRequest("/invoices", {
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 7,
      description: data.serviceDescription,
    });

    for (const item of data.items) {
      if (!item.amount || item.amount <= 0) continue;
      const label =
        item.type === "monthly"
          ? `${item.description} (Monthly Recurring)`
          : item.description;
      await stripeRequest("/invoiceitems", {
        customer: customer.id,
        invoice: invoice.id,
        amount: Math.round(item.amount * 100),
        currency: "aud",
        description: label,
      });
    }

    await stripeRequest(`/invoices/${invoice.id}/finalize`);
    const sent = await stripeRequest(`/invoices/${invoice.id}/send`);

    await supabaseAdmin
      .from("invoices")
      .update({
        stripe_invoice_id: sent.id,
        status: "sent",
      })
      .eq("id", data.invoiceId);

    // Internal notification email
    const oneTimeTotal = data.items
      .filter((i) => i.type === "one-time")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const monthlyTotal = data.items
      .filter((i) => i.type === "monthly")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);

    const recipients = Array.from(
      new Set(
        [data.salespersonEmail, "willc@pillaros.net"].filter(
          (v): v is string => !!v,
        ),
      ),
    );

    const html = `
      <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:640px">
        <h2 style="margin:0 0 8px">Invoice ${escapeHtml(data.invoiceNumber || "")} created for ${escapeHtml(data.clientName)}</h2>
        <p style="color:#475569;margin:0 0 16px">Salesperson: ${escapeHtml(data.salespersonName || "—")}</p>
        <p style="margin:0 0 4px"><strong>Client:</strong> ${escapeHtml(data.clientName)}</p>
        <p style="margin:0 0 16px"><strong>Client email:</strong> ${escapeHtml(data.clientEmail)}</p>
        <p style="margin:0 0 8px"><strong>Service:</strong> ${escapeHtml(data.serviceDescription)}</p>
        ${renderItemsTable(data.items)}
        <p style="margin:16px 0 4px"><strong>One-time total:</strong> ${money(oneTimeTotal)}</p>
        <p style="margin:0 0 4px"><strong>Monthly recurring:</strong> ${money(monthlyTotal)}/month</p>
        <p style="margin:0 0 16px"><strong>Total due today:</strong> ${money(oneTimeTotal)}</p>
        ${sent.hosted_invoice_url ? `<p><a href="${sent.hosted_invoice_url}" style="color:#2563eb">View hosted invoice</a></p>` : ""}
      </div>
    `;

    try {
      await sendResendEmail({
        to: recipients,
        subject: `Invoice ${data.invoiceNumber || ""} created for ${data.clientName}`,
        html,
      });
    } catch (e) {
      console.error("Invoice notification email failed", e);
    }

    return {
      stripe_invoice_id: sent.id,
      hosted_invoice_url: sent.hosted_invoice_url,
    };
  });

export const recordStripePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      receiptId: string;
      clientName: string;
      clientEmail: string;
      items: LineItemInput[];
      paymentMethod: string;
      receiptNumber?: string;
      salespersonEmail?: string;
      salespersonName?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { data: matches } = await supabaseAdmin
      .from("invoices")
      .select("id, stripe_invoice_id")
      .eq("client_email", data.clientEmail)
      .eq("status", "sent")
      .not("stripe_invoice_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const matchedInvoice = matches?.[0];

    if (matchedInvoice?.stripe_invoice_id) {
      try {
        await stripeRequest(`/invoices/${matchedInvoice.stripe_invoice_id}/pay`, {
          paid_out_of_band: true,
        });
        await supabaseAdmin
          .from("invoices")
          .update({ status: "paid" })
          .eq("id", matchedInvoice.id);
      } catch (e) {
        console.error("Stripe pay failed", e);
      }
    }

    await supabaseAdmin
      .from("receipts")
      .update({ status: "sent" })
      .eq("id", data.receiptId);

    const total = data.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const recipients = Array.from(
      new Set(
        [data.salespersonEmail, "willc@pillaros.net"].filter(
          (v): v is string => !!v,
        ),
      ),
    );

    const html = `
      <div style="font-family:Arial,sans-serif;color:#0f172a;max-width:640px">
        <h2 style="margin:0 0 8px">Receipt ${escapeHtml(data.receiptNumber || "")} sent to ${escapeHtml(data.clientName)}</h2>
        <p style="color:#475569;margin:0 0 16px">Salesperson: ${escapeHtml(data.salespersonName || "—")}</p>
        <p style="margin:0 0 4px"><strong>Client:</strong> ${escapeHtml(data.clientName)}</p>
        <p style="margin:0 0 4px"><strong>Client email:</strong> ${escapeHtml(data.clientEmail)}</p>
        <p style="margin:0 0 4px"><strong>Payment method:</strong> ${escapeHtml(data.paymentMethod)}</p>
        <p style="margin:0 0 16px"><strong>Date:</strong> ${new Date().toLocaleString()}</p>
        ${renderItemsTable(data.items)}
        <p style="margin:16px 0"><strong>Total received:</strong> ${money(total)}</p>
      </div>
    `;

    try {
      await sendResendEmail({
        to: recipients,
        subject: `Receipt ${data.receiptNumber || ""} sent to ${data.clientName}`,
        html,
      });
    } catch (e) {
      console.error("Receipt notification email failed", e);
    }

    return { ok: true };
  });

export const getStripeMode = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.STRIPE_SECRET_KEY || "";
  return { test: key.startsWith("sk_test_") };
});
