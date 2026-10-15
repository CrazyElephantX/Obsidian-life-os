import type LifeOSPlugin from "../../main";
import { PromptModal } from "../modals/PromptModal";
import { runAgentFlow } from "./common";

/** 🌅 Утренний план: агент сам создаёт дейлик при необходимости и раскладывает день по блокам. */
export function morningPlan(plugin: LifeOSPlugin): void {
  void runAgentFlow(plugin, {
    agent: "day-planner",
    prompt: "Собери утренний план дня.",
    title: "🌅 Утренний план",
  });
}

/** 🔄 Мини-чек-ин: свободный ответ пользователя передаётся агенту для отметки/пересборки. */
export function miniCheckin(plugin: LifeOSPlugin): void {
  new PromptModal(plugin.app, {
    title: "🔄 Мини-чек-ин",
    placeholder:
      "Коротко тремя пунктами:\n1) Что из плана уже сделано?\n2) Что появилось внепланового?\n3) Где сейчас больше всего сопротивления?",
    submitLabel: "Отправить агенту",
    onSubmit: (text) => {
      void runAgentFlow(plugin, {
        agent: "day-planner",
        prompt: `Мини-чек-ин. Ответы пользователя:\n${text}`,
        title: "🔄 Мини-чек-ин",
      });
    },
  }).open();
}

/** 🌙 Итоги дня: ретро-абзац в секцию «Итоги дня» дейлика. */
export function eveningRetro(plugin: LifeOSPlugin): void {
  void runAgentFlow(plugin, {
    agent: "day-planner",
    prompt:
      "Проведи вечерние итоги дня: сравни план с фактическими отметками и допиши абзац в секцию «Итоги дня» сегодняшнего дейлика.",
    title: "🌙 Итоги дня",
  });
}