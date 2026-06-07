import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const sb = createClient(
  'https://gnpjilwdehxsafdqdtak.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImducGppbHdkZWh4c2FmZHFkdGFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Nzk3NjIsImV4cCI6MjA5NTU1NTc2Mn0.iFYR9r5ZZsKcc9n2N8jPtFTLs0QDTIqR3KMCMhCdSdA'
);

function hashPassword(pwd: string) {
  return createHash('sha256').update(pwd + 'adrianne-portal-salt').digest('hex');
}

export const POST: APIRoute = async ({ request }) => {
  const json = await request.json().catch(() => null);
  const { email, password } = json || {};

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email et mot de passe requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: client, error } = await sb
    .from('adrianne_clients')
    .select('id, name, email, company, phone, password_hash')
    .eq('email', (email as string).toLowerCase().trim())
    .single();

  if (error || !client) {
    return new Response(JSON.stringify({ error: 'Identifiants invalides' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const hash = hashPassword(password as string);
  if (hash !== client.password_hash) {
    return new Response(JSON.stringify({ error: 'Identifiants invalides' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({ id: client.id, name: client.name, email: client.email, company: client.company }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
};
