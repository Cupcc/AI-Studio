import type { ProjectAttention } from '@shared/project/types'
import { S } from '@shared/project/strings'
import { useProjectAttention } from './integration'

export function AttentionDot({ projectId }: { projectId: string | null }) {
  const attention = useProjectAttention(projectId)
  return attention ? <span className={`attention-dot attention-dot--${attention}`} role="img" aria-label={S.tabAttention[attention]} data-attention={attention} /> : null
}
export function attentionLabel(attention: ProjectAttention): string { return attention ? S.tabAttention[attention] : '' }
