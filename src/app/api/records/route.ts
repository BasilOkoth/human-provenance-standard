import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { CreateRecordSchema, type HPSManifest } from "@/lib/hps/schema";
import { createHpsId } from "@/lib/hps/ids";
import { verifyDetachedCanonical, signRegistryManifest } from "@/lib/hps/crypto";

export const runtime="nodejs";
const hashText=(text:string)=>crypto.createHash("sha256").update(text,"utf8").digest("hex");

export async function POST(request:NextRequest){
  try{
    const auth=await createServerSupabase();const {data:{user}}=await auth.auth.getUser();
    if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
    const parsed=CreateRecordSchema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Invalid provenance input.",details:parsed.error.issues},{status:400});
    const {creatorClaim,creatorSignature,processNote}=parsed.data;
    if(!verifyDetachedCanonical(creatorClaim,creatorSignature,creatorClaim.creatorPublicKey))return NextResponse.json({error:"Creator canonical signature verification failed."},{status:400});

    const admin=createAdminSupabase();
    const {data:profile}=await admin.from("hps_profiles").select("*").eq("user_id",user.id).single();
    if(profile?.public_key&&profile.public_key!==creatorClaim.creatorPublicKey)return NextResponse.json({error:"Creator key does not match account key."},{status:400});
    const publicKey=process.env.HPS_REGISTRY_PUBLIC_KEY,secretKey=process.env.HPS_REGISTRY_SECRET_KEY;
    if(!publicKey||!secretKey)return NextResponse.json({error:"Registry signing service is not configured."},{status:503});

    let version=1;
    if(creatorClaim.parentRecordId){
      const {data:parent}=await admin.from("hps_records").select("version,owner_user_id").eq("id",creatorClaim.parentRecordId).single();
      if(!parent||parent.owner_user_id!==user.id)return NextResponse.json({error:"Invalid parent record."},{status:400});
      version=(parent.version||1)+1;
    }
    const id=createHpsId(),now=new Date().toISOString();
    const assurance=profile?.institution_verified?"institutionally_attested":"account_verified";
    const evidence=processNote?[{id:"process-note-1",type:"process_note",visibility:"hashed" as const,sha256:hashText(processNote),note:"Hash of creator-supplied process note."}]:[];
    const manifest:HPSManifest={
      hpsVersion:"1.0",id,
      work:{title:creatorClaim.title,type:creatorClaim.workType,createdAt:creatorClaim.issuedAt,version,sha256:creatorClaim.assetHash,fileName:creatorClaim.fileName},
      actors:[{id:"creator",name:creatorClaim.creatorName,role:"creator",publicKey:creatorClaim.creatorPublicKey,identityAssurance:assurance}],
      contributions:creatorClaim.contributionTypes.map(type=>({actorId:"creator",type,origin:type==="final_approval"?"human":creatorClaim.aiUsed?"ai_assisted":"human",description:`${creatorClaim.creatorName} declares responsibility for ${type.replaceAll("_"," ")} in this work.`,evidenceIds:evidence.length?["process-note-1"]:[],confidence:evidence.length?"evidence_backed":"self_declared"})),
      tools:creatorClaim.primaryTool?[{name:creatorClaim.primaryTool,role:"creation assistance",generativeAI:creatorClaim.aiUsed,scope:creatorClaim.aiUsed?"Creator disclosed generative AI assistance.":"Creator disclosed tool use.",humanOversight:"high"}]:[],
      evidence,
      responsibility:{finalApprovalActorId:"creator",statement:"The authenticated creator signed the canonical HPS contribution claim and accepts responsibility for the final work."},
      issuedAt:now,creatorClaim,
      creatorSignature:{algorithm:"Ed25519",publicKey:creatorClaim.creatorPublicKey,keyId:"creator-primary",value:creatorSignature},
      interoperability:{c2pa:{mappingVersion:"1.0",status:"exportable"},verifiableCredential:{contextVersion:"2.0",status:"exportable"}}
    };
    const countersigned=signRegistryManifest(manifest,publicKey,secretKey);
    const {error}=await admin.from("hps_records").insert({id,owner_user_id:user.id,title:creatorClaim.title,creator_name:creatorClaim.creatorName,work_type:creatorClaim.workType,record_kind:"creator_provenance",asset_hash:creatorClaim.assetHash,manifest:countersigned,creator_signature:creatorSignature,creator_public_key:creatorClaim.creatorPublicKey,registry_signature:countersigned.registrySignature!.value,registry_public_key:publicKey,version,parent_record_id:creatorClaim.parentRecordId||null,status:"active"});
    if(error)throw error;
    if(creatorClaim.parentRecordId)await admin.from("hps_records").update({status:"superseded",superseded_by_id:id}).eq("id",creatorClaim.parentRecordId).eq("owner_user_id",user.id);
    return NextResponse.json({id,manifest:countersigned,identityAssurance:assurance},{status:201});
  }catch(e){console.error(e);return NextResponse.json({error:"Unable to create HPS record."},{status:500})}
}

export async function GET(){
  try{const admin=createAdminSupabase();const {data}=await admin.from("hps_records").select("id,title,creator_name,work_type,record_kind,version,status,issuer_org_id,created_at").order("created_at",{ascending:false}).limit(100);return NextResponse.json({records:data||[]});}
  catch{return NextResponse.json({records:[]})}
}
