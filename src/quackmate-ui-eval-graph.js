/**
 * Evaluation Graph — Pure SVG Vector Renderer
 *
 * Renders a live centipawn evaluation curve with:
 *   - Adaptive Y-axis scaling (auto-ranges from ±3.5p to ±16p)
 *   - Catmull-Rom → Cubic Bézier spline for smooth curves
 *   - Confidence ribbon (uncertainty band via sigma)
 *   - Split area fill (White/Black advantage gradient)
 *   - Interactive hover tooltip
 *
 * All functions are exported so they can be imported by quackmate-ui.js.
 */

const SCORE_CAP = 10000;

function clampScore(s) {
    return Math.max(-SCORE_CAP, Math.min(SCORE_CAP, s));
}

function compressScore(cp) {
    const p = cp / 100;
    if (Math.abs(p) <= 6) return p;
    const sign = p > 0 ? 1 : -1;
    const excess = Math.abs(p) - 6;
    const compressed = 6 + 9 * (1 - Math.exp(-excess / 12));
    return sign * compressed;
}

function getAdaptiveScaleConfig(evalList) {
    const scores = evalList.map(e => compressScore(clampScore(e.score)));
    const uppers = evalList.map(e => compressScore(clampScore(e.score + (e.sigma || 0))));
    const lowers = evalList.map(e => compressScore(clampScore(e.score - (e.sigma || 0))));

    const maxAbs = Math.max(
        ...scores.map(Math.abs), ...uppers.map(Math.abs), ...lowers.map(Math.abs), 2.2
    );

    let yLimit, gridTicks;

    if (maxAbs <= 3.2) {
        yLimit = 3.5;
        gridTicks = [
            { val: 3, label: '+3p' }, { val: 2, label: '+2p' }, { val: 1, label: '+1p' },
            { val: 0, label: '0.0', isZero: true },
            { val: -1, label: '-1p' }, { val: -2, label: '-2p' }, { val: -3, label: '-3p' }
        ];
    } else if (maxAbs <= 6.5) {
        yLimit = 7.0;
        gridTicks = [
            { val: 6, label: '+6p' }, { val: 4, label: '+4p' }, { val: 2, label: '+2p' },
            { val: 0, label: '0.0', isZero: true },
            { val: -2, label: '-2p' }, { val: -4, label: '-4p' }, { val: -6, label: '-6p' }
        ];
    } else if (maxAbs <= 11.0) {
        yLimit = 12.0;
        gridTicks = [
            { val: 10, label: '+10p' }, { val: 5, label: '+5p' }, { val: 2, label: '+2p' },
            { val: 0, label: '0.0', isZero: true },
            { val: -2, label: '-2p' }, { val: -5, label: '-5p' }, { val: -10, label: '-10p' }
        ];
    } else {
        yLimit = 16.0;
        gridTicks = [
            { val: 15, label: '+Mate' }, { val: 10, label: '+10p' }, { val: 5, label: '+5p' },
            { val: 0, label: '0.0', isZero: true },
            { val: -5, label: '-5p' }, { val: -10, label: '-10p' }, { val: -15, label: '-Mate' }
        ];
    }

    return { yLimit, gridTicks, scores, uppers, lowers };
}

function computeEvaluationUncertainty(item, lastFen) {
    let legalMovesCount = 20;
    try {
        const fen = item.fen || lastFen;
        if (fen) {
            const { GameState } = await_import_GameState();
            const game = new GameState(fen);
            legalMovesCount = game.generateMoves({ legal: true }).length;
        }
    } catch (e) { /* fallback */ }

    const depth = Math.max(1, item.depth || 3);
    const absScore = Math.min(Math.abs(item.score || 0), 800);
    const decisiveness = 1 - Math.pow(absScore / 900, 2);
    const depthFactor = 0.55 + (1.35 / depth);
    const sigma = (20 + 2.2 * legalMovesCount) * Math.max(0.2, decisiveness) * depthFactor;
    return Math.max(15, Math.round(sigma));
}

let _GameState = null;
async function await_import_GameState() {
    if (!_GameState) {
        const mod = await import('./quackmate-js-dfs.js');
        _GameState = mod.GameState;
    }
    return { GameState: _GameState };
}

function getBezierSpline(points) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    if (points.length === 2) {
        return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
    }

    let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
}

