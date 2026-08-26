import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Box, Button, Chip, Tab, Tabs, Tooltip } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import { api, unwrap } from '@/api'
import { describeError } from '@/lib/errors'
import { useUiStore, type SectionTab } from '@/stores/ui.store'
import { useSectionsStore } from '@/stores/sections.store'
import { useTestsStore } from '@/stores/tests.store'
import { PageHeader } from '@/components/common/PageHeader'
import { RosterTab } from '@/components/students/RosterTab'
import { NewTestButton, TestsList } from '@/components/tests/TestsList'

export function SectionDetailPage(): JSX.Element {
  const sectionId = useUiStore((s) => s.selectedSectionId)
  const tab = useUiStore((s) => s.sectionTab)
  const setTab = useUiStore((s) => s.setSectionTab)
  const navigate = useUiStore((s) => s.navigate)
  const closeSection = useUiStore((s) => s.closeSection)
  const toast = useUiStore((s) => s.toast)
  const openTest = useUiStore((s) => s.openTest)
  const createTest = useTestsStore((s) => s.create)
  const [exporting, setExporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const section = useSectionsStore((s) => s.sections.find((x) => x.id === sectionId) ?? null)
  const sectionsLoading = useSectionsStore((s) => s.loading)

  // If the section disappeared (deleted, or archived while hidden), go back to the list.
  useEffect(() => {
    if (!sectionsLoading && sectionId !== null && section === null) navigate('sections')
  }, [sectionsLoading, sectionId, section, navigate])

  if (!section) return <Box />

  // The section is known, so there is nothing to ask: make the draft and start typing the title.
  const newTest = (): void => {
    if (creating) return
    setCreating(true)
    void createTest({ sectionId: section.id, title: '' })
      .then((test) => openTest(test.id))
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setCreating(false))
  }

  const exportCsv = (): void => {
    setExporting(true)
    void unwrap(api.export.sectionCsv(section.id))
      .then((outcome) => {
        if (outcome) toast('success', `Saved ${outcome.rows} students to ${outcome.path}`)
      })
      .catch((err: unknown) => toast('error', describeError(err)))
      .finally(() => setExporting(false))
  }

  return (
    <>
      <PageHeader
        title={section.name}
        onBack={closeSection}
        backLabel="Back to sections"
        chips={
          <>
            {section.schoolYear ? <Chip size="small" label={section.schoolYear} variant="outlined" /> : null}
            {section.archived ? <Chip size="small" label="Archived" /> : null}
          </>
        }
        actions={
          <>
            <Tooltip title="One row per student, one column per finalized test, plus an average">
              <span>
                <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportCsv} disabled={exporting || section.testCount === 0}>
                  Export grades
                </Button>
              </span>
            </Tooltip>
            {tab === 'tests' ? <NewTestButton onClick={newTest} disabled={creating} /> : null}
          </>
        }
      />

      <Tabs value={tab} onChange={(_, value: SectionTab) => setTab(value)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label={`Roster (${section.studentCount})`} value="roster" />
        <Tab label={`Tests (${section.testCount})`} value="tests" />
      </Tabs>

      {tab === 'roster' ? <RosterTab section={section} /> : null}
      {tab === 'tests' ? (
        <TestsList sectionId={section.id} newTest={{ open: false, onOpen: newTest, onClose: () => undefined }} />
      ) : null}
    </>
  )
}
