import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["application/pdf","image/jpeg","image/png","image/webp"]);

async function orgAdmin(orgId:string){
  const s=await createServerSupabase();
  const {data:{user}}=await s.auth.getUser();
  if(!user)return {ok:false as const,status:401,error:"Authentication required."};
  const a=createAdminSupabase();
  const {data:m}=await a.from("hps_org_members").select("role,status").eq("org_id",orgId).eq("user_id",user.id).single();
  if(!m||m.status!=="active"||m.role!=="admin")return {ok:false as const,status:403,error:"Institution admin role required."};
  return {ok:true as const,user,admin:a};
}

export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const auth=await orgAdmin(id);
  if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
  const {data,error}=await auth.admin.from("hps_org_verification_evidence")
    .select("id,evidence_type,registration_number,file_name,mime_type,file_size,sha256,note,created_at")
    .eq("org_id",id).order("created_at",{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({evidence:data??[]});
}

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params; const auth=await orgAdmin(id);
  if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});

  const form=await req.formData();
  const file=form.get("file");
  const evidenceType=String(form.get("evidenceType")||"").trim();
  const registrationNumber=String(form.get("registrationNumber")||"").trim();
  const note=String(form.get("note")||"").trim();
  if(!(file instanceof File))return NextResponse.json({error:"Evidence file is required."},{status:400});
  if(!evidenceType)return NextResponse.json({error:"Evidence type is required."},{status:400});
  if(!ALLOWED.has(file.type))return NextResponse.json({error:"Upload PDF, JPEG, PNG or WebP evidence."},{status:400});
  if(file.size<=0||file.size>MAX_BYTES)return NextResponse.json({error:"Evidence file must be 10 MB or smaller."},{status:400});

  const bytes=Buffer.from(await file.arrayBuffer());
  const sha256=createHash("sha256").update(bytes).digest("hex");
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-180);
  const storagePath=`${id}/${randomUUID()}-${safe}`;
  const {error:uploadError}=await auth.admin.storage.from("hps-institution-evidence").upload(storagePath,bytes,{contentType:file.type,upsert:false});
  if(uploadError)return NextResponse.json({error:uploadError.message},{status:500});

  const {data,error}=await auth.admin.from("hps_org_verification_evidence").insert({
    org_id:id,uploaded_by:auth.user.id,evidence_type:evidenceType,
    registration_number:registrationNumber||null,file_name:file.name,mime_type:file.type,
    file_size:file.size,sha256,storage_path:storagePath,note:note||null
  }).select("id,evidence_type,registration_number,file_name,mime_type,file_size,sha256,note,created_at").single();
  if(error){await auth.admin.storage.from("hps-institution-evidence").remove([storagePath]);return NextResponse.json({error:error.message},{status:500});}
  return NextResponse.json({evidence:data},{status:201});
}
