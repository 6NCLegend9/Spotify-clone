import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Use the project's existing TypeScript devDependency; no runtime packages or loader flags.
const require = createRequire(import.meta.url);
const ts = require("typescript");
export function loadAudioModules(names = ["session", "snapshot", "reducer", "controller", "reduxPort"]) {
  const directory = mkdtempSync(join(tmpdir(), "kasa-audio-tests-"));
  writeFileSync(join(directory, "package.json"), '{"type":"commonjs"}');
  try {
    for (const name of names) {
      const source = readFileSync(new URL(`../../src/audio/${name}.ts`, import.meta.url), "utf8");
      const result = ts.transpileModule(source, { fileName: `${name}.ts`, reportDiagnostics: true,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
      const errors = (result.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
      if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (file) => file, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n",
      }));
      writeFileSync(join(directory, `${name}.js`), result.outputText);
    }
    return Object.fromEntries(names.map((name) => [name, require(join(directory, `${name}.js`))]));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
