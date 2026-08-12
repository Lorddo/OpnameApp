import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { safeParseInspectionTemplate } from '../template-schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const templatesRoot = path.resolve(__dirname, '../../../../templates')

async function collectTemplateFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectTemplateFiles(full)))
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(full)
    }
  }
  return files
}

async function main() {
  const files = await collectTemplateFiles(templatesRoot)
  if (files.length === 0) {
    console.error(`No template JSON files found under ${templatesRoot}`)
    process.exit(1)
  }

  let failed = 0
  for (const file of files.sort()) {
    const relative = path.relative(templatesRoot, file)
    const raw = await readFile(file, 'utf8')
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch (error) {
      failed += 1
      console.error(`FAIL  ${relative}: invalid JSON (${String(error)})`)
      continue
    }

    const result = safeParseInspectionTemplate(json)
    if (!result.success) {
      failed += 1
      console.error(`FAIL  ${relative}`)
      for (const issue of result.error.issues) {
        console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      }
      continue
    }

    console.log(`OK    ${relative} (${result.data.id}@${result.data.version})`)
  }

  if (failed > 0) {
    console.error(`\n${failed} template(s) failed validation`)
    process.exit(1)
  }

  console.log(`\nValidated ${files.length} template(s)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
