// End-of-session summary, achievements, and hero style radar

function shouldShowSessionSummary() {
  return Boolean(human() && human().stack <= 0 && state.handOver && !state.sessionEnded);
}

function maybeShowSessionSummary() {
  if (!shouldShowSessionSummary()) return false;
  state.sessionEnded = true;
  clearAutoNewHandTimer();
  renderSessionSummary();
  return true;
}

function closeSessionSummaryAndRestart() {
  if (els.sessionSummaryOverlay) els.sessionSummaryOverlay.hidden = true;
  resetGameSession();
  startHand();
}

function renderSessionSummary() {
  if (!els.sessionSummaryOverlay || !els.sessionSummaryContent) return;
  const stats = state.heroStyle || createHeroStyleStats();
  const profile = heroStyleProfile();
  const actionRatios = heroStyleRatios();
  const styleMetrics = heroStyleShapeMetrics(stats);
  const achievements = buildHeroAchievements(stats, profile);
  const analysis = buildHeroAnalysis(stats, profile);
  const totalActions = Math.max(1, (stats.calls || 0) + (stats.raises || 0) + (stats.folds || 0) + (stats.allIns || 0) + (stats.checks || 0));
  const vpipRate = Math.round(((stats.vpip || 0) / Math.max(1, stats.hands || 0)) * 100);
  const sampleNote = stats.hands < 5
    ? `<span class="session-sample-note">樣本偏少：至少 5 手後，風格輪廓會比較準。</span>`
    : "";

  els.sessionSummaryContent.innerHTML = `
    <section class="session-hero">
      <div>
        <p class="eyebrow">Session Report</p>
        <h2>本輪結算</h2>
        <span>Owl 籌碼歸零，這場先收工。看完重點後會重新從第 1 局開始。</span>
        ${sampleNote}
      </div>
      <div class="session-hero-stats">
        ${renderKeyStat("完成", stats.hands, "手")}
        ${renderKeyStat("入池率", vpipRate, "%")}
        ${renderKeyStat("最大底池", stats.biggestPot || 0, "")}
      </div>
    </section>

    <section class="session-grid">
      <div class="session-card session-radar-card">
        <h3>七邊形風格輪廓</h3>
        ${renderHeroRadar(styleMetrics)}
      </div>

      <div class="session-card session-chart-card">
        <h3>行為統整圖表</h3>
        ${renderSessionActionChart(actionRatios, stats)}
      </div>

      <div class="session-card session-review-card">
        <div>
          <h3>技術分析</h3>
          <div class="analysis-list">
            ${analysis.map(item => `<p>${escapeHtml(item)}</p>`).join("")}
          </div>
        </div>
        <div>
          <h3>本輪成就</h3>
          <div class="achievement-list">
            ${achievements.map(item => `
              <span class="achievement-pill">
                <strong>${escapeHtml(item.title)}</strong>
                <em>${escapeHtml(item.detail)}</em>
              </span>
            `).join("")}
          </div>
        </div>
        <div class="session-action-count">本輪記錄 ${totalActions} 次操作</div>
      </div>
    </section>

    <button class="session-restart-button" type="button" data-session-restart>回到第 1 局</button>
  `;

  els.sessionSummaryOverlay.hidden = false;
}

function renderHeroRadar(ratios) {
  const center = 116;
  const radius = 78;
  const outer = radarPoints(ratios.map(() => 100), center, radius);
  const inner = radarPoints(ratios.map(metric => metric.value), center, radius);
  const rings = [0.35, 0.68, 1].map(scale => `
    <polygon points="${radarPoints(ratios.map(() => scale * 100), center, radius)}" />
  `).join("");
  const labels = ratios.map((metric, index) => {
    const angle = -Math.PI / 2 + index * ((Math.PI * 2) / ratios.length);
    const x = center + Math.cos(angle) * (radius + 25);
    const y = center + Math.sin(angle) * (radius + 25);
    return `
      <text x="${x.toFixed(1)}" y="${y.toFixed(1)}">
        <tspan x="${x.toFixed(1)}" dy="-0.35em">${escapeHtml(metric.label)}</tspan>
        <tspan x="${x.toFixed(1)}" dy="1.25em">${metric.value}</tspan>
      </text>
    `;
  }).join("");

  return `
    <div class="style-radar-wrap">
      <svg class="style-radar" viewBox="0 0 232 232" role="img" aria-label="玩家七邊形風格圖">
        <g class="radar-rings">${rings}</g>
        <g class="radar-spokes">${renderRadarSpokes(ratios.length, center, radius)}</g>
        <polygon class="radar-outline" points="${outer}" />
        <polygon class="radar-shape" points="${inner}" />
        <g class="radar-labels">${labels}</g>
      </svg>
    </div>
  `;
}

function renderRadarSpokes(count, center, radius) {
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * ((Math.PI * 2) / count);
    const x = center + Math.cos(angle) * radius;
    const y = center + Math.sin(angle) * radius;
    return `<line x1="${center}" y1="${center}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />`;
  }).join("");
}

