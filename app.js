const STORAGE_KEY = 'project-pulse-state-v1';
const SYNC_CONFIG_KEY = 'project-pulse-sync-v1';
const REMOTE_STATE_PATH = './data/projectpulse-state.json';
const statusOrder = ['Backlog', 'In Progress', 'Review', 'Done'];
const priorityOrder = ['Low', 'Medium', 'High'];

const projectsSeed = [
  { id: 'proj-launch', name: 'Website launch', color: '#8b5cf6', description: 'Landing page, QA, and go-live checklist.' },
  { id: 'proj-mobile', name: 'Mobile refresh', color: '#06b6d4', description: 'Navigation polish and performance fixes.' },
  { id: 'proj-ops', name: 'Team operations', color: '#f97316', description: 'Meetings, templates, and handoff process.' },
];

let dragSession = null;
let suppressTaskClick = null;

function defaultSyncConfig() {
  return {
    enabled: false,
    owner: '',
    repo: '',
    branch: 'main',
    path: 'data/projectpulse-state.json',
    token: '',
  };
}

function tomorrow(daysAhead) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

const tasksSeed = [
  {
    id: 'task-1',
    title: 'Finalize homepage hero copy',
    projectId: 'proj-launch',
    assignee: 'Mia',
    priority: 'High',
    status: 'In Progress',
    dueDate: tomorrow(1),
    notes: 'Make sure the value prop is aligned with the new product positioning.',
    createdAt: Date.now() - 86_400_000 * 3,
  },
  {
    id: 'task-2',
    title: 'Run mobile layout audit',
    projectId: 'proj-mobile',
    assignee: 'Avery',
    priority: 'Medium',
    status: 'Review',
    dueDate: tomorrow(3),
    notes: 'Check tablet breakpoints and validate sticky header behavior.',
    createdAt: Date.now() - 86_400_000 * 2,
  },
  {
    id: 'task-3',
    title: 'Document onboarding checklist',
    projectId: 'proj-ops',
    assignee: 'Noah',
    priority: 'Low',
    status: 'Backlog',
    dueDate: tomorrow(7),
    notes: 'Turn the current process into a concise step-by-step guide.',
    createdAt: Date.now() - 86_400_000,
  },
  {
    id: 'task-4',
    title: 'Approve release QA results',
    projectId: 'proj-launch',
    assignee: 'You',
    priority: 'High',
    status: 'Done',
    dueDate: tomorrow(-1),
    notes: 'All smoke tests passed. Share release notes with stakeholders.',
    createdAt: Date.now() - 86_400_000 * 5,
  },
];

const state = loadState();

function loadState() {
  const fallback = {
    projects: clone(projectsSeed),
    tasks: clone(tasksSeed),
  };

  const cached = loadCachedState();

  try {
    return {
      projects: Array.isArray(cached.projects) && cached.projects.length ? cached.projects : fallback.projects,
      tasks: Array.isArray(cached.tasks) ? cached.tasks : fallback.tasks,
      selectedProjectId: 'all',
      search: '',
      statusFilter: 'All',
      modal: null,
      error: '',
      syncConfig: loadSyncConfig(),
      syncStatus: 'idle',
      syncMessage: '',
      remoteLoaded: false,
      modalDraft: null,
    };
  } catch {
    return {
      ...fallback,
      selectedProjectId: 'all',
      search: '',
      statusFilter: 'All',
      modal: null,
      error: '',
      syncConfig: loadSyncConfig(),
      syncStatus: 'idle',
      syncMessage: '',
      remoteLoaded: false,
      modalDraft: null,
    };
  }
}

function loadCachedState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadSyncConfig() {
  try {
    const raw = window.localStorage.getItem(SYNC_CONFIG_KEY);
    if (!raw) return defaultSyncConfig();
    const parsed = JSON.parse(raw);
    return { ...defaultSyncConfig(), ...parsed };
  } catch {
    return defaultSyncConfig();
  }
}

function persistSyncConfig(config) {
  window.localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
}

function persistLocalState() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ projects: state.projects, tasks: state.tasks }),
  );
}

