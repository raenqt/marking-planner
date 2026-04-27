/**
 * Marking Planner - Frontend JavaScript
 */

// State
let taskTypes = [];
let batches = [];
let weeklyTemplate = {};
let lastSchedule = null;

// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupTabs();
    loadWeeklyTemplate();
    await loadTaskTypes();
    await loadBatches();
    loadToday();
    loadSavedSchedule();
});

async function loadSavedSchedule() {
    try {
        const saved = await api('/schedule');
        if (!saved) return;
        lastSchedule = saved;
        renderSchedule(saved);
        showExportBtn(saved.generatedAt);
        renderStaleBanner(saved.stale);
    } catch (err) {
        console.error('Could not load saved schedule:', err);
    }
}

function renderStaleBanner(stale) {
    const existing = document.getElementById('schedule-stale-banner');
    if (existing) existing.remove();
    if (!stale) return;
    const banner = document.createElement('div');
    banner.id = 'schedule-stale-banner';
    banner.className = 'stale-banner';
    banner.innerHTML = `⚠️ Batches have changed since this schedule was generated. Regenerate to get an accurate plan.`;
    document.getElementById('warnings-container').prepend(banner);
}

// Tab Switching
function setupTabs() {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            if (tabId === 'today') loadToday();
        });
    });
}

