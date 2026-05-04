import type { LLMProvider, LLMRole, LLMRoleConfig } from "@/types/llm";
import { allLlmProviders as catalogProviders, llmRoleConfig as catalogRoles } from "@/data/runtime/llm-catalog";

const ENV_ALIASES: Record<string, string[]> = {
  DASHSCOPE_API_KEY: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
  KIMI_API_KEY: ["KIMI_API_KEY", "MOONSHOT_API_KEY"],
  TENCENT_SECRET_KEY: ["TENCENT_HUNYUAN_API_KEY", "TENCENT_SECRET_KEY"],
  BAIDU_API_KEY: ["BAIDU_ERNIE_API_KEY", "BAIDU_API_KEY"],
  ZHIPU_API_KEY: ["ZHIPU_API_KEY", "ZAI_API_KEY"],
  DOUBAO_API_KEY: ["DOUBAO_API_KEY", "VOLCENGINE_API_KEY"],
  NAVER_API_KEY: ["NAVER_CLOVA_API_KEY", "NAVER_API_KEY"],
  CUSTOM_LLM_API_KEY: ["CUSTOM_LLM_API_KEY"],
  OLLAMA_API_KEY: ["OLLAMA_API_KEY"],
};

const BASE_URL_ENV: Record<string, string> = {
  openai: "OPENAI_BASE_URL",
  anthropic: "ANTHROPIC_BASE_URL",
  google: "GOOGLE_BASE_URL",
  mistral: "MISTRAL_BASE_URL",
  xai: "XAI_BASE_URL",
  deepseek: "DEEPSEEK_BASE_URL",
  qwen: "DASHSCOPE_BASE_URL",
  kimi: "KIMI_BASE_URL",
  minimax: "MINIMAX_BASE_URL",
  zhipu: "ZHIPU_BASE_URL",
  doubao: "VOLCENGINE_BASE_URL",
  naver: "NAVER_BASE_URL",
  "custom-asian": "CUSTOM_LLM_BASE_URL",
  ollama: "OLLAMA_BASE_URL",
};

const LOCAL_NO_KEY_PROVIDERS = new Set(["ollama"]);

function getSecret(envKey: string) {
  const keys = ENV_ALIASES[envKey] || [envKey];
  const key = keys.find((candidate) => Boolean(process.env[candidate]));
  return key ? { key, value: process.env[key] || "" } : null;
}

