import { createClient } from 'npm:@supabase/supabase-js@2.112.2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Metodo invalido.' }, 405);

  const expectedSecret = Deno.env.get('FIO_PUSH_WEBHOOK_SECRET');
  if (expectedSecret && request.headers.get('x-fio-webhook-secret') !== expectedSecret) {
    return json({ error: 'Nao autorizado.' }, 401);
  }

  try {
    const payload = await request.json();
    const notificationId = payload?.record?.id ?? payload?.notification_id;
    if (!notificationId) return json({ error: 'Notification id ausente.' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) throw new Error('Configuracao do servidor indisponivel.');

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: notification, error } = await admin
      .from('fio_notifications')
      .select('id, user_id, title, description')
      .eq('id', notificationId)
      .maybeSingle();
    if (error || !notification) return json({ error: 'Notificacao nao encontrada.' }, 404);

    const { data: tokens } = await admin
      .from('fio_push_tokens')
      .select('token')
      .eq('user_id', notification.user_id);
    const messages = (tokens ?? []).map((row) => ({
      to: row.token,
      sound: 'default',
      title: notification.title,
      body: notification.description || 'Uma nova atualizacao foi registrada no FIO.',
      data: { notification_id: notification.id },
    }));
    if (messages.length === 0) return json({ sent: 0 });

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await response.json();
    return json({ sent: messages.length, result });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