// API Helper
async function api(endpoint, options = {}) {
    const response = await fetch(`/api${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
    }
    return response.json();
}

// ============== Weekly Template ==============

async function loadWeeklyTemplate() {
    try {
        weeklyTemplate = await api('/weekly-template');
        renderWeeklyTemplate();
    } catch (err) {
        console.error('Failed to load weekly template:', err);
    }
}

function timePickerHTML(prefix, defaultHour, defaultMinute, defaultAmPm) {
    const hourOptions = [1,2,3,4,5,6,7,8,9,10,11,12].map(h =>
        `<option value="${h}" ${h === defaultHour ? 'selected' : ''}>${h}</option>`
    ).join('');
    const minuteOptions = ['00','15','30','45'].map(m =>
        `<option value="${m}" ${m === defaultMinute ? 'selected' : ''}>${m}</option>`
    ).join('');
    const ampmOptions = ['AM','PM'].map(a =>
        `<option value="${a}" ${a === defaultAmPm ? 'selected' : ''}>${a}</option>`
    ).join('');
    return `
        <select class="${prefix}-hour">${hourOptions}</select>
        <span class="time-sep">:</span>
        <select class="${prefix}-minute">${minuteOptions}</select>
        <select class="${prefix}-ampm">${ampmOptions}</select>
    `;
}

function renderWeeklyTemplate() {
    const container = document.getElementById('days-container');
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    container.innerHTML = days.map(day => `
        <div class="day-card" data-day="${day}">
            <div class="day-header">
                <h3>${day}</h3>
            </div>
            <div class="add-slot-form">
                <label>From</label>
                <div class="time-picker-container">
                    ${timePickerHTML('slot-start', 4, '00', 'PM')}
                </div>
                <label>To</label>
                <div class="time-picker-container">
                    ${timePickerHTML('slot-end', 5, '00', 'PM')}
                </div>
                <input type="text" class="slot-label" placeholder="Label (optional)">
                <button onclick="addSlot('${day}')">Add Slot</button>
            </div>
            <div class="slots-list">
                ${(weeklyTemplate[day] || []).map(slot => `
                    <div class="slot-item">
                        <div>
                            <span class="slot-time">${formatTime(slot.start)} - ${formatTime(slot.end)}</span>
                            ${slot.label ? `<span class="slot-label-display">(${escapeHtml(slot.label)})</span>` : ''}
                        </div>
                        <div class="slot-actions">
                            <button class="delete-btn" onclick="deleteSlot('${day}', '${slot.id}')">Delete</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

async function addSlot(day) {
    const card = document.querySelector(`.day-card[data-day="${day}"]`);

    const startHour = card.querySelector('.slot-start-hour').value;
    const startMinute = card.querySelector('.slot-start-minute').value;
    const startAmPm = card.querySelector('.slot-start-ampm').value;
    const start = formatTo24Hour(startHour, startMinute, startAmPm);

    const endHour = card.querySelector('.slot-end-hour').value;
    const endMinute = card.querySelector('.slot-end-minute').value;
    const endAmPm = card.querySelector('.slot-end-ampm').value;
    const end = formatTo24Hour(endHour, endMinute, endAmPm);

    const label = card.querySelector('.slot-label').value;

    if (!start || !end) {
        alert('Please select start and end times');
        return;
    }

    try {
        weeklyTemplate = await api('/weekly-template', {
            method: 'POST',
            body: JSON.stringify({ day, start, end, label })
        });
        renderWeeklyTemplate();
    } catch (err) {
        alert('Failed to add slot: ' + err.message);
    }
}

async function deleteSlot(day, slotId) {
    try {
        weeklyTemplate = await api(`/weekly-template/${day}/${slotId}`, {
            method: 'DELETE'
        });
        renderWeeklyTemplate();
    } catch (err) {
        alert('Failed to delete slot: ' + err.message);
    }
}

// ============== Task Types ==============

async function loadTaskTypes() {
    try {
        taskTypes = await api('/task-types');
        renderTaskTypes();
        updateTaskTypeDropdown();
    } catch (err) {
        console.error('Failed to load task types:', err);
    }
}

function renderTaskTypes() {
    const container = document.getElementById('task-types-list');

    if (taskTypes.length === 0) {
        container.innerHTML = '<p class="text-muted">🦦 No task types yet — add one above to get started!</p>';
        return;
    }

    container.innerHTML = taskTypes.map(type => `
        <div class="task-type-item">
            <div class="task-type-info">
                <div class="task-type-colour" style="background: ${escapeHtml(type.colour)}"></div>
                <span class="task-type-name">${escapeHtml(type.name)}</span>
                <span class="task-type-time">${type.timePerScript} min/script</span>
            </div>
            <div class="task-type-actions">
                <button class="edit-btn" onclick="openEditTaskTypeModal('${type.id}')">Edit</button>
                <button class="delete-btn" onclick="deleteTaskType('${type.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function updateTaskTypeDropdown() {
    const select = document.getElementById('batch-task-type');
    select.innerHTML = '<option value="">Select task type...</option>' +
        taskTypes.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${t.timePerScript} min)</option>`).join('');
}

// Add Task Type Form
document.getElementById('task-type-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('task-name').value;
    const time = document.getElementById('task-time').value;
    const colour = document.getElementById('task-colour').value;

    try {
        await api('/task-types', {
            method: 'POST',
            body: JSON.stringify({ name, timePerScript: parseInt(time), colour })
        });
        document.getElementById('task-type-form').reset();
        loadTaskTypes();
    } catch (err) {
        alert('Failed to add task type: ' + err.message);
    }
});

async function deleteTaskType(id) {
    if (!confirm('Delete this task type?')) return;

    try {
        await api(`/task-types/${id}`, { method: 'DELETE' });
        loadTaskTypes();
    } catch (err) {
        alert('Failed to delete: ' + err.message);
    }
}

// Edit Task Type Modal
function openEditTaskTypeModal(id) {
    const type = taskTypes.find(t => t.id === id);
    if (!type) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal">
            <h3>Edit Task Type</h3>
            <form class="modal-form">
                <input type="text" class="edit-name" value="${escapeHtml(type.name)}" required>
                <input type="number" class="edit-time" value="${type.timePerScript}" min="1" required>
                <input type="color" class="edit-colour" value="${type.colour}">
            </form>
            <div class="modal-actions">
                <button class="modal-cancel" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="modal-save" onclick="saveTaskTypeEdit('${id}')">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveTaskTypeEdit(id) {
    const modal = document.querySelector('.modal-overlay.active');
    const name = modal.querySelector('.edit-name').value;
    const time = modal.querySelector('.edit-time').value;
    const colour = modal.querySelector('.edit-colour').value;

    try {
        await api(`/task-types/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name, timePerScript: parseInt(time), colour })
        });
        modal.remove();
        loadTaskTypes();
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
}

// ============== Batches ==============

async function loadBatches() {
    try {
        batches = await api('/batches');
        renderBatches();
    } catch (err) {
        console.error('Failed to load batches:', err);
    }
}

