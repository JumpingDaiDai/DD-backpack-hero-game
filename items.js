// 裝備與道具資料庫
const ITEMS_DATABASE = [
  {
    id: 'iron_sword',
    name: '鐵劍',
    icon: '⚔️',
    description: '基礎武器。造成 7 點傷害。',
    shape: [
      [1],
      [1]
    ], // 1x2 垂直形狀
    type: 'weapon',
    cost: 1,
    effect: { damage: 7 }
  },
  {
    id: 'wooden_shield',
    name: '木盾',
    icon: '🛡️',
    description: '基礎防具。獲得 6 點護盾。',
    shape: [
      [1, 1],
      [1, 1]
    ], // 2x2 正方形
    type: 'shield',
    cost: 1,
    effect: { block: 6 }
  },
  {
    id: 'health_potion',
    name: '生命藥水',
    icon: '🧪',
    description: '恢復 10 點生命值。使用後消耗。',
    shape: [
      [1]
    ], // 1x1
    type: 'potion',
    cost: 1,
    consumable: true,
    effect: { heal: 10 }
  },
  {
    id: 'ruby_gem',
    name: '紅寶石',
    icon: '💎',
    description: '被動：使上方相鄰的武器傷害 +4。',
    shape: [
      [1]
    ], // 1x1
    type: 'accessory',
    cost: 0,
    passive: 'boost_above_weapon',
    bonusDamage: 4
  },
  {
    id: 'dagger',
    name: '刺客匕首',
    icon: '🗡️',
    description: '輕型武器。造成 4 點傷害，消耗 0 能量。',
    shape: [
      [1]
    ], // 1x1
    type: 'weapon',
    cost: 0,
    effect: { damage: 4 }
  },
  {
    id: 'plate_armor',
    name: '板甲',
    icon: '🥋',
    description: '重型防具。獲得 14 點護盾。',
    shape: [
      [1, 1],
      [1, 1],
      [1, 1]
    ], // 2x3 形狀
    type: 'shield',
    cost: 2,
    effect: { block: 14 }
  }
];

// 地牢敵人資料庫
const ENEMIES_DATABASE = [
  { name: '地牢史萊姆', emoji: '🟢', hp: 20, maxHp: 20, attack: 5 },
  { name: '哥布林戰士', emoji: '👺', hp: 35, maxHp: 35, attack: 8 },
  { name: '骨骸劍士', emoji: '💀', hp: 50, maxHp: 50, attack: 12 },
  { name: '地牢領主・黑龍', emoji: '🐲', hp: 90, maxHp: 90, attack: 16 }
];
