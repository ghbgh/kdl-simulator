# KDL 回合制战役模拟器 - GitHub Copilot 指引

## 项目概述

这是一个纯前端的回合制战斗模拟器，用于计算两个独立战役的战斗结果（魔力消耗、侵蚀度、完成度）。项目使用原生 JavaScript + HTML + CSS，不依赖任何框架。

## 技术栈

- **纯原生技术**：HTML5 + CSS3 + Vanilla JavaScript
- **数据持久化**：localStorage
- **无构建工具**：直接在浏览器中运行

## 核心架构

### 状态管理 (app.js)

```javascript
// 全局状态结构
state = {
  c1: {  // 战役一
    id: "c1",
    progress: 0,        // 完成度 0-100
    erosion: 0,         // 侵蚀度
    selectedEnemy: "R", // 当前选中的敌人
    enemyAbilities: {},  // 每个敌人的能力（单选）
    team: [...],        // 3名队员
    log: [...]          // 战斗记录
  },
  c2: { /* 战役二，结构类似但有差异 */ }
}
```

### 战斗系统核心

1. **回合制战斗循环**：
   - 每回合按队员顺序依次攻击
   - 主攻消耗2魔力/回合，协同消耗1魔力/回合，待机不消耗
   - 魔力不足时差额转为侵蚀度
   - 击败敌人后本回合后续队员不消耗魔力（杀敌中断）

2. **统一战斗逻辑** (`estimateBattle` 和 `simulateBattle`)：
   - 两个函数使用相同的战斗循环
   - 通过 `computeBattleModifiers` 函数统一处理两个战役的差异
   - 战役特定逻辑通过 `campaignId` 判断

3. **能力系统**：
   - 战役一：单选能力（坚韧/再生/汲取/巨型）
   - 战役二：双选能力（坚硬/孢子/亡语/震慑/无）

## 代码规范

### 命名约定

- **常量**：大写下划线分隔 `ROLE`, `ENEMY_ABILITIES`
- **函数**：驼峰命名 `renderTeam()`, `simulateBattle()`
- **变量**：驼峰命名 `campaignId`, `manaSpent`
- **DOM ID**：驼峰命名带前缀 `c1Team`, `c2Simulate`

### 函数组织

```javascript
// 1. 工具函数
clamp(), deepClone(), formatNumber()

// 2. 状态管理
getDefaultState(), loadState(), saveState(), pushHistory(), popHistory()

// 3. 数据校验
ensureCampaign1EnemyAbilities(), ensureCampaign2EnemyAbilities()

// 4. 战斗核心
computeBattleModifiers()  // 计算修正值
estimateBattle()          // 预测战斗（不修改状态）
simulateBattle()          // 执行战斗（修改状态）

// 5. UI渲染
renderTeam(), renderEnemies(), renderLog(), renderAll()

// 6. 事件处理
setupTabs(), setupActions()
```

### 战斗逻辑关键点

```javascript
// 统一的战斗修正值计算
function computeBattleModifiers(campaign, enemyKey, abilityKey, campaignId) {
  // 返回包含所有修正值的对象
  return {
    rarityIdx,
    main, chtholly, lantoluque, novte,  // 队员引用
    hasChthollyAssist, hasAesyaAssist, hasLantoluqueAssist, hasNovteAssist,
    sealed,           // 奈芙莲协同封印
    abilityKey,       // 战役1能力
    maxHp,            // 敌人最大生命值
    costMultiplier,   // 魔力消耗倍率
    hasDrain, hasLastWord, hasHard, hasStun  // 战役2能力
  };
}

// 战斗循环结构
while (!forcedStop && hp > 0) {
  rounds += 1;
  
  // 1. 回合开始：汲取能力
  // 2. 计算诺夫特协同伤害（战役2）
  // 3. 队员依次攻击
  for (const member of campaign.team) {
    // 3.1 扣除魔力
    // 3.2 检查强制中止（单人侵蚀>200）
    // 3.3 兰朵露可协同跳过攻击（战役2）
    // 3.4 计算伤害
    // 3.5 应用技能效果
    // 3.6 兰朵露可协同追击（战役2）
  }
  // 4. 回合结束：再生能力
}
```

## 战役差异

### 战役一
- **队员**：珂朵莉、奈芙莲、艾瑟雅
- **敌人**：R/SR/SSR/UR（全部4种）
- **能力**：每个敌人单选一个能力
- **特殊技能**：
  - 珂朵莉主攻：开场伤害
  - 珂朵莉协同：其他队员+1伤害
  - 艾瑟雅主攻：%生命值伤害
  - 艾瑟雅协同：主攻侵蚀减半

### 战役二
- **队员**：奈芙莲、兰朵露可、诺夫特
- **敌人**：SR/SSR/UR（排除R）
- **能力**：每个敌人可选0-2个能力
- **特殊技能**：
  - 兰朵露可主攻：连续对战加成
  - 兰朵露可协同：跳过自己攻击，追击其他队员40%伤害
  - 诺夫特主攻：单兵作战加成
  - 诺夫特协同：附加已损失生命值2%伤害

### 共通机制
- **奈芙莲主攻**：全队魔力消耗-40%
- **奈芙莲协同**：封印所有敌兽能力（消耗6+稀有度×2魔力）

## UI 组件

### 敌人选择
```html
<!-- 战役一：单个下拉框 -->
<select class="enemy-ability-select">

<!-- 战役二：两个垂直排列的下拉框 -->
<div class="enemy-ability-selects">
  <select>能力1</select>
  <select>能力2</select>
</div>
```

### 右侧能力按钮
```html
<!-- 战役一：单列4个按钮 -->
<div class="ability-buttons">

<!-- 战役二：双列，能力1和能力2 -->
<div class="ability-buttons-c2">
  <div class="ability-column">能力1列</div>
  <div class="ability-column">能力2列（含"无"）</div>
</div>
```

## 常见修改场景

### 添加新敌人能力
1. 在 `ENEMY_ABILITIES` 或 `ENEMY_ABILITIES_C2` 添加定义
2. 在 HTML 添加按钮和下拉选项
3. 在 `computeBattleModifiers` 添加检测
4. 在战斗循环相应位置添加效果逻辑

### 添加新队员技能
1. 在 `getMemberSkills` 添加描述
2. 在 `computeBattleModifiers` 添加检测
3. 在战斗循环相应位置添加效果逻辑

### 修改战斗预测
只修改 `estimateBattle` 函数，不修改 `simulateBattle`

### 修改实际战斗
同时修改 `estimateBattle` 和 `simulateBattle`，保持逻辑一致

## 调试提示

- 战斗日志在 `campaign.log` 中
- 使用 `formatLogEntry()` 查看详细信息
- 预测和实际战斗应该返回相同结果
- 侵蚀度检查：单人>200触发强制中止
- 魔力恢复：仅待机成员，胜利后恢复 = 进度值

## 性能考虑

- 避免频繁调用 `renderAll()`
- 使用 `deepClone` 创建快照，不直接修改原状态
- localStorage 限制约5MB，日志保持最近80条
- 历史记录限制50条

## 注意事项

⚠️ **关键规则**：
- 修改战斗逻辑时，`estimateBattle` 和 `simulateBattle` 必须保持一致
- 所有能力效果必须在封印状态下被正确禁用
- 魔力消耗必须分别计算"实际支付"和"转为侵蚀"
- 杀敌中断：`if (hp <= 0) break;` 必须在每个队员攻击后检查
- 战役2的连续作战目标 `lastTarget` 仅在兰朵露可参战且胜利时更新
