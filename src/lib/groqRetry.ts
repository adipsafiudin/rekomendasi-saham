const MAX_RETRIES = 6;

/**
 * Executes a Groq API call with automatic retry on 429 rate-limit errors.
 * Parses the "try again in X.XXs" message from the error to wait the exact
 * amount of time Groq asks for, plus a 500ms buffer.
 */
export async function withGroqRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (attempt === MAX_RETRIES) throw err;

      // Groq SDK raises APIError with .status for HTTP errors
      const status = (err as Record<string, unknown>)?.status;
      if (status !== 429) throw err;

      // Parse "try again in X.XXs" from error message
      const msg = (err as Error).message ?? "";
      const match = msg.match(/try again in (\d+(?:\.\d+)?)s/i);
      const waitMs = match
        ? Math.ceil(parseFloat(match[1]) * 1000) + 500
        : Math.min(2 ** attempt * 1000, 30_000); // exponential fallback, max 30s

      console.warn(
        `[Groq] 429 rate limit on attempt ${attempt + 1}. Waiting ${waitMs}ms before retry...`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw new Error("[Groq] Max retries exceeded");
}
