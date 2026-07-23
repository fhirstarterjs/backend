// Packed-consumer type-surface test. Packs the real tarball, installs it into an isolated
// consumer, and type-checks two fixtures against the PUBLISHED types. Locks the current
// packaging behavior: default import works; README-advertised named type imports do NOT.
// Slice 7 repairs the exports and flips the negative fixture to expect success.
import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, copyFileSync, rmSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// `shell: true` is required on Windows to run npm.cmd/tsc.cmd. All args here are static
// internal constants (no user input), so the DEP0190 escaping concern does not apply.
const
   root = join(import.meta.dirname, ".."),
   npm = process.platform === "win32" ? "npm.cmd" : "npm",
   tscOf = (dir: string): string =>
      join(dir, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc"),

   setupConsumer = (): string => {
      const
         dir = mkdtempSync(join(tmpdir(), "fhirstarter-consumer-")),
         tgz = execFileSync(npm, ["pack", "--silent"], { cwd: root, shell: true }).toString().trim(),
         tgzPath = join(root, tgz.split(/\r?\n/).at(-1) ?? tgz)
      writeFileSync(
         join(dir, "package.json"),
         JSON.stringify({ name: "consumer", type: "module", private: true }, null, 2),
      )
      execFileSync(npm, ["install", "--no-save", tgzPath, "typescript@7", "@types/node"], { cwd: dir, stdio: "ignore", shell: true })
      rmSync(tgzPath, { force: true })
      return dir
   },

   typecheck = (dir: string, file: string): { ok: boolean, out: string } => {
      copyFileSync(join(root, "test", "consumer", file), join(dir, file))
      writeFileSync(
         join(dir, "tsconfig.json"),
         JSON.stringify(
            {
               compilerOptions: { module: "ESNext", moduleResolution: "bundler", strict: true, noEmit: true, skipLibCheck: true, types: ["node"] },
               files: [file],
            },
            null,
            2,
         ),
      )
      try {
         const out = execFileSync(tscOf(dir), ["-p", "tsconfig.json"], { cwd: dir, shell: true }).toString()
         return { ok: true, out }
      } catch (e) {
         return { ok: false, out: (e as { stdout?: Buffer }).stdout?.toString() ?? String(e) }
      }
   }

test("packed default import type-checks against published types", () => {
   const dir = setupConsumer()
   try {
      const { ok, out } = typecheck(dir, "default-import.ts")
      assert.ok(ok, `default import should compile; got:\n${out}`)
   } finally {
      rmSync(dir, { recursive: true, force: true })
   }
})

test("KNOWN DEFECT: named type imports do NOT resolve from the package (v1)", () => {
   const dir = setupConsumer()
   try {
      const { ok, out } = typecheck(dir, "named-types.expect-error.ts")
      assert.equal(ok, false, "named type imports are expected to fail in v1")
      assert.match(out, /AuthConfig|has no exported member|Module .* has no/, `expected a missing-export error; got:\n${out}`)
   } finally {
      rmSync(dir, { recursive: true, force: true })
   }
})
