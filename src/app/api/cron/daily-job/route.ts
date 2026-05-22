import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildPipeline } from "../../../../lib/container";

export const maxDuration = 300; // 5 minutes (requires Vercel Pro)

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Validate Vercel Cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Detect trigger source: Vercel Cron sends x-vercel-cron-signature, manual uses curl
  const triggeredBy = request.headers.get("x-vercel-cron-signature")
    ? "cron"
    : "manual";

  // Insert RUNNING log entry
  const { data: logRow } = await supabase
    .from("cron_logs")
    .insert({ status: "RUNNING", triggered_by: triggeredBy })
    .select("id")
    .single();
  const logId = logRow?.id as string | undefined;

  try {
    const pipeline = buildPipeline();
    const result = await pipeline.run();

    console.log("[CronJob] Pipeline completed:", JSON.stringify(result));

    // Update log to SUCCESS
    if (logId) {
      await supabase
        .from("cron_logs")
        .update({
          status: "SUCCESS",
          completed_at: new Date().toISOString(),
          recommended:
            result.recommended.length > 0 ? result.recommended : null,
          audited: result.audited,
          errors: result.errors.length > 0 ? result.errors : null,
        })
        .eq("id", logId);
    }

    return NextResponse.json({
      success: true,
      audited: result.audited,
      recommended: result.recommended,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[CronJob] Fatal error:", err);

    // Update log to FAILED
    if (logId) {
      await supabase
        .from("cron_logs")
        .update({
          status: "FAILED",
          completed_at: new Date().toISOString(),
          message: String(err),
        })
        .eq("id", logId);
    }

    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
