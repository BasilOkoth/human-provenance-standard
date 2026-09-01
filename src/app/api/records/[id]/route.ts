import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { HPSManifestSchema } from "@/lib/hps/schema";
import { verifyRegistrySignature } from "@/lib/hps/crypto";

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  try{
    const admin=createAdminSupabase();
    const {data,error}=await admin.from("hps_records").select("*").eq("id",id).single();
    if(error||!data)return NextResponse.json({error:"Record not found."},{status:404});
    const m=HPSManifestSchema.parse(data.manifest);
    const {data:attestations}=await admin.from("hps_attestations").select("*").eq("record_id",id).eq("status","active");
    return NextResponse.json({record:data,attestations:attestations||[],verification:{validRegistrySignature:verifyRegistrySignature(m)}});
  }catch{return NextResponse.json({error:"Unable to retrieve record."},{status:500})}
}
