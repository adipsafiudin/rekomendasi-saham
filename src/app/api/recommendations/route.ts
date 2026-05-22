import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "PENDING";
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 100);

  try {
    const supabase = getSupabase();
    let query = supabase
      .from("recommendation_history")
      .select("*")
      .order("date", { ascending: false })
      .limit(limit);

    if (status !== "ALL") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ data, total: data?.length ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
