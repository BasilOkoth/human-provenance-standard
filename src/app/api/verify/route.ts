import { NextRequest, NextResponse } from "next/server";
import { verifyHPSManifest } from "@/lib/hps/verify";

export async function POST(req:NextRequest) {
  try {
    return NextResponse.json(verifyHPSManifest(await req.json()));
  } catch {
    return NextResponse.json({error:"Invalid JSON payload."},{status:400});
  }
}
