// =============================================================================
// SINCRONIZAÇÃO DAS FICHAS (Netlify Function + Netlify Blobs)
//
// GET    /.netlify/functions/sync?code=ABC123&pin=123456  → devolve as fichas
// POST   /.netlify/functions/sync   { code, pin, payload } → guarda as fichas
// DELETE /.netlify/functions/sync   { code, pin }          → apaga o espaço
//
// O código é o "endereço" do espaço e o PIN é a senha. Só quem tem os dois
// consegue ler ou gravar. Nada além das fichas é guardado.
// =============================================================================
import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB por espaço
const CODE_RE = /^[A-Z0-9]{6,16}$/;
const PIN_RE = /^\d{4,8}$/;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS'
  }
});

const hashPin = (code, pin) => createHash('sha256').update(`${code}:${pin}`).digest('hex');

function samePin(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return json(204, {});

  const store = getStore({ name: 'fichas-v20', consistency: 'strong' });
  const url = new URL(req.url);

  let code;
  let pin;
  let payload;
  if (req.method === 'GET') {
    code = (url.searchParams.get('code') || '').toUpperCase();
    pin = url.searchParams.get('pin') || '';
  } else {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return json(400, { error: 'Corpo inválido.' });
    }
    code = String(body.code || '').toUpperCase();
    pin = String(body.pin || '');
    payload = body.payload;
  }

  if (!CODE_RE.test(code)) return json(400, { error: 'Código inválido.' });
  if (!PIN_RE.test(pin)) return json(400, { error: 'PIN inválido.' });

  const key = `space/${code}.json`;
  const existing = await store.get(key, { type: 'json' });

  if (existing && !samePin(existing.pin, hashPin(code, pin))) {
    return json(403, { error: 'PIN não confere para este código.' });
  }

  if (req.method === 'GET') {
    if (!existing) return json(404, { error: 'Nada guardado com esse código ainda.' });
    return json(200, { payload: existing.payload, updatedAt: existing.updatedAt, device: existing.device || '' });
  }

  if (req.method === 'DELETE') {
    if (existing) await store.delete(key);
    return json(200, { ok: true });
  }

  if (req.method === 'POST') {
    if (!payload || typeof payload !== 'object') return json(400, { error: 'Sem fichas para guardar.' });
    const raw = JSON.stringify(payload);
    if (raw.length > MAX_BYTES) return json(413, { error: 'Fichas grandes demais para o espaço (limite de 3 MB).' });
    const record = {
      pin: hashPin(code, pin),
      payload,
      updatedAt: new Date().toISOString(),
      device: String((payload && payload.device) || '').slice(0, 60)
    };
    await store.setJSON(key, record);
    return json(200, { ok: true, updatedAt: record.updatedAt });
  }

  return json(405, { error: 'Método não suportado.' });
}