function serializeState() {
  return {
    projects: state.projects,
    tasks: state.tasks,
  };
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function encodeRepoPath(path) {
  return String(path)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function repoFileUrl(config) {
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodeRepoPath(config.path)}`;
}

async function loadRemoteState() {
  try {
    const response = await fetch(`${REMOTE_STATE_PATH}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const remote = await response.json();
    if (Array.isArray(remote.projects) && remote.projects.length) {
      state.projects = remote.projects;
    }
    if (Array.isArray(remote.tasks)) {
      state.tasks = remote.tasks;
    }
    state.remoteLoaded = true;
    persistLocalState();
    render();
  } catch {
    state.remoteLoaded = false;
  }
}

function currentModalDraft() {
  return state.modalDraft || {};
}

function setModalDraft(draft) {
  state.modalDraft = draft;
}

function clearModalDraft() {
  state.modalDraft = null;
}

function modalHealthLabel() {
  if (!state.syncConfig.enabled) return 'Local cache only';
  if (state.syncStatus === 'saving') return 'Saving to GitHub…';
  if (state.syncStatus === 'saved') return 'Repo synced';
  if (state.syncStatus === 'error') return 'Repo sync error';
  return state.remoteLoaded ? 'Connected to repo' : 'Waiting for repo';
}

function captureModalDraftFromDom() {
  if (!state.modal) return;

  const form = document.querySelector('.modal form[data-form]');
  if (!(form instanceof HTMLFormElement)) return;

  const nextDraft = { ...state.modalDraft };
  for (const element of form.elements) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) continue;
    if (!element.name) continue;
    nextDraft[element.name] = element.type === 'checkbox' ? element.checked : element.value;
  }

  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
    if (form.contains(active)) {
      state.modalDraftFocus = {
        form: form.dataset.form || '',
        name: active.name,
        start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
        end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
      };
    }
  }

  state.modalDraft = nextDraft;
}

function restoreModalFocus() {
  if (!state.modal || !state.modalDraftFocus) return;

  const { form: formName, name, start, end } = state.modalDraftFocus;
  const form = document.querySelector(`.modal form[data-form="${formName}"]`);
  if (!(form instanceof HTMLFormElement)) return;

  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLElement)) return;
  if (typeof field.focus === 'function') field.focus();
  if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && typeof start === 'number' && typeof end === 'number') {
    field.setSelectionRange(start, end);
  }
}

