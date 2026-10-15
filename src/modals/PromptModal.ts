import { App, Modal, Setting, TextAreaComponent } from "obsidian";

export interface PromptModalOptions {
  title: string;
  placeholder: string;
  submitLabel?: string;
  defaultValue?: string;
  onSubmit: (text: string) => void;
}

/** Модалка с многострочным вводом (мини-чек-ин, целевые стадии и т.п.). */
export class PromptModal extends Modal {
  private textArea!: TextAreaComponent;

  constructor(app: App, private opts: PromptModalOptions) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.opts.title });

    this.textArea = new TextAreaComponent(contentEl);
    this.textArea.setPlaceholder(this.opts.placeholder);
    this.textArea.setValue(this.opts.defaultValue ?? "");
    this.textArea.inputEl.style.width = "100%";
    this.textArea.inputEl.style.minHeight = "120px";
    this.textArea.inputEl.addClass("lifeos-prompt-input");

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText(this.opts.submitLabel ?? "Отправить")
        .setCta()
        .onClick(() => {
          const text = this.textArea.getValue().trim();
          if (text) this.opts.onSubmit(text);
          this.close();
        })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}