import Groq from "groq-sdk";
import { INarrator } from "../../../core/ports/outbound/INarrator";
import { Recommendation } from "../../../core/domain/entities/Recommendation";
import { withGroqRetry } from "../../../lib/groqRetry";

const MODEL = "llama-3.3-70b-versatile";

export class GroqNarratorAdapter implements INarrator {
  private client: Groq;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY must be set");
    this.client = new Groq({ apiKey });
  }

  async summarize(rec: Recommendation, winRate: number): Promise<string> {
    const winRatePct = (winRate * 100).toFixed(1);
    const aggPct = (rec.aggregatedScore * 100).toFixed(1);

    const fund = rec.fundamentalBreakdown as any;
    const tech = rec.technicalBreakdown as any;

    // Build optional context lines from new breakdown structure
    const fairValueLine =
      fund?.fairValue != null
        ? `Harga Wajar (${fund.fairValueMethod ?? "estimasi"}): Rp ${Math.round(fund.fairValue).toLocaleString("id-ID")}${fund.marginOfSafety != null ? ` — ${fund.marginOfSafety > 0 ? "diskon" : "premium"} ${Math.abs(fund.marginOfSafety * 100).toFixed(1)}% dari harga pasar` : ""}`
        : null;
    const priceHistLine =
      fund?.priceHistLabel &&
      fund.priceHistLabel !== "Posisi Harga Historis — Data tidak cukup"
        ? `Posisi Historis: ${fund.priceHistLabel}`
        : null;
    const sectorLine =
      fund?.sector != null
        ? `Sektor: ${fund.sector}${fund.industry ? ` / ${fund.industry}` : ""}${fund.isConglomerate ? " (Konglomerat)" : fund.isBank ? " (Perbankan)" : ""}${fund.relValLabel ? ` — ${fund.relValLabel}` : ""}`
        : null;
    const analystLine =
      fund?.analystLabel &&
      fund.analystLabel !== "Konsensus Analis — Tidak tersedia"
        ? `Konsensus Analis: ${fund.analystLabel}`
        : null;
    const accLine = tech?.accumulationLabel
      ? `Sinyal Akumulasi/Distribusi: ${tech.accumulationLabel}`
      : null;

    const extraContext = [
      fairValueLine,
      priceHistLine,
      sectorLine,
      analystLine,
      accLine,
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = `Kamu adalah analis saham senior di Indonesia. Tulis narasi rekomendasi BUY singkat (maksimal 5 kalimat) dalam Bahasa Indonesia yang profesional untuk saham berikut:

Saham: ${rec.ticker.raw}
Harga Masuk: Rp ${rec.entryPrice.toLocaleString("id-ID")}
Target Harga: Rp ${rec.targetPrice.toLocaleString("id-ID")}
Stop Loss: Rp ${rec.stopLoss.toLocaleString("id-ID")}
Skor Teknikal: ${(rec.technicalScore * 100).toFixed(1)}%
Skor Fundamental: ${(rec.fundamentalScore * 100).toFixed(1)}%
Skor Sentimen: ${(rec.sentimentScore * 100).toFixed(1)}%
Skor Agregat: ${aggPct}%
Sentimen Berita: ${rec.sentimentJson.reasoning}
Win Rate Historis: ${winRatePct}%${extraContext ? `\n${extraContext}` : ""}

Fokus narasi pada: (1) apakah saham ini undervalue vs harga wajar dan vs peers di sektornya, (2) posisi harga dalam kisaran historis, (3) sinyal akumulasi/distribusi dari volume, (4) konsensus analis bila tersedia. Untuk saham konglomerat dan bank, gunakan konteks yang tepat (jangan membandingkan D/E bank dengan standar umum). Gunakan bahasa yang mudah dipahami investor ritel Indonesia.`;

    const completion = await withGroqRetry(() =>
      this.client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 600,
      }),
    );

    return (
      completion.choices[0]?.message?.content?.trim() ??
      "Narasi tidak tersedia."
    );
  }
}
