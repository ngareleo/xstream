import { SeverityNumber } from "@opentelemetry/api-logs";
import { type ExportResult, ExportResultCode, hrTimeToMicroseconds } from "@opentelemetry/core";
import { type LogRecordExporter, type ReadableLogRecord } from "@opentelemetry/sdk-logs";

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
} as const;

export class PrettyConsoleExporter implements LogRecordExporter {
  export(records: ReadableLogRecord[], done: (result: ExportResult) => void): void {
    for (const r of records) {
      const d = new Date(hrTimeToMicroseconds(r.hrTime) / 1000);
      const ts = `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}`;
      const level = (r.severityText ?? "INFO").padEnd(5);
      const component = String(r.attributes?.["component"] ?? "server");
      const message = String(r.body ?? "");

      const levelColor =
        r.severityNumber !== undefined && r.severityNumber >= SeverityNumber.ERROR
          ? ANSI.red
          : r.severityNumber !== undefined && r.severityNumber >= SeverityNumber.WARN
            ? ANSI.yellow
            : ANSI.green;

      const attrs = Object.entries(r.attributes ?? {})
        .filter(([k]) => k !== "component")
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");

      process.stdout.write(
        `${ANSI.dim}${ts}${ANSI.reset} ` +
          `${levelColor}${ANSI.bold}${level}${ANSI.reset} ` +
          `${ANSI.cyan}[${component}]${ANSI.reset} ` +
          `${message}` +
          (attrs ? `  ${ANSI.dim}${attrs}${ANSI.reset}` : "") +
          "\n"
      );
    }
    done({ code: ExportResultCode.SUCCESS });
  }

  async forceFlush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}
