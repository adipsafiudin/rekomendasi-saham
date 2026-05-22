import { NewsItem } from "../../domain/entities/NewsItem";

export interface SentimentResult {
  score: number; // -1.0 to 1.0
  reasoning: string;
}

export interface ISentimentAnalyzer {
  analyze(news: NewsItem[]): Promise<SentimentResult>;
}
