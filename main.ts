import { Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  LifeOSSettings,
  LifeOSSettingTab,
} from "./src/settings";
import { registerCommands, installDailyTemplate } from "./src/commands/register";
import { ChatView, CHAT_VIEW_TYPE } from "./src/chat/chatView";

export default class LifeOSPlugin extends Plugin {
  settings!: LifeOSSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new LifeOSSettingTab(this.app, this));

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
    this.addRibbonIcon("bot", "LifeOS Chat", () => {
      void this.activateChatView();
    });

    registerCommands(this);
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(CHAT_VIEW_TYPE);
  }

  /** Путь к vault: настройка или текущий vault плагина. */
  getVaultPath(): string {
    if (this.settings.vaultPath.trim()) return this.settings.vaultPath.trim();
    const adapter = this.app.vault.adapter as { getBasePath?: () => string };
    return adapter.getBasePath ? adapter.getBasePath() : "";
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Установка шаблона дейлика (команда и кнопка в настройках). */
  async writeDailyTemplate(): Promise<void> {
    await installDailyTemplate(this);
  }

  async activateChatView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
    if (existing) {
      await workspace.revealLeaf(existing);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
    await workspace.revealLeaf(leaf);
  }
}