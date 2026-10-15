// Шаблон дейлика, встроенный в плагин (источник истины — templates/daily.md).
// esbuild подставляет содержимое через text-loader (.md → string).
import content from "../../templates/daily.md";

export const DAILY_TEMPLATE: string = content;