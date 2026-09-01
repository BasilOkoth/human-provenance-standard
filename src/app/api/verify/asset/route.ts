import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { HPSManifestSchema } from "@/lib/hps/schema";
import { verifyRegistrySignature, verifyDetachedCanonical } from "@/lib/hps/crypto";

export async function POST(request:NextRequest){
  try{
    const body=await request.json();const assetHash=String(body.assetHash||"").toLowerCase();
    if(!/^[a-f0-9]{64}$/.test(assetHash))return NextResponse.json({error:"A valid SHA-256 assetHash is required."},{status:400});
    const admin=createAdminSupabase();
    const {data,error}=await admin.from("hps_records").select("id,title,creator_name,record_kind,status,version,issuer_org_id,manifest").eq("asset_hash",assetHash).order("created_at",{ascending:false}).limit(20);
    if(error)throw error;
    const records=(data||[]).map(row=>{
      const parsed=HPSManifestSchema.safeParse(row.manifest);if(!parsed.success)return {...row,validSchema:false,validRegistrySignature:false,creatorSignatureValid:false,institutionSignatureValid:false};
      const m=parsed.data;
      const creatorSignatureValid=Boolean(m.creatorClaim&&m.creatorSignature?.publicKey&&verifyDetachedCanonical(m.creatorClaim,m.creatorSignature.value,m.creatorSignature.publicKey));
      const institutionSignatureValid=Boolean(m.institutionalClaim&&m.institutionSignature?.publicKey&&verifyDetachedCanonical(m.institutionalClaim,m.institutionSignature.value,m.institutionSignature.publicKey));
      return {id:row.id,title:row.title,creatorName:row.creator_name,recordKind:row.record_kind,status:row.status,version:row.version,issuerOrgId:row.issuer_org_id,validSchema:true,validRegistrySignature:verifyRegistrySignature(m),creatorSignatureValid,institutionSignatureValid};
    });
    return NextResponse.json({assetHash,match:records.length>0,records});
  }catch(e){console.error(e);return NextResponse.json({error:"Unable to verify asset."},{status:500})}
}
