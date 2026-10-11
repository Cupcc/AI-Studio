import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import GithubSlugger from 'github-slugger'
import { toString } from 'mdast-util-to-string'
import { git, paths } from './check-scope.mjs'

const parser = unified().use(remarkParse).use(remarkGfm)
function walk(node, visit) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

export function snapshot(ref, cwd = process.cwd()) {
  const files = ref
    ? paths(git(['ls-tree', '-r', '--name-only', '-z', ref], cwd))
    : paths(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd))
  const result = new Map()
  for (const file of new Set(files)) {
    if (!ref) {
      try { if (!statSync(path.join(cwd, file)).isFile()) continue } catch { continue }
    }
    result.set(file, file.endsWith('.md')
      ? (ref ? git(['show', `${ref}:${file}`], cwd) : readFileSync(path.join(cwd, file), 'utf8'))
      : null)
  }
  return result
}

export function documentIssues(files) {
  const documents = new Map()
  for (const [file, content] of files) {
    if (!file.endsWith('.md') || content === null) continue
    const tree = parser.parse(content)
    const slugger = new GithubSlugger()
    const anchors = new Set()
    const links = []
    const definitions = new Map()
    walk(tree, node => {
      if (node.type === 'heading') anchors.add(slugger.slug(toString(node)))
      if (node.type === 'html') {
        for (const match of node.value.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) anchors.add(match[1])
      }
      if (node.type === 'definition') definitions.set(node.identifier, node.url)
      if (['link', 'image', 'linkReference', 'imageReference'].includes(node.type)) links.push(node)
    })
    documents.set(file, { anchors, links, definitions })
  }
  const issues = []
  const exists = target => target === '.' || files.has(target) || [...files.keys()].some(file => file.startsWith(`${target}/`))
  for (const [file, doc] of documents) {
    for (const link of doc.links) {
      const url = link.url ?? doc.definitions.get(link.identifier)
      if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) continue
      const report = reason => issues.push({ file, line: link.position.start.line, url, reason,
        key: JSON.stringify([file, url, reason]) })
      let target, fragment
      try {
        const hash = url.indexOf('#')
        const pathname = (hash < 0 ? url : url.slice(0, hash)).split('?')[0]
        fragment = hash < 0 ? '' : decodeURIComponent(url.slice(hash + 1))
        target = pathname ? path.posix.normalize(path.posix.join(
          pathname.startsWith('/') ? '.' : path.posix.dirname(file), decodeURIComponent(pathname))) : file
        // Repository-root absolute paths are treated as repository links.
        target = target.replace(/^\//, '').replace(/\/$/, '') || '.'
      } catch { report('invalid URL encoding'); continue }
      if (target === '..' || target.startsWith('../') || !exists(target)) {
        report('missing local target')
      } else if (fragment && documents.has(target) && !documents.get(target).anchors.has(fragment)) {
        report('missing Markdown anchor')
      }
    }
  }
  return issues
}

export function newIssues(before, after) {
  const old = new Set(documentIssues(before).map(issue => issue.key))
  return documentIssues(after).filter(issue => !old.has(issue.key))
}

export function checkDocs({ base = 'HEAD', head, cwd = process.cwd() } = {}) {
  const before = base ? snapshot(base, cwd) : new Map()
  const after = snapshot(head, cwd)
  const issues = newIssues(before, after)
  for (const issue of issues) console.error(`${issue.file}:${issue.line}: ${issue.reason}: ${issue.url}`)
  console.log(`Documentation: ${issues.length} new issue(s); ${documentIssues(before).length} baseline issue(s) unchanged or removed.`)
  return issues.length === 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const options = {}
  while (args.length) {
    const flag = args.shift()
    if (!['--base', '--head'].includes(flag) || !args.length) throw new Error(`Invalid argument: ${flag}`)
    options[flag.slice(2)] = args.shift()
  }
  if (!checkDocs(options)) process.exitCode = 1
}
