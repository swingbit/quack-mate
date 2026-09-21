/**
 * Per-side Query Inspector.
 *
 * Two tabs:
 *   - Game Overview — the bird's-eye view of a move search (phase timings,
 *     totals, optimization metrics). Always available.
 *   - Profiling — a zoom-in into the cost centers of the last profiled move.
 *     Hidden entirely while profiling is OFF; appears once the ⚡ Profiling
 *     toggle is enabled and a move has been captured.
 *
 * The Profiling tab is a master-detail split:
 *   - Master: accordion of Phases > captured Queries, ranked by cost.
 *   - Detail: ranked operator Cost-Center table by default (scales to any plan
 *     size), with an optional Plan DAG toggle. A slide-over drawer hosts the
 *     live table inspector, reachable from the header or from a scan operator.
 */

import { telemetry } from './quackmate-telemetry.js';
import {
    parseDuckDBPlan,
    renderPlanView,
    renderOperatorCostTable,
    analyzeOperatorCosts,
    flattenOperators,
    extractTableName
} from './quackmate-ui-plan-dag.js';
import { renderTableInspector, selectTable } from './quackmate-ui-table-inspector.js';

export class QueryInspectorUI {
    constructor(side, engineGetter, playerGetter = null, ensureEngineGetter = null) {
        this.side = side; // 'white' or 'black'
        this.getEngine = engineGetter;
        this.getPlayer = playerGetter;
        // Used ONLY by the "⚡ Profiling" toggle: unlike `engineGetter` (a
        // cheap, lazy lookup that may fall back to a generic default engine
        // before this side's first move), this MUST resolve to the exact engine
        // instance that will play this side's NEXT real move, eagerly creating
        // it if necessary - otherwise toggling profiling could silently sync
        // against the wrong engine.
        this.ensureRealEngine = ensureEngineGetter || engineGetter;

        this.activeDepthFilter = null;      // Game Overview ply scope
        this.selectedPhase = null;          // Profiling master selection
        this.selectedTemplateKey = null;    // Profiling master selection
        this.expandedPhases = new Set();    // Profiling accordion state
        this.activePlanStepIndex = null;    // Per-statement selection
        this.detailView = 'costs';          // 'costs' | 'dag'
        this.masterCollapsed = false;       // Profiling master pane collapse

        telemetry.subscribe((event, data) => {
            if (data.color === this.side && (event === 'session_complete' || event === 'session_start')) {
                this.refreshActiveViews();
            }
        });
    }

    /**
     * Initializes all tool tabs for this player side.
     */
    init() {
        this.setupEventListeners();
        this.updateProfilingToggleUI();
        this.refreshActiveViews();
    }

    setupEventListeners() {
        const side = this.side;

        // Tab clicks (Game Overview / Profiling).
        $(`.tool-tabs[data-side="${side}"] .tool-tab-btn`).on('click', (e) => {
            this.switchToTab($(e.currentTarget).data('tab'));
        });

        // Global, on-demand profiling toggle. While ON, every SQL statement in
        // this side's NEXT move is profiled with real, single-execution DuckDB
        // timings (see telemetry.setProfilingEnabled()). Turning it on doesn't
        // replay anything - it profiles the actual next move as it's played.
        $(`.btn-toggle-profiling[data-side="${side}"]`).on('click', async () => {
            const next = !telemetry.isProfilingEnabled(side);
            telemetry.setProfilingEnabled(side, next);
            this.updateProfilingToggleUI();

            // For the Remote (HTTP) engine, profiling state lives in a
            // different process (the server) - propagate it there too, using
            // the engine instance that will actually play the next move.
            try {
                const engine = await this._resolveEngineFrom(this.ensureRealEngine);
                if (engine && typeof engine.setProfiling === 'function') {
                    await engine.setProfiling(next);
                }
            } catch (e) {
                console.warn('Failed to sync profiling flag to remote engine:', e);
            }
        });

        // Tables slide-over drawer.
        $(`#${side}-tables-drawer .btn-close-tables-drawer`).on('click', () => this.closeTablesDrawer());
    }

