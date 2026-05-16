/**
 * Fatture in Cloud — SDI bridge (stub).
 *
 * Italian B2B/B2C electronic invoicing must transit the SDI (Sistema di
 * Interscambio). Stripe Invoicing produces the PDF + tax lines; this connector
 * forwards the finalized invoice to Fatture in Cloud, which files it with SDI.
 *
 * Wired to the Stripe `invoice.paid` webhook (see routes/webhook.js).
 *
 * To go live:
 *   1. Create a Fatture in Cloud app → OAuth2 client_id/secret.
 *   2. Set FIC_ACCESS_TOKEN + FIC_COMPANY_ID in .env.
 *   3. Replace the stubbed fetch below with the real
 *      POST /c/{company_id}/issued_documents call.
 *   API docs: https://developers.fattureincloud.it
 */

const FIC_API = 'https://api-v2.fattureincloud.it';

const configured = () =>
  !!process.env.FIC_ACCESS_TOKEN && !!process.env.FIC_COMPANY_ID;

/**
 * Forward a paid Stripe invoice to Fatture in Cloud → SDI.
 * @param {object} invoice  Stripe invoice object from the webhook.
 */
export async function forwardInvoiceToSDI(invoice) {
  if (!configured()) {
    console.log(`[fic] SDI bridge not configured — skipping invoice ${invoice.id}`);
    return { ok: false, reason: 'not configured' };
  }

  const payload = {
    data: {
      type: 'invoice',
      // Stripe gives amounts in cents; FIC expects EUR units.
      amount_gross: (invoice.amount_paid ?? 0) / 100,
      currency: (invoice.currency ?? 'eur').toUpperCase(),
      entity: {
        name:  invoice.customer_name || invoice.customer_email || 'Cliente',
        email: invoice.customer_email || '',
        // VAT id collected by Stripe Tax tax_id_collection, when present.
        vat_number: invoice.customer_tax_ids?.[0]?.value || '',
      },
      stripe_invoice_id: invoice.id,
      e_invoice: true,            // route through SDI
    },
  };

  try {
    const res = await fetch(
      `${FIC_API}/c/${process.env.FIC_COMPANY_ID}/issued_documents`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.FIC_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) throw new Error(`FIC ${res.status}`);
    console.log(`[fic] invoice ${invoice.id} forwarded to SDI`);
    return { ok: true };
  } catch (err) {
    console.error('[fic] SDI forward failed:', err.message);
    return { ok: false, reason: err.message };
  }
}
