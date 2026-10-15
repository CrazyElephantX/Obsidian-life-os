import { App, ButtonComponent, Component, MarkdownRenderer, Modal, Notice } from "obsidian";

export interface ResultAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ResultModalOptions {
  title: string;
  markdown: string;
  /** Path используется как sourcePath для рендера ссылок/вложений */
  vaultPath: string;
  actions?: ResultAction[];
}

/** Результат работы агента: markdown-рендер + действия. */
export class ResultModal extends Modal {
  private renderComponent: Component;

  constructor(app: App, private opts: ResultModalOptions) {
    super(app);
    this.renderComponent = new Component();
    this.renderComponent.load();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(this.opts.title);

    const body = contentEl.createDiv({ cls: "lifeos-result" });
    MarkdownRenderer.render(
      this.app,
      this.opts.markdown || "*(пустой ответ)*",
      body,
      this.opts.vaultPath,
      this.renderComponent
    );

    const actions = contentEl.createDiv({ cls: "modal-button-container" });

    new ButtonComponent(actions)
      .setButtonText("Копировать")
      .onClick(async () => {
        await navigator.clipboard.writeText(this.opts.markdown);
        new Notice("Скопировано");
      });

    new ButtonComponent(actions)
      .setButtonText("Вставить в активную заметку")
      .onClick(async () => {
        const editor = this.app.workspace.activeEditor?.editor;
        if (editor) {
          editor.replaceSelection(this.opts.markdown);
          new Notice("Вставлено в активную заметку");
        } else {
          new Notice("Нет активной заметки");
        }
      });

    for (const a of this.opts.actions ?? []) {
      new ButtonComponent(actions).setButtonText(a.label).onClick(() => void a.onClick());
    }

    new ButtonComponent(actions).setButtonText("Закрыть").onClick(() => this.close());
  }

  onClose(): void {
    this.renderComponent.unload();
    this.contentEl.empty();
  }
}