    /**
     * Syncs the profiling toggle's visual state, shows/hides the Profiling tab,
     * and moves focus between the two tabs accordingly.
     */
    updateProfilingToggleUI() {
        const side = this.side;
        const enabled = telemetry.isProfilingEnabled(side);

        const $btn = $(`.btn-toggle-profiling[data-side="${side}"]`);
        $btn.toggleClass('active', enabled);
        $btn.text(enabled ? '⚡ Profiling: ON (slower)' : '⚡ Profiling: OFF');

        const $tab = $(`.tool-tabs[data-side="${side}"] .tool-tab-btn[data-tab="${side}-profiling"]`);
        $tab.toggle(enabled);

        if (enabled) {
            this.switchToTab(`${side}-profiling`);
        } else {
            if (this._activeTabId() === `${side}-profiling`) {
                this.switchToTab(`${side}-stats`);
            }
            this.closeTablesDrawer();
        }
    }

    _activeTabId() {
        return $(`.tool-tabs[data-side="${this.side}"] .tool-tab-btn.active`).data('tab');
    }

    /**
     * Activates a tab and renders its content. Kept independent of the global
     * tab handler so it works even during early initialization.
     */
    switchToTab(tabId) {
        const side = this.side;
        const $container = $(`.tool-tabs[data-side="${side}"]`).closest('.tool-panel-container');

        $container.find('.tool-tab-btn').removeClass('active');
        $container.find('.tool-tab-pane').removeClass('active');
        $container.find(`.tool-tab-btn[data-tab="${tabId}"]`).addClass('active');
        $container.find(`#${tabId}`).addClass('active');

        if (tabId === `${side}-profiling`) {
            this.renderProfilingTab();
        } else if (tabId === `${side}-stats`) {
            this.renderGameOverview();
        }
    }

    refreshActiveViews() {
        if (this._activeTabId() === `${this.side}-profiling`) {
            this.renderProfilingTab();
        } else {
            this.renderGameOverview();
        }
    }

