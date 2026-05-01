/**
 * _shared/cors.ts
 * Headers CORS padrão para todas as Edge Functions do AGORA.
 *
 * Uso:
 *   import { corsHeaders, corsResponse, handleCors } from '../_shared/cors.ts';
 *
 *   serve(async (req) => {
 *     if (req.method === 'OPTIONS') return handleCors();
 *     // ... lógica ...
 *     return new Response(body, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
 *   });
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-alert-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

/** Responde ao preflight OPTIONS imediatamente */
export function handleCors(): Response {
  return new Response('ok', { headers: corsHeaders, status: 200 });
}

/** Envolve um body JSON com os headers CORS e Content-Type correto */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Shortcut para erros */
export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}
