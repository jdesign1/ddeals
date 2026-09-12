// Temporary destination while the custom support inbox is being set up.
// Override this in Vercel with CONTACT_FORM_TO_EMAIL when hello@ is ready.
const DEFAULT_CONTACT_EMAIL = "dodgydealnz@gmail.com";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactMode = "support" | "report";

interface ContactPayload {
  mode: ContactMode;
  name: string;
  email: string;
  product: string;
  retailer: string;
  store: string;
  displayedPrice: string;
  message: string;
  website: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parsePayload(value: unknown): ContactPayload | null {
  if (!value || typeof value !== "object") return null;

  const input = value as Record<string, unknown>;
  const mode = input.mode === "support" || input.mode === "report" ? input.mode : null;
  const payload: ContactPayload = {
    mode: mode ?? "support",
    name: text(input.name),
    email: text(input.email),
    product: text(input.product),
    retailer: text(input.retailer),
    store: text(input.store),
    displayedPrice: text(input.displayedPrice),
    message: text(input.message),
    website: text(input.website),
  };

  if (!mode) return null;
  if (!payload.email || payload.email.length > 320 || !EMAIL_PATTERN.test(payload.email)) return null;
  if (!payload.message || payload.message.length > 4000) return null;
  if (payload.name.length > 200 || payload.product.length > 300 || payload.retailer.length > 200) return null;
  if (payload.store.length > 200 || payload.displayedPrice.length > 100 || payload.website.length > 200) return null;
  if (payload.mode === "report" && !payload.product) return null;

  return payload;
}

function buildEmail(payload: ContactPayload): { subject: string; text: string } {
  if (payload.mode === "report") {
    const safeProduct = payload.product.replace(/[\r\n]+/g, " ");
    return {
      subject: `Incorrect deal report: ${safeProduct}`,
      text: [
        "Submitted from the Dodgy Deal app",
        `Name: ${payload.name || "Not provided"}`,
        `Reply email: ${payload.email}`,
        `Product: ${payload.product}`,
        `Retailer: ${payload.retailer || "Not provided"}`,
        `Store or location: ${payload.store || "Not provided"}`,
        `Displayed price: ${payload.displayedPrice || "Not provided"}`,
        "",
        "What needs correcting:",
        payload.message,
      ].join("\n"),
    };
  }

  return {
    subject: "Dodgy Deal support request",
    text: [
      "Submitted from the Dodgy Deal app",
      `Name: ${payload.name || "Not provided"}`,
      `Reply email: ${payload.email}`,
      "",
      "How can we help?",
      payload.message,
    ].join("\n"),
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return Response.json({ error: "Please check the form and try again." }, { status: 400 });
  }

  const payload = parsePayload(rawPayload);
  if (!payload) {
    return Response.json({ error: "Please check the form and try again." }, { status: 400 });
  }

  // Quietly discard obvious bot submissions. The visible form never fills this field.
  if (payload.website) return Response.json({ ok: true });

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.CONTACT_FORM_FROM_EMAIL;
  const contactEmail = process.env.CONTACT_FORM_TO_EMAIL || DEFAULT_CONTACT_EMAIL;
  if (!apiKey || !fromEmail) {
    console.error("Contact form email is not configured.");
    return Response.json({ error: "Support is temporarily unavailable. Please try again later." }, { status: 503 });
  }

  const email = buildEmail(payload);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [contactEmail],
        reply_to: payload.email,
        subject: email.subject,
        text: email.text,
      }),
    });

    if (!response.ok) {
      console.error("Contact form email provider rejected the request.", { status: response.status });
      return Response.json({ error: "We couldn't send that right now. Please try again." }, { status: 502 });
    }
  } catch (error) {
    console.error("Contact form email request failed.", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "We couldn't send that right now. Please try again." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