    // =========================================================================
    // Game Overview — Search lifecycle & stats
    // =========================================================================
    renderGameOverview() {
        const side = this.side;
        const $container = $(`#${side}-search-stats`);
        const session = telemetry.getSession(side);

        if (!session || session.queryCount === 0) {
            $container.html('<div class="tool-pane-placeholder">Run a move search to view lifecycle timings & SQL metrics.</div>');
            return;
        }

        const activePly = this.activeDepthFilter;
        const depthData = (activePly !== null && session.depths && session.depths[activePly]) ? session.depths[activePly] : null;

        const totalMs = Math.max(0.1, depthData ? depthData.durationMs : session.totalDurationMs);
        const phases = Object.values(depthData ? depthData.phases : session.phases).filter(p => p.queryCount > 0);
        const queryCount = depthData ? depthData.queryCount : session.queryCount;
        const s = session.result && session.result.stats ? session.result.stats : null;
        const nodesEvaluated = session.result && session.result.nodes !== undefined ? session.result.nodes : session.totalRows;

        // Player game stats & running averages
        const player = this.getPlayer ? this.getPlayer() : null;
        const movesCount = player?.stats?.moves || 0;
        const avgTimeMs = movesCount > 0 ? Math.round(player.stats.time / movesCount) : null;
        const avgNodesCount = movesCount > 0 ? Math.round(player.stats.nodes / movesCount) : null;

        // Depth Filter Pills
        const plies = Object.keys(session.depths || {}).map(Number).sort((a, b) => a - b);
        let depthPillsHtml = `<button class="sql-filter-pill ${this.activeDepthFilter === null ? 'active' : ''}" data-depth="">All Depths (Cumulative: 1→${session.depth})</button>`;
        plies.forEach(ply => {
            const isFinal = ply === session.depth;
            const label = `Depth ${ply}${isFinal ? ' (Final Horizon)' : ''}`;
            depthPillsHtml += `<button class="sql-filter-pill ${this.activeDepthFilter === ply ? 'active' : ''}" data-depth="${ply}">${label}</button>`;
        });

        // Optimization metrics
        let pvStabilityStr = '-';
        if (s && s.pv_accuracy && s.pv_accuracy.total > 0) {
            const acc = Math.round((s.pv_accuracy.correct / s.pv_accuracy.total) * 100);
            pvStabilityStr = `${acc}% (${s.pv_accuracy.correct}/${s.pv_accuracy.total})`;
        }

        let lmrRateStr = '-';
        if (s && s.lmr && s.lmr.total_batches > 0) {
            const rRate = Math.round((s.lmr.reductions / s.lmr.total_batches) * 100);
            lmrRateStr = `${rRate}% (${s.lmr.reductions}/${s.lmr.total_batches})`;
        }

        let lmrResearchesStr = '-';
        if (s && s.lmr && s.lmr.reductions > 0) {
            const rPct = Math.round((s.lmr.researches / s.lmr.reductions) * 100);
            lmrResearchesStr = `${s.lmr.researches}/${s.lmr.reductions} (${rPct}%)`;
        }

        const prunedParents = s && s.pruning ? s.pruning.pruned_parents : null;
        let nodesAvoidedStr = '-';
        if (s && s.pruning && s.pruning.estimated_nodes_avoided > 0) {
            nodesAvoidedStr = (s.pruning.estimated_nodes_avoided > 1000000)
                ? (s.pruning.estimated_nodes_avoided / 1000000).toFixed(2) + 'M'
                : (s.pruning.estimated_nodes_avoided / 1000).toFixed(1) + 'k';
        }

        // Horizontal stacked bar
        let barSegmentsHtml = '';
        phases.forEach(p => {
            const pct = ((p.durationMs / totalMs) * 100).toFixed(1);
            if (Number(pct) > 0.5) {
                barSegmentsHtml += `<div class="waterfall-bar-segment"
                         style="width: ${pct}%; background-color: ${p.color};"
                         title="${p.phase}: ${p.durationMs.toFixed(1)}ms (${pct}%)"
                         data-phase="${escapeHtmlAttr(p.phase)}">
                    </div>
                `;
            }
        });

        // Phase Breakdown Cards
        const profilingOn = telemetry.isProfilingEnabled(side);
        let cardsHtml = '';
        phases.sort((a, b) => b.durationMs - a.durationMs).forEach(p => {
            const pct = ((p.durationMs / totalMs) * 100).toFixed(1);
            const isSelected = profilingOn && this.selectedPhase === p.phase;
            const clickable = profilingOn ? 'clickable' : '';
            cardsHtml += `<div class="waterfall-phase-card ${isSelected ? 'selected' : ''} ${clickable}" data-phase="${escapeHtmlAttr(p.phase)}">
                    <div class="phase-card-header">
                        <span class="phase-color-dot" style="background-color: ${p.color};"></span>
                        <span class="phase-name">${p.phase}</span>
                        <span class="phase-pct">${pct}%</span>
                    </div>
                    <div class="phase-card-body">
                        <span class="phase-time">${p.durationMs.toFixed(1)}ms</span>
                        <span class="phase-queries">${p.queryCount} queries</span>
                        <span class="phase-rows">${p.rowCount.toLocaleString()} rows</span>
                    </div>
                </div>
            `;
        });

        const scopeTitle = depthData
            ? `Iterative Deepening Ply ${activePly} Only (${totalMs.toFixed(1)}ms, ${queryCount} queries)`
            : `Cumulative Search (Depths 1 → ${session.depth}): ${totalMs.toFixed(1)}ms, ${queryCount} queries`;

        const hintHtml = profilingOn
            ? `<div class="overview-profiling-hint">⚡ Profiling is ON — click a phase below to zoom into its cost centers.</div>`
            : `<div class="overview-profiling-hint muted">Turn on ⚡ Profiling and make a move to unlock the cost-center drill-down.</div>`;

        const html = `<div class="inspector-waterfall-wrapper">
                ${hintHtml}

                <!-- Depth Iteration Scope Selector -->
                <div class="waterfall-depth-selector">
                    <span class="depth-selector-label">Iteration Scope:</span>
                    <div class="depth-pills-row">
                        ${depthPillsHtml}
                    </div>
                </div>

                <!-- Top Summary Metrics Row -->
                <div class="waterfall-summary-header">
                    <div class="summary-metric">
                        <span class="metric-label">${depthData ? `Ply ${activePly} Time` : 'Move Time'}</span>
                        <span class="metric-val highlight">${totalMs.toFixed(1)} ms</span>
                        ${avgTimeMs !== null && !depthData ? `<span style="font-size: 9.5px; color: #64748B;">avg ${avgTimeMs}ms</span>` : ''}
                    </div>
                    <div class="summary-metric">
                        <span class="metric-label">Nodes Evaluated</span>
                        <span class="metric-val">${nodesEvaluated.toLocaleString()}</span>
                        ${avgNodesCount !== null && !depthData ? `<span style="font-size: 9.5px; color: #64748B;">avg ${avgNodesCount.toLocaleString()}</span>` : ''}
                    </div>
                    <div class="summary-metric">
                        <span class="metric-label">Nodes Avoided</span>
                        <span class="metric-val" style="color: #2563EB;">~${nodesAvoidedStr}</span>
                    </div>
                    <div class="summary-metric">
                        <span class="metric-label">Pruned Cutoffs</span>
                        <span class="metric-val">${prunedParents !== null ? prunedParents : '-'}</span>
                    </div>
                    <div class="summary-metric">
                        <span class="metric-label">${depthData ? 'Queries in Ply' : 'Total Queries'}</span>
                        <span class="metric-val">${queryCount.toLocaleString()}</span>
                    </div>
                    <div class="summary-metric">
                        <span class="metric-label">Search Horizon</span>
                        <span class="metric-val">Ply ${session.depth}</span>
                    </div>
                </div>

                <!-- Engine Heuristics & Optimizations Panel -->
                <div class="waterfall-optimizations-panel">
                    <span class="opt-panel-title">Optimization & Pruning Efficiency</span>
                    <div class="opt-badges-grid">
                        <div class="opt-badge-card">
                            <span class="opt-badge-label">PV Move Stability</span>
                            <span class="opt-badge-val">${pvStabilityStr}</span>
                        </div>
                        <div class="opt-badge-card">
                            <span class="opt-badge-label">LMR Reduction Rate</span>
                            <span class="opt-badge-val">${lmrRateStr}</span>
                        </div>
                        <div class="opt-badge-card">
                            <span class="opt-badge-label">LMR Researches</span>
                            <span class="opt-badge-val">${lmrResearchesStr}</span>
                        </div>
                        <div class="opt-badge-card">
                            <span class="opt-badge-label">Est. Nodes Saved</span>
                            <span class="opt-badge-val" style="color: #2563EB;">~${nodesAvoidedStr}</span>
                        </div>
                    </div>
                </div>

                <!-- Waterfall Distribution Bar -->
                <div class="waterfall-bar-container">
                    <div class="waterfall-bar-label">Search Phase Distribution:</div>
                    <div class="waterfall-stacked-bar">
                        ${barSegmentsHtml}
                    </div>
                </div>

                <!-- Lifecycle Phase Cards -->
                <div class="waterfall-phase-grid">
                    ${cardsHtml}
                </div>
            </div>
        `;

        $container.html(html);

        // Depth scope filter.
        $container.find('.sql-filter-pill').on('click', (e) => {
            const depthVal = $(e.currentTarget).attr('data-depth');
            this.activeDepthFilter = depthVal === '' || depthVal === undefined ? null : Number(depthVal);
            this.renderGameOverview();
        });

        // Zoom into a phase: only meaningful while profiling is on.
        $container.find('.waterfall-phase-card, .waterfall-bar-segment').on('click', (e) => {
            if (!telemetry.isProfilingEnabled(side)) return;
            this._selectPhase($(e.currentTarget).attr('data-phase'));
        });
    }

