import { NextRequest, NextResponse } from "next/server";
import { HPSManifestSchema } from "@/lib/hps/schema";
import { verifyRegistrySignature, verifyDetachedCanonical } from "@/lib/hps/crypto";
export async function POST(request:NextRequest){
  try{
    const parsed=HPSManifestSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({validSchema:false,errors:parsed.error.issues});
    const m=parsed.data;
    const creatorSignatureValid=Boolean(m.creatorClaim&&m.creatorSignature?.publicKey&&verifyDetachedCanonical(m.creatorClaim,m.creatorSignature.value,m.creatorSignature.publicKey));
    const institutionSignatureValid=Boolean(m.institutionalClaim&&m.institutionSignature?.publicKey&&verifyDetachedCanonical(m.institutionalClaim,m.institutionSignature.value,m.institutionSignature.publicKey));
    return NextResponse.json({validSchema:true,recordId:m.id,workTitle:m.work.title,hpsVersion:m.hpsVersion,validRegistrySignature:verifyRegistrySignature(m),creatorSignaturePresent:Boolean(m.creatorSignature),creatorSignatureValid,institutionSignaturePresent:Boolean(m.institutionSignature),institutionSignatureValid,identityStatus:m.actors[0]?.identityAssurance||"unknown",assetHash:m.work.sha256,evidence:{public:m.evidence.filter(e=>e.visibility==="public").length,hashed:m.evidence.filter(e=>e.visibility==="hashed").length,sealed:m.evidence.filter(e=>e.visibility==="sealed").length},contributions:{human:m.contributions.filter(c=>c.origin==="human").length,aiAssisted:m.contributions.filter(c=>c.origin==="ai_assisted").length,automated:m.contributions.filter(c=>c.origin==="automated").length}});
  }catch{return NextResponse.json({validSchema:false,error:"Invalid JSON."},{status:400})}
}
