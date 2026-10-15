/** Разбор NDJSON-вывода `opencode run --format json`. */

export interface ParsedRun {
  /** Итоговый текст ответа ассистента */
  text: string;
  /** ID сессии opencode, если встретился в событиях */
  sessionId?: string;
  /** Все распознанные события */
  events: unknown[];
}

export class OpenCodeError extends Error {
  readonly raw: string;
  constructor(message: string, raw = "") {
    super(message);
    this.name = "OpenCodeError";
    this.raw = raw;
  }
}

export function parseOpenCodeJson(stdout: string): ParsedRun {
  const textParts = new Map<string, string>();
  const events: unknown[] = [];
  let finalText = "";
  let sessionId: string | undefined;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let ev: Record<string, any>;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      continue;
    }
    events.push(ev);

    if (ev.type === "error") {
      const msg =
        ev.error?.data?.message ??
        ev.error?.message ??
        "opencode вернул ошибку";
      throw new OpenCodeError(msg, stdout);
    }

    if (typeof ev.sessionID === "string") sessionId = ev.sessionID;

    // Формат событий зависит от версии: part может быть и под message, и на верхнем уровне
    const part = ev.message?.part ?? ev.part;
    if (part && part.type === "text" && typeof part.text === "string") {
      if (part.id) textParts.set(part.id, part.text);
      else finalText += part.text;
    }

    // Легаси/запасной формат: цельное assistant-сообщение
    if (
      ev.type === "message" &&
      ev.message?.role === "assistant" &&
      typeof ev.message.content === "string"
    ) {
      finalText = ev.message.content;
    }
  }

  const text = [...textParts.values()].join("") || finalText;
  return { text: text.trim(), sessionId, events };
}

/** Обработка одной NDJSON-строки с накоплением текста по part.id. */
export class JsonStreamAccumulator {
  private textParts = new Map<string, string>();
  private fallback = "";
  sessionId?: string;

  pushLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let ev: Record<string, any>;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (ev.type === "error") {
      const msg =
        ev.error?.data?.message ??
        ev.error?.message ??
        "opencode вернул ошибку";
      throw new OpenCodeError(msg);
    }
    if (typeof ev.sessionID === "string") this.sessionId = ev.sessionID;
    const part = ev.message?.part ?? ev.part;
    if (part && part.type === "text" && typeof part.text === "string") {
      if (part.id) this.textParts.set(part.id, part.text);
      else this.fallback += part.text;
    }
    if (
      ev.type === "message" &&
      ev.message?.role === "assistant" &&
      typeof ev.message.content === "string"
    ) {
      this.fallback = ev.message.content;
    }
  }

  get text(): string {
    return ([...this.textParts.values()].join("") || this.fallback).trim();
  }
}