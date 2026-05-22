import { Recommendation } from "../../domain/entities/Recommendation";

export interface INarrator {
  summarize(recommendation: Recommendation, winRate: number): Promise<string>;
}
