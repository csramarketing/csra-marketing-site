// TEMP Gate 6 probe — delete after diagnosis.
export async function onRequest(context) {
  const cf = context.request.cf || {};
  return new Response(
    `GEO PROBE OK city=${cf.city || ""} region=${cf.region || ""} rc=${cf.regionCode || ""} country=${cf.country || ""} colo=${cf.colo || ""}`,
    { headers: { "content-type": "text/plain", "Cache-Control": "no-store" } }
  );
}
