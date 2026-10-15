import { ItemView, MarkdownRenderer, WorkspaceLeaf } from "obsidian";
import type LifeOSPlugin from "../../main";
import { ChatContext, ChatMessage, ChatProvider } from "./chatProvider";
import { AgentName, runAgent } from "../runner/opencodeRunner";
import { sessionIdFor } from "../utils/paths";

export const CHAT_VIEW_TYPE = "lifeos-chat-view";

interface QuickCommand {
  label: string;
  agent: AgentName;
  prompt: string;
}

const QUICK_COMMANDS: QuickCommand[] = [
  { label: "🌅 План дня", agent: "day-planner", prompt: "Собери утренний план дня." },
  {
    label: "🔄 Чек-ин",
    agent: "day-planner",
    prompt:
      "Мини-чек-ин: спроси у меня коротко (что сделано / что внепланового / где сопротивление) и дождись ответа — в этом чате я отвечу следующим сообщением.",
  },
  {
    label: "🌙 Итоги дня",
    agent: "day-planner",
    prompt: "Проведи вечерние итоги дня: сравни план с фактическими отметками и допиши абзац в секцию «Итоги дня» дейлика.",
  },
  {
    label: "📝 Что писать",
    agent: "content-pipeline",
    prompt: "Что писать сегодня? Проверь content_block и energy в дейлике, отсортируй бэклог и предложи одну задачу.",
  },
];

/** Боковая панель LifeOS Chat: история, стриминг, быстрые команды, копирование. */
export class ChatView extends ItemView {
  private provider: ChatProvider;
  private messages: ChatMessage[] = [];
  private context: ChatContext | null = null;

