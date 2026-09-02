import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { requireHpsAdmin } from "@/lib/hps/admin-auth";

export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=await requireHpsAdmin();
  if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
  const {id}=await params; const a=createAdminSupabase();
  const {data,error}=await a.from("hps_org_verification_evidence")
    .select("id,evidence_type,registration_number,file_name,mime_type,file_size,sha256,storage_path,note,created_at")
    .eq("org_id",id).order("created_at",{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:500});
  const evidence=await Promise.all((data??[]).map(async row=>{
    const {data:signed}=await a.storage.from("hps-institution-evidence").createSignedUrl(row.storage_path,300);
    const {storage_path,...safe}=row;
    return {...safe,signedUrl:signed?.signedUrl??null};
  }));
  return NextResponse.json({evidence});
}
