import { getStore } from "@netlify/blobs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-TBM-License"
};

function checkLicense(req){
  const raw = process.env.TBM_LICENSES || "";
  const allowed = raw.split(",").map(s=>s.trim()).filter(Boolean);
  if(!allowed.length) return true;
  let key = "";
  try{
    key = (req.headers.get("x-tbm-license") || new URL(req.url).searchParams.get("lic") || "").trim();
  }catch(e){}
  return !!key && allowed.indexOf(key) >= 0;
}

export default async (req) => {
  const store = getStore("tbm-photos");
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response("", { headers: CORS });
  // 사진 업로드는 라이선스 필수 (조회는 <img> 태그라 헤더를 못 실어 허용)
  if (req.method === "POST" && !checkLicense(req)) {
    return new Response(JSON.stringify({ error: "license_required" }),
      { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  try {
    if (req.method === "POST") {
      const name = (url.searchParams.get("name") || (Date.now() + ".jpg")).replace(/[^\w.\-]/g, "_");
      const buf = await req.arrayBuffer();
      await store.set(name, buf, { metadata: { contentType: "image/jpeg" } });
      return new Response(JSON.stringify({ url: url.origin + "/.netlify/functions/photo?key=" + encodeURIComponent(name) }),
        { headers: { ...CORS, "Content-Type": "application/json" } });
    }
    if (req.method === "GET") {
      const key = url.searchParams.get("key");
      if (!key) return new Response("no key", { status: 400, headers: CORS });
      const data = await store.get(key, { type: "arrayBuffer" });
      if (!data) return new Response("not found", { status: 404, headers: CORS });
      return new Response(data, { headers: { ...CORS, "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
    }
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  } catch (e) {
    return new Response(String(e && e.message || e), { status: 500, headers: CORS });
  }
};