function renderBatches() {
    const container = document.getElementById('batches-list');

    if (batches.length === 0) {
        container.innerHTML = '<p class="text-muted">🦦 No batches yet — add one above to get swimming!</p>';
        return;
    }

    container.innerHTML = batches.map(batch => {
        const type = taskTypes.find(t => t.id === batch.taskTypeId);
        const remaining = batch.numScripts - batch.completedScripts;
        const progress = Math.round((batch.completedScripts / batch.numScripts) * 100);
        const isComplete = remaining <= 0;
        const colour = type?.colour || '#ccc';

        return `
            <div class="batch-item ${isComplete ? 'batch-complete' : ''}">
                <div class="batch-info">
                    <div class="batch-colour" style="background: ${colour}"></div>
                    <div class="batch-details">
                        <span class="batch-name">${escapeHtml(type?.name || 'Unknown')} — ${batch.numScripts} scripts</span>
                        <span class="batch-meta">Deadline: ${formatDate(batch.deadline)} · ${batch.maxPerSitting} per sitting</span>
                        <div class="batch-progress-bar">
                            <div class="batch-progress-fill" style="width: ${progress}%; background: ${colour}"></div>
                        </div>
                        <span class="batch-progress-label">${batch.completedScripts} / ${batch.numScripts} done</span>
                    </div>
                </div>
                <div class="batch-actions">
                    ${isComplete
                        ? '<span class="complete-badge">Complete</span>'
                        : `<button class="done-btn" onclick="markScriptDone('${batch.id}')">+1 Done</button>`
                    }
                    <button class="edit-btn" onclick="openEditBatchModal('${batch.id}')">Edit</button>
                    <button class="delete-btn" onclick="deleteBatch('${batch.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function markScriptDoneFromToday(id) {
    const batch = batches.find(b => b.id === id);
    if (!batch) return;
    try {
        const updated = await api(`/batches/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ ...batch, completedScripts: batch.completedScripts + 1 })
        });
        batches[batches.findIndex(b => b.id === id)] = updated;
        renderBatches();
        // Re-render today in place using the saved schedule (no refetch needed)
        if (lastSchedule) renderToday(lastSchedule);
    } catch (err) {
        alert('Failed to update: ' + err.message);
    }
}

async function markScriptDone(id) {
    const batch = batches.find(b => b.id === id);
    if (!batch) return;
    try {
        const updated = await api(`/batches/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ ...batch, completedScripts: batch.completedScripts + 1 })
        });
        batches[batches.findIndex(b => b.id === id)] = updated;
        renderBatches();
    } catch (err) {
        alert('Failed to update: ' + err.message);
    }
}

function openEditBatchModal(id) {
    const batch = batches.find(b => b.id === id);
    if (!batch) return;
    const type = taskTypes.find(t => t.id === batch.taskTypeId);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
        <div class="modal">
            <h3>Edit Batch — ${escapeHtml(type?.name || 'Unknown')}</h3>
            <form class="modal-form">
                <label class="modal-label">Total scripts</label>
                <input type="number" class="edit-num" value="${batch.numScripts}" min="1" required>
                <label class="modal-label">Completed scripts</label>
                <input type="number" class="edit-completed" value="${batch.completedScripts}" min="0">
                <label class="modal-label">Deadline</label>
                <input type="date" class="edit-deadline" value="${batch.deadline}" required>
                <label class="modal-label">Max per sitting</label>
                <input type="number" class="edit-max" value="${batch.maxPerSitting}" min="1">
                <label class="modal-label">Override time per script (min)</label>
                <input type="number" class="edit-override" value="${batch.overrideTime || ''}" min="1" placeholder="Use task type default">
            </form>
            <div class="modal-actions">
                <button class="modal-cancel" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                <button class="modal-save" onclick="saveEditBatch('${id}')">Save</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

async function saveEditBatch(id) {
    const batch = batches.find(b => b.id === id);
    if (!batch) return;
    const modal = document.querySelector('.modal-overlay.active');
    const numScripts = parseInt(modal.querySelector('.edit-num').value);
    const completedScripts = Math.min(parseInt(modal.querySelector('.edit-completed').value) || 0, numScripts);
    const deadline = modal.querySelector('.edit-deadline').value;
    const maxPerSitting = parseInt(modal.querySelector('.edit-max').value) || 5;
    const overrideRaw = modal.querySelector('.edit-override').value;

    try {
        const updated = await api(`/batches/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
                taskTypeId: batch.taskTypeId,
                numScripts,
                completedScripts,
                deadline,
                maxPerSitting,
                overrideTime: overrideRaw ? parseInt(overrideRaw) : null
            })
        });
        batches[batches.findIndex(b => b.id === id)] = updated;
        modal.remove();
        renderBatches();
    } catch (err) {
        alert('Failed to save: ' + err.message);
    }
}

