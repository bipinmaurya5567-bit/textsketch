// samples.js — hard-coded sample DiagramSpecs for each type (design.md §2)
// Includes Phase 3 edge-case samples: large flowchart, many back-edges, wide timeline.

export const samples = [
  // ─── Flowchart samples ──────────────────────────────────────────────────────
  {
    label: 'Flowchart — User Registration',
    spec: {
      type: 'flowchart',
      title: 'User Registration Flow',
      nodes: [
        { id: 'n1', label: 'Visitor lands\non homepage', shape: 'rounded-rect', role: 'start' },
        { id: 'n2', label: 'Fill sign-up form', shape: 'rounded-rect', role: 'step' },
        { id: 'n3', label: 'Valid?', shape: 'diamond', role: 'decision' },
        { id: 'n4', label: 'Show errors', shape: 'rect', role: 'step' },
        { id: 'n5', label: 'Create account', shape: 'rounded-rect', role: 'step' },
        { id: 'n6', label: 'Send welcome email', shape: 'rounded-rect', role: 'step' },
        { id: 'n7', label: 'Done', shape: 'circle', role: 'end' },
      ],
      edges: [
        { from: 'n1', to: 'n2', label: '' },
        { from: 'n2', to: 'n3', label: '' },
        { from: 'n3', to: 'n4', label: 'No' },
        { from: 'n4', to: 'n2', label: 'retry' },
        { from: 'n3', to: 'n5', label: 'Yes' },
        { from: 'n5', to: 'n6', label: '' },
        { from: 'n6', to: 'n7', label: '' },
      ],
    },
  },
  {
    label: 'Flowchart — CI/CD Pipeline (many branches)',
    spec: {
      type: 'flowchart',
      title: 'CI/CD Pipeline',
      nodes: [
        { id: 'a1', label: 'Developer pushes code', shape: 'pill', role: 'start' },
        { id: 'a2', label: 'Lint & format check', shape: 'rounded-rect', role: 'step' },
        { id: 'a3', label: 'Lint passed?', shape: 'diamond', role: 'decision' },
        { id: 'a4', label: 'Fix lint errors', shape: 'rect', role: 'step' },
        { id: 'a5', label: 'Run unit tests', shape: 'rounded-rect', role: 'step' },
        { id: 'a6', label: 'Tests pass?', shape: 'diamond', role: 'decision' },
        { id: 'a7', label: 'Notify failure', shape: 'rect', role: 'step' },
        { id: 'a8', label: 'Build Docker image', shape: 'rounded-rect', role: 'step' },
        { id: 'a9', label: 'Security scan', shape: 'rounded-rect', role: 'step' },
        { id: 'a10', label: 'Scan clean?', shape: 'diamond', role: 'decision' },
        { id: 'a11', label: 'Block & alert team', shape: 'rect', role: 'step' },
        { id: 'a12', label: 'Push to registry', shape: 'rounded-rect', role: 'step' },
        { id: 'a13', label: 'Deploy to staging', shape: 'rounded-rect', role: 'step' },
        { id: 'a14', label: 'Smoke tests pass?', shape: 'diamond', role: 'decision' },
        { id: 'a15', label: 'Rollback staging', shape: 'rect', role: 'step' },
        { id: 'a16', label: 'Manual approval', shape: 'rounded-rect', role: 'step' },
        { id: 'a17', label: 'Approved?', shape: 'diamond', role: 'decision' },
        { id: 'a18', label: 'Deploy to production', shape: 'rounded-rect', role: 'step' },
        { id: 'a19', label: 'Production healthy?', shape: 'diamond', role: 'decision' },
        { id: 'a20', label: 'Rollback production', shape: 'rect', role: 'step' },
        { id: 'a21', label: 'Done', shape: 'circle', role: 'end' },
      ],
      edges: [
        { from: 'a1',  to: 'a2',  label: '' },
        { from: 'a2',  to: 'a3',  label: '' },
        { from: 'a3',  to: 'a4',  label: 'No' },
        { from: 'a4',  to: 'a2',  label: 'fix & retry' },
        { from: 'a3',  to: 'a5',  label: 'Yes' },
        { from: 'a5',  to: 'a6',  label: '' },
        { from: 'a6',  to: 'a7',  label: 'No' },
        { from: 'a7',  to: 'a5',  label: 'retry' },
        { from: 'a6',  to: 'a8',  label: 'Yes' },
        { from: 'a8',  to: 'a9',  label: '' },
        { from: 'a9',  to: 'a10', label: '' },
        { from: 'a10', to: 'a11', label: 'No' },
        { from: 'a10', to: 'a12', label: 'Yes' },
        { from: 'a11', to: 'a9',  label: 'rescan' },
        { from: 'a12', to: 'a13', label: '' },
        { from: 'a13', to: 'a14', label: '' },
        { from: 'a14', to: 'a15', label: 'No' },
        { from: 'a14', to: 'a16', label: 'Yes' },
        { from: 'a15', to: 'a13', label: 'retry' },
        { from: 'a16', to: 'a17', label: '' },
        { from: 'a17', to: 'a16', label: 'No' },
        { from: 'a17', to: 'a18', label: 'Yes' },
        { from: 'a18', to: 'a19', label: '' },
        { from: 'a19', to: 'a20', label: 'No' },
        { from: 'a19', to: 'a21', label: 'Yes' },
        { from: 'a20', to: 'a18', label: 'redeploy' },
      ],
    },
  },

  // ─── Timeline samples ───────────────────────────────────────────────────────
  {
    label: 'Timeline — Company Milestones',
    spec: {
      type: 'timeline',
      title: 'Company Milestones',
      events: [
        { id: 'e1', date: '2019', label: 'Company Founded', detail: 'Three founders, one rented desk.' },
        { id: 'e2', date: '2020 Q3', label: 'First Product', detail: 'MVP launched in beta.' },
        { id: 'e3', date: '2021 Q2', label: 'Series A', detail: '$4M raised.' },
        { id: 'e4', date: '2022', label: 'Team of 50', detail: 'Global remote team.' },
        { id: 'e5', date: '2023', label: '1 M Users', detail: 'Milestone reached.' },
        { id: 'e6', date: '2024 Q1', label: 'Series B', detail: '$20M raised.' },
      ],
    },
  },
  {
    label: 'Timeline — 12-event project (stress test)',
    spec: {
      type: 'timeline',
      title: 'Product Launch Timeline',
      events: [
        { id: 't1',  date: 'Week 1',  label: 'Kick-off meeting', detail: 'Align on scope and goals.' },
        { id: 't2',  date: 'Week 2',  label: 'Design sprint',    detail: 'Wireframes and prototypes.' },
        { id: 't3',  date: 'Week 3',  label: 'Design review',    detail: 'Stakeholder sign-off.' },
        { id: 't4',  date: 'Week 4',  label: 'Dev sprint 1',     detail: 'Core features.' },
        { id: 't5',  date: 'Week 5',  label: 'Dev sprint 2',     detail: 'Integrations.' },
        { id: 't6',  date: 'Week 6',  label: 'QA pass 1',        detail: 'Bug bash.' },
        { id: 't7',  date: 'Week 7',  label: 'Bug fixes',        detail: 'P0 and P1 bugs.' },
        { id: 't8',  date: 'Week 8',  label: 'Beta launch',      detail: '200 invited users.' },
        { id: 't9',  date: 'Week 9',  label: 'Beta feedback',    detail: 'Analyse responses.' },
        { id: 't10', date: 'Week 10', label: 'Final fixes',      detail: 'Polish and performance.' },
        { id: 't11', date: 'Week 11', label: 'Staging freeze',   detail: 'No new changes.' },
        { id: 't12', date: 'Week 12', label: 'Public launch',    detail: 'Press and marketing go live.' },
      ],
    },
  },

  // ─── Mind map samples ───────────────────────────────────────────────────────
  {
    label: 'Mind Map — Product Strategy',
    spec: {
      type: 'mindmap',
      title: 'Product Strategy',
      root: {
        id: 'r0',
        label: 'Product Strategy',
        children: [
          {
            id: 'r1', label: 'Growth',
            children: [
              { id: 'r1a', label: 'SEO', children: [] },
              { id: 'r1b', label: 'Referral programme', children: [] },
              { id: 'r1c', label: 'Paid Ads', children: [] },
            ],
          },
          {
            id: 'r2', label: 'Retention',
            children: [
              { id: 'r2a', label: 'Onboarding', children: [] },
              { id: 'r2b', label: 'Notifications', children: [] },
            ],
          },
          {
            id: 'r3', label: 'Monetisation',
            children: [
              { id: 'r3a', label: 'Pro Tier', children: [] },
              { id: 'r3b', label: 'Enterprise', children: [] },
            ],
          },
          {
            id: 'r4', label: 'Infrastructure',
            children: [
              { id: 'r4a', label: 'Reliability', children: [] },
              { id: 'r4b', label: 'Observability', children: [] },
            ],
          },
        ],
      },
    },
  },
  {
    label: 'Mind Map — Large (6 branches, depth 3)',
    spec: {
      type: 'mindmap',
      title: 'Engineering Org',
      root: {
        id: 'e0', label: 'Engineering Org',
        children: [
          { id: 'e1', label: 'Frontend', children: [
            { id: 'e1a', label: 'React', children: [
              { id: 'e1a1', label: 'Components', children: [] },
              { id: 'e1a2', label: 'State mgmt', children: [] },
            ]},
            { id: 'e1b', label: 'Accessibility', children: [] },
            { id: 'e1c', label: 'Performance', children: [] },
          ]},
          { id: 'e2', label: 'Backend', children: [
            { id: 'e2a', label: 'REST APIs', children: [] },
            { id: 'e2b', label: 'GraphQL', children: [] },
            { id: 'e2c', label: 'Auth service', children: [] },
          ]},
          { id: 'e3', label: 'Data', children: [
            { id: 'e3a', label: 'Postgres', children: [] },
            { id: 'e3b', label: 'Redis cache', children: [] },
            { id: 'e3c', label: 'Kafka streams', children: [] },
          ]},
          { id: 'e4', label: 'Platform', children: [
            { id: 'e4a', label: 'Kubernetes', children: [] },
            { id: 'e4b', label: 'CI/CD', children: [] },
          ]},
          { id: 'e5', label: 'Security', children: [
            { id: 'e5a', label: 'Pen testing', children: [] },
            { id: 'e5b', label: 'Compliance', children: [] },
          ]},
          { id: 'e6', label: 'Mobile', children: [
            { id: 'e6a', label: 'iOS (Swift)', children: [] },
            { id: 'e6b', label: 'Android (Kotlin)', children: [] },
          ]},
        ],
      },
    },
  },
];
