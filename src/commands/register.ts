import { Notice } from "obsidian";
import type LifeOSPlugin from "../../main";
import * as dayPlanner from "./dayPlanner";
import * as contentPipeline from "./contentPipeline";
import { DAILY_TEMPLATE } from "../bundled/dailyTemplate";

export function registerCommands(plugin: LifeOSPlugin): void {
  plugin.addCommand({
    id: "lifeos-morning-plan",
    name: "🌅 Утренний план",
    callback: () => dayPlanner.morningPlan(plugin),
  });

  plugin.addCommand({
    id: "lifeos-mini-checkin",
    name: "🔄 Мини-чек-ин",
    callback: () => dayPlanner.miniCheckin(plugin),
  });

  plugin.addCommand({
    id: "lifeos-evening-retro",
    name: "🌙 Итоги дня",
    callback: () => dayPlanner.eveningRetro(plugin),
  });

  plugin.addCommand({
    id: "lifeos-what-to-write",
    name: "📝 Что писать сегодня",
    callback: () => contentPipeline.whatToWriteToday(plugin),
  });

  plugin.addCommand({
    id: "lifeos-advance-draft",
    name: "✍️ Довести черновик",
    callback: () => contentPipeline.advanceDraft(plugin),
  });

  plugin.addCommand({
    id: "lifeos-multi-format",
    name: "📤 Собери версии для площадок",
    callback: () => contentPipeline.multiFormat(plugin),
  });

  plugin.addCommand({
    id: "lifeos-event-recap",
    name: "📣 Анонс/итоги мероприятия",
    callback: () => contentPipeline.eventRecap(plugin),
  });

  plugin.addCommand({
    id: "lifeos-install-daily-template",
    name: "LifeOS: установить шаблон дейлика",
    callback: () => void installDailyTemplate(plugin),
  });

  plugin.addCommand({
    id: "lifeos-open-chat",
    name: "💬 Открыть чат LifeOS",
    callback: () => void plugin.activateChatView(),
  });
}

/** Установка шаблона дейлика «одной кнопкой»: создаёт/перезаписывает заметку-шаблон. */
export async function installDailyTemplate(plugin: LifeOSPlugin): Promise<void> {
  const p = plugin.settings.dailyTemplatePath;
  try {
    const exists = await plugin.app.vault.adapter.exists(p);
    if (exists) {
      await plugin.app.vault.adapter.write(p, DAILY_TEMPLATE);
    } else {
      await plugin.app.vault.create(p, DAILY_TEMPLATE);
    }
    new Notice(`LifeOS: шаблон записан → ${p}`);
  } catch (e) {
    new Notice(`LifeOS: не удалось записать шаблон: ${(e as Error).message}`);
  }
}