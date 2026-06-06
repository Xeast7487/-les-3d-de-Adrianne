import type { APIRoute } from 'astro';
import Stripe from 'stripe';

const stripe = new Stripe(import.meta.env.STRIPE_SECRET_KEY as string);

export const POST: APIRoute = async ({ request }) => {
  try {
    const { name, price_cents, image_url, product_id } = await request.json();

    if (!name || !price_cents || price_cents < 50) {
      return new Response(JSON.stringify({ error: 'Paramètres invalides' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const origin = `${proto}://${host}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name,
              ...(image_url ? { images: [image_url] } : {}),
            },
            unit_amount: Math.round(price_cents),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
      metadata: { product_id: product_id || '' },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
