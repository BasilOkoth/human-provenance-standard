import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { CreateRecordSchema, type HPSManifest } from "@/lib/hps/schema";
import { createHpsId } from "@/lib/hps/ids";
import { verifyCreatorSignature, signRegistryManifest } from "@/lib/hps/crypto";

export const runtime = "nodejs";

function hashText(text:string){return crypto.createHash("sha256").update(text,"utf8").digest("hex")}

export async function POST(request:NextRequest){
  try{
    const auth=await createServerSupabase();
    const {data:{user}}=await auth.auth.getUser();
    if(!user)return NextResponse.json({error:"Authentication required."},{status:401});

    const parsed=CreateRecordSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid provenance input.",details:parsed.error.issues},{status:400});
    const input=parsed.data;

    if(!verifyCreatorSignature(input.unsignedPayload,input.creatorSignature,input.creatorPublicKey)){
      return NextResponse.json({error:"Creator signature verification failed."},{status:400});
    }

    const admin=createAdminSupabase();
    const {data:profile}=await admin.from("hps_profiles").select("*").eq("user_id",user.id).single();

    if(profile?.public_key && profile.public_key!==input.creatorPublicKey){
      return NextResponse.json({error:"Creator key does not match the key registered to this account."},{status:400});
    }

    const publicKey=process.env.HPS_REGISTRY_PUBLIC_KEY;
    const secretKey=process.env.HPS_REGISTRY_SECRET_KEY;
    if(!publicKey||!secretKey)return NextResponse.json({error:"Registry signing service is not configured."},{status:503});

    let version=1;
    if(input.parentRecordId){
      const {data:parent}=await admin.from("hps_records").select("version,owner_user_id").eq("id",input.parentRecordId).single();
      if(!parent||parent.owner_user_id!==user.id)return NextResponse.json({error:"Invalid parent record."},{status:400});
      version=(parent.version||1)+1;
    }

    const id=createHpsId();
    const now=new Date().toISOString();
    const assurance=profile?.institution_verified?"institutionally_attested":"account_verified";

    const evidence=input.processNote?[{
      id:"process-note-1",type:"process_note",visibility:"hashed" as const,
      sha256:hashText(input.processNote),
      note:"Hash of creator-supplied process note."
    }]:[];

    const manifest:HPSManifest={
      hpsVersion:"0.4",id,
      work:{title:input.title,type:input.workType,createdAt:now,version,sha256:input.assetHash,fileName:input.fileName},
      actors:[{
        id:"creator",name:input.creatorName,role:"creator",
        publicKey:input.creatorPublicKey,identityAssurance:assurance
      }],
      contributions:input.contributionTypes.map(type=>({
        actorId:"creator",type,
        origin:type==="final_approval"?"human":input.aiUsed?"ai_assisted":"human",
        description:`${input.creatorName} declares responsibility for ${type.replaceAll("_"," ")} in this work.`,
        evidenceIds:evidence.length?["process-note-1"]:[],
        confidence:evidence.length?"evidence_backed":"self_declared"
      })),
      tools:input.primaryTool?[{
        name:input.primaryTool,role:"creation assistance",generativeAI:input.aiUsed,
        scope:input.aiUsed?"Creator disclosed generative AI assistance.":"Creator disclosed tool use.",
        humanOversight:"high"
      }]:[],
      evidence,
      responsibility:{
        finalApprovalActorId:"creator",
        statement:"The authenticated creator signed the underlying contribution declaration and accepts responsibility for the final work."
      },
      issuedAt:now,
      creatorSignature:{
        algorithm:"Ed25519",
        publicKey:input.creatorPublicKey,
        value:input.creatorSignature
      }
    };

    const countersigned=signRegistryManifest(manifest,publicKey,secretKey);

    const {error}=await admin.from("hps_records").insert({
      id,owner_user_id:user.id,title:input.title,creator_name:input.creatorName,
      work_type:input.workType,asset_hash:input.assetHash,manifest:countersigned,
      creator_signature:input.creatorSignature,creator_public_key:input.creatorPublicKey,
      registry_signature:countersigned.registrySignature!.value,registry_public_key:publicKey,
      version,parent_record_id:input.parentRecordId||null,status:"active"
    });
    if(error)throw error;

    return NextResponse.json({id,manifest:countersigned,identityAssurance:assurance},{status:201});
  }catch(e){console.error(e);return NextResponse.json({error:"Unable to create HPS record."},{status:500})}
}

export async function GET(){
  try{
    const admin=createAdminSupabase();
    const {data}=await admin.from("hps_records")
      .select("id,title,creator_name,work_type,version,status,created_at")
      .order("created_at",{ascending:false}).limit(50);
    return NextResponse.json({records:data||[]});
  }catch{return NextResponse.json({records:[]})}
}
