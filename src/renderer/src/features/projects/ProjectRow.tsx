import { getDeadlineInfo, todayDateOnly } from '@shared/date-utils'
import type { Project } from '@shared/types'
import { CostBadge, StatusBadge } from '../../common/Badge'
import { ProjectLogo } from '../../common/ProjectLogo'

const CATEGORY_LABEL = { event_mmo: 'Event MMO', airdrop: 'Airdrop' } as const

export function ProjectRow({ project, onOpen }: { project: Project; onOpen: () => void }): React.JSX.Element {
  const deadline = getDeadlineInfo(project.endDate, todayDateOnly())
  const summary = project.taskSummary || project.howToJoin || 'Chưa có mô tả nhiệm vụ'

  return (
    <button
      type="button"
      className={`project-row${deadline.tone === 'expired' ? ' project-row--expired' : ''}`}
      onClick={onOpen}
      data-lock-allow="true"
    >
      <span className="project-row__identity">
        <ProjectLogo projectId={project.id} name={project.name} hasLogo={Boolean(project.logoPath)} />
        <span className="project-row__name text-clamp-1">{project.name}</span>
      </span>
      <span className="project-row__task text-clamp-1">
        <span className="muted">{CATEGORY_LABEL[project.category]} · </span>
        {summary}
      </span>
      <span className="project-row__deadline">
        <span>{project.endDate ?? 'Chưa rõ'}</span>
        <span className={`deadline--${deadline.tone}`}>{deadline.text}</span>
      </span>
      <span>
        <StatusBadge status={project.status} />
      </span>
      <span className="project-row__cost">
        <CostBadge costType={project.costType} amountUsd={project.costAmountUsd} />
      </span>
    </button>
  )
}
