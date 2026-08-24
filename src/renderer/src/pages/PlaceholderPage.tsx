import type { JSX } from 'react'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'

interface Props {
  title: string
  subtitle: string
  phase: string
}

export function PlaceholderPage({ title, subtitle, phase }: Props): JSX.Element {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState title="Coming soon" description={`This screen is planned for ${phase}.`} />
    </>
  )
}