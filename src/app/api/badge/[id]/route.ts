import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { HPSManifestSchema } from "@/lib/hps/schema";
import { verifyRegistrySignature,verifyDetachedCanonical } from "@/lib/hps/crypto";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const a=createAdminSupabase();const {data}=await a.from("hps_records").select("manifest,status").eq("id",id).single();
  let ok=false,status="NOT FOUND";
  if(data){
    const p=HPSManifestSchema.safeParse(data.manifest);
    if(p.success){
      const m=p.data;
      const creatorOk=m.hpsVersion==="0.4"?Boolean(m.creatorSignature):Boolean(m.creatorClaim&&m.creatorSignature?.publicKey&&verifyDetachedCanonical(m.creatorClaim,m.creatorSignature.value,m.creatorSignature.publicKey));
      const institutionOk=Boolean(m.institutionalClaim&&m.institutionSignature?.publicKey&&verifyDetachedCanonical(m.institutionalClaim,m.institutionSignature.value,m.institutionSignature.publicKey));
      ok=data.status==="active"&&verifyRegistrySignature(m)&&(creatorOk||institutionOk);
    }
    status=data.status==="revoked"?"REVOKED":data.status==="superseded"?"SUPERSEDED":ok?"PROVENANCE VERIFIED":"CHECK RECORD";
  }
  const code=id.split("-").pop()||id,bg=ok?"#102219":"#261313",fg=ok?"#6fd09a":"#e58d87";
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="42" role="img" aria-label="HPS ${status}"><rect width="360" height="42" rx="4" fill="${bg}"/><text x="14" y="27" fill="#fff" font-family="Arial,sans-serif" font-weight="700" font-size="14">HPS</text><circle cx="58" cy="21" r="10" fill="${fg}"/><text x="54" y="26" fill="${bg}" font-family="Arial,sans-serif" font-weight="900" font-size="14">${ok?"✓":"!"}</text><text x="78" y="26" fill="#fff" font-family="Arial,sans-serif" font-weight="700" font-size="11">${status}</text><text x="250" y="26" fill="${fg}" font-family="monospace" font-size="10">${code}</text></svg>`;
  return new NextResponse(svg,{headers:{"content-type":"image/svg+xml","cache-control":"public, max-age=60"}});
}