    /**
     * Selects a phase, picks its costliest captured query, and opens the
     * Profiling tab focused on it.
     */
    _selectPhase(phase) {
        const scope = this._scope();
        if (scope) {
            const inPhase = this._capturedTemplates(scope).filter(t => t.phase === phase);
            if (inPhase.length > 0) {
                const hottest = inPhase.sort((a, b) => b.totalDurationMs - a.totalDurationMs)[0];
                this.selectedTemplateKey = hottest.key;
                this.activePlanStepIndex = null;
            }
        }
        this.selectedPhase = phase;
        this.expandedPhases.add(phase);
        this.switchToTab(`${this.side}-profiling`);
    }

    // =========================================================================
    // Profiling — master-detail cost-center drill-down
    // =========================================================================
    _scope() {
        const session = telemetry.getSession(this.side);
        if (!session) return null;
        return {
            session,
            templates: Array.from(session.templates.values())
        };
    }

    _capturedTemplates(scope) {
        if (!scope || !scope.session.capturedPlans) return [];
        const map = scope.session.capturedPlans;
        return scope.templates.filter(t => map.has(t.key));
    }

    renderProfilingTab() {
        const side = this.side;
        const $root = $(`#${side}-profiling-root`);
        const scope = this._scope();
        const captured = this._capturedTemplates(scope);

        if (captured.length === 0) {
            $root.html(`<div class="tool-pane-placeholder">⚡ Profiling is ON. Make a move to capture real, measured cost centers for every statement executed.</div>`);
            return;
        }

        this._ensureSelection(scope);

        $root.html(`<div class="profiling-split ${this.masterCollapsed ? 'master-collapsed' : ''}">
                <div class="profiling-master" id="${side}-profiling-master"></div>
                <div class="profiling-detail" id="${side}-profiling-detail"></div>
            </div>`);

        this.renderProfilingMaster(scope);
        this.renderProfilingDetail(scope);
    }

