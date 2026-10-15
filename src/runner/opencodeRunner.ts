import { execFile, spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { LifeOSSettings } from "../settings";
import { JsonStreamAccumulator } from "./jsonParser";

export type AgentName = "day-planner" | "content-pipeline";

export interface RunAgentParams {
  agent: AgentName;
  prompt: string;
  model?: string;
  files?: string[];
  sessionId?: string;
  /** Сигнал отмены: kill процесса и ошибка «Отменено пользователем». */
  signal?: AbortSignal;
  onProgress?: (partialText: string) => void;
}

export interface RunAgentResult {
  text: string;
  sessionId?: string;
}

const BINARY_CANDIDATES = [
  "/opt/homebrew/bin/opencode",
  "/usr/local/bin/opencode",
  path.join(os.homedir(), "bin", "opencode"),
  path.join(os.homedir(), ".local", "bin", "opencode"),
];

/**
 * Поиск бинарника opencode.
 * Obsidian, запущенный из Finder/Dock, не наследует PATH терминала,
 * поэтому проверяем известные пути и только в конце — `which`.
 */
export function detectBinary(): Promise<string> {
  return new Promise((resolve, reject) => {
    const tryCandidate = (idx: number): void => {
      if (idx >= BINARY_CANDIDATES.length) {
        execFile("which", ["opencode"], (e: Error | null, stdout: string) => {
          if (!e && stdout.trim()) resolve(stdout.trim());
          else reject(new Error("Бинарник opencode не найден. Укажите путь в настройках."));
        });
        return;
      }
      execFile("test", ["-x", BINARY_CANDIDATES[idx]], (e: Error | null) => {
        if (!e) resolve(BINARY_CANDIDATES[idx]);
        else tryCandidate(idx + 1);
      });
    };
    tryCandidate(0);
  });
}

export async function resolveBinary(settings: LifeOSSettings): Promise<string> {
  if (settings.binaryPath.trim()) return settings.binaryPath.trim();
  return detectBinary();
}

/**
 * Ключ DeepSeek: свой из настроек, либо автоматически из
 * obsidian-ai-providers (vault/.obsidian/plugins/ai-providers/data.json).
 */
export function resolveApiKey(settings: LifeOSSettings, vaultPath: string): string {
  if (settings.apiKey.trim()) return settings.apiKey.trim();
  try {
    const p = path.join(vaultPath, ".obsidian", "plugins", "ai-providers", "data.json");
    const data = JSON.parse(fs.readFileSync(p, "utf8")) as {
      providers?: Array<{ name?: string; type?: string; apiKey?: string }>;
    };
    const provs = data.providers ?? [];
    const dp =
      provs.find((x) => x.type === "deepseek") ??
      provs.find((x) => (x.name ?? "").toLowerCase().includes("deepseek"));
    return dp?.apiKey ?? "";
  } catch {
    return "";
  }
}

function buildArgs(
  settings: LifeOSSettings,
  params: RunAgentParams,
  useSession: boolean
): string[] {
  const args = [
    "run",
    "--agent",
    params.agent,
    "-m",
    params.model ?? settings.defaultModel,
    "--format",
    "json",
  ];
  if (useSession && params.sessionId) args.push("-s", params.sessionId);
  for (const f of params.files ?? []) args.push("-f", f);
  args.push(params.prompt);
  return args;
}

/**
 * Запуск агента opencode с потоковым разбором NDJSON.
 * Первый запуск дня: сессии ещё нет, opencode отвечает «Session not found»
 * (вывод в stderr) — автоматически повторяем запуск без сессии.
 */
export function runAgent(
  settings: LifeOSSettings,
  vaultPath: string,
  params: RunAgentParams
): Promise<RunAgentResult> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const key = resolveApiKey(settings, vaultPath);
  if (key) env.DEEPSEEK_API_KEY = key;

  const doRun = (useSession: boolean): Promise<RunAgentResult> =>
    new Promise((resolve, reject) => {
      resolveBinary(settings)
        .then((binary) => {
          const args = buildArgs(settings, params, useSession);
          const child = spawn(binary, args, {
            cwd: vaultPath || undefined,
            env,
            // stdin игнорируем: открытый pipe без данных заставляет opencode (TUI)
            // ждать ввода вечно — таймаут 300 с без единого запроса к API.
            stdio: ["ignore", "pipe", "pipe"],
          });

          const acc = new JsonStreamAccumulator();
          let buf = "";
          let stderrTail = "";
          let settled = false;

          const fail = (err: Error): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            params.signal?.removeEventListener("abort", onAbort);
            try {
              child.kill();
            } catch {
              /* noop */
            }
            reject(err);
          };

          const onAbort = (): void => {
            fail(new Error("Отменено пользователем"));
          };

          const timer = setTimeout(() => {
            fail(new Error(`Таймаут: агент не ответил за ${settings.timeoutMs / 1000} с`));
          }, settings.timeoutMs);

          params.signal?.addEventListener("abort", onAbort, { once: true });
          if (params.signal?.aborted) {
            onAbort();
            return;
          }

          child.stdout.on("data", (chunk: Buffer) => {
            buf += chunk.toString();
            let nl: number;
            while ((nl = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, nl);
              buf = buf.slice(nl + 1);
              try {
                acc.pushLine(line);
              } catch (e) {
                fail(e as Error);
                return;
              }
            }
            params.onProgress?.(acc.text);
          });

          child.stderr.on("data", (chunk: Buffer) => {
            stderrTail = (stderrTail + chunk.toString()).slice(-4000);
            if (settings.debugLogs) {
              console.log("[lifeos:opencode stderr]", chunk.toString());
            }
          });

          child.on("error", (err) => fail(err));

          child.on("close", (code) => {
            if (settled) return;
            clearTimeout(timer);
            if (buf.trim()) {
              try {
                acc.pushLine(buf.trim());
              } catch (e) {
                fail(e as Error);
                return;
              }
            }
            const text = acc.text;
            if (code !== 0 && !text) {
              const msg = stderrTail.trim() || `opencode завершился с кодом ${code}`;
              const err = new Error(msg);
              (err as Error & { exitCode?: number }).exitCode = code ?? undefined;
              fail(err);
              return;
            }
            settled = true;
            params.signal?.removeEventListener("abort", onAbort);
            const result: RunAgentResult = { text };
            if (acc.sessionId) result.sessionId = acc.sessionId;
            resolve(result);
          });
        })
        .catch(reject);
    });

  return doRun(true).catch((e: Error) => {
    if (params.sessionId && /session not found/i.test(e.message)) {
      return doRun(false);
    }
    throw e;
  });
}