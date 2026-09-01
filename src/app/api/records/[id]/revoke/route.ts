import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const supabase=await createServerSupabase();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});

  const body=await request.json();
  const reason=String(body.reason||"Revoked by creator").slice(0,1000);
  const admin=createAdminSupabase();
  const {data:record}=await admin.from("hps_records").select("owner_user_id").eq("id",id).single();

  if(!record||record.owner_user_id!==user.id)return NextResponse.json({error:"Only the record owner may revoke this record."},{status:403});

  const {error}=await admin.from("hps_records").update({
    status:"revoked",revoked_at:new Date().toISOString(),revocation_reason:reason
  }).eq("id",id);

  if(error)return NextResponse.json({error:"Unable to revoke record."},{status:500});
  return NextResponse.json({revoked:true});
}
