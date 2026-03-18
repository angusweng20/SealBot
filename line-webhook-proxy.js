export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('ok', { status: 200 });
    }

    const body = await request.text();
    const headers = new Headers();
    headers.set('Content-Type', request.headers.get('content-type') || 'application/json');

    const signature = request.headers.get('x-line-signature');
    if (signature) {
      headers.set('x-line-signature', signature);
    }

    ctx.waitUntil(
      fetch(env.GAS_WEBHOOK_URL, {
        method: 'POST',
        headers,
        body,
        redirect: 'follow'
      })
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
