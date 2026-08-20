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
    this.draggedItemObj = null; // 當前正在拖曳的物件 { source: 'stash'|'placed', obj }
    this.touchState = null; // 手機觸控拖曳的暫存狀態

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

    // 備用箱也做成 Drop 區域（拖回備用箱）
    this.stashContainerEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.stashContainerEl.classList.add('drag-over');
    });

    this.stashContainerEl.addEventListener('dragleave', () => {
      this.stashContainerEl.classList.remove('drag-over');
    });

    this.stashContainerEl.addEventListener('drop', (e) => {
      e.preventDefault();
      this.stashContainerEl.classList.remove('drag-over');
      if (this.draggedItemObj && this.draggedItemObj.source === 'placed') {
        this.returnPlacedItemToStash(this.draggedItemObj.obj);
        this.draggedItemObj = null;
      }
    });

    // 全域快捷鍵 (R 鍵旋轉)
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
    this.log('冒險開始！你可以點擊選取或直接「拖曳裝備」進背包整理！(按 R 可旋轉)');
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

        // Drag & Drop 事件：整個裝備形狀涵蓋的所有格子同步高亮預覽
        cell.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (this.draggedItemObj) {
            const itemObj = this.draggedItemObj.obj;
            this.highlightGridCells(r, c, itemObj.shape, itemObj);
          }
        });

        cell.addEventListener('dragleave', () => {
          this.clearGridHighlights();
        });

        cell.addEventListener('drop', (e) => {
          e.preventDefault();
          this.clearGridHighlights();
          this.handleDropOnCell(r, c);
        });

        this.backpackGridEl.appendChild(cell);
      }
    }
  }

  // 高亮涵蓋的所有網格 (合法為 drag-over 藍光，衝突/超出為 invalid-over 紅光)
  highlightGridCells(startR, startC, shape, draggedItem) {
    this.clearGridHighlights();

    // 若拖曳的是已放置物品，預覽時暫時無視它原先佔用的格子
    if (this.draggedItemObj && this.draggedItemObj.source === 'placed') {
      this.clearGridForPlacedItem(draggedItem);
    }

    const isValid = this.canPlaceItem(shape, startR, startC);
    const h = shape.length;
    const w = shape[0].length;

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (shape[r][c] === 1) {
          const targetR = startR + r;
          const targetC = startC + c;
          if (targetR < this.gridRows && targetC < this.gridCols) {
            const cell = this.backpackGridEl.querySelector(`.grid-cell[data-r="${targetR}"][data-c="${targetC}"]`);
            if (cell) {
              cell.classList.add(isValid ? 'drag-over' : 'invalid-over');
            }
          }
        }
      }
    }

    // 復原已放置物品的網格佔用
    if (this.draggedItemObj && this.draggedItemObj.source === 'placed') {
      this.fillGridForPlacedItem(draggedItem);
    }
  }

  clearGridHighlights() {
    const cells = this.backpackGridEl.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
      cell.classList.remove('drag-over', 'invalid-over');
    });
  }

  // 讀取實際渲染出的網格尺寸（隨 --cell-size 響應式變化），確保縮圖與定位永遠對齊
  getCellMetrics() {
    const sampleCell = this.backpackGridEl.querySelector('.grid-cell');
    if (!sampleCell) return { cellWidth: 60, cellHeight: 60, gap: 6 };
    const rect = sampleCell.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(this.backpackGridEl).columnGap) || 0;
    return { cellWidth: rect.width, cellHeight: rect.height, gap };
  }

  // 依觸控座標推算對應的背包格子（不用 elementFromPoint，避免被已放置裝備的浮層擋住判斷）
  cellFromPoint(clientX, clientY) {
    const rect = this.backpackGridEl.getBoundingClientRect();
    const style = getComputedStyle(this.backpackGridEl);
    const { cellWidth, cellHeight, gap } = this.getCellMetrics();
    const x = clientX - rect.left - (parseFloat(style.paddingLeft) || 0);
    const y = clientY - rect.top - (parseFloat(style.paddingTop) || 0);
    if (x < 0 || y < 0) return null;
    const c = Math.floor(x / (cellWidth + gap));
    const r = Math.floor(y / (cellHeight + gap));
    if (r < 0 || r >= this.gridRows || c < 0 || c >= this.gridCols) return null;
    return { r, c };
  }

  isPointInStash(clientX, clientY) {
    const rect = this.stashContainerEl.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  returnPlacedItemToStash(pi) {
    this.removePlacedItem(pi);
    this.stashItems.push({ instanceId: pi.instanceId, item: pi.item, shape: pi.shape });
    this.renderStash();
    this.renderPlacedItems();
    this.log(`將【${pi.item.name}】移回了備用箱！`);
  }

  // 建立跟隨手指移動的觸控拖曳縮圖（與滑鼠版 DragImage 外觀一致）
  createTouchGhost(itemObj) {
    const { cellWidth, cellHeight, gap } = this.getCellMetrics();
    const shape = itemObj.shape;
    const w = shape[0].length;
    const h = shape.length;

    const ghost = document.createElement('div');
    ghost.className = 'touch-ghost';
    ghost.style.width = `${w * cellWidth + (w - 1) * gap}px`;
    ghost.style.height = `${h * cellHeight + (h - 1) * gap}px`;
    ghost.innerHTML = `
      <span style="font-size: 1.4rem;">${itemObj.item.icon}</span>
      <span style="font-size: 0.7rem; color: #f59e0b; font-weight:700;">${itemObj.item.name}</span>
    `;
    document.body.appendChild(ghost);
    return ghost;
  }

  updateTouchGhostPosition(ghost, clientX, clientY) {
    const w = ghost.offsetWidth;
    const h = ghost.offsetHeight;
    ghost.style.left = `${clientX - w / 2}px`;
    ghost.style.top = `${clientY - h / 2 - 46}px`; // 往上偏移，避免手指擋住縮圖
  }

  // 觸控版拖曳：先記錄起點，移動超過門檻才視為「拖曳」，讓單純點擊仍能正常觸發原生 click
  onTouchStart(e, source, obj, el) {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    this.touchState = {
      source, obj, el,
      startX: t.clientX, startY: t.clientY,
      dragging: false,
      ghost: null,
      hoverCell: null
    };
  }

  onTouchMove(e) {
    const state = this.touchState;
    if (!state) return;
    const t = e.touches[0];
    const dx = t.clientX - state.startX;
    const dy = t.clientY - state.startY;

    if (!state.dragging) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      state.dragging = true;
      this.draggedItemObj = { source: state.source, obj: state.obj };
      if (state.source === 'stash') this.selectedStashItem = state.obj;
      state.ghost = this.createTouchGhost(state.obj);
      state.el.classList.add('dragging');
    }

    e.preventDefault();
    this.updateTouchGhostPosition(state.ghost, t.clientX, t.clientY);

    const cell = this.cellFromPoint(t.clientX, t.clientY);
    if (cell) {
      state.hoverCell = cell;
      this.stashContainerEl.classList.remove('drag-over');
      this.highlightGridCells(cell.r, cell.c, state.obj.shape, state.obj);
    } else {
      state.hoverCell = null;
      this.clearGridHighlights();
      this.stashContainerEl.classList.toggle('drag-over', this.isPointInStash(t.clientX, t.clientY));
    }
  }

  onTouchEnd(e) {
    const state = this.touchState;
    if (!state) return;
    this.touchState = null;
    if (!state.dragging) return; // 單純點擊，交給原生 click 事件處理

    e.preventDefault();
    if (state.ghost) state.ghost.remove();
    state.el.classList.remove('dragging');
    this.clearGridHighlights();
    this.stashContainerEl.classList.remove('drag-over');

    if (state.hoverCell) {
      this.handleDropOnCell(state.hoverCell.r, state.hoverCell.c);
    } else {
      const t = e.changedTouches[0];
      if (state.source === 'placed' && this.isPointInStash(t.clientX, t.clientY)) {
        this.returnPlacedItemToStash(state.obj);
      }
      this.draggedItemObj = null;
    }
  }

  onTouchCancel() {
    const state = this.touchState;
    this.touchState = null;
    if (!state || !state.dragging) return;
    if (state.ghost) state.ghost.remove();
    state.el.classList.remove('dragging');
    this.clearGridHighlights();
    this.stashContainerEl.classList.remove('drag-over');
    this.draggedItemObj = null;
  }

  // 建立與裝備實際尺寸、形狀與 Icon 完全一致的動態 DragImage 縮圖
  createCustomDragImage(e, itemObj) {
    const shape = itemObj.shape;
    const { cellWidth, cellHeight, gap } = this.getCellMetrics();
    const w = shape[0].length;
    const h = shape.length;

    const dragImg = document.createElement('div');
    dragImg.style.position = 'absolute';
    dragImg.style.top = '-9999px';
    dragImg.style.left = '-9999px';
    dragImg.style.width = `${w * cellWidth + (w - 1) * gap}px`;
    dragImg.style.height = `${h * cellHeight + (h - 1) * gap}px`;
    dragImg.style.background = 'linear-gradient(135deg, #374151, #1f2937)';
    dragImg.style.border = '2px solid #f59e0b';
    dragImg.style.borderRadius = '8px';
    dragImg.style.display = 'flex';
    dragImg.style.flexDirection = 'column';
    dragImg.style.alignItems = 'center';
    dragImg.style.justifyContent = 'center';
    dragImg.style.boxShadow = '0 8px 16px rgba(0,0,0,0.5)';
    dragImg.style.opacity = '0.9';

    dragImg.innerHTML = `
      <span style="font-size: 1.4rem;">${itemObj.item.icon}</span>
      <span style="font-size: 0.7rem; color: #f59e0b; font-weight:700;">${itemObj.item.name}</span>
    `;

    document.body.appendChild(dragImg);
    e.dataTransfer.setDragImage(dragImg, cellWidth / 2, cellHeight / 2);

    setTimeout(() => {
      document.body.removeChild(dragImg);
    }, 0);
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
      card.draggable = true; // 啟用 HTML5 拖曳

      card.innerHTML = `
        <div class="item-icon">${st.item.icon}</div>
        <div class="item-details">
          <div class="item-title">${st.item.name} (${st.shape[0].length}x${st.shape.length})</div>
          <div class="item-desc">${st.item.description}</div>
        </div>
        <div class="item-cost">⚡${st.item.cost}</div>
      `;

      // 點擊選取
      card.addEventListener('click', () => {
        this.selectedStashItem = st;
        this.log(`選取了【${st.item.name}】！點擊背包網格或拖曳放入，按 R 鍵可旋轉。`);
        this.renderStash();
      });

      // 拖曳事件監聽 (搭配自訂形狀 DragImage 縮圖)
      card.addEventListener('dragstart', (e) => {
        this.selectedStashItem = st;
        this.draggedItemObj = { source: 'stash', obj: st };
        card.classList.add('dragging');
        this.createCustomDragImage(e, st);
        e.dataTransfer.setData('text/plain', st.instanceId);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        this.clearGridHighlights();
      });

      // 手機觸控拖曳
      card.addEventListener('touchstart', (e) => this.onTouchStart(e, 'stash', st, card), { passive: true });
      card.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
      card.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
      card.addEventListener('touchcancel', () => this.onTouchCancel(), { passive: true });

      this.stashContainerEl.appendChild(card);
    });
  }

  renderPlacedItems() {
    // 移除現有的放置物 DOM (保留背景網格)
    const existing = this.backpackGridEl.querySelectorAll('.placed-item');
    existing.forEach(el => el.remove());

    const { cellWidth, cellHeight, gap } = this.getCellMetrics();

    this.placedItems.forEach((pi) => {
      const el = document.createElement('div');
      el.className = 'placed-item';
      el.draggable = true; // 背包內的物品也可以拖曳移動位置或拉回備用箱
      
      const widthCols = pi.shape[0].length;
      const heightRows = pi.shape.length;

      // 取得起點格子 DOM，精準取得其相對於 grid-container 的絕對偏移距離 offsetLeft / offsetTop
      const targetCell = this.backpackGridEl.querySelector(`.grid-cell[data-r="${pi.r}"][data-c="${pi.c}"]`);
      
      if (targetCell) {
        el.style.width = `${widthCols * cellWidth + (widthCols - 1) * gap}px`;
        el.style.height = `${heightRows * cellHeight + (heightRows - 1) * gap}px`;
        el.style.left = `${targetCell.offsetLeft}px`;
        el.style.top = `${targetCell.offsetTop}px`;
      }

      el.innerHTML = `
        <span style="font-size: 1.4rem;">${pi.item.icon}</span>
        <span style="font-size: 0.7rem; color: var(--accent-gold); font-weight:700;">${pi.item.name}</span>
      `;

      // 點擊發動裝備
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.useItem(pi);
      });

      // 拖曳已放置的物品
      el.addEventListener('dragstart', (e) => {
        this.selectedStashItem = null;
        this.draggedItemObj = { source: 'placed', obj: pi };
        el.style.opacity = '0.5';
        this.createCustomDragImage(e, pi);
        e.dataTransfer.setData('text/plain', pi.instanceId);
      });

      el.addEventListener('dragend', () => {
        el.style.opacity = '1';
        this.clearGridHighlights();
      });

      // 手機觸控拖曳
      el.addEventListener('touchstart', (e) => this.onTouchStart(e, 'placed', pi, el), { passive: true });
      el.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
      el.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
      el.addEventListener('touchcancel', () => this.onTouchCancel(), { passive: true });

      this.backpackGridEl.appendChild(el);
    });
  }

  handleDropOnCell(targetR, targetC) {
    if (!this.draggedItemObj) return;

    if (this.draggedItemObj.source === 'stash') {
      const st = this.draggedItemObj.obj;
      if (this.canPlaceItem(st.shape, targetR, targetC)) {
        this.placeItem(st, targetR, targetC);
        this.stashItems = this.stashItems.filter(s => s !== st);
        this.selectedStashItem = null;
        this.renderStash();
        this.renderPlacedItems();
        this.log(`成功將【${st.item.name}】拖曳放進背包！`);
      } else {
        this.log(`無法放置【${st.item.name}】：空間被佔用或超出邊界！`);
      }
    } else if (this.draggedItemObj.source === 'placed') {
      const pi = this.draggedItemObj.obj;
      // 暫時將其從網格移除來測試能否放入新位置
      this.clearGridForPlacedItem(pi);
      
      if (this.canPlaceItem(pi.shape, targetR, targetC)) {
        pi.r = targetR;
        pi.c = targetC;
        this.fillGridForPlacedItem(pi);
        this.renderPlacedItems();
        this.log(`移動了【${pi.item.name}】的位置！`);
      } else {
        // 放不進去，恢復原位置
        this.fillGridForPlacedItem(pi);
        this.renderPlacedItems();
        this.log(`無法移動【${pi.item.name}】：目標位置無足夠空間！`);
      }
    }

    this.draggedItemObj = null;
  }

  onGridCellClick(r, c) {
    if (this.selectedStashItem) {
      const st = this.selectedStashItem;
      if (this.canPlaceItem(st.shape, r, c)) {
        this.placeItem(st, r, c);
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

    this.fillGridForPlacedItem(placedObj);
    this.placedItems.push(placedObj);
  }

  fillGridForPlacedItem(placedObj) {
    const { shape, r: startR, c: startC } = placedObj;
    const h = shape.length;
    const w = shape[0].length;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (shape[r][c] === 1) {
          this.grid[startR + r][startC + c] = placedObj;
        }
      }
    }
  }

  clearGridForPlacedItem(placedObj) {
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        if (this.grid[r][c] === placedObj) {
          this.grid[r][c] = null;
        }
      }
    }
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
    this.placedItems.forEach((other) => {
      if (other.item.passive === 'boost_above_weapon') {
        if (other.c === placedObj.c && other.r === placedObj.r + placedObj.shape.length) {
          bonus += (other.item.bonusDamage || 4);
        }
      }
    });
    return bonus;
  }

  removePlacedItem(placedObj) {
    this.placedItems = this.placedItems.filter(p => p !== placedObj);
    this.clearGridForPlacedItem(placedObj);
    this.renderPlacedItems();
  }

  endTurn() {
    this.log(`⏳ 回合結束！輪到【${this.currentEnemy.name}】行動！`);

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
    const playerHpPct = (this.player.hp / this.player.maxHp) * 100;
    this.playerHpBarEl.style.width = `${playerHpPct}%`;
    this.playerHpTextEl.textContent = `${this.player.hp} / ${this.player.maxHp}`;
    this.playerBlockEl.textContent = `🛡️ 護盾: ${this.player.block}`;
    this.energyDisplayEl.textContent = `${this.player.energy} / ${this.player.maxEnergy}`;

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
