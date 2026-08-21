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
    this.maxStar = 3; // 合成升星上限

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
    this.itemDetailBarEl = document.getElementById('item-detail-bar');
    this.turnToastEl = document.getElementById('turn-toast');
    this.turnToastTextEl = document.getElementById('turn-toast-text');

    // 綁定按鈕事件
    document.getElementById('rotate-btn').addEventListener('click', () => this.rotateSelected());
    document.getElementById('end-turn-btn').addEventListener('click', () => this.endTurn());
    document.getElementById('modal-next-btn').addEventListener('click', () => this.nextLevel());

    // 全螢幕按鈕（Android Chrome 等支援 Fullscreen API 的瀏覽器可一鍵全螢幕；
    // iOS Safari 對此 API 支援有限，主要仍建議「加入主畫面」以 PWA 模式啟動）
    this.fullscreenBtnEl = document.getElementById('fullscreen-btn');
    this.fullscreenBtnEl.addEventListener('click', () => this.toggleFullscreen());
    document.addEventListener('fullscreenchange', () => this.updateFullscreenBtn());
    document.addEventListener('webkitfullscreenchange', () => this.updateFullscreenBtn());

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

  isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  toggleFullscreen() {
    if (this.isFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }

    const el = document.documentElement;
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!request) {
      this.log('這個瀏覽器不支援全螢幕 API，可改用「加入主畫面」以全螢幕模式啟動！');
      return;
    }

    request.call(el).then(() => {
      // 進入全螢幕後嘗試鎖定直向（部分瀏覽器不支援，失敗也不影響遊戲）
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('portrait').catch(() => {});
      }
    }).catch(() => {
      this.log('無法進入全螢幕，請改用「加入主畫面」以全螢幕模式啟動！');
    });
  }

  // 畫面中央顯示回合切換提示，1 秒後自動淡出消失
  showTurnToast(text) {
    if (!this.turnToastEl) return;
    this.turnToastTextEl.textContent = text;
    this.turnToastEl.classList.add('show');
    clearTimeout(this.turnToastTimer);
    this.turnToastTimer = setTimeout(() => {
      this.turnToastEl.classList.remove('show');
    }, 500);
  }

  updateFullscreenBtn() {
    if (!this.fullscreenBtnEl) return;
    const active = this.isFullscreen();
    this.fullscreenBtnEl.textContent = active ? '⛝' : '⛶';
    this.fullscreenBtnEl.title = active ? '離開全螢幕' : '全螢幕遊玩';
  }

  initGame() {
    this.dungeonLevel = 0;
    this.player.hp = this.player.maxHp;
    this.player.block = 0;
    this.player.energy = this.player.maxEnergy;
    this.clearStashSelection();
    // 重新開始冒險時，清空背包網格（上一輪的裝備不應該留在新的一輪裡）
    this.placedItems = [];
    this.grid = Array(this.gridRows).fill(null).map(() => Array(this.gridCols).fill(null));

    // 初始贈送裝備進入備用箱
    this.stashItems = [
      { instanceId: 'init_1', item: ITEMS_DATABASE[0], shape: JSON.parse(JSON.stringify(ITEMS_DATABASE[0].shape)), star: 1 }, // 鐵劍
      { instanceId: 'init_2', item: ITEMS_DATABASE[1], shape: JSON.parse(JSON.stringify(ITEMS_DATABASE[1].shape)), star: 1 }, // 木盾
      { instanceId: 'init_3', item: ITEMS_DATABASE[2], shape: JSON.parse(JSON.stringify(ITEMS_DATABASE[2].shape)), star: 1 }  // 藥水
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

  // 高亮涵蓋的所有網格 (合法為 drag-over 藍光，合成目標為 merge-over 金光，衝突/超出為 invalid-over 紅光)
  highlightGridCells(startR, startC, shape, draggedItem) {
    this.clearGridHighlights();

    // 優先檢測是否有可合成目標裝備
    const mergeTarget = this.findMergeTargetOnGrid(draggedItem, startR, startC);

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
              if (mergeTarget) {
                cell.classList.add('merge-over');
              } else if (isValid) {
                cell.classList.add('drag-over');
              } else {
                cell.classList.add('invalid-over');
              }
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
      cell.classList.remove('drag-over', 'invalid-over', 'merge-over');
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

  // 點擊物資箱 icon：選取並在畫面上方（角色區塊下方）顯示形狀／名稱／描述
  selectStashItem(st) {
    this.selectedStashItem = st;
    this.renderItemDetail(st);
    this.renderStash();
    this.log(`選取了【${st.item.name}】！點擊背包網格或拖曳放入，按 R 鍵可旋轉。`);
  }

  clearStashSelection() {
    this.selectedStashItem = null;
    this.hideItemDetail();
  }

  renderItemDetail(st) {
    if (!this.itemDetailBarEl) return;
    const shape = st.shape;
    const h = shape.length;
    const w = shape[0].length;
    const star = st.star || 1;

    let cellsHtml = '';
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        cellsHtml += `<span class="cell ${shape[r][c] ? '' : 'off'}"></span>`;
      }
    }

    this.itemDetailBarEl.innerHTML = `
      <span class="item-detail-icon">${st.item.icon}</span>
      <span class="item-detail-shape" style="grid-template-columns: repeat(${w}, 1fr); grid-template-rows: repeat(${h}, 1fr);">${cellsHtml}</span>
      <span class="item-detail-info">
        <span class="item-detail-name">${st.item.name}${star > 1 ? ` <span class="item-detail-star">${'★'.repeat(star)}</span>` : ''}<span class="item-detail-dim">${w}×${h}</span></span>
        <span class="item-detail-desc">${st.item.description}</span>
      </span>
      <span class="item-detail-cost">⚡${st.item.cost}</span>
    `;
    this.itemDetailBarEl.classList.add('show');
  }

  hideItemDetail() {
    if (!this.itemDetailBarEl) return;
    this.itemDetailBarEl.classList.remove('show');
    this.itemDetailBarEl.innerHTML = '';
  }

  returnPlacedItemToStash(pi) {
    this.removePlacedItem(pi);
    this.stashItems.push({ instanceId: pi.instanceId, item: pi.item, shape: pi.shape, star: pi.star || 1 });
    this.renderStash();
    this.renderPlacedItems();
    this.log(`將【${pi.item.name}】移回了備用箱！`);
  }

  // 星等效果縮放：2 星 = 1.5 倍、3 星 = 2 倍，四捨五入取整數
  starMultiplier(star) {
    return 1 + ((star || 1) - 1) * 0.5;
  }

  scaledValue(base, star) {
    return Math.round((base || 0) * this.starMultiplier(star));
  }

  // 星等效果縮放：2 星 = 1.5 倍、3 星 = 2 倍，四捨五入取整數
  starMultiplier(star) {
    return 1 + ((star || 1) - 1) * 0.5;
  }

  scaledValue(base, star) {
    return Math.round((base || 0) * this.starMultiplier(star));
  }

  // 判斷兩件裝備是否可以合成升星 (同裝備 ID、同星等、星等 < 3)
  canMerge(a, b) {
    if (!a || !b || a === b) return false;
    if (a.instanceId === b.instanceId) return false;
    if (a.item.id !== b.item.id) return false;
    const starA = a.star || 1;
    const starB = b.star || 1;
    if (starA !== starB) return false;
    if (starA >= this.maxStar) return false;
    return true;
  }

  // 檢測懸停網格位置是否有可以與 draggedObj 合成的裝備
  findMergeTargetOnGrid(draggedObj, startR, startC) {
    if (!draggedObj) return null;
    const shape = draggedObj.shape;
    const h = shape.length;
    const w = shape[0].length;

    // 若拖拽的是已放置物品，暫時清空其佔用格子以利精準碰撞
    if (this.draggedItemObj && this.draggedItemObj.source === 'placed') {
      this.clearGridForPlacedItem(draggedObj);
    }

    let targetItem = null;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (shape[r][c] === 1) {
          const targetR = startR + r;
          const targetC = startC + c;
          if (targetR < this.gridRows && targetC < this.gridCols) {
            const occupant = this.grid[targetR][targetC];
            if (occupant && occupant !== draggedObj && this.canMerge(draggedObj, occupant)) {
              targetItem = occupant;
              break;
            }
          }
        }
      }
      if (targetItem) break;
    }

    if (this.draggedItemObj && this.draggedItemObj.source === 'placed') {
      this.fillGridForPlacedItem(draggedObj);
    }

    return targetItem;
  }

  // 執行拖曳合成 (支援放置裝備與物資箱裝備任意組合)
  performDragMerge(sourceItem, targetItem, targetR, targetC) {
    const newStar = (sourceItem.star || 1) + 1;

    // 移除來源裝備
    if (this.draggedItemObj.source === 'stash') {
      this.stashItems = this.stashItems.filter(s => s !== sourceItem);
    } else if (this.draggedItemObj.source === 'placed') {
      this.removePlacedItem(sourceItem);
    }

    // 移除目標裝備
    const isTargetPlaced = this.placedItems.includes(targetItem);
    let finalR = targetR;
    let finalC = targetC;
    if (isTargetPlaced) {
      finalR = targetItem.r;
      finalC = targetItem.c;
      this.removePlacedItem(targetItem);
    } else {
      this.stashItems = this.stashItems.filter(s => s !== targetItem);
    }

    // 建立合成後升星的新裝備
    const mergedObj = {
      instanceId: `merged_${sourceItem.instanceId}_${targetItem.instanceId}`,
      item: sourceItem.item,
      shape: JSON.parse(JSON.stringify(sourceItem.item.shape)),
      star: newStar,
      usedThisTurn: false
    };

    if (isTargetPlaced && this.canPlaceItem(mergedObj.shape, finalR, finalC)) {
      this.placeItem(mergedObj, finalR, finalC);
      this.renderPlacedItems();
    } else {
      this.stashItems.push(mergedObj);
      this.renderStash();
      this.renderPlacedItems();
    }

    this.selectStashItem(mergedObj);
    this.log(`✨ 合成成功！【${mergedObj.item.name}】拖曳升級為 ${'★'.repeat(newStar)}！`);
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
      if (state.source === 'stash') {
        // 拖曳中途避免重繪物資箱（會讓 state.el 失去參照），只更新詳情顯示
        this.selectedStashItem = state.obj;
        this.renderItemDetail(state.obj);
      }
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

  // 底部橫向物資箱：只顯示 icon，形狀／名稱／描述點擊後改顯示在上方 item-detail-bar
  renderStash() {
    this.stashContainerEl.innerHTML = '';
    if (this.stashItems.length === 0) {
      this.stashContainerEl.innerHTML = '<div class="stash-empty-hint">備用箱空空如也</div>';
      return;
    }

    this.stashItems.forEach((st) => {
      const star = st.star || 1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `stash-icon-btn ${this.selectedStashItem === st ? 'selected' : ''}`;
      btn.draggable = true; // 啟用 HTML5 拖曳
      btn.innerHTML = `
        <span class="stash-icon-emoji">${st.item.icon}</span>
        <span class="stash-icon-cost">⚡${st.item.cost}</span>
        ${star > 1 ? `<span class="stash-icon-star">★${star}</span>` : ''}
      `;

      // 點擊：選取並在上方顯示詳情
      btn.addEventListener('click', () => {
        this.selectStashItem(st);
      });

      // 物資箱圖示支援拖曳懸停與放置合成
      btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.draggedItemObj && this.canMerge(this.draggedItemObj.obj, st)) {
          btn.classList.add('merge-over');
        }
      });

      btn.addEventListener('dragleave', () => {
        btn.classList.remove('merge-over');
      });

      btn.addEventListener('drop', (e) => {
        e.preventDefault();
        btn.classList.remove('merge-over');
        if (this.draggedItemObj && this.canMerge(this.draggedItemObj.obj, st)) {
          this.performDragMerge(this.draggedItemObj.obj, st, 0, 0);
          this.draggedItemObj = null;
        }
      });

      // 拖曳事件監聽 (搭配自訂形狀 DragImage 縮圖)。拖曳中途不重繪物資箱，避免節點參照失效
      btn.addEventListener('dragstart', (e) => {
        this.selectedStashItem = st;
        this.renderItemDetail(st);
        this.draggedItemObj = { source: 'stash', obj: st };
        btn.classList.add('dragging');
        this.createCustomDragImage(e, st);
        e.dataTransfer.setData('text/plain', st.instanceId);
      });

      btn.addEventListener('dragend', () => {
        btn.classList.remove('dragging');
        this.clearGridHighlights();
      });

      // 手機觸控拖曳
      btn.addEventListener('touchstart', (e) => this.onTouchStart(e, 'stash', st, btn), { passive: true });
      btn.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
      btn.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
      btn.addEventListener('touchcancel', () => this.onTouchCancel(), { passive: true });

      this.stashContainerEl.appendChild(btn);
    });
  }

  renderPlacedItems() {
    // 移除現有的放置物 DOM (保留背景網格)
    const existing = this.backpackGridEl.querySelectorAll('.placed-item');
    existing.forEach(el => el.remove());

    const { cellWidth, cellHeight, gap } = this.getCellMetrics();

    this.placedItems.forEach((pi) => {
      const star = pi.star || 1;
      const el = document.createElement('div');
      el.className = `placed-item ${pi.usedThisTurn ? 'used' : ''}`;
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
        ${star > 1 ? `<span class="placed-item-star">★${star}</span>` : ''}
      `;

      // 點擊發動裝備
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.useItem(pi);
      });

      // 拖曳已放置的物品
      el.addEventListener('dragstart', (e) => {
        this.clearStashSelection();
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

    const sourceObj = this.draggedItemObj.obj;

    // 優先檢測是否有可合成的目標裝備
    const mergeTarget = this.findMergeTargetOnGrid(sourceObj, targetR, targetC);
    if (mergeTarget) {
      this.performDragMerge(sourceObj, mergeTarget, targetR, targetC);
      this.draggedItemObj = null;
      return;
    }

    if (this.draggedItemObj.source === 'stash') {
      const st = sourceObj;
      if (this.canPlaceItem(st.shape, targetR, targetC)) {
        this.placeItem(st, targetR, targetC);
        this.stashItems = this.stashItems.filter(s => s !== st);
        this.clearStashSelection();
        this.renderStash();
        this.renderPlacedItems();
        this.log(`成功將【${st.item.name}】拖曳放進背包！`);
      } else {
        this.log(`無法放置【${st.item.name}】：空間被佔用或超出邊界！`);
      }
    } else if (this.draggedItemObj.source === 'placed') {
      const pi = sourceObj;
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
        this.clearStashSelection();
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
      shape: shape,
      star: stashObj.star || 1,
      usedThisTurn: false
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
      this.renderItemDetail(this.selectedStashItem);
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

    // 主動裝備（武器／防具／藥水）每回合限用一次，避免 0 能量消耗的裝備無限連打
    if (placedObj.usedThisTurn) {
      this.log(`【${item.name}】本回合已經使用過了，下回合才能再用！`);
      return;
    }

    if (this.player.energy < item.cost) {
      this.log(`能量不足！使用【${item.name}】需要 ${item.cost} 點能量。`);
      return;
    }

    this.player.energy -= item.cost;
    const star = placedObj.star || 1;
    let bonus = this.calculatePassiveBonus(placedObj);

    if (item.type === 'weapon') {
      let dmg = this.scaledValue(item.effect.damage, star) + bonus;
      this.currentEnemy.hp = Math.max(0, this.currentEnemy.hp - dmg);
      this.log(`⚔️ 你使用【${item.name}】造成了 ${dmg} 點傷害！${bonus > 0 ? `(加成 +${bonus})` : ''}`);
      placedObj.usedThisTurn = true;
    } else if (item.type === 'shield') {
      let block = this.scaledValue(item.effect.block, star) + bonus;
      this.player.block += block;
      this.log(`🛡️ 你使用【${item.name}】獲得了 ${block} 點護盾！${bonus > 0 ? `(加成 +${bonus})` : ''}`);
      placedObj.usedThisTurn = true;
    } else if (item.type === 'potion') {
      let heal = this.scaledValue(item.effect.heal || 0, star);
      let energyGain = this.scaledValue(item.effect.energy || 0, star);
      if (heal > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      if (energyGain > 0) this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + energyGain);
      const parts = [];
      if (heal > 0) parts.push(`恢復了 ${heal} 點生命值`);
      if (energyGain > 0) parts.push(`回復了 ${energyGain} 點能量`);
      this.log(`🧪 你使用了【${item.name}】，${parts.join('、')}！`);
      placedObj.usedThisTurn = true;

      if (item.consumable) {
        this.removePlacedItem(placedObj);
      }
    } else {
      this.log(`【${item.name}】為被動配件，會在相鄰物品效果中自動加成！`);
    }

    this.renderPlacedItems();
    this.updateUI();

    if (this.currentEnemy.hp <= 0) {
      this.handleVictory();
      return;
    }

    // 能量用盡時直接自動結束回合，不用等玩家按按鈕
    if (this.player.energy <= 0) {
      this.endTurn();
    }
  }

  calculatePassiveBonus(placedObj) {
    const isWeapon = placedObj.item.type === 'weapon';
    const isShield = placedObj.item.type === 'shield';
    if (!isWeapon && !isShield) return 0;

    const targetRStart = placedObj.r;
    const targetREnd = placedObj.r + placedObj.shape.length - 1;
    const targetCStart = placedObj.c;
    const targetCEnd = placedObj.c + placedObj.shape[0].length - 1;

    let bonus = 0;
    this.placedItems.forEach((other) => {
      if (!other.item.passive) return;

      const otherCStart = other.c;
      const otherCEnd = other.c + other.shape[0].length - 1;
      const isColOverlap = Math.max(targetCStart, otherCStart) <= Math.min(targetCEnd, otherCEnd);
      if (!isColOverlap) return;

      if (isWeapon && other.item.passive === 'boost_above_weapon') {
        // 紅寶石 (位於武器正下方)：寶石頂端 row 等於 武器底端 row + 1
        if (other.r === targetREnd + 1) {
          const base = other.item.bonusDamage || 4;
          bonus += this.scaledValue(base, other.star || 1);
        }
      } else if (isShield && other.item.passive === 'boost_above_shield') {
        // 藍寶石 (位於防具正下方)：寶石頂端 row 等於 防具底端 row + 1
        if (other.r === targetREnd + 1) {
          const base = other.item.bonusBlock || 4;
          bonus += this.scaledValue(base, other.star || 1);
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
    this.showTurnToast('⏳ 回合結束');
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
    // 新回合開始，解除所有裝備的「本回合已使用」鎖定
    this.placedItems.forEach(p => { p.usedThisTurn = false; });
    this.renderPlacedItems();
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
      shape: JSON.parse(JSON.stringify(randomLoot.shape)),
      star: 1
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
      // 新的一層開始，解除所有裝備的「本回合已使用」鎖定
      this.placedItems.forEach(p => { p.usedThisTurn = false; });
      this.renderPlacedItems();
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
  window.game = new BackpackGame();
});