function radarPoints(values, center, radius) {
  const count = values.length;
  return values.map((value, index) => {
    const angle = -Math.PI / 2 + index * ((Math.PI * 2) / count);
    const distance = radius * Math.max(0, Math.min(1, value / 100));
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function renderSessionActionChart(ratios, stats) {
  const chartItems = ratios.map(metric => {
    const value = clampPercentage(metric.value);
    return `
      <div class="session-chart-row" data-metric="${escapeHtml(metric.key)}">
        <span class="chart-label">${escapeHtml(metric.label)}</span>
        <span class="chart-track"><i style="width: ${value}%"></i></span>
        <strong>${value}%</strong>
      </div>
    `;
  }).join("");

  return `
    <div class="session-chart">
      ${chartItems}
    </div>
    <div class="session-key-stats">
      ${renderKeyStat("完成", stats.hands, "手")}
      ${renderKeyStat("最高籌碼", stats.maxStack || 0, "")}
      ${renderKeyStat("最大底池", stats.biggestPot || 0, "")}
      ${renderKeyStat("最大收池", stats.bestWin || 0, "")}
    </div>
  `;
}

function heroStyleShapeMetrics(stats) {
  const hands = Math.max(1, stats.hands || 0);
  const vpip = (stats.vpip / hands) * 100;
  const raise = (stats.raises / hands) * 100;
  const call = (stats.calls / hands) * 100;
  const fold = (stats.folds / hands) * 100;
  const allIn = (stats.allIns / hands) * 100;
  const showdown = (stats.showdowns / hands) * 100;
  const win = (stats.wins / hands) * 100;

  return [
    { key: "patience", label: "耐心", value: styleScore(fold * 1.1 + (100 - vpip) * 0.45) },
    { key: "pressure", label: "壓迫", value: styleScore(raise * 1.45 + allIn * 0.8) },
    { key: "curiosity", label: "好奇", value: styleScore(call * 1.15 + vpip * 0.45) },
    { key: "courage", label: "膽量", value: styleScore(allIn * 2.2 + showdown * 0.45) },
    { key: "control", label: "控池", value: styleScore((100 - allIn) * 0.5 + (100 - raise) * 0.25 + fold * 0.25) },
    { key: "showdown", label: "攤牌", value: styleScore(showdown * 1.45 + call * 0.35) },
    { key: "harvest", label: "收割", value: styleScore(win * 1.35 + Math.min(100, (stats.bestWin || 0) / Math.max(1, currentBuyIn()) * 65)) },
  ];
}

function styleScore(value) {
  return Math.round(Math.max(8, Math.min(100, value || 0)));
}

function renderKeyStat(label, value, suffix) {
  return `
    <span>
      <em>${escapeHtml(label)}</em>
      <strong>${value}${escapeHtml(suffix)}</strong>
    </span>
  `;
}

function clampPercentage(value) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function buildHeroAchievements(stats, profile) {
  const achievements = [
    { title: "完成桌局", detail: `打完 ${stats.hands} 手` },
  ];
  if (stats.wins > 0) achievements.push({ title: "有收底池", detail: `贏下 ${stats.wins} 手` });
  if (stats.allIns > 0) achievements.push({ title: "敢推到底", detail: `All-in ${stats.allIns} 次` });
  if ((stats.biggestPot || 0) >= currentBuyIn()) achievements.push({ title: "大底池參與", detail: `最大底池 ${stats.biggestPot}` });
  if (profile.label === "謹慎型" || profile.label === "穩健型") achievements.push({ title: "冷靜收手", detail: "沒有一直硬跟" });
  if (profile.label === "激進型") achievements.push({ title: "主動施壓", detail: "加注頻率很高" });
  if (achievements.length < 4) achievements.push({ title: "資料建立中", detail: "多打幾輪會更準" });
  return achievements.slice(0, 5);
}

function buildHeroAnalysis(stats, profile) {
  const hands = Math.max(1, stats.hands || 0);
  const vpip = Math.round((stats.vpip / hands) * 100);
  const raiseRate = Math.round((stats.raises / hands) * 100);
  const foldRate = Math.round((stats.folds / hands) * 100);
  const lines = [
    stats.hands < 5
      ? `目前只打了 ${stats.hands} 手，先看行為傾向，不急著定型。入池率 ${vpip}%、加注率 ${raiseRate}%、棄牌率 ${foldRate}%。`
      : `目前風格偏「${profile.label}」。入池率 ${vpip}%、加注率 ${raiseRate}%、棄牌率 ${foldRate}%。`,
  ];

  if (stats.allIns >= Math.max(2, Math.ceil(hands * 0.25))) {
    lines.push("All-in 次數偏多，容易讓一兩手牌決定整場。可以多用 1/2 Pot 或 Pot 下注測試對手。");
  } else if (raiseRate < 18 && vpip > 42) {
    lines.push("跟注多、加注少，容易被激進 AI 控制底池。好牌可以更主動一點。");
  } else if (foldRate > 48) {
    lines.push("收手很快是優點，但盲注升級後可以挑位置偷一些小底池。");
  } else {
    lines.push("整體節奏算穩，下一輪可以注意位置：BTN/CO 可打寬，UTG 盡量保守。");
  }

  if ((stats.bestWin || 0) > 0) {
    lines.push(`最大單次收池 ${stats.bestWin}，代表你有能力在好牌時累積價值。`);
  } else {
    lines.push("這輪沒有明顯大收池，先降低跟注成本，等強牌再把底池做大。");
  }

  if (stats.wins > 0 && stats.showdowns > 0) {
    lines.push("下輪目標：贏牌時多想一層下注尺寸，別只求攤牌，試著把強牌價值拿滿。");
  } else {
    lines.push("下輪目標：先把入池成本壓低，少用情緒跟注，等位置和牌力都舒服再進攻。");
  }

  return lines;
}
