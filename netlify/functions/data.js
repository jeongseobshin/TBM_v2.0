import { getStore } from "@netlify/blobs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-TBM-License"
};

/* ── 라이선스 검증 (무단배포 방지) ─────────────────────────────
   Netlify → Site configuration → Environment variables 에
     TBM_LICENSES = KEY-AAAA-1111,KEY-BBBB-2222   (쉼표로 여러 개)
   를 등록하면, 등록된 키를 가진 앱만 데이터에 접근할 수 있습니다.
   변수를 등록하지 않으면 검증 없이 동작합니다(기존 사이트 호환).
   키를 지우면 그 즉시 해당 배포본은 사용 불가 → 배포 회수 가능.        */
function licenseOf(req){
  try{
    const h = req.headers.get("x-tbm-license");
    if(h) return String(h).trim();
    const u = new URL(req.url);
    return (u.searchParams.get("lic") || "").trim();
  }catch(e){ return ""; }
}
function checkLicense(req){
  const raw = process.env.TBM_LICENSES || "";
  const allowed = raw.split(",").map(s=>s.trim()).filter(Boolean);
  if(!allowed.length) return { ok:true };               // 미설정 → 검증 안 함
  const key = licenseOf(req);
  if(!key) return { ok:false, reason:"missing" };
  if(allowed.indexOf(key) < 0) return { ok:false, reason:"invalid" };
  return { ok:true, key };
}
const KV = ["settings", "teams", "accounts", "custom"];

export default async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: CORS });

  const lic = checkLicense(req);
  if (!lic.ok) {
    return json({ error: "license_required", reason: lic.reason }, 401);
  }

  const store = getStore({ name: "tbm-data", consistency: "strong" });
  try {
    if (req.method === "GET") {
      const { blobs } = await store.list();
      const out = { settings: null, teams: null, accounts: null, custom: null, records: [] };
      for (const b of blobs) {
        if (b.key.startsWith("kv:")) {
          const k = b.key.slice(3);
          if (KV.includes(k)) out[k] = await store.get(b.key, { type: "json" });
        } else if (b.key.startsWith("rec:")) {
          const v = await store.get(b.key, { type: "json" });
          if (v) out.records.push(v);
        }
      }
      return json(out);
    }
    if (req.method === "POST") {
      const body = await req.json();
      const op = body.op;
      if (op === "kv" && KV.includes(body.key)) {
        await store.setJSON("kv:" + body.key, body.val);
      } else if (op === "rec" && body.rec && body.rec.id) {
        await store.setJSON("rec:" + body.rec.id, body.rec);
      } else if (op === "delRec" && body.id) {
        await store.delete("rec:" + body.id);
      } else if (op === "clearRecords") {
        const { blobs } = await store.list();
        for (const b of blobs) if (b.key.startsWith("rec:")) await store.delete(b.key);
      } else if (op === "bulk" && body.data) {
        const { blobs } = await store.list();
        for (const b of blobs) if (b.key.startsWith("rec:")) await store.delete(b.key);
        for (const k of KV) if (body.data[k] !== undefined) await store.setJSON("kv:" + k, body.data[k]);
        for (const r of (body.data.records || [])) if (r && r.id) await store.setJSON("rec:" + r.id, r);
      }
      return json({ ok: true });
    }
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 500);
  }
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
