import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, extname, join, relative, resolve } from "node:path"
import { spawnSync } from "node:child_process"
// @ts-expect-error - Internal solid transform helper shipped by @opentui/solid
import { transformSolidSource } from "../node_modules/@opentui/solid/scripts/solid-transform.js"

const ROOT_DIR = resolve(import.meta.dir, "..")
const SRC_DIR = join(ROOT_DIR, "src")
const DIST_DIR = join(ROOT_DIR, "dist")

async function collectSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(fullPath)))
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(fullPath)
    }
  }
  return files
}

async function main() {
  await rm(DIST_DIR, { recursive: true, force: true })
  await mkdir(DIST_DIR, { recursive: true })

  const tsc = spawnSync("bunx", ["tsc", "-p", "tsconfig.build.json"], {
    cwd: ROOT_DIR,
    stdio: "inherit",
  })
  if (tsc.status !== 0) {
    process.exit(tsc.status ?? 1)
  }

  const sourceFiles = await collectSourceFiles(SRC_DIR)
  for (const srcFile of sourceFiles) {
    const code = await readFile(srcFile, "utf8")
    const transformed = await transformSolidSource(code, {
      filename: srcFile,
      moduleName: "@opentui/solid",
    })

    if (srcFile.endsWith(".tsx") && transformed.includes("jsxDEV(")) {
      throw new Error(
        `Unexpected non-reactive jsxDEV transform in ${relative(ROOT_DIR, srcFile)}`,
      )
    }

    const rel = relative(SRC_DIR, srcFile)
    const outRel = rel.slice(0, -extname(rel).length) + ".js"
    const outFile = join(DIST_DIR, outRel)
    await mkdir(dirname(outFile), { recursive: true })
    await writeFile(outFile, transformed + "\n", "utf8")
  }
}

await main()
