import {NextRequest,NextResponse} from "next/server";
import {HPSManifestSchema} from "@/lib/hps/schema";
import {verifyManifestSignature} from "@/lib/hps/crypto";
export async function POST(req:NextRequest){
  try{
    const input=await req.json();
    const parsed=HPSManifestSchema.safeParse(input);
    if(!parsed.success)return NextResponse.json({validSchema:false,validSignature:false,identityStatus:"unknown",errors:parsed.error.issues});
    const m=parsed.data;
    const actor=m.actors.find(a=>a.id===m.responsibility.finalApprovalActorId);
    return NextResponse.json({
      validSchema:true,
      validSignature:verifyManifestSignature(m),
      identityStatus:actor?.identityAssurance??"unknown",
      evidence:{
        public:m.evidence.filter(e=>e.visibility==="public").length,
        hashed:m.evidence.filter(e=>e.visibility==="hashed").length,
        sealed:m.evidence.filter(e=>e.visibility==="sealed").length
      },
      contributions:{
        human:m.contributions.filter(c=>c.origin==="human").length,
        aiAssisted:m.contributions.filter(c=>c.origin==="ai_assisted").length,
        automated:m.contributions.filter(c=>c.origin==="automated").length
      },
      errors:[]
    })
  }catch{return NextResponse.json({validSchema:false,error:"Invalid JSON payload."},{status:400})}
}