import {
  Recommendation,
  RecommendationStatus,
} from "../../domain/entities/Recommendation";

export interface ResolutionData {
  status: RecommendationStatus;
  resolutionDate: Date;
  resolutionPrice: number;
  resolutionReason: string;
}

export interface IRecommendationRepository {
  save(recommendation: Recommendation): Promise<void>;
  findPending(): Promise<Recommendation[]>;
  updateStatus(id: string, resolution: ResolutionData): Promise<void>;
  getWinRate(): Promise<number>;
}