// Add Batch Form
document.getElementById('batch-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const taskTypeId = document.getElementById('batch-task-type').value;
    const numScripts = document.getElementById('batch-num').value;
    const deadline = document.getElementById('batch-deadline').value;
    const overrideTime = document.getElementById('batch-override-time').value;
    const maxPerSitting = document.getElementById('batch-max').value;

    if (!taskTypeId || !numScripts || !deadline) {
        alert('Please fill in required fields');
        return;
    }

    try {
        await api('/batches', {
            method: 'POST',
            body: JSON.stringify({
                taskTypeId,
                numScripts: parseInt(numScripts),
                deadline,
                overrideTime: overrideTime ? parseInt(overrideTime) : null,
                maxPerSitting: parseInt(maxPerSitting) || 5
            })
        });
        document.getElementById('batch-form').reset();
        loadBatches();
    } catch (err) {
        alert('Failed to add batch: ' + err.message);
    }
});

async function deleteBatch(id) {
    if (!confirm('Delete this batch?')) return;

    try {
        await api(`/batches/${id}`, { method: 'DELETE' });
        loadBatches();
    } catch (err) {
        alert('Failed to delete: ' + err.message);
    }
}

// ============== Schedule Generation ==============

document.getElementById('generate-btn').addEventListener('click', async () => {
    try {
        const result = await api('/generate-schedule', { method: 'POST' });
        lastSchedule = result;
        renderSchedule(result);
        showExportBtn(result.generatedAt);
        renderStaleBanner(false);
    } catch (err) {
        alert('Failed to generate schedule: ' + err.message);
    }
});

function showExportBtn(generatedAt) {
    document.getElementById('export-btn').style.display = 'inline-block';
    const ts = document.getElementById('schedule-generated-at');
    if (generatedAt) {
        const d = new Date(generatedAt);
        ts.textContent = `Last generated: ${d.toLocaleDateString('en-AU', {day:'numeric',month:'short'})} at ${d.toLocaleTimeString('en-AU', {hour:'2-digit',minute:'2-digit'})}`;
        ts.style.display = 'inline';
    }
}

document.getElementById('export-btn').addEventListener('click', exportToICal);

// ============== Today View ==============

async function loadToday() {
    const container = document.getElementById('today-container');
    try {
        const schedule = await api('/schedule');
        if (!schedule) {
            container.innerHTML = `
                <div class="today-empty">
                    <div style="font-size:3rem;margin-bottom:1rem">🦦</div>
                    <p>No schedule yet! Set up your weekly slots, add marking batches,<br>
                    then hit <strong>Generate Schedule</strong> in the Batches &amp; Schedule tab.</p>
                </div>`;
            return;
        }
        lastSchedule = schedule;
        renderToday(schedule);
    } catch (err) {
        container.innerHTML = `<div class="today-empty"><p>Could not load schedule.</p></div>`;
    }
}

function localDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderToday(schedule) {
    const container = document.getElementById('today-container');
    const todayStr = localDateStr();
    const today = new Date();
    const dayLabel = today.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const todayData = schedule.calendar[todayStr];

    // Greeting
    const hour = today.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    // Find next session after today
    const futureDates = Object.keys(schedule.calendar).filter(d => d > todayStr).sort();
    const nextDate = futureDates[0];
    const nextLabel = nextDate
        ? new Date(nextDate + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
        : null;

    // Remaining work from live batch data
    const activeBatches = batches.filter(b => b.numScripts - b.completedScripts > 0);

    let sessionsHTML;
    if (!todayData || todayData.slots.length === 0) {
        sessionsHTML = `<p class="text-muted">🌊 No marking today — enjoy the break!</p>`;
        if (nextLabel) {
            sessionsHTML += `<p class="next-session-hint">Next session: <strong>${nextLabel}</strong></p>`;
        }
    } else {
        sessionsHTML = todayData.slots.map(slot => {
            const totalMin = slot.assignments.reduce((sum, a) => sum + a.count * (a.timePerScript || 20), 0);
            return `
                <div class="today-slot">
                    <div class="today-slot-time">${formatTime(slot.start)} – ${formatTime(slot.end)}</div>
                    ${slot.label ? `<div class="today-slot-label">${escapeHtml(slot.label)}</div>` : ''}
                    <div class="today-assignments">
                        ${slot.assignments.map(a => {
                            const type = taskTypes.find(t => t.name === a.taskTypeName);
                            return `
                                <div class="today-assignment" style="border-left: 3px solid ${a.colour}">
                                    <span class="today-assignment-name">${a.count}× ${escapeHtml(a.taskTypeName)}</span>
                                    <span class="today-assignment-time">${a.count * (a.timePerScript || 20)} min</span>
                                </div>`;
                        }).join('')}
                    </div>
                    <div class="today-slot-total">${totalMin} min total</div>
                </div>`;
        }).join('');
    }

    let remainingHTML;
    if (activeBatches.length === 0) {
        remainingHTML = '<p class="text-muted">🎉 All batches complete — well done!</p>';
    } else {
        remainingHTML = activeBatches.map(batch => {
            const type = taskTypes.find(t => t.id === batch.taskTypeId);
            const remaining = batch.numScripts - batch.completedScripts;
            const progress = Math.round((batch.completedScripts / batch.numScripts) * 100);
            const colour = type?.colour || '#ccc';
            const deadlineDays = Math.ceil((new Date(batch.deadline) - today) / 86400000);
            const urgency = deadlineDays <= 3 ? 'deadline-urgent' : deadlineDays <= 7 ? 'deadline-soon' : '';
            return `
                <div class="today-batch">
                    <div class="today-batch-header">
                        <span class="today-batch-name">
                            <span class="batch-dot" style="background:${colour}"></span>
                            ${escapeHtml(type?.name || 'Unknown')}
                        </span>
                        <div style="display:flex;align-items:center;gap:0.5rem">
                            <span class="today-batch-deadline ${urgency}">${deadlineDays}d to go</span>
                            ${remaining > 0 ? `<button class="done-btn" onclick="markScriptDoneFromToday('${batch.id}')">+1 Done</button>` : '<span class="complete-badge">Complete</span>'}
                        </div>
                    </div>
                    <div class="batch-progress-bar">
                        <div class="batch-progress-fill" style="width:${progress}%;background:${colour}"></div>
                    </div>
                    <div class="today-batch-meta">${batch.completedScripts} / ${batch.numScripts} done &nbsp;·&nbsp; ${remaining} remaining</div>
                </div>`;
        }).join('');
    }

    const staleHTML = schedule.stale ? `
        <div class="stale-banner">
            ⚠️ Your schedule may be out of date — you've marked scripts since it was last generated.
            <a href="#" onclick="event.preventDefault();document.querySelector('[data-tab=\\'schedule\\']').click()">Regenerate</a>
        </div>` : '';

    container.innerHTML = `
        ${staleHTML}
        <div class="today-header">
            <div>
                <div class="today-greeting">${greeting} 🦦</div>
                <div class="today-date">${dayLabel}</div>
            </div>
            <button class="refresh-btn" onclick="loadToday()">Refresh</button>
        </div>
        <div class="today-grid">
            <div class="today-section">
                <h3>Today's Sessions</h3>
                ${sessionsHTML}
            </div>
            <div class="today-section">
                <h3>Remaining Work</h3>
                ${remainingHTML}
            </div>
        </div>`;
}

// ============== iCal Export ==============

function exportToICal() {
    if (!lastSchedule) {
        alert('Generate a schedule first.');
        return;
    }

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Marking Planner//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
    ];

    Object.values(lastSchedule.calendar).forEach(day => {
        day.slots.forEach(slot => {
            if (!slot.assignments.length) return;

            const dateStr = day.date.replace(/-/g, '');
            const startStr = slot.start.replace(':', '') + '00';
            const endStr = slot.end.replace(':', '') + '00';
            const summary = slot.assignments.map(a => `${a.count}x ${a.taskTypeName}`).join(', ');
            const totalMin = slot.assignments.reduce((sum, a) => sum + a.count * (a.timePerScript || 20), 0);
            const description = slot.assignments
                .map(a => `${a.count}x ${a.taskTypeName} (${a.timePerScript || 20} min each)`)
                .join('\\n') + `\\nTotal: ${totalMin} min`;

            lines.push(
                'BEGIN:VEVENT',
                `UID:marking-${dateStr}-${startStr}@markingplanner`,
                `DTSTART:${dateStr}T${startStr}`,
                `DTEND:${dateStr}T${endStr}`,
                `SUMMARY:Marking: ${summary}`,
                `DESCRIPTION:${description}`,
                'END:VEVENT'
            );
        });
    });

    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marking-schedule.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function renderSchedule(result) {
    const { calendar, batches: batchStatus, summary } = result;

    // Show summary bar
    const summaryBar = document.getElementById('summary-bar');
    summaryBar.style.display = 'flex';
    document.getElementById('summary-total').textContent = summary.totalRemaining;
    document.getElementById('summary-hours').textContent = summary.totalHours;
    document.getElementById('summary-deadline').textContent = summary.nearestDeadline ? formatDate(summary.nearestDeadline) : '-';

    // Show warnings
    const warningsContainer = document.getElementById('warnings-container');
    const impossibleBatches = batchStatus.filter(b => b.impossible);
    if (impossibleBatches.length > 0) {
        warningsContainer.innerHTML = impossibleBatches.map(b => `
            <div class="warning-banner">
                <strong>Warning:</strong> ${b.taskTypeName} batch cannot be completed by deadline (${formatDate(b.deadline)}).
                ${b.remaining} scripts remaining after all available slots.
            </div>
        `).join('');
    } else {
        warningsContainer.innerHTML = '';
    }

    // Render calendar
    const calendarContainer = document.getElementById('calendar-container');
    const dates = Object.keys(calendar).sort();

    if (dates.length === 0) {
        calendarContainer.innerHTML = '<p class="text-muted">No slots available. Add time slots in the Weekly Template tab.</p>';
        return;
    }

    // Group by week
    const weeks = {};
    dates.forEach(date => {
        const weekStart = getWeekStart(date);
        if (!weeks[weekStart]) weeks[weekStart] = [];
        weeks[weekStart].push(calendar[date]);
    });

    calendarContainer.innerHTML = Object.entries(weeks).map(([weekStart, days]) => {
        const weekEnd = getWeekEnd(weekStart);
        return `
            <div class="calendar-week">
                <div class="calendar-week-header">
                    Week of ${formatDate(weekStart)} - ${formatDate(weekEnd)}
                </div>
                <div class="calendar-grid">
                    ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(dayName => {
                        const dayData = days.find(d => d.dayName === dayName);
                        if (!dayData) {
                            return `<div class="calendar-day empty">
                                <div class="calendar-day-label">${dayName.slice(0, 3)}</div>
                            </div>`;
                        }
                        return `
                            <div class="calendar-day">
                                <div class="calendar-day-label">${dayName.slice(0, 3)}</div>
                                <div class="calendar-date">${new Date(dayData.date).getDate()}</div>
                                ${dayData.slots.map(slot => `
                                    <div class="calendar-slot">
                                        <div class="calendar-slot-time">${formatTime(slot.start)} - ${formatTime(slot.end)}</div>
                                        ${slot.label ? `<div style="font-size:0.7rem;color:#666">${escapeHtml(slot.label)}</div>` : ''}
                                        ${slot.assignments.map(a => `
                                            <div class="calendar-slot-assignment" style="background:${a.colour}">
                                                <span class="dot"></span>
                                                ${a.count}x ${escapeHtml(a.taskTypeName)}
                                            </div>
                                        `).join('')}
                                    </div>
                                `).join('')}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// ============== Utilities ==============

function formatTo24Hour(hour, minute, ampm) {
    let h = parseInt(hour);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${minute}`;
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getWeekStart(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff)).toISOString().split('T')[0];
}

function getWeekEnd(weekStart) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + 6);
    return date.toISOString().split('T')[0];
}
