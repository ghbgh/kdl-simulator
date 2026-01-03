/* KDL Turn-based Campaign Simulator (no frameworks) */

const STORAGE_KEY = "kdl-sim-v1";
const HISTORY_KEY = "kdl-sim-history-v1";
const TAB_KEY = "kdl-sim-active-tab";
const MAX_HISTORY = 50;

const ENEMIES = {
  R: { rarity: "R", hp: 50, progress: 5, color: "#22c55e" },
  SR: { rarity: "SR", hp: 90, progress: 10, color: "#3ea0ff" },
  SSR: { rarity: "SSR", hp: 140, progress: 15, color: "#a855f7" },
  UR: { rarity: "UR", hp: 200, progress: 20, color: "#f59e0b" },
};

const RARITY_INDEX = { R: 1, SR: 2, SSR: 3, UR: 4 };

const ENEMY_ABILITIES = {
  tough: { key: "tough", name: "坚韧", desc: "受到的伤害降低 1 点" },
  regen: { key: "regen", name: "再生", desc: "每轮恢复 2 点生命值" },
  drain: { key: "drain", name: "汲取", desc: "每轮削减参战妖精兵 0.5 魔力" },
  giant: { key: "giant", name: "巨型", desc: "生命值提高 30%" },
};

const ENEMY_ABILITIES_C2 = {
  hard: { key: "hard", name: "坚硬", desc: "只会受到来自主攻妖精兵的伤害" },
  spore: { key: "spore", name: "孢子", desc: "死亡时生成的第六兽将额外获得一项能力" },
  lastWord: { key: "lastWord", name: "亡语", desc: "死亡时削减主攻妖精兵10%魔力" },
  stun: { key: "stun", name: "震慑", desc: "本次战斗结束，待机妖精兵无法恢复魔力" },
  none: { key: "none", name: "无", desc: "无额外能力" },
};

