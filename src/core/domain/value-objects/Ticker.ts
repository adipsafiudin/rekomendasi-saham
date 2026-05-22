export class Ticker {
  private readonly value: string;

  constructor(value: string) {
    if (!/^[A-Z0-9]{2,10}$/.test(value)) {
      throw new Error("Invalid ticker format");
    }
    this.value = value;
  }

  get raw(): string {
    return this.value;
  }

  toYahooSymbol(): string {
    return this.value + ".JK";
  }
}
