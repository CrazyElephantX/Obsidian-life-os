import { Notice } from "obsidian";
import type LifeOSPlugin from "../../main";
import { PromptModal } from "../modals/PromptModal";
import { runAgentFlow } from "./common";

function activeFilePath(plugin: LifeOSPlugin): string | undefined {
  return plugin.app.workspace.getActiveFile()?.path;
}

/** 📝 Что писать сегодня: агент читает energy/content_block и предлагает одну задачу. */
export function whatToWriteToday(plugin: LifeOSPlugin): void {
  void runAgentFlow(plugin, {
    agent: "content-pipeline",
    prompt: "Что писать сегодня? Проверь content_block и energy в дейлике, отсортируй бэклог и предложи одну задачу.",
    title: "📝 Что писать сегодня",
  });
}

/** ✍️ Довести черновик: один переход по стадиям для активной заметки (+ референсы стиля). */
export function advanceDraft(plugin: LifeOSPlugin): void {
  const file = activeFilePath(plugin);
  if (!file) {
    new Notice("LifeOS: открой заметку-черновик в редакторе");
    return;
  }
  new PromptModal(plugin.app, {
    title: "✍️ Довести черновик",
    placeholder: "Целевая стадия: idea / outline / draft / ready (пусто — следующий шаг по цепочке)",
    defaultValue: "следующий по цепочке",
    onSubmit: (stage) => {
      void runAgentFlow(plugin, {
        agent: "content-pipeline",
        prompt: `Доведи заметку до стадии «${stage}». Заметка: ${file}. Если доступны референсы стиля — используй их.`,
        files: [file],
        title: "✍️ Довести черновик",
      });
    },
  }).open();
}

/** 📤 Собери версии для площадок из готового драфта (активная заметка). */
export function multiFormat(plugin: LifeOSPlugin): void {
  const file = activeFilePath(plugin);
  if (!file) {
    new Notice("LifeOS: открой готовый драфт в редакторе");
    return;
  }
  new PromptModal(plugin.app, {
    title: "📤 Собери версии для площадок",
    placeholder: "Площадки через запятую: site, tg, video, boosty (пусто — все)",
    defaultValue: "site, tg, video, boosty",
    onSubmit: (platforms) => {
      void runAgentFlow(plugin, {
        agent: "content-pipeline",
        prompt: `Собери версии для площадок: ${platforms}. Источник: ${file}. Версии выведи в ответе.`,
        files: [file],
        title: "📤 Версии для площадок",
      });
    },
  }).open();
}

/** 📣 Анонс/итоги мероприятия по активной заметке курса/выступления. */
export function eventRecap(plugin: LifeOSPlugin): void {
  const file = activeFilePath(plugin);
  if (!file) {
    new Notice("LifeOS: открой заметку курса/выступления");
    return;
  }
  new PromptModal(plugin.app, {
    title: "📣 Анонс или итоги?",
    placeholder: "анонс (до мероприятия) / итоги (после)",
    defaultValue: "анонс",
    onSubmit: (kind) => {
      void runAgentFlow(plugin, {
        agent: "content-pipeline",
        prompt: `Подготовь ${kind === "итоги" ? "пост с итогами" : "анонс"} мероприятия. Материал: ${file}`,
        files: [file],
        title: "📣 Анонс/итоги мероприятия",
      });
    },
  }).open();
}