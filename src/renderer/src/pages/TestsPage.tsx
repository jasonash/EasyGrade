import type { JSX } from 'react'
import { useState } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { NewTestButton, TestsList } from '@/components/tests/TestsList'
import { useSchoolYearFilter } from '@/lib/schoolYear'
import { ALL_YEARS } from '@/lib/schoolYear'

export function TestsPage(): JSX.Element {
  const { year } = useSchoolYearFilter()
  const [newOpen, setNewOpen] = useState(false)
  return (
    <>
      <PageHeader
        title="Tests"
        subtitle={`Single-page multiple-choice tests${year !== ALL_YEARS ? ` · showing ${year}` : ''}`}
        actions={<NewTestButton onClick={() => setNewOpen(true)} />}
      />
      <TestsList
        filter={(t) => year === ALL_YEARS || t.schoolYear === '' || t.schoolYear === year}
        newTest={{ open: newOpen, onOpen: () => setNewOpen(true), onClose: () => setNewOpen(false) }}
      />
    </>
  )
}
