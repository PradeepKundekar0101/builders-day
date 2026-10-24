// Execution adapters. Each takes a catalog model plus a chat transcript and
// returns { text, usage: { input, output }, servedBy }. Add a provider by adding
// a function here and a runtime in public/core/catalog.js.
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

// Claude models that accept server-side refusal fallbacks.
const CLAUDE_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5']);

async function runAnthropic(m, { system, messages, effort, maxTokens }) {
  const client = new Anthropic();
  const params = {
    model: m.model,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { effort },
  };
  const msg = CLAUDE_FALLBACK_MODELS.has(m.model)
    ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await client.messages.create(params);
  if (msg.stop_reason === 'refusal') {
    const err = new Error(`Declined by ${m.name}${msg.stop_details?.category ? ` (${msg.stop_details.category})` : ''}.`);
    err.refusal = true;
    throw err;
  }
  return {
    text: msg.content.filter(b => b.type === 'text').map(b => b.text).join(''),
    usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens },
    servedBy: msg.model,
  };
}

async function runOpenAI(m, { system, messages, maxTokens }) {
  const client = new OpenAI();
  const r = await client.responses.create({
    model: m.model,
    instructions: system,
    input: messages.map(x => ({ role: x.role, content: x.content })),
    max_output_tokens: maxTokens,
  });
  return {
    text: r.output_text,
    usage: { input: r.usage?.input_tokens ?? 0, output: r.usage?.output_tokens ?? 0 },
    servedBy: r.model,
  };
}

async function runGemini(m, { system, messages, maxTokens }) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const r = await ai.models.generateContent({
    model: m.model,
    contents: messages.map(x => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] })),
    config: { systemInstruction: system, maxOutputTokens: maxTokens },
  });
  return {
    text: r.text ?? '',
    usage: { input: r.usageMetadata?.promptTokenCount ?? 0, output: r.usageMetadata?.candidatesTokenCount ?? 0 },
    servedBy: m.model,
  };
}

// Hugging Face Inference Providers, Ollama and BYO endpoints all speak the OpenAI chat format.
async function runCompatible(m, { system, messages, maxTokens }, { baseURL, apiKey }) {
  const client = new OpenAI({ baseURL, apiKey });
  const r = await client.chat.completions.create({
    model: m.model,
    messages: [{ role: 'system', content: system }, ...messages],
    max_tokens: Math.min(maxTokens, 8192),
  });
  return {
    text: r.choices?.[0]?.message?.content ?? '',
    usage: { input: r.usage?.prompt_tokens ?? 0, output: r.usage?.completion_tokens ?? 0 },
    servedBy: r.model || m.model,
  };
}

/**
 * Runs one model. `byoCreds` maps BYO model ids to { baseURL, apiKey } supplied by the caller
 * (the console sends them per request; they are never stored server-side).
 */
export async function runModel(m, input, byoCreds = {}) {
  switch (m.runtime) {
    case 'anthropic': return runAnthropic(m, input);
    case 'openai': return runOpenAI(m, input);
    case 'gemini': return runGemini(m, input);
    case 'hf': return runCompatible(m, input, {
      baseURL: process.env.HF_BASE_URL || 'https://router.huggingface.co/v1',
      apiKey: process.env.HF_TOKEN,
    });
    case 'ollama': return runCompatible(m, input, {
      baseURL: process.env.OLLAMA_BASE_URL,
      apiKey: process.env.OLLAMA_API_KEY || 'ollama',
    });
    case 'byo': {
      const c = byoCreds[m.id] || {};
      return runCompatible(m, input, {
        baseURL: c.baseURL || m.baseURL,
        apiKey: c.apiKey || (m.apiKeyEnv && process.env[m.apiKeyEnv]) || 'none',
      });
    }
    default: throw new Error(`No adapter for runtime "${m.runtime}".`);
  }
}
