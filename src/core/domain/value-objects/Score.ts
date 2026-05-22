export class Score {
  private readonly value: number;

  constructor(value: number) {
    if (value < 0 || value > 1) {
      throw new Error("Score must be between 0 and 1");
    }
    this.value = value;
  }

  get number(): number {
    return this.value;
  }
}
