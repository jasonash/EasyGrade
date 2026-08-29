import type { JSX } from 'react'
import { useState } from 'react'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import type { Test } from '@shared/types'
import { attachmentUrl } from '@shared/scan-url'
import { useTestsStore } from '@/stores/tests.store'
import { useUiStore } from '@/stores/ui.store'
import { describeError } from '@/lib/errors'
import { formatBytes, formatDateTime } from '@/lib/format'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

interface Props {
  test: Test
  onChanged: (test: Test) => void
}

/**
 * The teacher's own copy of the test (PDF or image) kept with the answer
 * sheet. Works at any status: the file is not part of the printed layout.
 */
export function AttachmentCard({ test, onChanged }: Props): JSX.Element {
  const { attachFile, removeAttachment, openAttachment } = useTestsStore()
  const toast = useUiStore((s) => s.toast)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const attachment = test.attachment

  const run = async (work: () => Promise<Test | null>, done?: string): Promise<void> => {
    setBusy(true)
    try {
      const updated = await work()
      if (updated) {
        onChanged(updated)
        if (done) toast('success', done)
      }
    } catch (err) {
      toast('error', describeError(err))
    } finally {
      setBusy(false)
    }
  }

  const open = (): void => void run(() => openAttachment(test.id).then(() => null))

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        {attachment ? (
          <Box
            sx={{
              width: 96,
              minWidth: 96,
              height: 124,
              borderRadius: 1,
              overflow: 'hidden',
              bgcolor: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            onClick={open}
            role="button"
            aria-label="Open the attached file"
          >
            {attachment.thumb ? (
              <img src={attachmentUrl(test.id, attachment.thumb, attachment.addedAt)} alt="" style={{ width: '100%', display: 'block' }} />
            ) : (
              <PictureAsPdfIcon sx={{ fontSize: 48, color: 'grey.600' }} />
            )}
          </Box>
        ) : null}
        <Stack spacing={1} sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle2">The test itself</Typography>
          {attachment ? (
            <>
              <Typography variant="body2" noWrap title={attachment.fileName}>
                {attachment.fileName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatBytes(attachment.bytes)}, attached {formatDateTime(attachment.addedAt)}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />} disabled={busy} onClick={open}>
                  Open
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AttachFileIcon />}
                  disabled={busy}
                  onClick={() => void run(() => attachFile(test.id), 'File replaced')}
                >
                  Replace...
                </Button>
                <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} disabled={busy} onClick={() => setConfirmRemove(true)}>
                  Remove
                </Button>
              </Stack>
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                Keep a PDF or photo of the test with this answer sheet so you can open or reprint it later. Google Docs can export a PDF from File,
                Download.
              </Typography>
              <Box>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AttachFileIcon />}
                  disabled={busy}
                  onClick={() => void run(() => attachFile(test.id), 'File attached')}
                >
                  Attach PDF or image...
                </Button>
              </Box>
            </>
          )}
        </Stack>
      </Stack>
      <ConfirmDialog
        open={confirmRemove}
        title="Remove the attached file?"
        message={attachment ? `"${attachment.fileName}" will be deleted from EasyGrade. Your original file is not affected.` : ''}
        confirmLabel="Remove"
        destructive
        busy={busy}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false)
          void run(() => removeAttachment(test.id), 'File removed')
        }}
      />
    </Paper>
  )
}
