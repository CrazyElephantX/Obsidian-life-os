import { requestUrl } from "obsidian";
import type LifeOSPlugin from "../../main";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContext {
  title: string;
  content: string;
}

const SYSTEM_PROMPT =
  "Ты — ассистент LifeOS в Obsidian. Помогаешь планировать день, работать с контентом и отвечать " +
  "по заметкам пользователя. Отвечай по-русски, кратко и по делу.";

/**
 * Чат-провайдер: основной путь — obsidian-ai-providers (стриминг через SDK),
 * фолбэк — прямой вызов DeepSeek через requestUrl (без стриминга).
 */
export class ChatProvider {
  private ai: Promise<unknown> | null = null;

  constructor(private plugin: LifeOSPlugin) {}

  private async getAiProviders(): Promise<any> {
    if (!this.ai) {
      this.ai = (async () => {
        // SDK @obsidian-ai-providers/sdk: ждём загрузки плагина ai-providers
        const { waitForAI } = await import("@obsidian-ai-providers/sdk");
        const resolver = await waitForAI();
        return await Promise.race([
          resolver.promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("ai-providers не загружен")), 6000)
          ),
        ]);
      })();
    }
    return this.ai;
  }

  async chat(
    messages: ChatMessage[],
    context: ChatContext | null,
    onProgress?: (partial: string) => void
  ): Promise<string> {
    const s = this.plugin.settings;

    if (s.chatUseAiProviders && s.apiKey.length === 0) {
      // Ключ берётся из ai-providers; пробуем даже без нашего ключа
    }
    if (s.chatUseAiProviders) {
      try {
        return await this.chatViaAiProviders(messages, context, onProgress);
      } catch (e) {
        console.warn("[lifeos] ai-providers недоступен, фолбэк на requestUrl:", e);
      }
    }
    if (!s.apiKey.trim()) {
      throw new Error("Не задан DeepSeek API-ключ (настройки LifeOS) и недоступен ai-providers");
    }
    return this.chatViaRequestUrl(messages, context, onProgress);
  }

  private async chatViaAiProviders(
    messages: ChatMessage[],
    context: ChatContext | null,
    onProgress?: (partial: string) => void
  ): Promise<string> {
    const ai: any = await this.getAiProviders();
    const provider =
      ai.providers.find((p: any) => p.type === "deepseek") ?? ai.providers[0];
    if (!provider) throw new Error("В ai-providers нет провайдеров");

    const ctx = context
      ? `Контекст из заметки «${context.title}»:\n${context.content.slice(0, 8000)}\n\n---\n`
      : "";

    return (await ai.execute({
      provider,
      model: this.plugin.settings.chatModel || undefined,
      messages: [
        { role: "system", content: SYSTEM_PROMPT + "\n" + ctx },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      onProgress: (_chunk: string, acc: string) => onProgress?.(acc),
    })) as string;
  }

  private async chatViaRequestUrl(
    messages: ChatMessage[],
    context: ChatContext | null,
    onProgress?: (partial: string) => void
  ): Promise<string> {
    const ctx = context
      ? `Контекст из заметки «${context.title}»:\n${context.content.slice(0, 8000)}\n\n---\n`
      : "";
    const resp = await requestUrl({
      url: "https://api.deepseek.com/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.plugin.settings.apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.plugin.settings.chatModel,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n" + ctx },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
      throw: false,
    });
    if (resp.status !== 200) {
      throw new Error(`DeepSeek API ${resp.status}: ${resp.text.slice(0, 200)}`);
    }
    const json = JSON.parse(resp.text);
    const text: string = json.choices?.[0]?.message?.content ?? "";
    onProgress?.(text);
    return text;
  }
}