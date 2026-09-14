import { createReadStream } from "node:fs"
import { readdir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import { getDataDir } from "../src/shared/branding"

// Run after several days: bun scripts/performance-report.ts [data directory] [days].
const directory = path.join(process.argv[2] ?? getDataDir(homedir()), "diagnostics")
const days = Number(process.argv[3] ?? 7)
if (!Number.isFinite(days) || days <= 0) throw new Error("Days must be positive")
const since = Date.now() - days * 86_400_000
const runs = new Map<string, {
  firstTime: string; lastTime: string; samples: number; firstRss: number; lastRss: number; peakRss: number
  peakChildRss: number; peakLag: number; peaks: Record<string, number>
  metrics: Record<string, { count: number; total: number; max: number }>
}>()
const browsers = new Map<string, { firstSeen: string; lastSeen: string; heapFirst: number | null; heapLast: number | null; heapPeak: number; nodesPeak: number; displayMaxMs: number }>()
let skipped = 0
const files = (await readdir(directory)).filter(name => /^performance-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort()
for (const file of files) {
  const lines = createInterface({ input: createReadStream(path.join(directory, file)), crlfDelay: Infinity })
  for await (const line of lines) {
    let row
    try { row = JSON.parse(line) } catch { skipped += 1; continue }
    if (Date.parse(row.time) < since || !Number.isFinite(row.memory?.rss)) continue
    // PID and approximate boot time distinguish restarts and later PID reuse.
    for (const [id, client] of Object.entries(row.clients ?? {}) as [string, { lastSeen: string; metrics: Record<string, { max: number }> }][]) {
      const heap = client.metrics.browser_heap_bytes?.max ?? null
      const browser = browsers.get(id) ?? { firstSeen: client.lastSeen, lastSeen: client.lastSeen, heapFirst: heap, heapLast: heap, heapPeak: 0, nodesPeak: 0, displayMaxMs: 0 }
      browser.lastSeen = client.lastSeen
      browser.heapLast = heap
      browser.heapPeak = Math.max(browser.heapPeak, heap ?? 0)
      browser.nodesPeak = Math.max(browser.nodesPeak, client.metrics.dom_nodes?.max ?? 0)
      browser.displayMaxMs = Math.max(browser.displayMaxMs, client.metrics.chat_display_ms?.max ?? 0)
      browsers.set(id, browser)
    }
    const bootMinute = Math.round((Date.parse(row.time) - row.uptimeSeconds * 1000) / 60_000)
    const key = `${row.pid}:${bootMinute}`
    let run = runs.get(key)
    if (!run) {
      run = { firstTime: row.time, lastTime: row.time, samples: 0, firstRss: row.memory.rss, lastRss: row.memory.rss, peakRss: 0, peakChildRss: 0, peakLag: 0, peaks: {}, metrics: {} }
      runs.set(key, run)
    }
    run.samples += 1
    run.lastTime = row.time
    run.lastRss = row.memory.rss
    run.peakRss = Math.max(run.peakRss, row.memory.rss)
    run.peakChildRss = Math.max(run.peakChildRss, row.children?.rssBytes ?? 0)
    run.peakLag = Math.max(run.peakLag, row.metrics?.event_loop_lag_ms?.max ?? 0)
    for (const [name, value] of Object.entries(row.resources ?? {})) {
      if (typeof value === "number") run.peaks[name] = Math.max(run.peaks[name] ?? 0, value)
    }
    for (const [name, metric] of Object.entries(row.metrics ?? {}) as [string, { count: number; total: number; max: number }][]) {
      const previous = run.metrics[name] ?? { count: 0, total: 0, max: 0 }
      run.metrics[name] = { count: previous.count + metric.count, total: previous.total + metric.total, max: Math.max(previous.max, metric.max) }
    }
  }
}
console.log(JSON.stringify({ directory, days, skipped, runs: Object.fromEntries(runs), browsers: Object.fromEntries(browsers) }, null, 2))
