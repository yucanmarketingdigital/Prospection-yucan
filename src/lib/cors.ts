// L'extension Chrome appelle ces routes avec un jeton (pas de cookie) : CORS ouvert sans risque.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization,content-type",
};

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: CORS_HEADERS });
}

export function options() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
