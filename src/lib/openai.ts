import OpenAI from "openai";

// Reuse a singleton client; OpenAI SDK v5 supports both Chat Completions and Responses APIs
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type SupportedModel =
  | "gpt-4o-mini"
  | "gpt-4o"
  | "gpt-5-mini"
  | "gpt-5";
