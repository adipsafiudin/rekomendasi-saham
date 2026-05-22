import Groq from "groq-sdk";
import {
  ISentimentAnalyzer,
  SentimentResult,
} from "../../../core/ports/outbound/ISentimentAnalyzer";
import { NewsItem } from "../../../core/domain/entities/NewsItem";
import { withGroqRetry } from "../../../lib/groqRetry";

const MODEL = "llama-3.3-70b-versatile";

export class GroqSentimentAdapter implements ISentimentAnalyzer {
  private client: Groq;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY must be set");
    this.client = new Groq({ apiKey });
  }

  async analyze(news: NewsItem[]): Promise<SentimentResult> {
    if (news.length === 0) {
      return { score: 0, reasoning: "No news available for analysis" };
    }

    const headlines = news.map((n, i) => `${i + 1}. ${n.headline}`).join("\n");

    const prompt = `You are a financial sentiment analyst for Indonesian stock market (IDX/IHSG).

Analyze the sentiment of the following news headlines and return a JSON object with:
- "score": a float between -1.0 (very bearish) and 1.0 (very bullish)
- "reasoning": a brief 1-2 sentence explanation in English

News headlines:
${headlines}

Respond with ONLY valid JSON, no markdown, no explanation outside the JSON:
{"score": <float>, "reasoning": "<string>"}`;

    const completion = await withGroqRetry(() =>
      this.client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 256,
      }),
    );

    const content =
      completion.choices[0]?.message?.content ??
      '{"score":0,"reasoning":"parse error"}';

    try {
      const parsed = JSON.parse(content) as {
        score: number;
        reasoning: string;
      };
      const score = Math.min(1, Math.max(-1, Number(parsed.score)));
      return { score, reasoning: parsed.reasoning };
    } catch {
      return { score: 0, reasoning: "Failed to parse Groq sentiment response" };
    }
  }
}
