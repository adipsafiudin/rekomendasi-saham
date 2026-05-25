import Groq from "groq-sdk";
import {
  ISentimentAnalyzer,
  SentimentResult,
} from "../../../core/ports/outbound/ISentimentAnalyzer";
import { NewsItem } from "../../../core/domain/entities/NewsItem";
import { withGroqRetry } from "../../../lib/groqRetry";

// Smaller/faster model with higher rate limits on Groq free tier.
// Sufficient for sentiment scoring; narrator keeps the larger model.
const MODEL = "llama-3.1-8b-instant";

const NEUTRAL: SentimentResult = { score: 0, reasoning: "No news available for analysis" };

export class GroqSentimentAdapter implements ISentimentAnalyzer {
  private client: Groq;

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY must be set");
    this.client = new Groq({ apiKey });
  }

  async analyze(news: NewsItem[]): Promise<SentimentResult> {
    if (news.length === 0) return NEUTRAL;

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
        max_tokens: 200,
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

  // Sends all tickers in a single Groq call — avoids N separate requests and
  // eliminates per-ticker delays, dramatically reducing rate-limit pressure.
  async analyzeBatch(
    items: { ticker: string; news: NewsItem[] }[],
  ): Promise<Map<string, SentimentResult>> {
    const result = new Map<string, SentimentResult>();

    const nonEmpty = items.filter((i) => i.news.length > 0);
    // Pre-fill neutral for tickers with no news
    for (const item of items) {
      if (item.news.length === 0) result.set(item.ticker, NEUTRAL);
    }
    if (nonEmpty.length === 0) return result;

    const stocksBlock = nonEmpty
      .map((item) => {
        const headlines = item.news
          .map((n, i) => `  ${i + 1}. ${n.headline}`)
          .join("\n");
        return `STOCK: ${item.ticker}\nNEWS:\n${headlines}`;
      })
      .join("\n\n");

    const prompt = `You are a financial sentiment analyst for Indonesian stock market (IDX/IHSG).

Analyze the sentiment for each stock below based on its news headlines.
Return a JSON array where each element has:
- "ticker": the stock ticker
- "score": float between -1.0 (very bearish) and 1.0 (very bullish)
- "reasoning": 1 sentence explanation in English

${stocksBlock}

Respond with ONLY a valid JSON array, no markdown:
[{"ticker":"<TICKER>","score":<float>,"reasoning":"<string>"}, ...]`;

    const completion = await withGroqRetry(() =>
      this.client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 100 * nonEmpty.length,
      }),
    );

    const content = completion.choices[0]?.message?.content ?? "[]";

    try {
      const parsed = JSON.parse(content) as {
        ticker: string;
        score: number;
        reasoning: string;
      }[];
      for (const entry of parsed) {
        const score = Math.min(1, Math.max(-1, Number(entry.score)));
        result.set(entry.ticker, { score, reasoning: entry.reasoning });
      }
    } catch {
      // Fallback: neutral for all if parse fails
      for (const item of nonEmpty) {
        result.set(item.ticker, {
          score: 0,
          reasoning: "Failed to parse batch sentiment response",
        });
      }
    }

    // Ensure every requested ticker has a result
    for (const item of nonEmpty) {
      if (!result.has(item.ticker)) result.set(item.ticker, NEUTRAL);
    }

    return result;
  }
}