  private msgsEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private ctxLabelEl!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, private plugin: LifeOSPlugin) {
    super(leaf);
    this.provider = new ChatProvider(plugin);
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "LifeOS Chat";
  }

  getIcon(): string {
    return "bot";
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.empty();
    container.addClass("lifeos-chat");

    // Быстрые команды агентов
    const quick = container.createDiv({ cls: "lifeos-chat-quick" });
    for (const cmd of QUICK_COMMANDS) {
      quick.createEl("button", { text: cmd.label }).addEventListener("click", () => {
        void this.runAgentIntoChat(cmd);
      });
    }

    this.msgsEl = container.createDiv({ cls: "lifeos-chat-messages" });

    const toolbar = container.createDiv({ cls: "lifeos-chat-toolbar" });
    toolbar.createEl("button", { text: "📎 Контекст: активная заметка" }).addEventListener(
      "click",
      () => void this.attachActiveNote()
    );
    this.ctxLabelEl = toolbar.createEl("span", { cls: "lifeos-chat-context", text: "" });

    const row = container.createDiv({ cls: "lifeos-chat-input-row" });
    this.inputEl = row.createEl("textarea", {
      attr: { placeholder: "Спроси что угодно… (⌘/Ctrl+Enter — отправить)" },
    });
    row
      .createEl("button", { text: "➤", cls: "mod-cta" })
      .addEventListener("click", () => void this.send());
    this.inputEl.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void this.send();
      }
    });

    this.renderMessages();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  private renderMessages(): void {
    this.msgsEl.empty();
    if (this.messages.length === 0) {
      this.msgsEl.createDiv({
        cls: "lifeos-chat-msg assistant",
        text: "Привет! Я LifeOS. Используй быстрые команды сверху или спроси про план дня, контент и заметки.",
      });
    }
    for (const m of this.messages) {
      this.appendMessage(m);
    }
  }

  private appendMessage(m: ChatMessage, streaming = false): HTMLElement {
    const wrap = this.msgsEl.createDiv({ cls: `lifeos-chat-msg ${m.role}` });
    const body = wrap.createDiv({ cls: "lifeos-chat-msg-body" });
    if (streaming) {
      body.setText(m.content || "…");
    } else {
      MarkdownRenderer.render(this.app, m.content || "*(пусто)*", body, "", this);
    }
    if (m.role === "assistant" && m.content) {
      const copy = wrap.createEl("button", { text: "⧉ Копировать", cls: "lifeos-copy-btn" });
      copy.addEventListener("click", async () => {
        await navigator.clipboard.writeText(m.content);
        copy.setText("✓ Скопировано");
        setTimeout(() => copy.setText("⧉ Копировать"), 1500);
      });
    }
    return body;
  }

  private async attachActiveNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      this.ctxLabelEl.setText("(нет активной заметки)");
      return;
    }
    const content = await this.app.vault.cachedRead(file);
    this.context = { title: file.path, content };
    this.ctxLabelEl.setText(`📎 ${file.path}`);
  }

  /** Быстрая команда: запускает агента и показывает результат в чате. */
  private async runAgentIntoChat(cmd: QuickCommand): Promise<void> {
    this.messages.push({ role: "user", content: `⚡ ${cmd.label}` });
    this.appendMessage(this.messages[this.messages.length - 1]);

    const aMsg: ChatMessage = { role: "assistant", content: "" };
    this.messages.push(aMsg);
    const bubble = this.appendMessage(aMsg, true);
    bubble.scrollIntoView({ block: "end" });

    // Индикатор процесса: этап + таймер + кнопка отмены
    const statusEl = bubble.createDiv({
      cls: "lifeos-chat-status",
      text: "⚙️ Запуск opencode CLI…",
    });
    const cancelBtn = bubble.createEl("button", { text: "⏹ Отмена", cls: "lifeos-cancel-btn" });
    const startedAt = Date.now();
    let lastTick = -1;
    const tick = (): void => {
      const s = Math.round((Date.now() - startedAt) / 1000);
      if (s !== lastTick) {
        lastTick = s;
        statusEl.setText(`🤖 Агент думает… ${this.fmtElapsed(s)}`);
      }
    };
    const timer = window.setInterval(tick, 250);
    const abort = new AbortController();
    const cleanup = (): void => {
      window.clearInterval(timer);
      statusEl.remove();
      cancelBtn.remove();
    };
    cancelBtn.addEventListener("click", () => abort.abort());

    try {
      const result = await runAgent(this.plugin.settings, this.plugin.getVaultPath(), {
        agent: cmd.agent,
        prompt: cmd.prompt,
        sessionId: this.plugin.settings.sessionPerDay
          ? sessionIdFor(cmd.agent, new Date())
          : undefined,
        signal: abort.signal,
        onProgress: (t) => {
          if (t) {
            cleanup(); // первый токен — показываем живой текст
            aMsg.content = t;
            bubble.setText(t);
          }
          bubble.scrollIntoView({ block: "end" });
        },
      });
      cleanup();
      aMsg.content = result.text || "*(пустой ответ)*";
      bubble.empty();
      MarkdownRenderer.render(this.app, aMsg.content, bubble, "", this);
      this.reappendCopyButton(bubble, aMsg.content);
    } catch (e) {
      cleanup();
      aMsg.content = `*Ошибка: ${(e as Error).message}*`;
      bubble.empty();
      bubble.setText(aMsg.content);
    }
  }

  private reappendCopyButton(body: HTMLElement, text: string): void {
    const copy = body.createEl("button", { text: "⧉ Копировать", cls: "lifeos-copy-btn" });
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(text);
      copy.setText("✓ Скопировано");
      setTimeout(() => copy.setText("⧉ Копировать"), 1500);
    });
  }

  private async send(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = "";

    this.messages.push({ role: "user", content: text });
    this.appendMessage(this.messages[this.messages.length - 1]);

    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    this.messages.push(assistantMsg);
    const bubble = this.appendMessage(assistantMsg, true);
    bubble.scrollIntoView({ block: "end" });

    // Индикатор процесса: этап + таймер (до первого токена)
    const statusEl = bubble.createDiv({
      cls: "lifeos-chat-status",
      text: "⏳ Отправляю запрос к модели…",
    });
    const startedAt = Date.now();
    let lastTick = -1;
    const tick = (): void => {
      const s = Math.round((Date.now() - startedAt) / 1000);
      if (s !== lastTick) {
        lastTick = s;
        statusEl.setText(`🤖 Модель думает… ${this.fmtElapsed(s)}`);
      }
    };
    const timer = window.setInterval(tick, 250);

    try {
      const full = await this.provider.chat(
        this.messages.slice(0, -1),
        this.context,
        (partial) => {
          if (partial) {
            window.clearInterval(timer);
            statusEl.remove();
            assistantMsg.content = partial;
            bubble.setText(partial);
          }
          bubble.scrollIntoView({ block: "end" });
        }
      );
      window.clearInterval(timer);
      statusEl.remove();
      assistantMsg.content = full || "*(пусто)*";
      bubble.empty();
      MarkdownRenderer.render(this.app, assistantMsg.content, bubble, "", this);
      this.reappendCopyButton(bubble, assistantMsg.content);
    } catch (e) {
      window.clearInterval(timer);
      statusEl.remove();
      assistantMsg.content = `*Ошибка: ${(e as Error).message}*`;
      bubble.empty();
      bubble.setText(assistantMsg.content);
    }
  }

  /** Человекочитаемый прошедший интервал: 0:05, 1:23, 2:01. */
  private fmtElapsed(s: number): string {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}:${ss < 10 ? `0${ss}` : ss}`;
  }
}