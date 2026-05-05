import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Activity, Brain, History,
  GitBranch, Shield, Settings, Plug, Users, Gauge, Target, FormInput, Mic, BookLock, Lock
} from 'lucide-react'

const NAV = [
  { to: '/',              icon: LayoutDashboard, label: 'Dashboard',       group: 'core' },
  { to: '/context',       icon: Activity,        label: 'Context Monitor', group: 'core' },
  { to: '/predictions',   icon: Brain,           label: 'Predictions',     group: 'core' },
  { to: '/relationships', icon: Users,           label: 'Relationships',   group: 'core' },
  { to: '/actions',       icon: History,         label: 'Action Log',      group: 'core' },
  { to: '/workflows',     icon: GitBranch,       label: 'Workflows',       group: 'automation' },
  { to: '/voice-gesture', icon: Mic,             label: 'Voice & Gesture', group: 'automation' },
  { to: '/safety',        icon: Shield,          label: 'Safety',          group: 'system' },
  { to: '/performance',   icon: Gauge,           label: 'Performance',     group: 'system' },
  { to: '/accuracy',      icon: Target,          label: 'Accuracy',        group: 'system' },
  { to: '/formfill',      icon: FormInput,       label: 'Form Fill',       group: 'system' },
  { to: '/integrations',  icon: Plug,            label: 'Integrations',    group: 'system' },
  { to: '/settings',      icon: Settings,        label: 'Settings',        group: 'system' },
  { to: '/compliance',    icon: BookLock,        label: 'Compliance',      group: 'system' },
  { to: '/privacy',       icon: Lock,            label: 'Privacy',         group: 'system' },
]

const GROUP_LABELS = { core: 'Intelligence', automation: 'Automation', system: 'System' }

export default function Sidebar() {
  const groups = [...new Set(NAV.map(n => n.group))]

  return (
    <aside
      className="w-56 flex-shrink-0 border-r border-border bg-card flex flex-col py-4 px-3 gap-0.5"
      aria-label="Main navigation"
      role="navigation"
    >
      <div className="px-3 mb-5">
        <p className="text-base font-bold text-foreground tracking-tight">PFPA</p>
        <p className="text-xs text-muted-foreground">Prompt-Free Proactive AI v2</p>
      </div>

      {groups.map((group, gi) => {
        const items = NAV.filter(n => n.group === group)
        return (
          <div key={group} className={gi > 0 ? 'mt-3' : ''}>
            <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
              {GROUP_LABELS[group]}
            </p>
            {items.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={to === '/'}
                aria-label={label}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`
                }>
                <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        )
      })}
    </aside>
  )
}
