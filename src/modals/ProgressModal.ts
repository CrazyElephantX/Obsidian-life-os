import { App, Modal } from "obsidian";

/** Индикатор выполнения агента: показывает потоковый текст ответа. */
export class ProgressModal extends Modal {
  private body!: HTMLElement;
  private timer: number | null = null;
  private startedAt = 0;
  private gotText = false;

  constructor(app: App, title: string) {
    super(app);
    this.setTitle(title);
  }

  onOpen(): void {
    this.body = this.contentEl.createDiv({ cls: "lifeos-progress" });
    this.body.setText("⚙️ Запуск opencode CLI…");
    this.startedAt = Date.now();
    this.timer = window.setInterval(() => {
      if (this.gotText) return;
      const s = Math.round((Date.now() - this.startedAt) / 1000);
      this.body.setText(`🤖 Агент думает… ${s} с`);
    }, 1000);
  }

  setText(t: string): void {
    if (!this.body) return;
    if (t.trim()) {
      this.gotText = true;
      if (this.timer !== null) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
    }
    const shown = t.length > 6000 ? t.slice(-6000) : t;
    this.body.setText(shown || "…");
    this.body.scrollTop = this.body.scrollHeight;
  }

  onClose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.contentEl.empty();
  }
}