function buildEvalTooltipHtml(item, idx, getSanForMove) {
    const cp = item.score;
    let san = getSanForMove ? getSanForMove(idx) : '?';
    if (san === '?') {
        san = item.turn === 'white' ? 'White move' : 'Black move';
    }
    const fullMoveNum = Math.ceil(item.moveNumber / 2);
    const plyText = item.turn === 'white' ? `${fullMoveNum}. ${san}` : `${fullMoveNum}... ${san}`;

    let evalHtml = '';
    const pawnScore = (cp / 100).toFixed(2);
    if (cp > 0) {
        evalHtml = `<span style="color: #38bdf8; font-weight: 700;">+${pawnScore} pawns</span> <span style="color: #94a3b8; font-size: 10px;">(+${cp} cp White adv)</span>`;
    } else if (cp < 0) {
        evalHtml = `<span style="color: #f43f5e; font-weight: 700;">${pawnScore} pawns</span> <span style="color: #94a3b8; font-size: 10px;">(${cp} cp Black adv)</span>`;
    } else {
        evalHtml = `<span style="color: #cbd5e1; font-weight: 700;">0.00 pawns</span> <span style="color: #94a3b8; font-size: 10px;">(Equal)</span>`;
    }

    const winProbWhite = Math.round((((2 / (1 + Math.exp(-0.004 * cp))) - 1 + 1) / 2) * 100);
    const winProbText = winProbWhite >= 50
        ? `<span style="color: #38bdf8; font-weight: 600;">${winProbWhite}%</span> White win prob`
        : `<span style="color: #f43f5e; font-weight: 600;">${100 - winProbWhite}%</span> Black win prob`;

    const sigmaPawn = ((item.sigma || 0) / 100).toFixed(2);
    const depthLabel = item.depth ? `depth ${item.depth}` : 'static';

    return `
        <div style="font-weight: 600; font-size: 11px; margin-bottom: 2px; color: #f8fafc; display: flex; justify-content: space-between; gap: 12px;">
            <span>${plyText}</span>
            <span style="color: #64748b; font-size: 10px; text-transform: capitalize;">${item.turn}</span>
        </div>
        <div style="font-size: 11px; margin-bottom: 3px;">${evalHtml}</div>
        <div style="font-size: 10px; color: #94a3b8; display: flex; gap: 6px; align-items: center; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 3px;">
            <span>${winProbText}</span>
            <span style="opacity: 0.4;">•</span>
            <span>±${sigmaPawn}p (${depthLabel})</span>
        </div>
    `;
}

/**
 * Render the evaluation graph as an inline SVG inside `container`.
 * `evalHistory` — array of { score, sigma, turn, moveNumber, ... }.
 * `getSanForMove` — callback from the parent module for SAN lookup.
 * `lastFen` — current board FEN (for uncertainty computation).
 */