function maskSecret(secret: string) {
  if (!secret) return "non configurée";
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 3)}••••••••••••${secret.slice(-4)}`;
}

function overrideEndpoint(provider: LLMProvider) {
  const envName = BASE_URL_ENV[provider.id];
  return envName && process.env[envName] ? process.env[envName] || provider.endpoint : provider.endpoint;
}

function isLocalNoKeyProvider(provider: LLMProvider) {
  return LOCAL_NO_KEY_PROVIDERS.has(provider.id);
}

function hasLocalProviderEndpoint(provider: LLMProvider) {
  const envName = BASE_URL_ENV[provider.id];
  return Boolean(envName && process.env[envName]);
}

export function getConfiguredLlmProviders(): LLMProvider[] {
  return catalogProviders.map((provider) => {
    const secret = getSecret(provider.envKey);
    const endpoint = overrideEndpoint(provider);
    const customModel = provider.id === "ollama" ? process.env.OLLAMA_MODEL : provider.id.includes("custom") && process.env.CUSTOM_LLM_MODEL;
    const localEndpointConfigured = isLocalNoKeyProvider(provider) && hasLocalProviderEndpoint(provider);

    return {
      ...provider,
      endpoint,
      status: secret || localEndpointConfigured ? "connected" : "pending",
      maskedKey: isLocalNoKeyProvider(provider) ? "local" : maskSecret(secret?.value || ""),
      latencyMs: secret ? 0 : 0,
      estimatedDailyCost: 0,
      errorRate: 0,
      tokensToday: 0,
      models: customModel
        ? [{ ...provider.models[0], name: customModel, modelId: customModel, custom: true, availability: "custom" }]
        : provider.models,
    };
  });
}

export function getConfiguredLlmRoles(): LLMRoleConfig[] {
  return catalogRoles.map((role) => ({
    ...role,
    providerId: process.env[`LLM_${role.role.toUpperCase()}_PROVIDER`] || role.providerId,
    modelId: process.env[`LLM_${role.role.toUpperCase()}_MODEL`] || role.modelId,
    fallbackModelId: process.env[`LLM_${role.role.toUpperCase()}_FALLBACK_MODEL`] || role.fallbackModelId,
  }));
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function providerHeaders(provider: LLMProvider, apiKey: string): Record<string, string> {
  if (isLocalNoKeyProvider(provider) && !apiKey) return {};

  if (provider.apiFormat === "Anthropic-compatible") {
    return {
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    };
  }

  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

function providerModelsUrl(provider: LLMProvider, apiKey: string) {
  if (provider.id === "ollama") {
    return joinUrl(provider.endpoint, "/api/tags");
  }

  if (provider.id === "google") {
    return `${joinUrl(provider.endpoint, "/v1beta/models")}?key=${encodeURIComponent(apiKey)}`;
  }

  if (provider.apiFormat === "Anthropic-compatible") {
    return joinUrl(provider.endpoint, "/v1/models");
  }

  return joinUrl(provider.endpoint, "/models");
}

export async function testConfiguredLlmProvider(providerId: string) {
  const provider = getConfiguredLlmProviders().find((item) => item.id === providerId);

  if (!provider) {
    return { ok: false, status: "error" as const, latencyMs: 0, message: "Provider inconnu." };
  }

  const secret = getSecret(provider.envKey);
  if (!secret?.value && !isLocalNoKeyProvider(provider)) {
    return { ok: false, status: "pending" as const, latencyMs: 0, message: `Aucune clé détectée pour ${provider.envKey}.` };
  }

  if (!provider.endpoint) {
    return { ok: false, status: "error" as const, latencyMs: 0, message: "Endpoint manquant pour ce provider." };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(providerModelsUrl(provider, secret?.value || ""), {
      method: "GET",
      headers: provider.id === "google" ? undefined : providerHeaders(provider, secret?.value || ""),
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        status: "error" as const,
        latencyMs,
        message: `Connexion refusée (${response.status}). Vérifiez endpoint, clé et permissions.`,
      };
    }

    const payload = await response.json().catch(() => null);
    const modelCount = Array.isArray(payload?.data) ? payload.data.length : Array.isArray(payload?.models) ? payload.models.length : undefined;

    return {
      ok: true,
      status: "connected" as const,
      latencyMs,
      modelCount,
      message: modelCount ? `${modelCount} modèles accessibles.` : "Provider joignable.",
    };
  } catch (error) {
    return {
      ok: false,
      status: "error" as const,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error && error.name === "AbortError" ? "Timeout de connexion provider." : "Test provider impossible.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

type LlmCallTarget = {
  provider: LLMProvider;
  modelId: string;
};

type LlmRunResult = {
  ok: boolean;
  status: "connected" | "pending" | "error";
  providerId?: string;
  modelId?: string;
  latencyMs: number;
  message: string;
  text?: string;
  fallbackUsed?: boolean;
};

function findProviderByModel(modelId: string) {
  return getConfiguredLlmProviders().find((provider) => provider.models.some((model) => model.modelId === modelId));
}

function resolveRoleTarget(role: LLMRole): { primary?: LlmCallTarget; fallback?: LlmCallTarget; error?: string } {
  const roleConfig = getConfiguredLlmRoles().find((item) => item.role === role);
  if (!roleConfig) return { error: `Rôle LLM introuvable: ${role}.` };

  const providers = getConfiguredLlmProviders();
  const primaryProvider = providers.find((provider) => provider.id === roleConfig.providerId);
  const fallbackProvider = roleConfig.fallbackModelId ? findProviderByModel(roleConfig.fallbackModelId) : undefined;

  return {
    primary: primaryProvider ? { provider: primaryProvider, modelId: roleConfig.modelId } : undefined,
    fallback: fallbackProvider && roleConfig.fallbackModelId ? { provider: fallbackProvider, modelId: roleConfig.fallbackModelId } : undefined,
    error: primaryProvider ? undefined : `Provider configuré introuvable: ${roleConfig.providerId}.`,
  };
}

function textFromOpenAiCompatiblePayload(payload: unknown) {
  const data = payload as { choices?: Array<{ message?: { content?: string }; text?: string }> };
  return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "";
}

function textFromAnthropicPayload(payload: unknown) {
  const data = payload as { content?: Array<{ text?: string }> };
  return data.content?.map((part) => part.text).filter(Boolean).join("\n") || "";
}

function textFromGooglePayload(payload: unknown) {
  const data = payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n") || "";
}

function textFromOllamaPayload(payload: unknown) {
  const data = payload as { message?: { content?: string }; response?: string };
  return data.message?.content || data.response || "";
}

async function callTarget(target: LlmCallTarget, prompt: string, role: LLMRole): Promise<LlmRunResult> {
  const secret = getSecret(target.provider.envKey);
  if (!secret?.value && !isLocalNoKeyProvider(target.provider)) {
    return {
      ok: false,
      status: "pending",
      providerId: target.provider.id,
      modelId: target.modelId,
      latencyMs: 0,
      message: `Aucune clé détectée pour ${target.provider.envKey}.`,
    };
  }

  if (!target.provider.endpoint) {
    return {
      ok: false,
      status: "error",
      providerId: target.provider.id,
      modelId: target.modelId,
      latencyMs: 0,
      message: "Endpoint manquant pour ce provider.",
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutMs = Number(process.env.LLM_GENERATION_TIMEOUT_MS || (target.provider.id === "ollama" ? 8_000 : 15_000));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const system = "Tu es un auditeur de trading. Réponds en français, de façon concise, sans conseil financier, et rappelle si une validation humaine est nécessaire.";

  try {
    let response: Response;

    if (target.provider.id === "ollama") {
      response = await fetch(joinUrl(target.provider.endpoint, "/api/chat"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: target.modelId,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          stream: false,
          options: {
            temperature: role === "auditeur" ? 0 : 0.2,
            num_predict: role === "rapide" ? 600 : 1200,
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    } else if (target.provider.id === "google") {
      response = await fetch(`${joinUrl(target.provider.endpoint, `/v1beta/models/${target.modelId}:generateContent`)}?key=${encodeURIComponent(secret?.value || "")}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${system}\n\n${prompt}` }] }] }),
        signal: controller.signal,
        cache: "no-store",
      });
    } else if (target.provider.apiFormat === "Anthropic-compatible") {
      response = await fetch(joinUrl(target.provider.endpoint, "/v1/messages"), {
        method: "POST",
        headers: { ...providerHeaders(target.provider, secret?.value || ""), "content-type": "application/json" },
        body: JSON.stringify({
          model: target.modelId,
          max_tokens: role === "rapide" ? 600 : 1200,
          temperature: role === "auditeur" ? 0 : 0.2,
          system,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    } else {
      response = await fetch(joinUrl(target.provider.endpoint, "/chat/completions"), {
        method: "POST",
        headers: { ...providerHeaders(target.provider, secret?.value || ""), "content-type": "application/json" },
        body: JSON.stringify({
          model: target.modelId,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          temperature: role === "auditeur" ? 0 : 0.2,
          max_tokens: role === "rapide" ? 600 : 1200,
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    }

    const latencyMs = Date.now() - startedAt;
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        status: "error",
        providerId: target.provider.id,
        modelId: target.modelId,
        latencyMs,
        message: `Appel LLM refusé (${response.status}). Vérifiez modèle, endpoint et droits API.`,
      };
    }

    const text =
      target.provider.id === "ollama"
        ? textFromOllamaPayload(payload)
        : target.provider.id === "google"
        ? textFromGooglePayload(payload)
        : target.provider.apiFormat === "Anthropic-compatible"
          ? textFromAnthropicPayload(payload)
          : textFromOpenAiCompatiblePayload(payload);

    return {
      ok: true,
      status: "connected",
      providerId: target.provider.id,
      modelId: target.modelId,
      latencyMs,
      message: "Réponse LLM reçue.",
      text: text || "Provider joignable, mais aucune réponse textuelle exploitable n'a été renvoyée.",
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      providerId: target.provider.id,
      modelId: target.modelId,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error && error.name === "AbortError" ? "Timeout de génération LLM." : "Génération LLM impossible.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runConfiguredLlmRole(role: LLMRole, prompt: string): Promise<LlmRunResult> {
  const target = resolveRoleTarget(role);
  if (target.error || !target.primary) {
    return { ok: false, status: "error", latencyMs: 0, message: target.error || "Rôle LLM incomplet." };
  }

  const primary = await callTarget(target.primary, prompt, role);
  if (primary.ok || !target.fallback) return primary;

  const fallback = await callTarget(target.fallback, prompt, role);
  return {
    ...fallback,
    fallbackUsed: true,
    message: fallback.ok ? `Fallback utilisé après échec primaire: ${primary.message}` : `${primary.message} Fallback: ${fallback.message}`,
  };
}

export async function runSpecificLlmProvider(providerId: string, modelId: string, role: LLMRole, prompt: string): Promise<LlmRunResult> {
  const provider = getConfiguredLlmProviders().find((item) => item.id === providerId);
  if (!provider) {
    return { ok: false, status: "error", latencyMs: 0, message: `Provider introuvable: ${providerId}.` };
  }

  return callTarget({ provider, modelId }, prompt, role);
}
