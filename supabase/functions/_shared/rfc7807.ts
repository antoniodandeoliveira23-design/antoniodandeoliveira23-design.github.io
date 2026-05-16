/**
 * _shared/rfc7807.ts
 * Helper para respostas de erro no formato RFC 7807 — Problem Details for HTTP APIs.
 * https://datatracker.ietf.org/doc/html/rfc7807
 */

/** Cria uma Response com Content-Type: application/problem+json */
export function problem(
  status: number,
  title: string,
  detail: string,
  instance: string,
): Response {
  return new Response(
    JSON.stringify({ type: 'about:blank', title, status, detail, instance }),
    {
      status,
      headers: {
        'Content-Type': 'application/problem+json',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
