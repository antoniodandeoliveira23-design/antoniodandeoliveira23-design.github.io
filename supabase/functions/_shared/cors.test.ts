/**
 * _shared/cors.test.ts
 *
 * Testes das funções utilitárias de CORS.
 * Todas são puras: nenhuma dependência de env vars ou rede.
 */

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import {
  corsHeaders,
  handleCors,
  jsonResponse,
  errorResponse,
} from './cors.ts';

// ── corsHeaders ────────────────────────────────────────────────────

Deno.test('corsHeaders - contém Access-Control-Allow-Origin: *', () => {
  assertEquals(corsHeaders['Access-Control-Allow-Origin'], '*');
});

Deno.test('corsHeaders - contém Access-Control-Allow-Headers', () => {
  assertStringIncludes(
    corsHeaders['Access-Control-Allow-Headers'],
    'authorization',
  );
});

Deno.test('corsHeaders - contém Access-Control-Allow-Methods com POST e GET', () => {
  const methods = corsHeaders['Access-Control-Allow-Methods'];
  assertStringIncludes(methods, 'POST');
  assertStringIncludes(methods, 'GET');
  assertStringIncludes(methods, 'OPTIONS');
});

// ── handleCors ─────────────────────────────────────────────────────

Deno.test('handleCors - retorna status 200', () => {
  const resp = handleCors();
  assertEquals(resp.status, 200);
});

Deno.test('handleCors - body é "ok"', async () => {
  const resp = handleCors();
  const body = await resp.text();
  assertEquals(body, 'ok');
});

Deno.test('handleCors - inclui Access-Control-Allow-Origin no header', () => {
  const resp = handleCors();
  assertEquals(resp.headers.get('Access-Control-Allow-Origin'), '*');
});

// ── jsonResponse ───────────────────────────────────────────────────

Deno.test('jsonResponse - status padrão 200', async () => {
  const resp = jsonResponse({ ok: true });
  assertEquals(resp.status, 200);
  const data = await resp.json();
  assertEquals(data.ok, true);
});

Deno.test('jsonResponse - status customizado', async () => {
  const resp = jsonResponse({ msg: 'criado' }, 201);
  assertEquals(resp.status, 201);
});

Deno.test('jsonResponse - Content-Type é application/json', () => {
  const resp = jsonResponse({});
  assertEquals(resp.headers.get('Content-Type'), 'application/json');
});

Deno.test('jsonResponse - inclui CORS headers', () => {
  const resp = jsonResponse({});
  assertEquals(resp.headers.get('Access-Control-Allow-Origin'), '*');
});

Deno.test('jsonResponse - serializa objetos complexos', async () => {
  const resp = jsonResponse({ lista: [1, 2, 3], nested: { a: 'b' } });
  const data = await resp.json();
  assertEquals(data.lista.length, 3);
  assertEquals(data.nested.a, 'b');
});

// ── errorResponse ──────────────────────────────────────────────────

Deno.test('errorResponse - status padrão 400', async () => {
  const resp = errorResponse('erro teste');
  assertEquals(resp.status, 400);
  const data = await resp.json();
  assertEquals(data.error, 'erro teste');
});

Deno.test('errorResponse - status customizado 500', async () => {
  const resp = errorResponse('falha interna', 500);
  assertEquals(resp.status, 500);
});

Deno.test('errorResponse - inclui CORS headers', () => {
  const resp = errorResponse('erro');
  assertEquals(resp.headers.get('Access-Control-Allow-Origin'), '*');
});