async function syncStateToRepo() {
  const config = state.syncConfig;
  if (!config.enabled) return;
  if (!config.owner || !config.repo || !config.token) {
    state.syncStatus = 'error';
    state.syncMessage = 'Configure repository owner, repo, and token first.';
    render();
    return;
  }

  state.syncStatus = 'saving';
  state.syncMessage = 'Saving to GitHub repository…';
  render();

  try {
    const url = repoFileUrl(config);
    const headers = {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github+json',
    };
    const getResponse = await fetch(`${url}?ref=${encodeURIComponent(config.branch)}`, { headers });
    let sha = null;
    if (getResponse.ok) {
      const existing = await getResponse.json();
      sha = existing.sha;
    } else if (getResponse.status !== 404) {
      throw new Error(`Unable to read repo file: ${getResponse.status}`);
    }

    const payload = {
      message: 'Update ProjectPulse data',
      content: encodeBase64(JSON.stringify(serializeState(), null, 2)),
      branch: config.branch,
      ...(sha ? { sha } : {}),
    };

    const putResponse = await fetch(url, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!putResponse.ok) {
      const body = await putResponse.text();
      throw new Error(body || `GitHub save failed: ${putResponse.status}`);
    }

    state.syncStatus = 'saved';
    state.syncMessage = 'Saved to GitHub repository.';
    persistLocalState();
    render();
  } catch (error) {
    state.syncStatus = 'error';
    state.syncMessage = `GitHub save failed, but local cache was updated. ${error instanceof Error ? error.message : ''}`.trim();
    persistLocalState();
    render();
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function dateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function shiftDateKey(value, days) {
  const date = new Date(`${dateKey(value)}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseDay(value) {
  return new Date(`${value}T12:00:00`).getTime();
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((parseDay(end) - parseDay(start)) / 86_400_000));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildTimeline(tasks) {
  if (!tasks.length) return null;

  const starts = tasks.map((task) => dateKey(task.createdAt));
  const ends = tasks.map((task) => task.dueDate);
  const minDate = starts.reduce((earliest, current) => (parseDay(current) < parseDay(earliest) ? current : earliest), starts[0]);
  const maxDate = ends.reduce((latest, current) => (parseDay(current) > parseDay(latest) ? current : latest), ends[0]);
  const totalDays = Math.max(7, daysBetween(minDate, maxDate) + 1);
  const days = Array.from({ length: totalDays }, (_, index) => {
    const day = new Date(`${minDate}T12:00:00`);
    day.setDate(day.getDate() + index);
    return dateKey(day.toISOString());
  });

  return { minDate, maxDate, totalDays, days };
}

function getTaskTimelineMetrics(task, timeline) {
  const startKey = dateKey(task.createdAt);
  const endKey = task.dueDate;
  const offsetDays = clamp(daysBetween(timeline.minDate, startKey), 0, timeline.totalDays - 1);
  const spanDays = clamp(daysBetween(startKey, endKey) + 1, 1, timeline.totalDays - offsetDays);
  const widthPercent = (spanDays / timeline.totalDays) * 100;
  const leftPercent = (offsetDays / timeline.totalDays) * 100;
  return { startKey, endKey, offsetDays, spanDays, widthPercent, leftPercent };
}

function getProject(projectId) {
  return state.projects.find((project) => project.id === projectId) || null;
}

function getSelectedProject() {
  return state.selectedProjectId === 'all' ? null : getProject(state.selectedProjectId);
}

function filteredTasks() {
  const query = state.search.trim().toLowerCase();
  return state.tasks.filter((task) => {
    const projectMatch = state.selectedProjectId === 'all' || task.projectId === state.selectedProjectId;
    const statusMatch = state.statusFilter === 'All' || task.status === state.statusFilter;
    const searchMatch =
      !query ||
      task.title.toLowerCase().includes(query) ||
      task.assignee.toLowerCase().includes(query) ||
      task.notes.toLowerCase().includes(query);
    return projectMatch && statusMatch && searchMatch;
  });
}

function completionRate() {
  const doneCount = state.tasks.filter((task) => task.status === 'Done').length;
  return state.tasks.length ? Math.round((doneCount / state.tasks.length) * 100) : 0;
}

function overdueCount() {
  const today = tomorrow(0);
  return state.tasks.filter((task) => task.status !== 'Done' && task.dueDate < today).length;
}

function visibleProjects() {
  return state.selectedProjectId === 'all'
    ? state.projects
    : state.projects.filter((project) => project.id === state.selectedProjectId);
}

function render() {
  captureModalDraftFromDom();
  const tasks = filteredTasks();
  const project = getSelectedProject();
  const timeline = buildTimeline(tasks);
  const grouped = statusOrder.map((status) => ({
    status,
    tasks: tasks.filter((task) => task.status === status).sort((left, right) => right.createdAt - left.createdAt),
  }));

  const app = document.getElementById('root');
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div>
          <div class="brand">ProjectPulse</div>
          <p class="sidebar-copy">Plan work, track delivery, and keep the team moving.</p>
        </div>

        <button class="primary-button" data-action="open-task">New task</button>
        <button class="ghost-button" data-action="open-project">New project</button>

        <div class="sidebar-panel">
          <div class="section-label">Projects</div>
          <button class="${state.selectedProjectId === 'all' ? 'project-pill active' : 'project-pill'}" data-action="select-project" data-project-id="all">
            All projects
          </button>
          ${state.projects
            .map(
              (item) => `
                <button class="${state.selectedProjectId === item.id ? 'project-pill active' : 'project-pill'}" data-action="select-project" data-project-id="${item.id}">
                  <span class="swatch" style="background:${item.color}"></span>
                  <span class="pill-copy">
                    <strong>${escapeHtml(item.name)}</strong>
                    <small>${escapeHtml(item.description)}</small>
                  </span>
                  <span class="pill-count">${state.tasks.filter((task) => task.projectId === item.id).length}</span>
                </button>
              `,
            )
            .join('')}
        </div>

        <div class="sidebar-panel stats-panel">
          <div class="stat-card"><strong>${completionRate()}%</strong><span>Completion</span></div>
          <div class="stat-card"><strong>${overdueCount()}</strong><span>Overdue</span></div>
          <div class="stat-card"><strong>${state.projects.length}</strong><span>Projects</span></div>
        </div>

        <div class="sidebar-panel sync-panel">
          <div>
            <div class="section-label">GitHub sync</div>
            <strong>${modalHealthLabel()}</strong>
            <p>${state.syncMessage || (state.remoteLoaded ? 'Loaded from repo data file.' : 'Edits stay in this browser until sync is enabled.')}</p>
          </div>
          <button class="ghost-button" data-action="open-sync">Sync settings</button>
        </div>
      </aside>

      <main class="main">
        <header class="hero">
          <div>
            <p class="eyebrow">Interactive workspace</p>
            <h1>Plan the week, move the board, ship faster.</h1>
            <p class="hero-copy">Use filters, status lanes, and quick actions to stay on top of every project.</p>
          </div>
          <div class="hero-summary">
            <div><span class="summary-label">Projects</span><strong>${state.projects.length}</strong></div>
            <div><span class="summary-label">Visible tasks</span><strong>${tasks.length}</strong></div>
            <div><span class="summary-label">Next due</span><strong>${tasks[0] ? formatDate(tasks[0].dueDate) : '—'}</strong></div>
          </div>
        </header>

        <section class="toolbar">
          <label class="search-box">
            <span>Search</span>
            <input value="${escapeHtml(state.search)}" placeholder="Task, person, note" data-field="search" />
          </label>

          <div class="filters">
            ${['All', ...statusOrder]
              .map(
                (status) => `
                  <button class="${state.statusFilter === status ? 'filter-chip active' : 'filter-chip'}" data-action="filter-status" data-status="${status}">${status}</button>
                `,
              )
              .join('')}
          </div>
        </section>

            <section class="gantt-panel">
              <div class="gantt-header">
                <div>
                  <span class="section-label">Gantt chart</span>
                  <h2>Delivery timeline</h2>
                  <p>Visualize how tasks stretch across the current schedule.</p>
                </div>
                <div class="gantt-legend">
                  <span><i class="legend-dot legend-start"></i>Start</span>
                  <span><i class="legend-dot legend-due"></i>Due</span>
                  <span><i class="legend-dot legend-done"></i>Done</span>
                </div>
              </div>

              ${timeline
                ? `
                  <div class="gantt-grid" style="--gantt-columns:${timeline.totalDays}">
                    <div class="gantt-axis gantt-axis-days">
                      ${timeline.days
                        .map((day) => `<span>${new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${day}T12:00:00`))}</span>`)
                        .join('')}
                    </div>
                    <div class="gantt-rows">
                      ${tasks
                        .map((task) => {
                          const taskProject = getProject(task.projectId);
                          const metrics = getTaskTimelineMetrics(task, timeline);
                          return `
                            <div class="gantt-row">
                              <div class="gantt-label">
                                <strong>${escapeHtml(task.title)}</strong>
                                <span>${escapeHtml(taskProject?.name || 'Unassigned')} · ${escapeHtml(task.assignee)} · ${task.priority}</span>
                              </div>
                              <div class="gantt-track" aria-label="${escapeHtml(task.title)} timeline">
                                <div class="gantt-track-base"></div>
                                <button class="gantt-bar" style="left:${metrics.leftPercent}%; width:${metrics.widthPercent}%; border-color:${taskProject?.color || '#64748b'}; background:${taskProject?.color || '#64748b'}33" data-action="edit-task" data-task-id="${task.id}" data-gantt-bar="true" title="Drag or edit ${escapeHtml(task.title)}">
                                  <span>${escapeHtml(task.status)}</span>
                                  <small>${formatDate(task.dueDate)}</small>
                                </button>
                              </div>
                            </div>
                          `;
                        })
                        .join('')}
                    </div>
                  </div>
                `
                : '<div class="gantt-empty">Add a task to see the timeline.</div>'}
            </section>

        ${project ? `
          <section class="project-banner" style="border-color:${project.color}">
            <div>
              <span class="section-label">Selected project</span>
              <h2>${escapeHtml(project.name)}</h2>
              <p>${escapeHtml(project.description)}</p>
            </div>
            <button class="danger-button" data-action="delete-project" data-project-id="${project.id}">Delete project</button>
          </section>
        ` : ''}

        <section class="board">
          ${grouped
            .map(
              (group) => `
                <article class="lane">
                  <div class="lane-header">
                    <div>
                      <h3>${group.status}</h3>
                      <span>${group.tasks.length} tasks</span>
                    </div>
                    <span class="lane-dot" style="background:${laneColor(group.status)}"></span>
                  </div>
                  <div class="lane-body">
                    ${group.tasks.length === 0
                      ? '<div class="empty-state">No tasks in this lane.</div>'
                      : group.tasks
                          .map((task) => {
                            const taskProject = getProject(task.projectId);
                            const taskStatusIndex = statusOrder.indexOf(task.status);
                            const prevStatus = statusOrder[Math.max(0, taskStatusIndex - 1)];
                            const nextStatus = statusOrder[Math.min(statusOrder.length - 1, taskStatusIndex + 1)];
                            return `
                              <div class="task-card">
                                <div class="task-topline">
                                  <span class="priority-badge" data-priority="${task.priority}">${task.priority}</span>
                                  <span class="task-date">Due ${formatDate(task.dueDate)}</span>
                                </div>
                                <h4>${escapeHtml(task.title)}</h4>
                                <p>${escapeHtml(task.notes)}</p>
                                <div class="task-meta">
                                  <span>${escapeHtml(task.assignee)}</span>
                                  <span class="project-tag" style="border-color:${taskProject?.color || '#334155'}">${escapeHtml(taskProject?.name || 'Unassigned')}</span>
                                </div>
                                <div class="task-actions">
                                  <button data-action="edit-task" data-task-id="${task.id}">Edit</button>
                                  <button data-action="move-task" data-task-id="${task.id}" data-status="${prevStatus}" ${task.status === 'Backlog' ? 'disabled' : ''}>←</button>
                                  <button data-action="move-task" data-task-id="${task.id}" data-status="${nextStatus}" ${task.status === 'Done' ? 'disabled' : ''}>→</button>
                                  <button data-action="delete-task" data-task-id="${task.id}">Delete</button>
                                </div>
                              </div>
                            `;
                          })
                          .join('')}
                  </div>
                </article>
              `,
            )
            .join('')}
        </section>

        <section class="footer-summary">
          <div><span class="section-label">Active project scope</span><strong>${visibleProjects().length} project(s)</strong></div>
          <div><span class="section-label">Ready for review</span><strong>${state.tasks.filter((task) => task.status === 'Review').length} tasks</strong></div>
          <div><span class="section-label">Board health</span><strong>${overdueCount() === 0 ? 'On track' : `${overdueCount()} items need attention`}</strong></div>
        </section>
      </main>

      ${renderModal()}
    </div>
  `;

  restoreModalFocus();
}

function laneColor(status) {
  return {
    Backlog: 'var(--tone-slate)',
    'In Progress': 'var(--tone-blue)',
    Review: 'var(--tone-amber)',
    Done: 'var(--tone-green)',
  }[status];
}

function renderModal() {
  if (!state.modal) return '';
  if (state.modal.type === 'sync') {
    const draft = { ...state.syncConfig, ...currentModalDraft() };
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal" data-stop="true">
          <div class="modal-header">
            <div>
              <span class="section-label">GitHub sync</span>
              <h2>Repository persistence</h2>
            </div>
            <button class="icon-button" data-action="close-modal">×</button>
          </div>
          <p class="sync-help">Use a fine-grained GitHub token that can write to this repository. The app stores the token in your browser so it can update <strong>data/projectpulse-state.json</strong>.</p>
          <form class="composer-form" data-form="sync">
            <label><span>Enable repo sync</span><input type="checkbox" name="enabled" ${draft.enabled ? 'checked' : ''} /></label>
            <div class="form-grid">
              <label><span>Owner</span><input name="owner" value="${escapeHtml(draft.owner)}" placeholder="your-github-user" /></label>
              <label><span>Repository</span><input name="repo" value="${escapeHtml(draft.repo)}" placeholder="projectManager" /></label>
            </div>
            <div class="form-grid">
              <label><span>Branch</span><input name="branch" value="${escapeHtml(draft.branch)}" /></label>
              <label><span>Path</span><input name="path" value="${escapeHtml(draft.path)}" /></label>
            </div>
            <label><span>GitHub token</span><input name="token" type="password" value="${escapeHtml(draft.token)}" placeholder="ghp_..." /></label>
            <div class="modal-actions">
              <button type="button" class="ghost-button" data-action="close-modal">Cancel</button>
              <button type="submit" class="primary-button">Save sync settings</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
  if (state.modal.type === 'project') {
    const draft = { name: '', color: '#8b5cf6', description: '', ...currentModalDraft() };
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <div class="modal" data-stop="true">
          <div class="modal-header">
            <div>
              <span class="section-label">Project composer</span>
              <h2>Create project</h2>
            </div>
            <button class="icon-button" data-action="close-modal">×</button>
          </div>
          ${state.error ? `<div class="form-error">${escapeHtml(state.error)}</div>` : ''}
          <form class="composer-form" data-form="project">
            <label><span>Name</span><input name="name" value="${escapeHtml(draft.name)}" /></label>
            <label><span>Color</span><input type="color" name="color" value="${escapeHtml(draft.color)}" /></label>
            <label><span>Description</span><textarea name="description" rows="4">${escapeHtml(draft.description)}</textarea></label>
            <div class="modal-actions">
              <button type="button" class="ghost-button" data-action="close-modal">Cancel</button>
              <button type="submit" class="primary-button">Create project</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  const task = state.modal.taskId ? state.tasks.find((item) => item.id === state.modal.taskId) : null;
  const draft = {
    ...(task || {
    title: '',
    projectId: state.selectedProjectId === 'all' ? state.projects[0]?.id || '' : state.selectedProjectId,
    assignee: '',
    priority: 'Medium',
    status: 'Backlog',
    dueDate: tomorrow(2),
    notes: '',
    }),
    ...currentModalDraft(),
  };

  return `
    <div class="modal-backdrop" data-action="close-modal">
      <div class="modal" data-stop="true">
        <div class="modal-header">
          <div>
            <span class="section-label">Task composer</span>
            <h2>${task ? 'Edit task' : 'Create task'}</h2>
          </div>
          <button class="icon-button" data-action="close-modal">×</button>
        </div>
        ${state.error ? `<div class="form-error">${escapeHtml(state.error)}</div>` : ''}
        <form class="composer-form" data-form="task">
          <label><span>Title</span><input name="title" value="${escapeHtml(draft.title)}" /></label>
          <label>
            <span>Project</span>
            <select name="projectId">
              ${state.projects.map((item) => `<option value="${item.id}" ${item.id === draft.projectId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
            </select>
          </label>
          <div class="form-grid">
            <label><span>Assignee</span><input name="assignee" value="${escapeHtml(draft.assignee)}" /></label>
            <label>
              <span>Priority</span>
              <select name="priority">${priorityOrder.map((item) => `<option value="${item}" ${item === draft.priority ? 'selected' : ''}>${item}</option>`).join('')}</select>
            </label>
          </div>
          <div class="form-grid">
            <label>
              <span>Status</span>
              <select name="status">${statusOrder.map((item) => `<option value="${item}" ${item === draft.status ? 'selected' : ''}>${item}</option>`).join('')}</select>
            </label>
            <label><span>Due date</span><input type="date" name="dueDate" value="${escapeHtml(draft.dueDate)}" /></label>
          </div>
          <label><span>Notes</span><textarea name="notes" rows="4">${escapeHtml(draft.notes)}</textarea></label>
          <div class="modal-actions">
            <button type="button" class="ghost-button" data-action="close-modal">Cancel</button>
            <button type="submit" class="primary-button">${task ? 'Save changes' : 'Create task'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function saveState() {
  persistLocalState();
  void syncStateToRepo();
}

function openTask(taskId = null) {
  state.modal = { type: 'task', taskId };
  state.modalDraft = taskId ? clone(state.tasks.find((item) => item.id === taskId) || {}) : {
    title: '',
    projectId: state.selectedProjectId === 'all' ? state.projects[0]?.id || '' : state.selectedProjectId,
    assignee: '',
    priority: 'Medium',
    status: 'Backlog',
    dueDate: tomorrow(2),
    notes: '',
  };
  state.error = '';
  render();
}

function openProject() {
  state.modal = { type: 'project' };
  state.modalDraft = { name: '', color: '#8b5cf6', description: '' };
  state.error = '';
  render();
}

function openSyncSettings() {
  state.modal = { type: 'sync' };
  state.modalDraft = { ...state.syncConfig };
  state.error = '';
  render();
}

function closeModal() {
  state.modal = null;
  clearModalDraft();
  state.modalDraftFocus = null;
  state.error = '';
  render();
}

function setSearch(value) {
  state.search = value;
  render();
}

function setStatusFilter(status) {
  state.statusFilter = status;
  render();
}

function selectProject(projectId) {
  state.selectedProjectId = projectId;
  render();
}

function moveTask(taskId, status) {
  state.tasks = state.tasks.map((task) => (task.id === taskId ? { ...task, status } : task));
  saveState();
  render();
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  saveState();
  render();
}

function deleteProject(projectId) {
  state.projects = state.projects.filter((project) => project.id !== projectId);
  state.tasks = state.tasks.filter((task) => task.projectId !== projectId);
  state.selectedProjectId = 'all';
  saveState();
  render();
}

function submitTask(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if (!String(data.title || '').trim()) {
    state.error = 'Task title is required.';
    render();
    return;
  }
  if (!data.projectId) {
    state.error = 'Pick a project for this task.';
    render();
    return;
  }

  const payload = {
    title: String(data.title).trim(),
    projectId: String(data.projectId),
    assignee: String(data.assignee || '').trim(),
    priority: String(data.priority),
    status: String(data.status),
    dueDate: String(data.dueDate),
    notes: String(data.notes || '').trim(),
  };

  if (state.modal?.taskId) {
    state.tasks = state.tasks.map((task) => (task.id === state.modal.taskId ? { ...task, ...payload } : task));
  } else {
    state.tasks = [
      { id: uid('task'), createdAt: Date.now(), ...payload },
      ...state.tasks,
    ];
  }

  state.modal = null;
  clearModalDraft();
  state.modalDraftFocus = null;
  state.error = '';
  saveState();
  render();
}

function submitProject(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if (!String(data.name || '').trim()) {
    state.error = 'Project name is required.';
    render();
    return;
  }

  const project = {
    id: uid('proj'),
    name: String(data.name).trim(),
    color: String(data.color || '#8b5cf6'),
    description: String(data.description || '').trim(),
  };

  state.projects = [project, ...state.projects];
  state.selectedProjectId = project.id;
  state.modal = null;
  clearModalDraft();
  state.modalDraftFocus = null;
  state.error = '';
  saveState();
  render();
}

function submitSyncSettings(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const nextConfig = {
    enabled: form.elements.enabled.checked,
    owner: String(data.owner || '').trim(),
    repo: String(data.repo || '').trim(),
    branch: String(data.branch || 'main').trim() || 'main',
    path: String(data.path || 'data/projectpulse-state.json').trim() || 'data/projectpulse-state.json',
    token: String(data.token || '').trim(),
  };

  state.syncConfig = nextConfig;
  persistSyncConfig(nextConfig);
  state.modal = null;
  clearModalDraft();
  state.modalDraftFocus = null;
  state.syncStatus = 'idle';
  state.syncMessage = nextConfig.enabled ? 'Repo sync enabled.' : 'Repo sync disabled.';
  persistLocalState();
  render();
  if (nextConfig.enabled) {
    void syncStateToRepo();
  }
}

function applyTaskTimelineShift(taskId, deltaDays) {
  if (!deltaDays) return;

  state.tasks = state.tasks.map((task) => {
    if (task.id !== taskId) return task;
    return {
      ...task,
      createdAt: new Date(`${shiftDateKey(task.createdAt, deltaDays)}T12:00:00`).getTime(),
      dueDate: shiftDateKey(task.dueDate, deltaDays),
    };
  });

  saveState();
}

function startGanttDrag(barElement, event) {
  if (!(barElement instanceof HTMLButtonElement)) return;

  const taskId = barElement.dataset.taskId;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  const trackElement = barElement.closest('.gantt-track');
  const timeline = buildTimeline(filteredTasks());
  if (!trackElement || !timeline) return;

  const trackRect = trackElement.getBoundingClientRect();
  const barRect = barElement.getBoundingClientRect();
  const startKey = dateKey(task.createdAt);
  const endKey = task.dueDate;
  const offsetDays = clamp(daysBetween(timeline.minDate, startKey), 0, timeline.totalDays - 1);
  const spanDays = clamp(daysBetween(startKey, endKey) + 1, 1, timeline.totalDays - offsetDays);

  dragSession = {
    taskId,
    barElement,
    trackElement,
    pointerId: event.pointerId,
    startX: event.clientX,
    pointerOffset: event.clientX - barRect.left,
    originalLeftPx: barRect.left - trackRect.left,
    originalOffsetDays: offsetDays,
    originalSpanDays: spanDays,
    dayWidth: trackRect.width / timeline.totalDays,
    maxOffsetDays: Math.max(0, timeline.totalDays - spanDays),
    moved: false,
  };

  barElement.classList.add('is-dragging');
  barElement.setPointerCapture?.(event.pointerId);
}

function updateGanttDrag(event) {
  if (!dragSession || event.pointerId !== dragSession.pointerId) return;

  const deltaX = event.clientX - dragSession.startX;
  if (Math.abs(deltaX) > 3) dragSession.moved = true;

  const trackRect = dragSession.trackElement.getBoundingClientRect();
  const rawLeft = event.clientX - trackRect.left - dragSession.pointerOffset;
  const maxLeft = trackRect.width - dragSession.barElement.getBoundingClientRect().width;
  const nextLeft = clamp(rawLeft, 0, maxLeft);
  dragSession.barElement.style.transform = `translateX(${nextLeft - dragSession.originalLeftPx}px)`;
}

function finishGanttDrag(event) {
  if (!dragSession || event.pointerId !== dragSession.pointerId) return;

  const session = dragSession;
  dragSession = null;
  session.barElement.classList.remove('is-dragging');
  session.barElement.style.transform = '';

  const trackRect = session.trackElement.getBoundingClientRect();
  const rawLeft = event.clientX - trackRect.left - session.pointerOffset;
  const nextOffsetDays = clamp(Math.round(rawLeft / session.dayWidth), 0, session.maxOffsetDays);
  const deltaDays = nextOffsetDays - session.originalOffsetDays;

  if (session.moved && deltaDays !== 0) {
    applyTaskTimelineShift(session.taskId, deltaDays);
    suppressTaskClick = { taskId: session.taskId, until: Date.now() + 350 };
    render();
    return;
  }

  if (session.moved) {
    suppressTaskClick = { taskId: session.taskId, until: Date.now() + 350 };
  }
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;

  const actionElement = event.target.closest('[data-action]');
  const backdrop = event.target.closest('.modal-backdrop');
  const modalContent = event.target.closest('[data-stop="true"]');

  if (backdrop && !modalContent) {
    closeModal();
    return;
  }

  if (!actionElement) return;

  const action = actionElement.dataset.action;
  if (action === 'open-task') openTask();
  if (action === 'open-project') openProject();
  if (action === 'open-sync') openSyncSettings();
  if (action === 'close-modal') closeModal();
  if (action === 'select-project') selectProject(actionElement.dataset.projectId || 'all');
  if (action === 'filter-status') setStatusFilter(actionElement.dataset.status || 'All');
  if (action === 'edit-task') {
    const taskId = actionElement.dataset.taskId || null;
    if (suppressTaskClick && suppressTaskClick.taskId === taskId && suppressTaskClick.until > Date.now()) return;
    openTask(taskId);
  }
  if (action === 'move-task') moveTask(actionElement.dataset.taskId || '', actionElement.dataset.status || 'Backlog');
  if (action === 'delete-task') deleteTask(actionElement.dataset.taskId || '');
  if (action === 'delete-project') deleteProject(actionElement.dataset.projectId || '');
});

document.addEventListener('pointerdown', (event) => {
  if (!(event.target instanceof Element)) return;
  const barElement = event.target.closest('[data-gantt-bar="true"]');
  if (!barElement) return;
  startGanttDrag(barElement, event);
});

document.addEventListener('pointermove', (event) => {
  updateGanttDrag(event);
});

document.addEventListener('pointerup', (event) => {
  finishGanttDrag(event);
});

document.addEventListener('pointercancel', (event) => {
  if (!dragSession || event.pointerId !== dragSession.pointerId) return;
  dragSession.barElement.classList.remove('is-dragging');
  dragSession.barElement.style.transform = '';
  dragSession = null;
});

document.addEventListener('input', (event) => {
  const target = event.target;
  const form = target instanceof Element ? target.closest('form[data-form]') : null;
  if (form instanceof HTMLFormElement && state.modal) {
    const currentDraft = { ...(state.modalDraft || {}) };
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      currentDraft[target.name] = target.type === 'checkbox' ? target.checked : target.value;
      setModalDraft(currentDraft);
      return;
    }
  }
  if (target instanceof HTMLInputElement && target.dataset.field === 'search') {
    setSearch(target.value);
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.dataset.form === 'task') submitTask(form);
  if (form.dataset.form === 'project') submitProject(form);
  if (form.dataset.form === 'sync') submitSyncSettings(form);
});

render();
void loadRemoteState();