import { createClient } from "@supabase/supabase-js";
import { buildPipeline } from "../src/lib/container";

async function main() {
  console.log(`[Pipeline] Starting at ${new Date().toISOString()}`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase =
    supabaseUrl && supabaseKey
      ? createClient(supabaseUrl, supabaseKey)
      : null;

  // Insert RUNNING log entry
  let logId: string | undefined;
  if (supabase) {
    const { data: logRow } = await supabase
      .from("cron_logs")
      .insert({ status: "RUNNING", triggered_by: "github-actions" })
      .select("id")
      .single();
    logId = logRow?.id as string | undefined;
  }

  try {
    const pipeline = buildPipeline();
    const result = await pipeline.run();

    console.log(`[Pipeline] Done at ${new Date().toISOString()}`);
    console.log(`[Pipeline] Audited: ${result.audited}`);
    console.log(
      `[Pipeline] Recommended: ${result.recommended.join(", ") || "none"}`,
    );

    if (result.errors.length > 0) {
      console.warn(`[Pipeline] Errors (${result.errors.length}):`);
      result.errors.forEach((e) => console.warn(" -", e));
    }

    // Update log to SUCCESS
    if (supabase && logId) {
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

    // Exit with error if pipeline had critical issues (no data at all)
    if (
      result.errors.length > 0 &&
      result.audited === 0 &&
      result.recommended.length === 0
    ) {
      process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Pipeline] Fatal:", message);

    // Update log to FAILED
    if (supabase && logId) {
      await supabase
        .from("cron_logs")
        .update({
          status: "FAILED",
          completed_at: new Date().toISOString(),
          message,
        })
        .eq("id", logId);
    }

    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[Pipeline] Fatal:", err);
  process.exit(1);
});