export function renderEvalGraph(evalHistory, getSanForMove, lastFen) {
    const container = document.getElementById('eval-graph');
    if (!container) return;

    if (evalHistory.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #64748b; font-size: 11px; padding: 16px 0;">No moves played yet</div>';
        return;
    }

    evalHistory.forEach(e => {
        if (e.sigma === undefined) {
            e.sigma = computeEvaluationUncertainty(e, lastFen);
        }
    });

    const { yLimit, gridTicks, scores, uppers, lowers } = getAdaptiveScaleConfig(evalHistory);

    const width = 640;
    const height = 115;
    const padding = { top: 12, right: 24, bottom: 20, left: 38 };

    const plotH = height - padding.top - padding.bottom;
    const zeroY = padding.top + plotH / 2;
    const halfH = plotH / 2;

    const yScale = val => zeroY - (val / yLimit) * halfH;
    const xScale = i => padding.left + (evalHistory.length <= 1
        ? (width - padding.left - padding.right) / 2
        : (i / (evalHistory.length - 1)) * (width - padding.left - padding.right));

    const zeroPercent = ((zeroY / height) * 100).toFixed(1);

    let svg = `<svg viewBox="0 0 ${width} ${height}" class="eval-graph-svg" preserveAspectRatio="none">`;

    // Gradients, clip paths & filters
    svg += `
    <defs>
      <clipPath id="evalClipAboveZero">
        <rect x="0" y="0" width="${width}" height="${zeroY.toFixed(1)}" />
      </clipPath>
      <clipPath id="evalClipBelowZero">
        <rect x="0" y="${zeroY.toFixed(1)}" width="${width}" height="${(height - zeroY).toFixed(1)}" />
      </clipPath>
      <linearGradient id="evalWhiteAreaGrad" gradientUnits="userSpaceOnUse" x1="0" y1="${padding.top}" x2="0" y2="${zeroY.toFixed(1)}">
        <stop offset="0%" stop-color="#10b981" stop-opacity="0.38" />
        <stop offset="100%" stop-color="#10b981" stop-opacity="0.10" />
      </linearGradient>
      <linearGradient id="evalBlackAreaGrad" gradientUnits="userSpaceOnUse" x1="0" y1="${zeroY.toFixed(1)}" x2="0" y2="${(height - padding.bottom).toFixed(1)}">
        <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.10" />
        <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.38" />
      </linearGradient>
      <linearGradient id="evalLineGrad" gradientUnits="userSpaceOnUse" x1="0" y1="${padding.top}" x2="0" y2="${height - padding.bottom}">
        <stop offset="0%" stop-color="#34d399" />
        <stop offset="48%" stop-color="#38bdf8" />
        <stop offset="52%" stop-color="#fb7185" />
        <stop offset="100%" stop-color="#f43f5e" />
      </linearGradient>
      <filter id="evalGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="0" stdDeviation="1.5" flood-color="#38bdf8" flood-opacity="0.4" />
      </filter>
    </defs>`;

    // Grid lines
    gridTicks.forEach(g => {
        const gy = yScale(g.val);
        if (g.isZero) {
            svg += `<line x1="${padding.left}" y1="${gy.toFixed(1)}" x2="${width - padding.right}" y2="${gy.toFixed(1)}" stroke="#64748b" stroke-width="1.2" stroke-opacity="0.6"/>`;
            svg += `<text x="${padding.left - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#cbd5e1" font-family="monospace">${g.label}</text>`;
        } else {
            svg += `<line x1="${padding.left}" y1="${gy.toFixed(1)}" x2="${width - padding.right}" y2="${gy.toFixed(1)}" stroke="#334155" stroke-dasharray="3,4" stroke-width="1" stroke-opacity="0.6"/>`;
            svg += `<text x="${padding.left - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b" font-family="monospace">${g.label}</text>`;
        }
    });

    const mainPoints = scores.map((s, i) => ({ x: xScale(i), y: yScale(s) }));
    const topPoints = uppers.map((u, i) => ({ x: xScale(i), y: yScale(u) }));
    const botPoints = lowers.map((l, i) => ({ x: xScale(i), y: yScale(l) }));

    if (evalHistory.length >= 2) {
        // Confidence ribbon
        const topSpline = getBezierSpline(topPoints);
        const botSplineRev = getBezierSpline(botPoints.slice().reverse());
        const ribbonD = `${topSpline} L ${botPoints[botPoints.length - 1].x.toFixed(1)},${botPoints[botPoints.length - 1].y.toFixed(1)} ${botSplineRev.replace(/^M\s*[\d\.]+,[\d\.]+/, '')} Z`;
        svg += `<path d="${ribbonD}" fill="rgba(56, 189, 248, 0.10)" stroke="rgba(56, 189, 248, 0.22)" stroke-width="1" stroke-dasharray="2,2"/>`;

        // Split area fill with distinct clip paths for White (top) and Black (bottom) regions
        const mainSpline = getBezierSpline(mainPoints);
        const lastX = mainPoints[mainPoints.length - 1].x.toFixed(1);
        const firstX = mainPoints[0].x.toFixed(1);
        const areaD = `${mainSpline} L ${lastX},${zeroY.toFixed(1)} L ${firstX},${zeroY.toFixed(1)} Z`;
        svg += `<path d="${areaD}" fill="url(#evalWhiteAreaGrad)" clip-path="url(#evalClipAboveZero)"/>`;
        svg += `<path d="${areaD}" fill="url(#evalBlackAreaGrad)" clip-path="url(#evalClipBelowZero)"/>`;

        // Main curve
        svg += `<path d="${mainSpline}" fill="none" stroke="url(#evalLineGrad)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" filter="url(#evalGlow)"/>`;
    } else if (evalHistory.length === 1) {
        const p0 = mainPoints[0];
        svg += `<line x1="${padding.left}" y1="${p0.y.toFixed(1)}" x2="${p0.x.toFixed(1)}" y2="${p0.y.toFixed(1)}" stroke="url(#evalLineGrad)" stroke-width="2" stroke-linecap="round"/>`;
    }

    // Data-point dots
    evalHistory.forEach((e, i) => {
        const pt = mainPoints[i];
        const moveNum = Math.ceil(e.moveNumber / 2);
        const plyNotation = e.turn === 'white' ? `${moveNum}.` : `${moveNum}...`;
        const colorLabel = e.turn === 'white' ? 'White' : 'Black';
        const cp = e.score;
        const scoreLabel = cp > 0 ? `+${(cp / 100).toFixed(2)}` : (cp < 0 ? `${(cp / 100).toFixed(2)}` : `0.00`);
        const tooltip = `${plyNotation} (${colorLabel}): ${scoreLabel}`;
        const fillColor = e.turn === 'white' ? '#ffffff' : '#0f172a';

        svg += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="3"
                 fill="${fillColor}" stroke="#38bdf8" stroke-width="1.5">
                 <title>${tooltip}</title>
               </circle>`;
    });

    // X-axis labels
    const maxTicks = 12;
    const step = Math.max(1, Math.ceil(evalHistory.length / maxTicks));
    for (let i = 0; i < evalHistory.length; i += step) {
        const fullMoveNum = Math.ceil(evalHistory[i].moveNumber / 2);
        svg += `<line x1="${xScale(i).toFixed(1)}" y1="${height - padding.bottom}" x2="${xScale(i).toFixed(1)}" y2="${height - padding.bottom + 4}" stroke="#334155" stroke-width="1"/>`;
        svg += `<text x="${xScale(i).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9" fill="#64748b" font-family="monospace">${fullMoveNum}</text>`;
    }
    if ((evalHistory.length - 1) % step !== 0 && evalHistory.length > 1) {
        const lastIdx = evalHistory.length - 1;
        const fullMoveNum = Math.ceil(evalHistory[lastIdx].moveNumber / 2);
        svg += `<line x1="${xScale(lastIdx).toFixed(1)}" y1="${height - padding.bottom}" x2="${xScale(lastIdx).toFixed(1)}" y2="${height - padding.bottom + 4}" stroke="#334155" stroke-width="1"/>`;
        svg += `<text x="${xScale(lastIdx).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9" fill="#64748b" font-family="monospace">${fullMoveNum}</text>`;
    }

    // Interactive hover elements
    svg += `
    <g id="eval-hover-group" style="display: none; pointer-events: none;">
      <line id="eval-hover-line" x1="0" y1="${padding.top}" x2="0" y2="${height - padding.bottom}" stroke="#38bdf8" stroke-dasharray="2,2" stroke-width="1" stroke-opacity="0.8"/>
      <circle id="eval-hover-halo" cx="0" cy="0" r="9" fill="rgba(56, 189, 248, 0.25)" />
      <circle id="eval-hover-dot" cx="0" cy="0" r="5" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />
    </g>`;

    svg += '</svg>';
    svg += '<div id="eval-tooltip" class="eval-tooltip" style="display: none;"></div>';
    container.innerHTML = svg;

    attachEvalGraphEvents(container, xScale, yScale, width, height, scores, evalHistory, getSanForMove);
}

function attachEvalGraphEvents(container, xScale, yScale, width, height, scores, evalHistory, getSanForMove) {
    const svg = container.querySelector('.eval-graph-svg');
    const tooltip = container.querySelector('#eval-tooltip');
    const hoverGroup = container.querySelector('#eval-hover-group');
    const hoverLine = container.querySelector('#eval-hover-line');
    const hoverDot = container.querySelector('#eval-hover-dot');
    const hoverHalo = container.querySelector('#eval-hover-halo');

    if (!svg || !tooltip || !hoverGroup || evalHistory.length === 0) return;

    svg.onmousemove = (evt) => {
        if (evalHistory.length === 0) return;
        const rect = svg.getBoundingClientRect();
        if (rect.width === 0) return;

        const svgX = ((evt.clientX - rect.left) / rect.width) * width;

        let nearestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < evalHistory.length; i++) {
            const px = xScale(i);
            const dist = Math.abs(svgX - px);
            if (dist < minDist) {
                minDist = dist;
                nearestIdx = i;
            }
        }

        const item = evalHistory[nearestIdx];
        const px = xScale(nearestIdx);
        const py = yScale(scores[nearestIdx]);

        hoverGroup.style.display = 'block';
        hoverLine.setAttribute('x1', px.toFixed(1));
        hoverLine.setAttribute('x2', px.toFixed(1));
        hoverDot.setAttribute('cx', px.toFixed(1));
        hoverDot.setAttribute('cy', py.toFixed(1));
        hoverHalo.setAttribute('cx', px.toFixed(1));
        hoverHalo.setAttribute('cy', py.toFixed(1));

        tooltip.innerHTML = buildEvalTooltipHtml(item, nearestIdx, getSanForMove);

        const containerRect = container.getBoundingClientRect();
        const clientX = (px / width) * rect.width + rect.left;
        const clientY = (py / height) * rect.height + rect.top;
        const tooltipLeft = clientX - containerRect.left;
        const tooltipTop = clientY - containerRect.top;

        const isNearTop = (py / height) < 0.40;
        const isNearLeft = (px / width) < 0.20;
        const isNearRight = (px / width) > 0.80;

        let transX = '-50%';
        if (isNearLeft) transX = '0%';
        else if (isNearRight) transX = '-100%';

        let transY = isNearTop ? '15px' : '-115%';

        tooltip.style.left = `${tooltipLeft}px`;
        tooltip.style.top = `${tooltipTop}px`;
        tooltip.style.transform = `translate(${transX}, ${transY})`;
        tooltip.style.display = 'block';
    };

    svg.onmouseleave = () => {
        hoverGroup.style.display = 'none';
        tooltip.style.display = 'none';
    };
}