    /**
     * Ensures a valid captured query is selected, defaulting to the costliest
     * one. Also keeps the containing phase expanded.
     */
    _ensureSelection(scope) {
        const captured = this._capturedTemplates(scope);
        if (captured.length === 0) return;

        const exists = captured.some(t => t.key === this.selectedTemplateKey);
        if (!exists) {
            const hottest = [...captured].sort((a, b) => b.totalDurationMs - a.totalDurationMs)[0];
            this.selectedTemplateKey = hottest.key;
            this.activePlanStepIndex = null;
        }

        const selected = captured.find(t => t.key === this.selectedTemplateKey);
        this.selectedPhase = selected ? selected.phase : null;
        if (this.selectedPhase) this.expandedPhases.add(this.selectedPhase);
    }

    renderProfilingMaster(scope) {
        const side = this.side;
        const $master = $(`#${side}-profiling-master`);
        const captured = this._capturedTemplates(scope);
        const totalMs = captured.reduce((sum, t) => sum + t.totalDurationMs, 0) || 1;

        const byPhase = new Map();
        for (const t of captured) {
            if (!byPhase.has(t.phase)) byPhase.set(t.phase, []);
            byPhase.get(t.phase).push(t);
        }

        const sum = list => list.reduce((s, t) => s + t.totalDurationMs, 0);
        const phaseEntries = [...byPhase.entries()].sort((a, b) => sum(b[1]) - sum(a[1]));

        let phasesHtml = '';
        for (const [phase, list] of phaseEntries) {
            const phaseMs = sum(list);
            const pct = ((phaseMs / totalMs) * 100).toFixed(1);
            const isOpen = this.expandedPhases.has(phase);
            const phaseColor = list[0].phaseColor;

            const queriesHtml = list
                .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
                .map(t => `<div class="pm-query ${t.key === this.selectedTemplateKey ? 'selected' : ''}" data-key="${escapeHtmlAttr(t.key)}">
                        <span class="pm-query-title">${escapeHtml(t.title)}</span>
                        <span class="pm-query-meta">${t.totalDurationMs.toFixed(1)}ms · ${t.count}×</span>
                    </div>`).join('');

            phasesHtml += `<div class="pm-phase ${isOpen ? 'open' : ''}" data-phase="${escapeHtmlAttr(phase)}">
                    <div class="pm-phase-header">
                        <span class="pm-caret">${isOpen ? '▾' : '▸'}</span>
                        <span class="phase-color-dot" style="background-color: ${phaseColor};"></span>
                        <span class="pm-phase-name">${escapeHtml(phase)}</span>
                        <span class="pm-phase-pct">${pct}%</span>
                    </div>
                    <div class="pm-phase-queries" style="${isOpen ? '' : 'display: none;'}">${queriesHtml}</div>
                </div>`;
        }

        $master.html(`<div class="profiling-master-header">
                <span class="pmh-title">Captured Cost Centers</span>
                <button class="pm-collapse-btn" title="${this.masterCollapsed ? 'Expand list' : 'Collapse list'}">${this.masterCollapsed ? '⟩' : '⟨'}</button>
            </div>
            <div class="profiling-master-body">${phasesHtml}</div>`);

        $master.find('.pm-collapse-btn').on('click', (e) => {
            e.stopPropagation();
            this.masterCollapsed = !this.masterCollapsed;
            $(`#${side}-profiling-root .profiling-split`).toggleClass('master-collapsed', this.masterCollapsed);
            $(e.currentTarget)
                .text(this.masterCollapsed ? '⟩' : '⟨')
                .attr('title', this.masterCollapsed ? 'Expand list' : 'Collapse list');
        });

        $master.find('.pm-phase-header').on('click', (e) => {
            const phase = $(e.currentTarget).closest('.pm-phase').attr('data-phase');
            if (this.expandedPhases.has(phase)) this.expandedPhases.delete(phase);
            else this.expandedPhases.add(phase);
            this.renderProfilingMaster(scope);
        });

        $master.find('.pm-query').on('click', (e) => {
            this.selectedTemplateKey = $(e.currentTarget).attr('data-key');
            this.activePlanStepIndex = null;
            const latestScope = this._scope();
            this._ensureSelection(latestScope);
            this.renderProfilingMaster(latestScope);
            this.renderProfilingDetail(latestScope);
        });
    }

