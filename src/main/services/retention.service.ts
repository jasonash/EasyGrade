import { rmSync } from 'node:fs'
import { join } from 'node:path'
import type { PurgeOutcome, PurgePreview } from '@shared/schemas'
import type { ScanRepository } from '../db/repositories/scan.repo'
import { dirBytes } from './backup.service'
import type { SettingsService } from './settings.service'

/**
 * Retention purge (PRD FR-6.3). Manual only: preview says what would go,
 * purge deletes the page images of batches older than the retention
 * setting and marks them purged. Detections and results are untouched.
 */
export class RetentionService {
  constructor(
    private readonly scans: ScanRepository,
    private readonly settings: SettingsService,
    private readonly scansDir: string
  ) {}

  cutoff(now = new Date()): { retentionDays: number; cutoff: string } {
    const retentionDays = this.settings.get().scanRetentionDays
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
    return { retentionDays, cutoff }
  }

  preview(now = new Date()): PurgePreview {
    const { retentionDays, cutoff } = this.cutoff(now)
    let pageCount = 0
    let bytes = 0
    const candidates = this.scans.listPurgeCandidates(cutoff)
    for (const batch of candidates) {
      pageCount += batch.pageCount
      bytes += dirBytes(join(this.scansDir, String(batch.id)))
    }
    return { retentionDays, cutoff, batchCount: candidates.length, pageCount, bytes }
  }

  purge(now = new Date()): PurgeOutcome {
    const { cutoff } = this.cutoff(now)
    const outcome: PurgeOutcome = { batchCount: 0, pageCount: 0, bytes: 0 }
    for (const batch of this.scans.listPurgeCandidates(cutoff)) {
      const dir = join(this.scansDir, String(batch.id))
      outcome.bytes += dirBytes(dir)
      rmSync(dir, { recursive: true, force: true })
      this.scans.markPurged(batch.id, now.toISOString())
      outcome.batchCount++
      outcome.pageCount += batch.pageCount
    }
    return outcome
  }
}
