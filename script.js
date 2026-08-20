class BackpackGame {
  constructor() {
    this.gridRows = 4;
    this.gridCols = 5;
    // 背包二維矩陣（存放置物件的實體）
    this.grid = Array(this.gridRows).fill(null).map(() => Array(this.gridCols).fill(null));
    
    // 玩家狀態
    this.player = {
      hp: 50,
      maxHp: 50,
      block: 0,
      energy: 3,
      maxEnergy: 3
    };

    // 地牢層數與當前敵人
    this.dungeonLevel = 0;
    this.currentEnemy = null;
    
    // 背包放置物清單與備用箱清單
    this.placedItems = []; // { instanceId, item, r, c, shape }
    this.stashItems = [];  // { instanceId, item, shape }
    
    // 當前選取/拖曳/旋轉暫存
    this.selectedStashItem = null;
    this.selectedPlacedItem = null;

    this.initDOM();
    this.initGame();
  }

  initDOM() {
    this.backpackGridEl = document.getElementById('backpack-grid');
    this.stashContainerEl = document.getElementById('stash-container');
    this.playerHpBarEl = document.getElementById('player-hp-bar');
    this.playerHpTextEl = document.getElementById('player-hp-text');
    this.playerBlockEl = document.getElementById('player-block');
    this.enemyAvatarEl = document.getElementById('enemy-avatar');
    this.enemyNameEl = document.getElementById('enemy-name');
    this.enemyHpBarEl = document.getElementById('enemy-hp-bar');
    this.enemyHpTextEl = document.getElementById('enemy-hp-text');
    this.enemyIntentEl = document.getElementById('enemy-intent');
    this.energyDisplayEl = document.getElementById('energy-display');
    this.gameLogEl = document.getElementById('game-log');
    this.modalOverlayEl = document.getElementById('modal-overlay');

    // 綁定按鈕事件
    document.getElementById('rotate-btn').addEventListener('click', () => this.rotateSelected());
    document.getElementById('end-turn-btn').addEventListener('click', () => this.endTurn());
    document.getElementById('modal-next-btn').addEventListener('click', () => this.nextLevel());

    // 全域快捷鍵
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') {
        this.rotateSelected();
      }
    });
  }

  initGame() {
    this.dungeonLevel = 0;
    this.player.hp = this.player.maxHp;
    this.player.block = 0;
    this.player.energy = this.player.maxEnergy;

    // 初始贈送裝備進入備用箱
    this.stashItems = [
      { instanceId: 'init_1', item: ITEMS_DATABASE[0], shape: JSON.parse(JSON.stringify(ITEMS_DATABASE[0].shape)) }, // 鐵劍
      { instanceId: 'init_2', item: ITEMS_DATABASE[1], shape: JSON.parse(JSON.stringify(ITEMS_DATABASE[1].shape)) }, // 木盾
      { instanceId: 'init_3', item: ITEMS_DATABASE[2], shape: JSON.parse(JSON.stringify(ITEMS_DATABASE[2].shape)) }  // 藥水
    ];

    this.spawnEnemy();
    this.renderGridCells();
    this.renderStash();
    this.updateUI();
    this.log('冒險開始！請將備用箱的裝備放入背包整理！');
  }

  spawnEnemy() {
    const enemyData = ENEMIES_DATABASE[Math.min(this.dungeonLevel, ENEMIES_DATABASE.length - 1)];
    this.currentEnemy = {
      ...enemyData,
      hp: enemyData.hp,
      maxHp: enemyData.maxHp,
      block: 0
    };
  }

  renderGridCells() {
    this.backpackGridEl.innerHTML = '';
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        
        // 點擊網格放置當前選取的備用裝備
        cell.addEventListener('click', () => this.onGridCellClick(r, c));
        this.backpackGridEl.appendChild(cell);
      }
    }
  }

  renderStash() {
    this.stashContainerEl.innerHTML = '';
    if (this.stashItems.length === 0) {
      this.stashContainerEl.innerHTML = '<div style="color:#6b7280; font-size:0.8rem; text-align:center; margin-top:20px;">備用箱空空如也</div>';
      return;
    }

    this.stashItems.forEach((st) => {
      const card = document.createElement('div');
      card.className = `item-card ${this.selectedStashItem === st ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="item-icon">${st.item.icon}</div>
        <div class="item-details">
          <div class="item-title">${st.item.name} (${st.shape[0].length}x${st.shape.length})</div>
          <div class="item-desc">${st.item.description}</div>
        </div>
        <div class="item-cost">⚡${st.item.cost}</div>
      `;

      card.addEventListener('click', () => {
        this.selectedStashItem = st;
        this.selectedPlacedItem = null;
        this.log(`選取了【${st.item.name}】！點擊背包網格放入，或按 R 鍵旋轉。`);
        this.renderStash();
      });

      this.stashContainerEl.appendChild(card);
    });
  }

  renderPlacedItems() {
    // 移除現有的放置物 DOM (保留背景網格)
    const existing = this.backpackGridEl.querySelectorAll('.placed-item');
    existing.forEach(el => el.remove());

    const cellWidth = 60;
    const cellHeight = 60;
    const gap = 6;
    const padding = 10;

    this.placedItems.forEach((pi) => {
      const el = document.createElement('div');
      el.className = 'placed-item';
      
      const widthCols = pi.shape[0].length;
      const heightRows = pi.shape.length;

      el.style.width = `${widthCols * cellWidth + (widthCols - 1) * gap}px`;
      el.style.height = `${heightRows * cellHeight + (heightRows - 1) * gap}px`;
      el.style.left = `${padding + pi.c * (cellWidth + gap)}px`;
      el.style.top = `${padding + pi.r * (cellHeight + gap)}px`;

      el.innerHTML = `
        <span style="font-size: 1.4rem;">${pi.item.icon}</span>
        <span style="font-size: 0.7rem; color: var(--accent-gold); font-weight:700;">${pi.item.name}</span>
      `;

      // 點擊觸發裝備發動/使用
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.useItem(pi);
      });

      this.backpackGridEl.appendChild(el);
    });
  }

  onGridCellClick(r, c) {
    if (this.selectedStashItem) {
      const st = this.selectedStashItem;
      if (this.canPlaceItem(st.shape, r, c)) {
        this.placeItem(st, r, c);
        // 從備用箱移除
        this.stashItems = this.stashItems.filter(s => s !== st);
        this.selectedStashItem = null;
        this.renderStash();
        this.renderPlacedItems();
        this.log(`成功將【${st.item.name}】放進背包！`);
      } else {
        this.log(`無法放置【${st.item.name}】：空間不足或超出邊界！`);
      }
    }
  }

  canPlaceItem(shape, startR, startC) {
    const h = shape.length;
    const w = shape[0].length;

    if (startR + h > this.gridRows || startC + w > this.gridCols) {
      return false;
    }

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (shape[r][c] === 1 && this.grid[startR + r][startC + c] !== null) {
          return false;
        }
      }
    }
    return true;
  }

  placeItem(stashObj, startR, startC) {
    const shape = stashObj.shape;
    const h = shape.length;
    const w = shape[0].length;

    const placedObj = {
      instanceId: stashObj.instanceId,
      item: stashObj.item,
      r: startR,
      c: startC,
      shape: shape
    };

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (shape[r][c] === 1) {
          this.grid[startR + r][startC + c] = placedObj;
        }
      }
    }

    this.placedItems.push(placedObj);
  }

  rotateSelected() {
    if (this.selectedStashItem) {
      this.selectedStashItem.shape = this.rotateMatrix(this.selectedStashItem.shape);
      this.log(`旋轉了【${this.selectedStashItem.item.name}】！`);
      this.renderStash();
    } else {
      this.log('請先點擊選取備用箱中的裝備再進行旋轉！');
    }
  }

  rotateMatrix(matrix) {
    const h = matrix.length;
    const w = matrix[0].length;
    let rotated = Array(w).fill(null).map(() => Array(h).fill(0));
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        rotated[c][h - 1 - r] = matrix[r][c];
      }
    }
    return rotated;
  }

  useItem(placedObj) {
    const item = placedObj.item;

    if (this.player.energy < item.cost) {
      this.log(`能量不足！使用【${item.name}】需要 ${item.cost} 點能量。`);
      return;
    }

    this.player.energy -= item.cost;
    let bonusDamage = this.calculatePassiveBonus(placedObj);

    if (item.type === 'weapon') {
      let dmg = item.effect.damage + bonusDamage;
      this.currentEnemy.hp = Math.max(0, this.currentEnemy.hp - dmg);
      this.log(`⚔️ 你使用【${item.name}】造成了 ${dmg} 點傷害！${bonusDamage > 0 ? `(寶石加成 +${bonusDamage})` : ''}`);
    } else if (item.type === 'shield') {
      let block = item.effect.block;
      this.player.block += block;
      this.log(`🛡️ 你使用【${item.name}】獲得了 ${block} 點護盾！`);
    } else if (item.type === 'potion') {
      let heal = item.effect.heal;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      this.log(`🧪 你使用了【${item.name}】恢復了 ${heal} 點生命值！`);
      
      if (item.consumable) {
        this.removePlacedItem(placedObj);
      }
    } else {
      this.log(`【${item.name}】為被動配件，會在相鄰物品效果中自動加成！`);
    }

    this.updateUI();

    if (this.currentEnemy.hp <= 0) {
      this.handleVictory();
    }
  }

  calculatePassiveBonus(placedObj) {
    let bonus = 0;
    // 檢查放置物件四周/上方是否有寶石被動加成
    this.placedItems.forEach((other) => {
      if (other.item.passive === 'boost_above_weapon') {
        // 如果這個寶石位在武器的正下方 (c 相等，r = weapon.r + height)
        if (other.c === placedObj.c && other.r === placedObj.r + placedObj.shape.length) {
          bonus += (other.item.bonusDamage || 4);
        }
      }
    });
    return bonus;
  }

  removePlacedItem(placedObj) {
    this.placedItems = this.placedItems.filter(p => p !== placedObj);
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        if (this.grid[r][c] === placedObj) {
          this.grid[r][c] = null;
        }
      }
    }
    this.renderPlacedItems();
  }

  endTurn() {
    this.log(`⏳ 回合結束！輪到【${this.currentEnemy.name}】行動！`);

    // 敵人攻擊邏輯
    let attack = this.currentEnemy.attack;
    if (this.player.block > 0) {
      if (this.player.block >= attack) {
        this.player.block -= attack;
        this.log(`🛡️ 你的護盾抵擋了敵人全部的 ${attack} 點攻擊！`);
      } else {
        let remainingDmg = attack - this.player.block;
        this.log(`🛡️ 護盾抵擋了 ${this.player.block} 點攻擊，受到了 ${remainingDmg} 點傷害！`);
        this.player.block = 0;
        this.player.hp = Math.max(0, this.player.hp - remainingDmg);
      }
    } else {
      this.player.hp = Math.max(0, this.player.hp - attack);
      this.log(`💥 【${this.currentEnemy.name}】對你造成了 ${attack} 點傷害！`);
    }

    // 玩家回合重置 (恢復能量)
    this.player.energy = this.player.maxEnergy;
    this.updateUI();

    if (this.player.hp <= 0) {
      this.handleGameOver();
    }
  }

  handleVictory() {
    const modalEmoji = document.getElementById('modal-emoji');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const lootDisplay = document.getElementById('loot-display');

    modalEmoji.textContent = '🏆';
    modalTitle.textContent = `第 ${this.dungeonLevel + 1} 層勝利！`;
    modalBody.textContent = `你成功打敗了【${this.currentEnemy.name}】！獲得戰利品裝備：`;

    // 隨機獲得一件新裝備
    const randomLoot = ITEMS_DATABASE[Math.floor(Math.random() * ITEMS_DATABASE.length)];
    this.stashItems.push({
      instanceId: `loot_${Date.now()}`,
      item: randomLoot,
      shape: JSON.parse(JSON.stringify(randomLoot.shape))
    });

    lootDisplay.innerHTML = `
      <div class="item-card" style="margin: 0 auto;">
        <div class="item-icon">${randomLoot.icon}</div>
        <div class="item-details">
          <div class="item-title">${randomLoot.name}</div>
          <div class="item-desc">${randomLoot.description}</div>
        </div>
      </div>
    `;

    this.modalOverlayEl.classList.add('show');
  }

  handleGameOver() {
    const modalEmoji = document.getElementById('modal-emoji');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const lootDisplay = document.getElementById('loot-display');

    modalEmoji.textContent = '💀';
    modalTitle.textContent = '你倒下了...';
    modalBody.textContent = '地牢冒險結束！再接再厲重新出發吧！';
    lootDisplay.innerHTML = '';

    document.getElementById('modal-next-btn').textContent = '重新開始冒險 🔄';
    this.modalOverlayEl.classList.add('show');
  }

  nextLevel() {
    this.modalOverlayEl.classList.remove('show');
    if (this.player.hp <= 0) {
      this.initGame();
    } else {
      this.dungeonLevel++;
      this.spawnEnemy();
      this.player.energy = this.player.maxEnergy;
      this.player.block = 0;
      this.renderStash();
      this.updateUI();
      this.log(`⚔️ 深入地牢第 ${this.dungeonLevel + 1} 層！遇見了【${this.currentEnemy.name}】！`);
    }
  }

  updateUI() {
    // 玩家狀態
    const playerHpPct = (this.player.hp / this.player.maxHp) * 100;
    this.playerHpBarEl.style.width = `${playerHpPct}%`;
    this.playerHpTextEl.textContent = `${this.player.hp} / ${this.player.maxHp}`;
    this.playerBlockEl.textContent = `🛡️ 護盾: ${this.player.block}`;
    this.energyDisplayEl.textContent = `${this.player.energy} / ${this.player.maxEnergy}`;

    // 敵人狀態
    if (this.currentEnemy) {
      this.enemyAvatarEl.textContent = this.currentEnemy.emoji;
      this.enemyNameEl.textContent = this.currentEnemy.name;
      const enemyHpPct = (this.currentEnemy.hp / this.currentEnemy.maxHp) * 100;
      this.enemyHpBarEl.style.width = `${enemyHpPct}%`;
      this.enemyHpTextEl.textContent = `${this.currentEnemy.hp} / ${this.currentEnemy.maxHp}`;
      this.enemyIntentEl.textContent = `⚔️ 準備攻擊 ${this.currentEnemy.attack} 點`;
    }
  }

  log(msg) {
    this.gameLogEl.textContent = msg;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new BackpackGame();
});
