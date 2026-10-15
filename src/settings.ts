import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LifeOSPlugin from "../main";
import { detectBinary } from "./runner/opencodeRunner";
import { DAILY_TEMPLATE } from "./bundled/dailyTemplate";
import { dailyNotePath } from "./utils/paths";

export interface LifeOSSettings {
  /** Абсолютный путь к бинарнику opencode (пусто = автоопределение) */
  binaryPath: string;
  /** Путь к vault (пусто = текущий vault) */
  vaultPath: string;
  /** DeepSeek API-ключ (env для opencode CLI и фолбэк чата) */
  apiKey: string;
  /** Модель агентов: provider/model */
  defaultModel: string;
  /** Использовать obsidian-ai-providers для чата */
  chatUseAiProviders: boolean;
  /** Модель чата (без префикса провайдера) */
  chatModel: string;
  /** Агент не редактирует файлы, только предлагает */
  dryRun: boolean;
  /** Таймаут CLI, мс */
  timeoutMs: number;
  /** Фиксированный session id на день для продолжения контекста */
  sessionPerDay: boolean;
  /** Папка с опубликованными постами-референсами стиля */
  styleRefsFolder: string;
  /** Логировать stderr CLI в консоль */
  debugLogs: boolean;
  /** Путь к заметке-шаблону дейлика */
  dailyTemplatePath: string;
}

export const DEFAULT_SETTINGS: LifeOSSettings = {
  binaryPath: "",
  vaultPath: "",
  apiKey: "",
  defaultModel: "deepseek/deepseek-flash",
  chatUseAiProviders: true,
  chatModel: "deepseek-flash",
  dryRun: false,
  timeoutMs: 300000,
  sessionPerDay: false,
  styleRefsFolder: "4. Архив/Посты",
  debugLogs: false,
  dailyTemplatePath: "4. Архив/Шаблоны/daily.md",
};

export class LifeOSSettingTab extends PluginSettingTab {
  plugin: LifeOSPlugin;

  constructor(app: App, plugin: LifeOSPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "LifeOS" });

    new Setting(containerEl)
      .setName("Путь к бинарнику opencode")
      .setDesc("Абсолютный путь к `opencode`. Пусто — автоматическое определение (для запуска Obsidian из Finder/Dock PATH не наследуется).")
      .addText((text) =>
        text
          .setPlaceholder("/opt/homebrew/bin/opencode")
          .setValue(this.plugin.settings.binaryPath)
          .onChange(async (value) => {
            this.plugin.settings.binaryPath = value;
            await this.plugin.saveSettings();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Определить").onClick(async () => {
          try {
            const bin = await detectBinary();
            this.plugin.settings.binaryPath = bin;
            await this.plugin.saveSettings();
            this.display();
          } catch (e) {
            new Notice(`opencode не найден: ${(e as Error).message}`);
          }
        })
      );

    new Setting(containerEl)
      .setName("Путь к vault")
      .setDesc("Каталог, в котором opencode запускает агентов. Пусто — текущий vault.")
      .addText((text) =>
        text
          .setPlaceholder(this.plugin.getVaultPath())
          .setValue(this.plugin.settings.vaultPath)
          .onChange(async (value) => {
            this.plugin.settings.vaultPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("DeepSeek API-ключ")
      .setDesc("Ключ подставляется в переменную окружения DEEPSEEK_API_KEY для opencode CLI и используется как фолбэк в чате.")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setPlaceholder("sk-...").setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Модель агентов")
      .setDesc("В формате provider/model. Доступные у аккаунта: deepseek/deepseek-flash, deepseek/deepseek-v4-pro.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.defaultModel)
          .setValue(this.plugin.settings.defaultModel)
          .onChange(async (value) => {
            this.plugin.settings.defaultModel = value.trim() || DEFAULT_SETTINGS.defaultModel;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Dry-run")
      .setDesc("Агенты не редактируют файлы, только предлагают план. Безопасно для отладки промптов.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.dryRun).onChange(async (value) => {
          this.plugin.settings.dryRun = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Сессия на день")
      .setDesc("Продолжать контекст агента через session id (отключено: у opencode 1.18 сессия не создаётся автоматически — 'Session not found', плагин повторяет запуск без сессии).")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.sessionPerDay).onChange(async (value) => {
          this.plugin.settings.sessionPerDay = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Таймаут выполнения (мс)")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.timeoutMs))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0) {
              this.plugin.settings.timeoutMs = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Debug-логи")
      .setDesc("Выводить stderr opencode в консоль разработчика.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.debugLogs).onChange(async (value) => {
          this.plugin.settings.debugLogs = value;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Шаблон дейлика" });

    new Setting(containerEl)
      .setName("Путь к шаблону дейлика")
      .setDesc("Заметка, из которой создаётся дневная запись (подключена в настройках Obsidian → Daily notes).")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.dailyTemplatePath)
          .onChange(async (value) => {
            this.plugin.settings.dailyTemplatePath = value.trim() || DEFAULT_SETTINGS.dailyTemplatePath;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Установить шаблон дейлика")
      .setDesc("Создаёт/перезаписывает заметку-шаблон с frontmatter energy/content_block и секциями lifeOS (одной кнопкой).")
      .addButton((btn) =>
        btn.setButtonText("Установить шаблон").onClick(async () => {
          try {
            await this.plugin.writeDailyTemplate();
            new Notice(`Шаблон записан: ${this.plugin.settings.dailyTemplatePath}`);
          } catch (e) {
            new Notice(`Ошибка: ${(e as Error).message}`);
          }
        })
      );

    new Setting(containerEl)
      .setName("Открыть сегодняшний дейлик")
      .setDesc("Для проверки структуры после установки шаблона.")
      .addButton((btn) =>
        btn.setButtonText("Открыть").onClick(async () => {
          const p = dailyNotePath(new Date());
          await this.plugin.app.vault.create(p, DAILY_TEMPLATE).catch(() => {});
          const tf = this.plugin.app.vault.getAbstractFileByPath(p);
          if (tf) await this.plugin.app.workspace.getLeaf(false).openFile(tf as any);
        })
      );

    containerEl.createEl("hr", { cls: "lifeos-footer-divider" });

    const footer = containerEl.createDiv({ cls: "lifeos-footer" });
    footer.createEl("div", {
      cls: "lifeos-footer-version",
      text: `LifeOS v${this.plugin.manifest.version}`,
    });

    const links = footer.createDiv({ cls: "lifeos-footer-links" });
    const makeLink = (label: string, href: string): void => {
      const a = links.createEl("a", { text: label, href });
      a.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(href, "_blank");
      });
    };
    makeLink("❤ Поддержать на Boosty", "https://boosty.to/crazyelephant");
    links.createEl("span", { text: " · " });
    makeLink("Сайт bv-dev.ru", "https://bv-dev.ru/");
  }
}