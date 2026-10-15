import { Notice } from "obsidian";
import type LifeOSPlugin from "../../main";
import { runAgent, RunAgentParams } from "../runner/opencodeRunner";
import { ProgressModal } from "../modals/ProgressModal";
import { ResultModal } from "../modals/ResultModal";
import { sessionIdFor } from "../utils/paths";

export interface AgentFlowOptions {
  agent: "day-planner" | "content-pipeline";
  prompt: string;
  files?: string[];
  title: string;
}

/**
 * Общий флоу: прогресс-модалка со стримингом → ResultModal с ответом.
 * Ключ подставляется раннером из настроек; сессия на день — по настройке.
 */
export async function runAgentFlow(plugin: LifeOSPlugin, opts: AgentFlowOptions): Promise<void> {
  const progress = new ProgressModal(plugin.app, opts.title);
  progress.open();

  const params: RunAgentParams = {
    agent: opts.agent,
    prompt: opts.prompt,
    files: opts.files,
  };
  if (plugin.settings.sessionPerDay) {
    params.sessionId = sessionIdFor(opts.agent, new Date());
  }

  try {
    const result = await runAgent(plugin.settings, plugin.getVaultPath(), {
      ...params,
      onProgress: (t) => progress.setText(t),
    });
    progress.close();
    new ResultModal(plugin.app, {
      title: opts.title,
      markdown: result.text,
      vaultPath: plugin.getVaultPath(),
    }).open();
  } catch (e) {
    progress.close();
    new Notice(`LifeOS: ${(e as Error).message}`);
  }
}