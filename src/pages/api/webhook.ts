import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY as string);
const resend = new Resend(import.meta.env.RESEND_API_KEY as string);
const sb = createClient(
  import.meta.env.SUPABASE_URL as string,
  import.meta.env.SUPABASE_ANON_KEY as string
);

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      import.meta.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signature invalide';
    console.error('Webhook signature error:', msg);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response('OK', { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Fetch full session with line items expanded
  const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items'],
  });

  const lineItem = fullSession.line_items?.data[0];
  const productName =
    lineItem?.description ||
    session.metadata?.product_name ||
    'Impression 3D personnalisée';
  const amountTotal = ((session.amount_total ?? 0) / 100).toFixed(2);
  const currency = (session.currency ?? 'cad').toUpperCase();

  const customerEmail = session.customer_details?.email ?? '';
  const nomField = session.custom_fields?.find(f => f.key === 'nom_complet');
  const customerName =
    nomField?.text?.value ||
    session.customer_details?.name ||
    'Client';

  // Generate order number  ADR-YYYYMMDD-XXX
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const rand = Math.floor(Math.random() * 900) + 100;
  const orderNumber = `ADR-${dateStr}-${rand}`;

  // Create order in Supabase
  const { error: dbError } = await sb.from('adrianne_orders').insert({
    order_number: orderNumber,
    client_name: customerName,
    description: `${productName} — ${amountTotal} ${currency}`,
    status: 'en_attente',
    notes: `Commande en ligne via Stripe.\nCourriel client : ${customerEmail}\nSession Stripe : ${session.id}`,
  });

  if (dbError) {
    console.error('Erreur Supabase lors de la création de commande:', dbError.message);
  }

  const siteUrl = 'https://les3darianne.xyz';
  const trackingUrl = `${siteUrl}/suivi?num=${orderNumber}`;
  const adrianneEmail = import.meta.env.ADRIANNE_EMAIL as string;
  const fromEmail = import.meta.env.RESEND_FROM_EMAIL as string;

  // Email de notification à Adrianne
  try {
    await resend.emails.send({
      from: `Les 3D d'Adrianne <${fromEmail}>`,
      to: adrianneEmail,
      subject: `Nouvelle commande ${orderNumber} — ${customerName}`,
      html: buildAdriannEmail({ orderNumber, customerName, customerEmail, productName, amountTotal, currency, trackingUrl }),
    });
  } catch (e) {
    console.error('Erreur envoi courriel Adrianne:', e);
  }

  // Courriel de confirmation au client
  if (customerEmail) {
    try {
      await resend.emails.send({
        from: `Les 3D d'Adrianne <${fromEmail}>`,
        to: customerEmail,
        reply_to: adrianneEmail,
        subject: `Confirmation de commande ${orderNumber} — Les 3D d'Adrianne`,
        html: buildClientEmail({ orderNumber, customerName, productName, amountTotal, currency, trackingUrl }),
      });
    } catch (e) {
      console.error('Erreur envoi courriel client:', e);
    }
  }

  return new Response('OK', { status: 200 });
};

