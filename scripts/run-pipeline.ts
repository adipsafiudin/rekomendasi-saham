import { buildPipeline } from "../src/lib/container";

async function main() {
  console.log(`[Pipeline] Starting at ${new Date().toISOString()}`);

  const pipeline = buildPipeline();
  const result = await pipeline.run();

  console.log(`[Pipeline] Done at ${new Date().toISOString()}`);
  console.log(`[Pipeline] Audited: ${result.audited}`);
  console.log(`[Pipeline] Recommended: ${result.recommended.join(", ") || "none"}`);

  if (result.errors.length > 0) {
    console.warn(`[Pipeline] Errors (${result.errors.length}):`);
    result.errors.forEach((e) => console.warn(" -", e));
  }

  // Exit with error if pipeline had critical issues (no data at all)
  if (result.errors.length > 0 && result.audited === 0 && result.recommended.length === 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[Pipeline] Fatal:", err);
  process.exit(1);
});