function formatNumber(n, digits = 1) {
  if (!Number.isFinite(n)) return "-";
  const rounded = Number(n.toFixed(digits));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

const ROLE = {
  MAIN: "main",
  ASSIST: "assist",
  STANDBY: "standby",
};

const ROLE_NAME = {
  main: "主攻",
  assist: "协同",
  standby: "待机",
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function getDefaultState() {
  return {
    c1: {
      id: "c1",
      name: "战役一",
      progress: 0,
      erosion: 0,
      selectedEnemy: "R",
      enemyAbilities: { R: "tough", SR: "tough", SSR: "tough", UR: "tough" },
      team: [
        { id: "c1-m1", name: "珂朵莉", color: "blue", mana: 100, role: ROLE.MAIN },
        { id: "c1-m2", name: "奈芙莲", color: "white", mana: 100, role: ROLE.ASSIST },
        { id: "c1-m3", name: "艾瑟雅", color: "yellow", mana: 100, role: ROLE.ASSIST },
      ],
      log: [],
    },
    c2: {
      id: "c2",
      name: "战役二",
      progress: 0,
      erosion: 0,
      selectedEnemy: "SR",
      enemyAbilities: { SR: ["hard"], SSR: ["hard"], UR: ["hard"] },
      lastTarget: "",
      team: [
        { id: "c2-m1", name: "奈芙莲", color: "white", mana: 100, role: ROLE.MAIN },
        { id: "c2-m2", name: "兰朵露可", color: "blue", mana: 100, role: ROLE.ASSIST },
        { id: "c2-m3", name: "诺夫特", color: "red", mana: 100, role: ROLE.ASSIST },
      ],
      log: [],
    },
  };
}

function applyCanonicalTeamMeta(state) {
  const canonical = {
    c1: {
      "c1-m1": { name: "珂朵莉", color: "blue" },
      "c1-m2": { name: "奈芙莲", color: "white" },
      "c1-m3": { name: "艾瑟雅", color: "yellow" },
    },
    c2: {
      "c2-m1": { name: "奈芙莲", color: "white" },
      "c2-m2": { name: "兰朵露可", color: "blue" },
      "c2-m3": { name: "诺夫特", color: "red" },
    },
  };

  for (const cid of ["c1", "c2"]) {
    const map = canonical[cid];
    const c = state[cid];
    if (!c?.team) continue;
    for (const m of c.team) {
      const meta = map[m.id];
      if (!meta) continue;
      m.name = meta.name;
      m.color = meta.color;
    }
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();
    const parsed = JSON.parse(raw);
    const fallback = getDefaultState();
    // Shallow merge to keep forward-compatible defaults.
    const state = {
      c1: { ...fallback.c1, ...(parsed.c1 ?? {}) },
      c2: { ...fallback.c2, ...(parsed.c2 ?? {}) },
    };
    ensureCampaign1EnemyAbilities(state.c1);
    ensureCampaign2EnemyAbilities(state.c2);
    return state;
  } catch {
    return getDefaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function pushHistory(state) {
  const history = loadHistory();
  // Only save relevant data for undo: mana, erosion, progress, lastTarget
  const snapshot = {
    c1: {
      progress: state.c1.progress,
      erosion: state.c1.erosion,
      team: state.c1.team.map(m => ({ id: m.id, mana: m.mana }))
    },
    c2: {
      progress: state.c2.progress,
      erosion: state.c2.erosion,
      lastTarget: state.c2.lastTarget,
      team: state.c2.team.map(m => ({ id: m.id, mana: m.mana }))
    }
  };
  history.push(snapshot);
  if (history.length > MAX_HISTORY) history.shift();
  saveHistory(history);
}

function popHistory() {
  const history = loadHistory();
  if (history.length === 0) return null;
  const snapshot = history.pop();
  saveHistory(history);
  return snapshot;
}

function canUndo() {
  return loadHistory().length > 0;
}

function formatSummary(campaign) {
  return `完成度 ${formatNumber(campaign.progress, 0)}/100 · 侵蚀 ${formatNumber(campaign.erosion, 1)} · 总魔力 ${formatNumber(campaign.team.reduce((a, m) => a + m.mana, 0), 1)}`;
}

function roleLabel(role) {
  if (role === ROLE.MAIN) return "主攻";
  if (role === ROLE.ASSIST) return "协同";
  return "待机";
}

function dotClass(color) {
  return {
    blue: "dot dot--blue",
    white: "dot dot--white",
    yellow: "dot dot--yellow",
    red: "dot dot--red",
  }[color] ?? "dot";
}

function ensureExactlyOneMain(campaign, preferredMemberId) {
  const active = campaign.team.filter((m) => m.role !== ROLE.STANDBY);
  // If nobody active, allow (battle will be blocked) and don't auto-change.
  if (active.length === 0) return;

  const mains = active.filter((m) => m.role === ROLE.MAIN);
  if (mains.length === 1) return;

  // If multiple mains, keep the last-changed as MAIN, others -> ASSIST.
  if (mains.length > 1) {
    for (const m of mains) {
      if (m.id !== preferredMemberId) m.role = ROLE.ASSIST;
    }
    return;
  }

  // If none MAIN, do nothing (UI/模拟会提示用户设置 1 名主攻)。
}

function roleToSliderValue(role) {
  if (role === ROLE.STANDBY) return 0;
  if (role === ROLE.ASSIST) return 1;
  return 2;
}

function sliderValueToRole(v) {
  if (v <= 0) return ROLE.STANDBY;
  if (v === 1) return ROLE.ASSIST;
  return ROLE.MAIN;
}

function renderTeam(campaignId, state) {
  const campaign = state[campaignId];
  const container = document.getElementById(`${campaignId}Team`);
  container.innerHTML = "";

  for (const member of campaign.team) {
    const el = document.createElement("div");
    el.className = "member";

    const skills = getMemberSkills(member.name);
    const isMainActive = member.role === ROLE.MAIN;
    const isAssistActive = member.role === ROLE.ASSIST;

    // Check if enemy selected for prediction display
    const hasEnemySelected = campaign.selectedEnemy != null;
    let predictedMana = member.mana;
    if (hasEnemySelected) {
      const est = estimateBattle(campaign, campaign.selectedEnemy);
      const pred = est.perMember.find(p => p.id === member.id);
      if (pred) predictedMana = pred.afterMana;
    }

    el.innerHTML = `
      <div>
        <div class="member__top">
          <div class="member__name">
            <span class="${dotClass(member.color)}" aria-hidden="true"></span>
            <span>${member.name}</span>
          </div>
          <div class="mana-bar" aria-label="${member.name}魔力">
            <div class="mana-bar__track">
              ${hasEnemySelected ? `
              <div class="mana-bar__fill mana-bar__fill--current" style="width:${clamp(member.mana, 0, 100)}%"></div>
              <div class="mana-bar__fill mana-bar__fill--predicted" style="width:${clamp(predictedMana, 0, 100)}%"></div>
              ` : `
              <div class="mana-bar__fill" style="width:${clamp(member.mana, 0, 100)}%"></div>
              `}
            </div>
            <div class="mana-bar__text">${formatNumber(member.mana, 1)}/100${hasEnemySelected ? ` → ${formatNumber(predictedMana, 1)}/100` : ''}</div>
          </div>
          <div class="kv"><span>状态：<b>${roleLabel(member.role)}</b></span></div>
        </div>
        <div class="kv" style="margin-top:8px">
          <span>每轮消耗：<b>${member.role === ROLE.MAIN ? 2 : member.role === ROLE.ASSIST ? 1 : 0}</b></span>
          <span>每轮伤害：<b>${member.role === ROLE.STANDBY ? 0 : 2}</b></span>
        </div>

        <div class="skills" aria-label="${member.name}技能">
          <div class="skill ${isMainActive ? "skill--active" : ""}"><b>主攻</b>：${skills.main}</div>
          <div class="skill ${isAssistActive ? "skill--active" : ""}"><b>协同</b>：${skills.assist}</div>
        </div>
      </div>

      <div class="member__controls">
        <div class="role-slider" aria-label="设置${member.name}状态">
          <div class="role-slider__wrap" data-role-slider-wrap="${member.id}">
            <input
              class="role-slider__range"
              type="range"
              min="0"
              max="2"
              step="1"
              value="${roleToSliderValue(member.role)}"
              data-member-role-slider="${member.id}"
              aria-label="${member.name} 状态滑块"
            />
          </div>
          <div class="role-slider__labels" aria-hidden="true">
            <span>待机</span><span>协同</span><span>主攻</span>
          </div>
        </div>
        <input type="number" min="0" max="100" step="1" value="${Number.isFinite(member.mana) ? Number(member.mana.toFixed(1)) : 0}" data-member-mana="${member.id}" aria-label="设置${member.name}魔力" />
        ${
          campaignId === "c2" && member.name === "兰朵露可"
            ? `
        <select data-last-target="${member.id}" aria-label="上一次对战目标" style="margin-top:8px">
          <option value="" ${!campaign.lastTarget ? "selected" : ""}>上次对战：无</option>
          <option value="SR" ${campaign.lastTarget === "SR" ? "selected" : ""}>上次对战：SR</option>
          <option value="SSR" ${campaign.lastTarget === "SSR" ? "selected" : ""}>上次对战：SSR</option>
          <option value="UR" ${campaign.lastTarget === "UR" ? "selected" : ""}>上次对战：UR</option>
        </select>`
            : ""
        }
      </div>
    `;

    container.appendChild(el);
  }

  container.querySelectorAll("input[data-member-role-slider]").forEach((inp) => {
    const memberId = inp.getAttribute("data-member-role-slider");
    const wrap = container.querySelector(`[data-role-slider-wrap="${memberId}"]`);

    const apply = () => {
      const member = campaign.team.find((m) => m.id === memberId);
      if (!member) return;

      const v = Number(inp.value);
      const nextRole = sliderValueToRole(Number.isFinite(v) ? v : 1);
      const prevRole = member.role;

      member.role = nextRole;

      // When someone becomes MAIN, demote old MAIN -> ASSIST.
      if (nextRole === ROLE.MAIN && prevRole !== ROLE.MAIN) {
        for (const other of campaign.team) {
          if (other.id !== member.id && other.role === ROLE.MAIN) other.role = ROLE.ASSIST;
        }
      }

      ensureExactlyOneMain(campaign, memberId);
      saveState(state);
      renderAll(state);
    };

    // Native drag is inconsistent on some browsers; implement pointer drag on the whole control.
    const setFromClientX = (clientX) => {
      const rect = (wrap ?? inp).getBoundingClientRect();
      const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
      const min = Number(inp.min ?? 0);
      const max = Number(inp.max ?? 2);
      const raw = min + ratio * (max - min);
      const stepped = Math.round(clamp(raw, min, max));
      inp.value = String(stepped);
      apply();
    };

    const target = wrap ?? inp;
    target.addEventListener("pointerdown", (e) => {
      target.setPointerCapture(e.pointerId);
      e.preventDefault();
      setFromClientX(e.clientX);
    });
    target.addEventListener("pointermove", (e) => {
      if (!target.hasPointerCapture(e.pointerId)) return;
      e.preventDefault();
      setFromClientX(e.clientX);
    });
    target.addEventListener("pointerup", (e) => {
      if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    });

    inp.addEventListener("input", apply);
    inp.addEventListener("change", apply);
  });

  container.querySelectorAll("input[data-member-mana]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const memberId = inp.getAttribute("data-member-mana");
      const member = campaign.team.find((m) => m.id === memberId);
      if (!member) return;
      const v = Number(inp.value);
      member.mana = clamp(Number.isFinite(v) ? v : 0, 0, 100);
      saveState(state);
      renderAll(state);
    });
  });

  container.querySelectorAll("select[data-last-target]").forEach((sel) => {
    sel.addEventListener("change", () => {
      ensureCampaign2EnemyAbilities(campaign);
      campaign.lastTarget = sel.value;
      saveState(state);
      renderAll(state);
    });
  });
}

function getAllowedEnemies(campaignId) {
  return campaignId === "c2" ? ["SR", "SSR", "UR"] : ["R", "SR", "SSR", "UR"];
}

function getMemberSkills(name) {
  if (name === "珂朵莉") {
    return {
      main: "战斗开始时，立即造成 10 + 敌兽稀有度×20 点伤害",
      assist: "提高 1 点其他妖精兵造成的伤害",
    };
  }
  if (name === "奈芙莲") {
    return {
      main: "全体妖精兵魔力消耗降低 40%",
      assist: "消耗 6 + 敌兽稀有度×2 的魔力，封印敌兽所有能力",
    };
  }
  if (name === "艾瑟雅") {
    return {
      main: "每轮造成 2% 敌兽最大生命值伤害",
      assist: "鼓舞主攻妖精兵：其伤害 +1（不叠加），透支魔力增加的侵蚀度减半",
    };
  }
  if (name === "兰朵露可") {
    return {
      main: "连续与同稀有度敌兽作战时，造成伤害+2，魔力消耗降低20%",
      assist: "不再主动攻击，其他妖精兵造成伤害时，自身进行追击，造成该伤害40%的伤害",
    };
  }
  if (name === "诺夫特") {
    return {
      main: "单兵作战时（一人主攻，其他人待机），造成伤害+敌兽稀有度×1",
      assist: "每轮附加敌兽已损失生命值×2%的伤害",
    };
  }
  return { main: "（后续添加）", assist: "（后续添加）" };
}

function ensureCampaign1EnemyAbilities(campaign) {
  if (!campaign) return;
  if (!campaign.enemyAbilities || typeof campaign.enemyAbilities !== "object") {
    campaign.enemyAbilities = {};
  }

  const migratedFallback = ENEMY_ABILITIES[campaign.enemyAbility] ? campaign.enemyAbility : "tough";
  for (const enemyKey of Object.keys(ENEMIES)) {
    const v = campaign.enemyAbilities[enemyKey];
    campaign.enemyAbilities[enemyKey] = ENEMY_ABILITIES[v] ? v : migratedFallback;
  }

  if ("enemyAbility" in campaign) delete campaign.enemyAbility;
}

function ensureCampaign2EnemyAbilities(campaign) {
  if (!campaign) return;
  if (!campaign.enemyAbilities || typeof campaign.enemyAbilities !== "object") {
    campaign.enemyAbilities = {};
  }

  const allowed = ["SR", "SSR", "UR"];
  for (const enemyKey of allowed) {
    if (!Array.isArray(campaign.enemyAbilities[enemyKey])) {
      campaign.enemyAbilities[enemyKey] = ["hard"];
    }
    campaign.enemyAbilities[enemyKey] = campaign.enemyAbilities[enemyKey]
      .filter((k) => ENEMY_ABILITIES_C2[k])
      .slice(0, 2);
    if (campaign.enemyAbilities[enemyKey].length === 0) {
      campaign.enemyAbilities[enemyKey] = ["hard"];
    }
  }

  if (!campaign.lastTarget || !allowed.includes(campaign.lastTarget)) {
    campaign.lastTarget = "SR";
  }
}

function getCampaign1AbilityKey(campaign, enemyKey) {
  ensureCampaign1EnemyAbilities(campaign);
  const key = campaign?.enemyAbilities?.[enemyKey];
  return ENEMY_ABILITIES[key] ? key : "tough";
}

function effectiveEnemyMaxHp(enemyKey, abilityKey, sealed) {
  const base = ENEMIES[enemyKey]?.hp ?? 0;
  if (sealed) return base;
  if (abilityKey === "giant") return base * 1.3;
  return base;
}

function computeBattleModifiers(campaign, enemyKey, abilityKey, campaignId) {
  const rarityIdx = RARITY_INDEX[enemyKey] ?? 1;

  const main = campaign.team.find((m) => m.role === ROLE.MAIN) ?? null;
  const chtholly = campaign.team.find((m) => m.name === "珂朵莉") ?? null;
  const nephr = campaign.team.find((m) => m.name === "奈芙莲") ?? null;
  const aesya = campaign.team.find((m) => m.name === "艾瑟雅") ?? null;
  const lantoluque = campaign.team.find((m) => m.name === "兰朵露可") ?? null;
  const novte = campaign.team.find((m) => m.name === "诺夫特") ?? null;

  const hasChthollyAssist = Boolean(chtholly && chtholly.role === ROLE.ASSIST);
  const hasAesyaAssist = Boolean(aesya && aesya.role === ROLE.ASSIST);
  const hasLantoluqueAssist = Boolean(lantoluque && lantoluque.role === ROLE.ASSIST);
  const hasNovteAssist = Boolean(novte && novte.role === ROLE.ASSIST);
  const sealed = Boolean(nephr && nephr.role === ROLE.ASSIST);

  const resolvedAbilityKey = campaignId === "c1" && !sealed ? abilityKey : null;
  const maxHp = effectiveEnemyMaxHp(enemyKey, resolvedAbilityKey, sealed);

  let costMultiplier = main?.name === "奈芙莲" ? 0.6 : 1;
  

  // Campaign 2 enemy abilities
  let c2Abilities = [];
  if (campaignId === "c2") {
    ensureCampaign2EnemyAbilities(campaign);
    c2Abilities = campaign.enemyAbilities[enemyKey] || [];
  }

  const hasDrain = campaignId === "c2" ? c2Abilities.includes("drain") : false;
  const hasLastWord = campaignId === "c2" ? c2Abilities.includes("lastWord") : false;
  const hasHard = campaignId === "c2" ? c2Abilities.includes("hard") : false;
  const hasStun = campaignId === "c2" ? c2Abilities.includes("stun") : false;

  return {
    rarityIdx,
    main,
    chtholly,
    lantoluque,
    novte,
    hasChthollyAssist,
    hasAesyaAssist,
    hasLantoluqueAssist,
    hasNovteAssist,
    sealed,
    abilityKey: resolvedAbilityKey,
    maxHp,
    costMultiplier,
    hasDrain,
    hasLastWord,
    hasHard,
    hasStun,
  };
}

function getBattleReadiness(campaign) {
  const active = campaign.team.filter((m) => m.role !== ROLE.STANDBY);
  if (active.length === 0) {
    return { ok: false, reason: "请至少设置 1 人参战（协同或主攻）。" };
  }
  const mainCount = active.filter((m) => m.role === ROLE.MAIN).length;
  if (mainCount !== 1) {
    return { ok: false, reason: "需要设置且仅设置 1 名主攻成员。" };
  }
  return { ok: true, reason: "点击页签选择敌人" };
}

function renderEnemies(campaignId, state) {
  const campaign = state[campaignId];
  const container = document.getElementById(`${campaignId}Enemies`);
  const hintEl = document.getElementById(`${campaignId}Hint`);
  const allowed = getAllowedEnemies(campaignId);

  if (!allowed.includes(campaign.selectedEnemy)) {
    campaign.selectedEnemy = allowed[0];
  }

  const readiness = getBattleReadiness(campaign);
  if (hintEl) {
    hintEl.textContent = readiness.reason;
  }

  container.innerHTML = "";
  for (const key of allowed) {
    const e = ENEMIES[key];

    const selectedAbilityKey = campaignId === "c1" ? getCampaign1AbilityKey(campaign, key) : null;
    const mods = computeBattleModifiers(campaign, key, selectedAbilityKey, campaignId);
    const effectiveHp = mods.maxHp;


    let perMember = null;
    let avgCostText = "";
    if (readiness.ok) {
      const est = estimateBattle(campaign, key);
      perMember = est.perMember;

      if (est.forcedStop) {
        avgCostText = "已中止（单人侵蚀>200）";
      } else {
        // Net cost: active members use spent + erosion; standby shows recovery as negative.
        const netCost = campaign.team.reduce((sum, m) => {
          const rec = perMember.find((x) => x.id === m.id);
          if (m.role === ROLE.STANDBY) {
            const recovered = rec.afterMana - m.mana;
            return sum - recovered;
          }
          return sum + (rec?.spent ?? 0) + (rec?.erosion ?? 0);
        }, 0);

        const avg = e.progress > 0 ? netCost / e.progress : NaN;
        avgCostText = `进度均耗 ${Number.isFinite(avg) ? avg.toFixed(2) : "-"}`;
      }
    }

    const costsHtml =
      campaign.team
        .map((m) => {
          if (!perMember) return `<div class="enemy-cost">—</div>`;

          const rec = perMember.find((x) => x.id === m.id);
          // Standby: show mana recovery as negative number (or 0 if stun active in c2)
          if (m.role === ROLE.STANDBY) {
            let recovered = rec.afterMana - m.mana;
            
            return `<div class="enemy-cost">-${formatNumber(recovered, 1)}</div>`;
          }

          const spent = rec?.spent ?? 0;
          const erosion = rec?.erosion ?? 0;
          return `<div class="enemy-cost">${formatNumber(spent, 1)}${erosion > 0 ? `<small>(+${formatNumber(erosion, 1)})</small>` : ""}</div>`;
        })
        .join("") +
      `<div class="enemy-cost enemy-cost--avg">${perMember ? avgCostText : ""}</div>`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `enemy-btn rarity--${e.rarity} ${campaign.selectedEnemy === key ? "enemy-btn--active" : ""} ${campaignId === "c1" || campaignId === "c2" ? "enemy-btn--has-select" : ""}`;
    btn.setAttribute("data-enemy", key);

    btn.innerHTML = `
      <div class="enemy-btn__row">
        <div>
          <div class="enemy-btn__top">
            <span class="enemy-btn__rarity">${e.rarity}</span>
            <span class="pill pill--ghost" style="border-color:rgba(255,255,255,.12)">+${e.progress}</span>
          </div>
          <div class="enemy-btn__meta">
            HP ${formatNumber(effectiveHp, 1)} · 完成度 +${e.progress}
          </div>
        </div>
        <div class="enemy-btn__costs" aria-label="三人耗魔（括号为侵蚀）">
          ${costsHtml}
        </div>
      </div>
    `;

    btn.addEventListener("click", () => {
      campaign.selectedEnemy = key;
      saveState(state);
      renderAll(state);
    });

    const tile = document.createElement("div");
    tile.className = "enemy-tile";
    tile.appendChild(btn);

    if (campaignId === "c1") {
      const sel = document.createElement("select");
      sel.className = `enemy-ability-select ${mods.sealed ? "enemy-ability-select--sealed" : ""}`;
      sel.id = `c1-ability-${key}`;
      sel.name = `c1-ability-${key}`;
      sel.setAttribute("data-enemy-ability", key);
      sel.setAttribute("aria-label", `${e.rarity} 敌兽能力`);

      for (const k of Object.keys(ENEMY_ABILITIES)) {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = ENEMY_ABILITIES[k].name;
        sel.appendChild(opt);
      }
      sel.value = selectedAbilityKey;
      sel.setAttribute("data-selected-ability", selectedAbilityKey);

      sel.addEventListener("change", () => {
        ensureCampaign1EnemyAbilities(campaign);
        campaign.enemyAbilities[key] = sel.value;
        sel.setAttribute("data-selected-ability", sel.value);
        saveState(state);
        renderAll(state);
      });

      tile.appendChild(sel);
    } else if (campaignId === "c2") {
      ensureCampaign2EnemyAbilities(campaign);
      const abilities = campaign.enemyAbilities[key] || [];
      
      // Check if Nephren is in assist mode (seals abilities)
      const nephren = campaign.team.find((m) => m.name === "奈芙莲");
      const isSealed = nephren && nephren.role === ROLE.ASSIST;

      const selectsWrap = document.createElement("div");
      selectsWrap.className = "enemy-ability-selects";

      [0, 1].forEach((idx) => {
        const sel = document.createElement("select");
        sel.className = isSealed ? "enemy-ability-select--sealed" : "";
        sel.id = `c2-ability-${key}-${idx}`;
        sel.name = `c2-ability-${key}-${idx}`;
        sel.setAttribute("data-c2-ability-idx", String(idx));
        sel.setAttribute("data-c2-ability-key", key);
        sel.setAttribute("aria-label", `${e.rarity} 敌兽能力 ${idx + 1}`);

        for (const k of Object.keys(ENEMY_ABILITIES_C2)) {
          const opt = document.createElement("option");
          opt.value = k;
          opt.textContent = ENEMY_ABILITIES_C2[k].name;
          sel.appendChild(opt);
        }
        sel.value = abilities[idx] || "none";
        sel.setAttribute("data-selected-ability", abilities[idx] || "none");

        sel.addEventListener("change", () => {
          ensureCampaign2EnemyAbilities(campaign);
          const arr = [...campaign.enemyAbilities[key]];
          if (sel.value === "none") {
            if (idx === 0 && arr.length > 0) {
              arr.splice(0, 1);
            } else if (idx === 1 && arr.length > 1) {
              arr.splice(1, 1);
            }
          } else {
            if (idx === 0) {
              arr[0] = sel.value;
            } else if (idx === 1) {
              if (arr.length === 0) arr[0] = "hard";
              arr[1] = sel.value;
            }
          }
          campaign.enemyAbilities[key] = arr.filter(Boolean).slice(0, 2);
          if (campaign.enemyAbilities[key].length === 0) {
            campaign.enemyAbilities[key] = ["hard"];
          }
          sel.setAttribute("data-selected-ability", sel.value);
          saveState(state);
          renderAll(state);
        });

        selectsWrap.appendChild(sel);
      });

      tile.appendChild(selectsWrap);
    }

    container.appendChild(tile);
  }
}

// Core battle execution function - used by both estimateBattle and simulateBattle
function _executeBattleCore(campaignData, enemyKey, mutateState) {
  const enemy = ENEMIES[enemyKey];
  if (!enemy) throw new Error("Invalid enemy");

  const campaignId = campaignData.id;
  
  // Unified logic for both campaigns
  const abilityKey = campaignId === "c1" ? getCampaign1AbilityKey(campaignData, enemyKey) : null;
  const mods = computeBattleModifiers(campaignData, enemyKey, abilityKey, campaignId);

  const active = campaignData.team.filter((m) => m.role !== ROLE.STANDBY);
  
  // Track per-member stats
  const perMember = new Map(
    campaignData.team.map((m) => [m.id, { id: m.id, name: m.name, spent: 0, erosion: 0, afterMana: m.mana }])
  );

  let hp = mods.maxHp;
  let rounds = 0;
  let manaSpent = 0;
  let erosionGained = 0;
  let forcedStop = false;

  // Helper to apply cost (works for both estimate and simulate modes)
  const applyCost = (member, rawCost, erosionMultiplier, costMultiplier, noeorsion = false) => {
    let cost = rawCost * costMultiplier;
    const pay = Math.min(member.mana, cost);
    member.mana -= pay;
    const rec = perMember.get(member.id);
    rec.spent += pay;
    manaSpent += pay;
    
    const overflow = cost - pay;
    if (overflow > 0 && !noeorsion) {
      const ero = overflow / costMultiplier * erosionMultiplier; // 超出部分不算魔力减免
      rec.erosion += ero;
      erosionGained += ero;
      
      // Only mutate campaign erosion if in simulate mode
      if (mutateState) {
        campaignData.erosion += ero;
      }
    }
    rec.afterMana = member.mana;
  };

  const sealCost = 6 + mods.rarityIdx * 2;

  // Nefy assist: seal at battle start
  if (mods.sealed) {
    const nephr = campaignData.team.find((m) => m.name === "奈芙莲");
    applyCost(nephr, sealCost, 1, 1);
  }

  // Campaign 1: Chtholly main start damage
  if (!forcedStop && campaignId === "c1" && mods.main?.name === "珂朵莉") {
    const base = 10 + mods.rarityIdx * 20;
    const dmg = mods.abilityKey === "tough" ? Math.max(0, base - 1) : base;
    // TODO: 验证这个伤害吃不吃坚硬
    hp -= dmg;
  }

  while (!forcedStop && hp > 1e-6) {
    rounds += 1;
    // if (campaignId === "c2" && mods.maxHp == 200)
        // console.log(`Round ${rounds} start: HP=${hp.toFixed(2)}`);

    // Enemy drain at start of round
    if (mods.abilityKey === "drain" || (!mods.sealed && mods.hasDrain)) {
      for (const member of campaignData.team) {
        if (member.role === ROLE.STANDBY) continue;
        applyCost(member, 0.5, 1, 1, true);
        // TODO: 验证这里的侵蚀能不能被减免
      }
    }


    for (const member of campaignData.team) {
      if (member.role === ROLE.STANDBY) continue;
      if (hp <= 1e-6) break;

      let costMultiplier = mods.costMultiplier;
      
      // Campaign 2: Lantoluque consecutive bonus
      if (campaignId === "c2" && member.name == "兰朵露可" && member.role == ROLE.MAIN && campaignData.lastTarget === enemyKey) {
        costMultiplier = Math.max(0, costMultiplier - 0.2);
      }

      const rawCost = (member.role === ROLE.MAIN ? 2 : 1);
      

      const erosionMul = mods.hasAesyaAssist && member.role === ROLE.MAIN ? 0.5 : 1;
      applyCost(member, rawCost, erosionMul, costMultiplier);

      if (perMember.get(member.id).erosion > 200) {
        forcedStop = true;
        break;
      }

      // Campaign 2: Lantoluque assist skips own attack
      if (campaignId === "c2" && member.name === "兰朵露可" && member.role === ROLE.ASSIST) {
        continue;
      }

      let dmg = 2;
      
      // Campaign 1 skills
      if (mods.hasChthollyAssist && member.name !== "珂朵莉") dmg += 1;
      if (mods.hasAesyaAssist && member.role === ROLE.MAIN) dmg += 1;
      if (member.role === ROLE.MAIN && member.name === "艾瑟雅") dmg += 0.02 * mods.maxHp;
      
      // Campaign 2 skills
      if (campaignId === "c2") {
        if (member.name === "兰朵露可" && member.role === ROLE.MAIN && campaignData.lastTarget === enemyKey) {
          dmg += 2;
        }
        if (member.name === "诺夫特" && member.role === ROLE.MAIN && active.length === 1) {
          dmg += mods.rarityIdx;
        }
      }
      
      // Campaign 1 tough ability
      if (mods.abilityKey === "tough") dmg = Math.max(0, dmg - 1);
      
      // Campaign 2 hard ability: only main can damage
      if (campaignId === "c2" && !mods.sealed && mods.hasHard && member.role !== ROLE.MAIN) {
        dmg = 0;
      }
    
      hp -= dmg;
      if (campaignId === "c2" && (mods.sealed || !mods.hasHard)) {
        // Campaign 2: Lantoluque assist follow-up
        if (campaignId === "c2" && mods.hasLantoluqueAssist && dmg > 0) {
            hp -= dmg * 0.4;
        }
        // Novte assist: extra missing HP damage
        if (member.name === "诺夫特" && member.role === ROLE.ASSIST) {
          // Campaign 2: Novte assist damage (based on missing HP per round)
          let novteAssistDmg = 0;
          if (campaignId === "c2" && mods.hasNovteAssist) {
            const missingHp = mods.maxHp - hp;
            novteAssistDmg = Math.floor(missingHp * 0.2) / 10;
          }
          hp -= novteAssistDmg;
          // Campaign 2: Lantoluque assist follow-up
          if (campaignId === "c2" && mods.hasLantoluqueAssist && novteAssistDmg > 0) {
              hp -= novteAssistDmg * 0.4;
          }
        }
      }
      
    }

    if (forcedStop) break;

    if (hp > 1e-6 && mods.abilityKey === "regen") {
      hp = Math.min(mods.maxHp, hp + 2);
    }
  }

  // Campaign 2: LastWord on death
  if (campaignId === "c2" && !mods.sealed && mods.hasLastWord && mods.main) {
    applyCost(mods.main, 10, 1, 1, true);
  }

  // Victory: update progress and standby mana
  let progressGain = 0;
  const progressBefore = campaignData.progress;
  
  if (true) {
    if (mutateState) {
      campaignData.progress = clamp(campaignData.progress + enemy.progress, 0, 100);
      progressGain = campaignData.progress - progressBefore;

      // Campaign 2: Update lastTarget
      if (campaignId === "c2" && mods.lantoluque && mods.lantoluque.role !== ROLE.STANDBY) {
        campaignData.lastTarget = enemyKey;
      }
    } else {
      progressGain = enemy.progress;
    }

    // Standby mana recovery (C2 stun blocks this)
    const stunBlocked = campaignId === "c2" && !mods.sealed && mods.hasStun;
    if (!stunBlocked) {
      for (const member of campaignData.team) {
        if (member.role !== ROLE.STANDBY) continue;
        member.mana = clamp(member.mana + enemy.progress, 0, 100);
        perMember.get(member.id).afterMana = member.mana;
      }
    }
  }

  return {
    enemy: deepClone(enemy),
    rounds,
    perMember: campaignData.team.map((m) => perMember.get(m.id)),
    manaSpent,
    erosionGained,
    totalErosion: erosionGained,
    progressGain,
    progressBefore,
    progressAfter: mutateState ? campaignData.progress : clamp(progressBefore + progressGain, 0, 100),
    forcedStop,
    remainingHp: Math.max(0, hp),
    enemyMaxHp: mods.maxHp,
    enemyAbility: campaignId === "c1" ? ENEMY_ABILITIES[abilityKey]?.name : null,
    sealed: mods.sealed,
  };
}

function estimateBattle(campaign, enemyKey) {
  const enemy = ENEMIES[enemyKey];
  if (!enemy) throw new Error("Invalid enemy");

  const snapshot = deepClone(campaign);
  ensureExactlyOneMain(snapshot, snapshot.team[0]?.id);

  const active = snapshot.team.filter((m) => m.role !== ROLE.STANDBY);
  if (active.length === 0) {
    const campaignId = snapshot.id;
    const abilityKey = campaignId === "c1" ? getCampaign1AbilityKey(snapshot, enemyKey) : null;
    const mods = computeBattleModifiers(snapshot, enemyKey, abilityKey, campaignId);
    return {
      enemy: deepClone(enemy),
      rounds: 0,
      perMember: snapshot.team.map((m) => ({ id: m.id, name: m.name, spent: 0, erosion: 0, afterMana: m.mana })),
      totalErosion: 0,
      forcedStop: false,
      remainingHp: mods.maxHp,
      enemyMaxHp: mods.maxHp,
      enemyAbility: campaignId === "c1" ? ENEMY_ABILITIES[abilityKey]?.name : null,
      sealed: mods.sealed,
    };
  }

  const mainCount = active.filter((m) => m.role === ROLE.MAIN).length;
  if (mainCount !== 1) {
    const campaignId = snapshot.id;
    const abilityKey = campaignId === "c1" ? getCampaign1AbilityKey(snapshot, enemyKey) : null;
    const mods = computeBattleModifiers(snapshot, enemyKey, abilityKey, campaignId);
    return {
      enemy: deepClone(enemy),
      rounds: 0,
      perMember: snapshot.team.map((m) => ({ id: m.id, name: m.name, spent: 0, erosion: 0, afterMana: m.mana })),
      totalErosion: 0,
      forcedStop: false,
      remainingHp: mods.maxHp,
      enemyMaxHp: mods.maxHp,
      enemyAbility: campaignId === "c1" ? ENEMY_ABILITIES[abilityKey]?.name : null,
      sealed: mods.sealed,
    };
  }

  return _executeBattleCore(snapshot, enemyKey, false);
}

function addLog(campaign, entry) {
  campaign.log.unshift({ ts: Date.now(), ...entry });
  // keep last 80
  if (campaign.log.length > 80) campaign.log.length = 80;
}

function formatLogEntry(entry) {
  const time = new Date(entry.ts).toLocaleString();
  const ability = entry.enemyAbility ? `\n能力：${entry.enemyAbility}${entry.sealed ? "（已封印）" : ""}` : "";
  const stop = entry.forcedStop ? "\n结束：单人侵蚀增加超过 200，强制中止" : "";
  const remain = Number.isFinite(entry.remainingHp) ? `\n剩余血量：${formatNumber(entry.remainingHp, 1)}` : "";
  return `[#${entry.seq}] ${time}\n敌人：${entry.enemy.rarity} HP=${formatNumber(entry.enemyMaxHp ?? entry.enemy.hp, 1)} 完成度+${entry.enemy.progress}${ability}\n阵容：${entry.roster}\n结果：回合=${entry.rounds}，耗魔=${formatNumber(entry.manaSpent, 1)}，侵蚀+${formatNumber(entry.erosionGained, 1)}，完成度→${formatNumber(entry.progressAfter, 0)}/100${stop}${remain}\n剩余魔力：${entry.manaAfter}\n`;
}

function renderLog(campaignId, state) {
  const campaign = state[campaignId];
  const el = document.getElementById(`${campaignId}Log`);
  const count = document.getElementById(`${campaignId}LogCount`);

  const selected = campaign.selectedEnemy;
  const selectedRarity = ENEMIES[selected]?.rarity;
  const filtered = selectedRarity ? campaign.log.filter((x) => x.enemy?.rarity === selectedRarity) : campaign.log;

  count.textContent = String(filtered.length);
  el.textContent = filtered.length ? filtered.map(formatLogEntry).join("\n") : "暂无该敌人的战斗记录。";
}

function simulateBattle(campaign, enemyKey) {
  const enemy = ENEMIES[enemyKey];
  if (!enemy) throw new Error("Invalid enemy");

  ensureExactlyOneMain(campaign, campaign.team[0].id);

  const active = campaign.team.filter((m) => m.role !== ROLE.STANDBY);
  if (active.length === 0) {
    throw new Error("至少需要一名参战者（主攻或协同）。");
  }

  const mainCount = active.filter((m) => m.role === ROLE.MAIN).length;
  if (mainCount !== 1) {
    throw new Error("需要设置且仅设置 1 名主攻成员。当前没有主攻或主攻人数不正确。");
  }

  // Execute battle with state mutation
  const result = _executeBattleCore(campaign, enemyKey, true);

  // Add log entry
  const manaAfter = campaign.team.map((m) => formatNumber(m.mana, 1)).join("/");
  const roster = campaign.team.map((m) => `${m.name}(${ROLE_NAME[m.role]})`).join(" ");

  addLog(campaign, {
    seq: campaign.log.length + 1,
    enemy: result.enemy,
    rounds: result.rounds,
    manaSpent: result.manaSpent,
    erosionGained: result.erosionGained,
    progressGain: result.progressGain,
    progressAfter: campaign.progress,
    manaAfter,
    roster,
    enemyAbility: result.enemyAbility,
    sealed: result.sealed,
    forcedStop: result.forcedStop,
    remainingHp: result.remainingHp,
    enemyMaxHp: result.enemyMaxHp,
  });

  return result;
}

function computeAdvice(campaign, allowedEnemies) {
  const active = campaign.team.filter((m) => m.role !== ROLE.STANDBY);
  const standby = campaign.team.filter((m) => m.role === ROLE.STANDBY);
  const mains = active.filter((m) => m.role === ROLE.MAIN);

  const totalMana = campaign.team.reduce((a, m) => a + m.mana, 0);
  const lowManaMembers = [...campaign.team]
    .sort((a, b) => a.mana - b.mana)
    .slice(0, 2)
    .map((m) => `${m.name}(${m.mana})`)
    .join("、");

  const caution = campaign.team.some((m) => m.mana <= 5) ? "当前有队友魔力很低，继续强打容易抬升侵蚀。" : "";

  // Heuristic enemy choice: estimate erosion risk by required total mana.
  // With k active members, per round dmg = 2k, so rounds ≈ ceil(hp/(2k)).
  // Mana per round = (k-1)*1 + 2 (for main) = k+1.
  // Total mana demand ≈ rounds*(k+1). Standby gives +progressGain to each standby.
  const k = Math.max(1, active.length);
  const manaPerRound = (k - 1) * 1 + 2;

  const enemyScores = allowedEnemies
    .map((key) => {
      const e = ENEMIES[key];
      const rounds = Math.ceil(e.hp / (2 * k));
      const demand = rounds * manaPerRound;
      const standbyRefund = standby.length * e.progress;
      // Lower net demand is better; also higher progress is better.
      const net = demand - standbyRefund;
      const score = e.progress * 10 - net; // arbitrary but stable
      return { key, rounds, demand, net, score, e };
    })
    .sort((a, b) => b.score - a.score);

  const best = enemyScores[0];

  // Suggested roles: pick MAIN as highest mana among active.
  const suggestedMain = [...campaign.team]
    .filter((m) => m.role !== ROLE.STANDBY)
    .sort((a, b) => b.mana - a.mana)[0];

  let roleHint = "";
  if (suggestedMain && mains.length === 1 && mains[0].id !== suggestedMain.id) {
    roleHint = `建议主攻换为“${suggestedMain.name}”（当前魔力最高，主攻更省侵蚀风险）。`;
  } else if (mains.length !== 1) {
    roleHint = "需要确保“主攻”恰好 1 人（其余参战者用“协同”）。";
  }

  let standbyHint = "";
  if (standby.length === 0) {
    standbyHint = "如果后续想稳侵蚀：可以让一名低魔队友“待机”，战后按完成度回蓝。";
  } else {
    standbyHint = `待机队友会在本次战后各回蓝 +${best?.e.progress ?? 0}（上限 100）。`;
  }

  const enemyHint = best
    ? `推荐敌人：${best.e.rarity}（预计回合≈${best.rounds}，理论总耗魔≈${best.demand}，待机回蓝抵扣后净需求≈${best.net}）。`
    : "";

  const context = `当前：完成度 ${campaign.progress}/100，侵蚀 ${campaign.erosion}，总魔力 ${totalMana}。低魔：${lowManaMembers}。`;
  const notes = "说明：这里的推荐是基于当前“无技能”版本的简单估算，后续加技能后会更新评分方式。";

  return [context, caution, roleHint, standbyHint, enemyHint, notes].filter(Boolean).join("\n");
}

function renderAll(state) {
  const btnGroup = document.getElementById("c1AbilityButtons");
  if (btnGroup) {
    ensureCampaign1EnemyAbilities(state.c1);
    const abilityVals = Object.keys(ENEMIES).map((k) => state.c1.enemyAbilities?.[k]).filter(Boolean);
    const unique = [...new Set(abilityVals)];
    btnGroup.querySelectorAll(".ability-btn[data-ability]").forEach((btn) => {
      const key = btn.getAttribute("data-ability");
      btn.classList.toggle("ability-btn--active", unique.length === 1 && key === unique[0]);
    });
  }

  const btnGroupC2 = document.getElementById("c2AbilityButtons");
  if (btnGroupC2) {
    ensureCampaign2EnemyAbilities(state.c2);
    const selectedEnemy = state.c2.selectedEnemy;
    const selectedAbilities = selectedEnemy ? (state.c2.enemyAbilities[selectedEnemy] || []) : [];
    btnGroupC2.querySelectorAll(".ability-btn[data-c2-ability]").forEach((btn) => {
      const key = btn.getAttribute("data-ability");
      const slot = parseInt(btn.getAttribute("data-slot") || "0");
      
      // Highlight if this ability is in the corresponding slot
      if (key === "none") {
        // Highlight "none" if there's no second ability
        btn.classList.toggle("ability-btn--active", slot === 1 && selectedAbilities.length <= 1);
      } else {
        btn.classList.toggle("ability-btn--active", selectedAbilities[slot] === key);
      }
    });
  }

  for (const campaignId of ["c1", "c2"]) {
    const campaign = state[campaignId];
    document.getElementById(`${campaignId}Summary`).textContent = formatSummary(campaign);

    const bar = document.getElementById(`${campaignId}ProgressBar`);
    const text = document.getElementById(`${campaignId}ProgressText`);
    if (bar) bar.style.width = `${clamp(campaign.progress, 0, 100)}%`;
    if (text) text.textContent = `${clamp(campaign.progress, 0, 100)}/100`;

    // Update undo button state
    const btnUndo = document.getElementById(`${campaignId}Undo`);
    if (btnUndo) {
      btnUndo.disabled = !canUndo();
    }

    // Update erosion bar for both campaigns
    const erosionBar = document.getElementById(`${campaignId}ErosionBar`);
    const erosionText = document.getElementById(`${campaignId}ErosionText`);
    if (erosionBar) {
      const erosionPercent = Math.min(100, campaign.erosion);
      erosionBar.style.width = `${erosionPercent}%`;
    }
    if (erosionText) erosionText.textContent = `${formatNumber(campaign.erosion, 1)}/100`;

    renderTeam(campaignId, state);
    renderLog(campaignId, state);

    renderEnemies(campaignId, state);
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab[data-tab]");
  const panels = document.querySelectorAll(".panel[data-panel]");
  
  function activate(tabId) {
    tabs.forEach((t) => {
      const on = t.getAttribute("data-tab") === tabId;
      t.classList.toggle("tab--active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    panels.forEach((p) => {
      const on = p.getAttribute("data-panel") === tabId;
      p.classList.toggle("panel--active", on);
    });
    // Save active tab to localStorage
    localStorage.setItem(TAB_KEY, tabId);
  }
  
  tabs.forEach((t) => t.addEventListener("click", () => activate(t.getAttribute("data-tab"))));
  
  // Restore active tab on page load
  const savedTab = localStorage.getItem(TAB_KEY);
  if (savedTab && (savedTab === "c1" || savedTab === "c2")) {
    activate(savedTab);
  }
}

function setupActions(state) {
  function attachCampaign(campaignId) {
    const btnSim = document.getElementById(`${campaignId}Simulate`);
    const btnReset = document.getElementById(`${campaignId}Reset`);
    const btnUndo = document.getElementById(`${campaignId}Undo`);

    btnSim.addEventListener("click", () => {
      const campaign = state[campaignId];
      const enemyKey = campaign.selectedEnemy;

      try {
        // Save state before battle for undo
        pushHistory(state);
        
        const beforeMana = campaign.team.map((m) => m.mana);
        const result = simulateBattle(campaign, enemyKey);

        saveState(state);
        renderAll(state);
      } catch (e) {
        alert(e?.message ?? String(e));
      }
    });

    btnUndo.addEventListener("click", () => {
      const snapshot = popHistory();
      if (!snapshot) return;
      
      // Restore mana, erosion, progress, lastTarget
      for (const cid of ["c1", "c2"]) {
        if (snapshot[cid]) {
          state[cid].progress = snapshot[cid].progress;
          state[cid].erosion = snapshot[cid].erosion;
          if (cid === "c2" && snapshot[cid].lastTarget !== undefined) {
            state[cid].lastTarget = snapshot[cid].lastTarget;
          }
          for (const savedMember of snapshot[cid].team) {
            const member = state[cid].team.find(m => m.id === savedMember.id);
            if (member) member.mana = savedMember.mana;
          }
        }
      }
      
      saveState(state);
      renderAll(state);
    });

    btnReset.addEventListener("click", () => {
      const ok = confirm(`确定要重置${state[campaignId].name}吗？将清空日志并重置魔力/侵蚀/完成度。`);
      if (!ok) return;
      const defaults = getDefaultState();
      state[campaignId] = defaults[campaignId];
      // Clear history on reset
      saveHistory([]);
      saveState(state);
      renderAll(state);
    });
  }

  attachCampaign("c1");
  attachCampaign("c2");

  const btnGroup = document.getElementById("c1AbilityButtons");
  if (btnGroup) {
    btnGroup.querySelectorAll(".ability-btn[data-ability]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const abilityKey = btn.getAttribute("data-ability");
        if (!ENEMY_ABILITIES[abilityKey]) return;
        ensureCampaign1EnemyAbilities(state.c1);
        for (const enemyKey of Object.keys(ENEMIES)) {
          state.c1.enemyAbilities[enemyKey] = abilityKey;
        }
        saveState(state);
        renderAll(state);
      });
    });
  }

  const btnGroupC2 = document.getElementById("c2AbilityButtons");
  if (btnGroupC2) {
    btnGroupC2.querySelectorAll(".ability-btn[data-c2-ability]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const abilityKey = btn.getAttribute("data-ability");
        const slot = parseInt(btn.getAttribute("data-slot") || "0");
        
        // Allow "none" only for slot 1
        if (abilityKey === "none" && slot !== 1) return;
        if (abilityKey !== "none" && !ENEMY_ABILITIES_C2[abilityKey]) return;
        
        ensureCampaign2EnemyAbilities(state.c2);
        const allowed = ["SR", "SSR", "UR"];
        
        for (const enemyKey of allowed) {
          const arr = [...(state.c2.enemyAbilities[enemyKey] || [])];
          
          if (abilityKey === "none") {
            // Remove slot 1 (second ability)
            if (arr.length > 1) {
              arr.splice(1, 1);
            }
          } else {
            // Set the ability at the specified slot
            if (slot === 0) {
              arr[0] = abilityKey;
            } else if (slot === 1) {
              // Ensure slot 0 exists
              if (arr.length === 0) arr[0] = "hard";
              arr[1] = abilityKey;
            }
          }
          
          state.c2.enemyAbilities[enemyKey] = arr.filter(Boolean).slice(0, 2);
          if (state.c2.enemyAbilities[enemyKey].length === 0) {
            state.c2.enemyAbilities[enemyKey] = ["hard"];
          }
        }
        saveState(state);
        renderAll(state);
      });
    });
  }

  // Export / Import - Disabled
  /*
  const dialog = document.getElementById("ioDialog");
  const ioTitle = document.getElementById("ioTitle");
  const ioHint = document.getElementById("ioHint");
  const ioText = document.getElementById("ioText");
  const ioConfirm = document.getElementById("ioConfirm");

  let mode = "export";

  document.getElementById("btnExport").addEventListener("click", () => {
    mode = "export";
    ioTitle.textContent = "导出存档";
    ioHint.textContent = "复制下面的 JSON 存档。";
    ioText.value = JSON.stringify(state, null, 2);
    ioConfirm.textContent = "关闭";
    dialog.showModal();
  });

  document.getElementById("btnImport").addEventListener("click", () => {
    mode = "import";
    ioTitle.textContent = "导入存档";
    ioHint.textContent = "粘贴 JSON 存档，点击确定后覆盖当前数据。";
    ioText.value = "";
    ioConfirm.textContent = "确定导入";
    dialog.showModal();
  });

  dialog.addEventListener("close", () => {
    if (dialog.returnValue !== "confirm") return;
    if (mode !== "import") return;
    try {
      const parsed = JSON.parse(ioText.value);
      // Basic validation
      if (!parsed?.c1?.team || !parsed?.c2?.team) throw new Error("存档格式不正确（缺少 c1/c2.team）。");
      state.c1 = { ...getDefaultState().c1, ...parsed.c1 };
      state.c2 = { ...getDefaultState().c2, ...parsed.c2 };

      ensureCampaign1EnemyAbilities(state.c1);
      ensureCampaign2EnemyAbilities(state.c2);

      saveState(state);
      renderAll(state);
    } catch (e) {
      alert(`导入失败：${e?.message ?? String(e)}`);
    }
  });
  */
}

(function main() {
  setupTabs();
  const state = loadState();
  applyCanonicalTeamMeta(state);

  ensureCampaign1EnemyAbilities(state.c1);
  ensureCampaign2EnemyAbilities(state.c2);

  saveState(state);
  setupActions(state);
  renderAll(state);
})();
