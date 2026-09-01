import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { AttestationSchema } from "@/lib/hps/schema";

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const supabase=await createServerSupabase();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});

  const parsed=AttestationSchema.safeParse(await request.json());
  if(!parsed.success)return NextResponse.json({error:"Invalid attestation."},{status:400});

  const admin=createAdminSupabase();
  const {data:profile}=await admin.from("hps_profiles").select("*").eq("user_id",user.id).single();
  const assurance=profile?.institution_verified?"institutionally_attested":"account_verified";
  const name=profile?.display_name||user.email||"Authenticated attestor";

  const {data,error}=await admin.from("hps_attestations").insert({
    record_id:id,attestor_user_id:user.id,attestor_name:name,
    institution:parsed.data.institution||profile?.institution||null,
    claim_type:parsed.data.claimType,statement:parsed.data.statement,
    assurance,status:"active"
  }).select("*").single();

  if(error)return NextResponse.json({error:"Unable to create attestation."},{status:500});
  return NextResponse.json({attestation:data},{status:201});
}
