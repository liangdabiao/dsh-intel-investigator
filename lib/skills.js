// 技能快照提供方（intel-investigator：情报调查方法论）。
// 与 cn30/xhs-darkhorse 同款：解析 SKILL.md frontmatter，get 时追加 DSH 环境说明。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const RANK = 600
const INVOCATION = { modelInvocable: true, userInvocable: true }

function parse(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return null
  const block = m[1]
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const descM = block.match(/^description:\s*(.+)$/m)?.[1]
  let description = descM ? descM.trim().replace(/^(["'])(.*)\1$/, '$2') : null
  if (!description) {
    const lines = block.split(/\r?\n/)
    const start = lines.findIndex((l) => /^description:\s*>/.test(l))
    if (start === -1) return null
    const collected = []
    for (let i = start + 1; i < lines.length; i++) {
      if (/^\S/.test(lines[i])) break
      collected.push(lines[i].replace(/^\s+/, ''))
    }
    description = collected.join(' ').trim()
  }
  if (!name || !description) return null
  return { name, description, body: text.slice(m[0].length) }
}

function readDir(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const sDir = join(dir, entry.name)
    const skillFile = join(sDir, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    const parsed = parse(skillFile)
    if (!parsed) continue
    const auxFiles = readdirSync(sDir, { recursive: true }).filter((f) => f.endsWith('.md') && f !== 'SKILL.md')
    out.push({ dir: sDir, file: skillFile, ...parsed, dirName: entry.name, auxFiles })
  }
  return out
}

function addendum(skill) {
  return [
    '',
    '---',
    '',
    '## 在 DSH 插件里使用',
    '',
    `- 本技能目录：\`${skill.dir}\`；references/ 下的 .md（执行流程/调查模式/引擎策略/报告模板）用文件读取工具按需加载。`,
    '- intel_investigate 工具负责：plan（按模式生成三轮搜索执行清单）/ save（报告存证本地+RedFox 平台）/ list / get；搜索执行、信息交叉验证与报告撰写由你完成。',
    '- 报告写完必须 save 存档（未配置 Key 时如实说明只存了本地），并按可信度标注规范给关键结论标注 ✅⚠️❌🔍。',
    '',
  ].join('\n')
}

export function createSkillProvider(dirs) {
  const list = [].concat(dirs)
  const candidate = (s, auxFiles) => ({
    name: s.name,
    description: s.description,
    path: s.file,
    invocation: INVOCATION,
    source: 'bundled',
    provider: 'intel-investigator',
    rank: RANK,
    locator: s.dir,
    resourceBase: { kind: 'directory', path: s.dir },
    auxFiles,
  })

  return {
    name: 'intel-investigator',
    async list() {
      return list.flatMap(readDir).map((s) => {
        const c = candidate(s, s.auxFiles)
        const { auxFiles, ...rest } = c
        return rest
      })
    },
    async get(c) {
      const s = list.flatMap(readDir).find((x) => x.dir === c.locator && x.name === c.name)
      if (!s) return undefined
      const content = s.body + addendum(s)
      const { rank, locator, auxFiles, ...summary } = candidate(s, s.auxFiles)
      return { ...summary, content, auxFiles }
    },
  }
}

export { readDir, addendum }
