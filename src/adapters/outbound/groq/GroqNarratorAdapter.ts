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

    const prompt = `Kamu adalah analis saham senior di Indonesia. Tulis narasi rekomendasi BUY singkat (maksimal 4 kalimat) dalam Bahasa Indonesia yang profesional untuk saham berikut:

Saham: ${rec.ticker.raw}
Harga Masuk: Rp ${rec.entryPrice.toLocaleString("id-ID")}
Target Harga: Rp ${rec.targetPrice.toLocaleString("id-ID")}
Stop Loss: Rp ${rec.stopLoss.toLocaleString("id-ID")}
Skor Teknikal: ${(rec.technicalScore * 100).toFixed(1)}%
Skor Fundamental: ${(rec.fundamentalScore * 100).toFixed(1)}%
Skor Sentimen: ${(rec.sentimentScore * 100).toFixed(1)}%
Skor Agregat: ${aggPct}%
Sentimen Berita: ${rec.sentimentJson.reasoning}
Win Rate Historis: ${winRatePct}%

Tulis narasi yang menjelaskan alasan rekomendasi berdasarkan data di atas. Gunakan bahasa yang mudah dipahami investor ritel Indonesia.`;

    const completion = await withGroqRetry(() =>
      this.client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 512,
      }),
    );

    return (
      completion.choices[0]?.message?.content?.trim() ??
      "Narasi tidak tersedia."
    );
  }
}