    renderProfilingDetail(scope) {
        const side = this.side;
        const $detail = $(`#${side}-profiling-detail`);
        const session = scope.session;
        const tpl = this.selectedTemplateKey ? session.templates.get(this.selectedTemplateKey) : null;

        if (!tpl) {
            $detail.html('<div class="tool-pane-placeholder">Select a query on the left to inspect its cost centers.</div>');
            return;
        }

        const captures = session.capturedPlans ? session.capturedPlans.get(tpl.key) : null;
        if (!captures || captures.length === 0) {
            $detail.html(`<div class="profiling-detail-empty">
                    <div class="pde-title">${escapeHtml(tpl.title)}</div>
                    <div class="pde-note">No capture for this statement yet. Make a move with profiling on to profile it.</div>
                </div>`);
            return;
        }

        // A template key is re-captured every time its query runs during a move,
        // and a multi-statement batch stores every statement in one capture.
        // Pick the RICHEST capture (most statements) and, on a tie, the FIRST
        // one seen. The tie-break must be strict (`>` not `>=`): choosing the
        // last-appended capture would make the drill-down silently change to a
        // different capture whenever a later one was recorded, even though the
        // user only toggled the view.
        const representative = captures.reduce((best, c) => {
            const bestLen = best && best.steps ? best.steps.length : -1;
            const len = c.steps ? c.steps.length : 0;
            return len > bestLen ? c : best;
        }, null);
        const parsed = this._buildParsedSteps(representative);
        if (parsed.length === 0) {
            $detail.html('<div class="tool-pane-placeholder">This capture has no profilable statements.</div>');
            return;
        }

        const selected = this._pickStep(parsed);
        const avgMs = tpl.count > 0 ? tpl.totalDurationMs / tpl.count : 0;

        const headerHtml = `<div class="profiling-detail-header">
                <div class="pdh-main">
                    <span class="phase-badge" style="background: ${tpl.phaseColor}25; color: ${tpl.phaseColor}; border: 1px solid ${tpl.phaseColor}60;">${escapeHtml(tpl.phase)}</span>
                    <span class="pdh-title">${escapeHtml(tpl.title)}</span>
                </div>
                <div class="pdh-metrics">
                    <span class="pdh-metric" title="Search-measured average duration of this statement">⏱ avg ${avgMs.toFixed(2)}ms</span>
                    <span class="pdh-metric">${captures.length} capture${captures.length === 1 ? '' : 's'}</span>
                    <button class="btn-open-tables" title="Open the live table inspector">🗄 Tables</button>
                </div>
            </div>`;

        const isDag = this.detailView === 'dag';

        // STATEMENT selector (ranked by decreasing measured cost, so the
        // costliest is the default) on the left; the view toggle and DAG zoom
        // controls pushed to the right of the SAME row, saving a whole row.
        let statementHtml = '';
        if (parsed.length > 1) {
            const ranked = [...parsed].sort((a, b) => b.totalTimingMs - a.totalTimingMs);
            const maxTiming = Math.max(...parsed.map(s => s.totalTimingMs), 0);
            const optionsHtml = ranked.map(s => {
                const ordinal = parsed.indexOf(s) + 1;
                const isHottest = maxTiming > 0 && s.totalTimingMs === maxTiming;
                return `<option value="${s.index}" ${s.index === selected.index ? 'selected' : ''}>${isHottest ? '🔥 ' : ''}${ordinal}. ${escapeHtml(s.label)} · ${s.totalTimingMs.toFixed(2)}ms</option>`;
            }).join('');
            statementHtml = `<span class="steps-label">Statement:</span><select class="plan-step-select">${optionsHtml}</select>`;
        }

        const zoomControlsHtml = isDag ? `
                <span class="pvt-ops">${selected.totalOperators} ops</span>
                <button class="btn-zoom btn-focus-hotspot" title="Center on the most expensive operator">🔥 Focus</button>
                <button class="btn-zoom btn-zoom-out" title="Zoom Out">−</button>
                <span class="zoom-level-label">100%</span>
                <button class="btn-zoom btn-zoom-in" title="Zoom In">+</button>
                <button class="btn-zoom btn-zoom-reset" title="Fit the whole plan in view">Fit</button>` : '';

        const controlsRowHtml = `<div class="profiling-controls-row">
                <div class="pcr-left">${statementHtml}</div>
                <div class="pcr-right">
                    <button class="pv-btn ${!isDag ? 'active' : ''}" data-view="costs">📊 Cost Centers</button>
                    <button class="pv-btn ${isDag ? 'active' : ''}" data-view="dag">⋈ Plan DAG</button>
                    ${zoomControlsHtml}
                </div>
            </div>`;

        const sqlHtml = `<details class="profiling-sql-block">
                <summary>
                    <span class="psb-label">SQL</span>
                    <button class="btn-copy-step-sql" title="Copy this statement's SQL">📋 Copy SQL</button>
                </summary>
                <pre class="psb-code">${escapeHtml(selected.stmtSql)}</pre>
            </details>`;

        $detail.html(`${headerHtml}${controlsRowHtml}<div class="profiling-detail-view"></div>${sqlHtml}`);

        const $view = $detail.find('.profiling-detail-view');
        const $zoomLabel = $detail.find('.zoom-level-label');
        const onZoomChange = (z) => $zoomLabel.text(`${Math.round(z * 100)}%`);

        if (isDag) {
            renderPlanView($view, selected.planTree, { onZoomChange });
        } else {
            renderOperatorCostTable($view, selected.planTree, {
                onInspectTable: (name) => this.openTablesDrawer(name)
            });
        }

        const defaultTable = this._firstScanTable(selected.planTree) || 'search_tree';
        $detail.find('.btn-open-tables').on('click', () => this.openTablesDrawer(defaultTable));

        $detail.find('.pv-btn').on('click', (e) => {
            this.detailView = $(e.currentTarget).attr('data-view');
            this.renderProfilingDetail(scope);
        });

        $detail.find('.plan-step-select').on('change', (e) => {
            const value = $(e.currentTarget).val();
            if (value !== '' && value !== null) {
                this.activePlanStepIndex = Number(value);
                this.renderProfilingDetail(scope);
            }
        });

        // DAG zoom controls delegate to the API returned by renderPlanView.
        const planApi = () => $view.data('planApi');
        $detail.find('.btn-zoom-in').on('click', () => planApi()?.zoomIn());
        $detail.find('.btn-zoom-out').on('click', () => planApi()?.zoomOut());
        $detail.find('.btn-zoom-reset').on('click', () => planApi()?.fit());
        $detail.find('.btn-focus-hotspot').on('click', () => planApi()?.focusHotspot());

        $detail.find('.btn-copy-step-sql').on('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const $btn = $(e.currentTarget);
            navigator.clipboard.writeText(selected.stmtSql).then(() => {
                const original = $btn.text();
                $btn.text('✓ Copied!');
                setTimeout(() => $btn.text(original), 1200);
            });
        });
    }

    /**
     * Parses each statement of a capture into a plan tree plus its cost
     * analysis. Statements whose plan can't be parsed are dropped.
     */
    _buildParsedSteps(capture) {
        return (capture.steps || []).map(step => {
            const planTree = parseDuckDBPlan(step.rawExplainRows);
            const analysis = planTree ? analyzeOperatorCosts(planTree) : null;
            return {
                index: step.index,
                label: step.label,
                stmtSql: step.stmtSql,
                planTree,
                totalTimingMs: analysis ? analysis.totalTimingMs : 0,
                totalOperators: analysis ? analysis.totalOperators : 0
            };
        }).filter(s => s.planTree);
    }

    /**
     * Returns the currently selected statement, defaulting to the costliest
     * measured one (falling back to the first when nothing is measured).
     */
    _pickStep(parsed) {
        let selected = parsed.find(s => s.index === this.activePlanStepIndex);
        if (!selected) {
            const timed = parsed.filter(s => s.totalTimingMs > 0);
            selected = timed.length > 0
                ? timed.reduce((max, s) => s.totalTimingMs > max.totalTimingMs ? s : max, timed[0])
                : parsed[0];
            this.activePlanStepIndex = selected.index;
        }
        return selected;
    }

    _firstScanTable(planTree) {
        for (const op of flattenOperators(planTree)) {
            const name = extractTableName(op);
            if (name) return name;
        }
        return null;
    }

    // =========================================================================
    // Tables slide-over drawer
    // =========================================================================
    async openTablesDrawer(tableName) {
        const side = this.side;
        const $drawer = $(`#${side}-tables-drawer`);
        const $body = $(`#${side}-tables-drawer-body`);

        $drawer.css('display', 'flex');
        const engine = await this._resolveEngineFrom(this.getEngine);
        const target = tableName || 'search_tree';

        if ($body.find('.table-inspector-wrapper').length === 0) {
            await renderTableInspector($body, engine, target);
        } else {
            await selectTable($body, engine, target);
        }
    }

    closeTablesDrawer() {
        $(`#${this.side}-tables-drawer`).css('display', 'none');
    }

    async _resolveEngineFrom(getter) {
        const raw = getter();
        return raw && typeof raw.then === 'function' ? await raw : raw;
    }
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#039;');
}

function escapeHtmlAttr(str) {
    return escapeHtml(str);
}