function buildAdriannEmail(p: {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  amountTotal: string;
  currency: string;
  trackingUrl: string;
}) {
  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f4f0;color:#0d1b2e">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
    <div style="background:#0d1b2e;padding:28px 36px;text-align:center">
      <p style="margin:0;color:#c9a96e;font-size:1.35rem;font-weight:700;letter-spacing:0.06em">Les 3D d'Adrianne</p>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.55);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em">Nouvelle commande reçue</p>
    </div>
    <div style="padding:32px 36px">
      <p style="font-size:1.05rem;margin:0 0 6px;font-weight:600">Tu as une nouvelle commande&nbsp;! 🎉</p>
      <p style="color:#666;margin:0 0 28px;font-size:0.9rem;line-height:1.65">Elle a été créée automatiquement dans ton panel admin.</p>

      <div style="background:#f8f7f4;border-radius:10px;padding:20px 24px;margin-bottom:28px">
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
          <tr>
            <td style="padding:7px 0;color:#888;width:40%">Numéro</td>
            <td style="padding:7px 0;font-weight:700;letter-spacing:0.05em">${p.orderNumber}</td>
          </tr>
          <tr style="border-top:1px solid #ece9e2">
            <td style="padding:7px 0;color:#888">Client</td>
            <td style="padding:7px 0;font-weight:600">${p.customerName}</td>
          </tr>
          <tr style="border-top:1px solid #ece9e2">
            <td style="padding:7px 0;color:#888">Courriel</td>
            <td style="padding:7px 0"><a href="mailto:${p.customerEmail}" style="color:#0d1b2e;font-weight:500">${p.customerEmail}</a></td>
          </tr>
          <tr style="border-top:1px solid #ece9e2">
            <td style="padding:7px 0;color:#888">Article</td>
            <td style="padding:7px 0">${p.productName}</td>
          </tr>
          <tr style="border-top:1px solid #ece9e2">
            <td style="padding:7px 0;color:#888">Montant</td>
            <td style="padding:7px 0;font-weight:700;color:#16a34a;font-size:1rem">${p.amountTotal}&nbsp;${p.currency}</td>
          </tr>
        </table>
      </div>

      <a href="${p.trackingUrl}" style="display:block;background:#0d1b2e;color:#fff;text-align:center;padding:14px 20px;border-radius:8px;font-size:0.9rem;font-weight:600;text-decoration:none;margin-bottom:16px">
        Voir dans le panel admin →
      </a>

      <p style="font-size:0.78rem;color:#aaa;text-align:center;margin:0">
        Un courriel de confirmation a aussi été envoyé au client.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildClientEmail(p: {
  orderNumber: string;
  customerName: string;
  productName: string;
  amountTotal: string;
  currency: string;
  trackingUrl: string;
}) {
  return `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#f4f4f0;color:#0d1b2e">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
    <div style="background:#0d1b2e;padding:28px 36px;text-align:center">
      <p style="margin:0;color:#c9a96e;font-size:1.35rem;font-weight:700;letter-spacing:0.06em">Les 3D d'Adrianne</p>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.55);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em">Confirmation de commande</p>
    </div>
    <div style="padding:32px 36px">
      <p style="font-size:1.05rem;margin:0 0 8px;font-weight:600">Merci ${p.customerName}&nbsp;! ✨</p>
      <p style="color:#555;margin:0 0 28px;font-size:0.925rem;line-height:1.7">
        Votre paiement a bien été reçu. Adrianne s'occupera de votre commande avec soin et vous contactera prochainement pour confirmer les détails.
      </p>

      <div style="background:#f8f7f4;border-radius:10px;padding:20px 24px;margin-bottom:20px;border-left:4px solid #c9a96e">
        <p style="margin:0 0 6px;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.1em;color:#aaa;font-weight:600">Votre numéro de commande</p>
        <p style="margin:0;font-size:1.6rem;font-weight:800;color:#0d1b2e;letter-spacing:0.06em">${p.orderNumber}</p>
      </div>

      <div style="background:#f8f7f4;border-radius:10px;padding:20px 24px;margin-bottom:28px">
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
          <tr>
            <td style="padding:7px 0;color:#888;width:40%">Article</td>
            <td style="padding:7px 0;font-weight:600">${p.productName}</td>
          </tr>
          <tr style="border-top:1px solid #ece9e2">
            <td style="padding:7px 0;color:#888">Montant payé</td>
            <td style="padding:7px 0;font-weight:700;color:#16a34a">${p.amountTotal}&nbsp;${p.currency}</td>
          </tr>
        </table>
      </div>

      <a href="${p.trackingUrl}" style="display:block;background:#0d1b2e;color:#fff;text-align:center;padding:14px 20px;border-radius:8px;font-size:0.9rem;font-weight:600;text-decoration:none;margin-bottom:28px">
        Suivre ma commande →
      </a>

      <div style="border-top:1px solid #ece9e2;padding-top:20px">
        <p style="font-size:0.8rem;color:#aaa;text-align:center;margin:0;line-height:1.7">
          Des questions ? Répondez directement à ce courriel.<br>
          <a href="https://les3darianne.xyz" style="color:#0d1b2e">les3darianne.xyz</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
