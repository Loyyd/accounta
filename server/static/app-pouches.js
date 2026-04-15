(function () {
  const app = window.AccountaApp

  function formatDateInputValue(date = new Date()) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function formatTransferDirection(direction) {
    return direction === 'from_pouch' ? 'To main account' : 'To pouch'
  }

  function getPouchById(pouchId) {
    return app.state.pouches.find((pouch) => pouch.id === pouchId) || null
  }

  function getPouchTransfers(pouchId) {
    return app.state.pouchTransfers
      .filter((transfer) => transfer.pouchId === pouchId)
      .sort((left, right) => right.date - left.date)
  }

  async function loadPouches() {
    try {
      const [pouchesResponse, transfersResponse] = await Promise.all([
        app.apiFetch('GET', '/pouches'),
        app.apiFetch('GET', '/pouch-transfers'),
      ])

      if (!pouchesResponse.ok || !transfersResponse.ok) {
        throw new Error('Failed to load pouch data')
      }

      app.state.pouches = await pouchesResponse.json()
      const transfers = await transfersResponse.json()
      app.state.pouchTransfers = transfers.map((transfer) => ({
        ...transfer,
        date: new Date(transfer.date).getTime(),
      }))
    } catch (error) {
      console.error('Failed to load pouches', error)
      app.state.pouches = []
      app.state.pouchTransfers = []
    }
  }

  async function createPouch(name) {
    const trimmed = name.trim()
    if (!trimmed) {
      return null
    }

    const response = await app.apiFetch('POST', '/pouches', {name: trimmed})
    if (!response.ok) {
      const payload = await response.json().catch(() => ({error: 'Failed to create pouch'}))
      alert(payload.error || 'Failed to create pouch')
      return null
    }

    const pouch = await response.json()
    await loadPouches()
    app.render()
    app.switchTab(`pouch-${pouch.id}`)
    return pouch
  }

  async function removePouch(pouchId) {
    const pouch = getPouchById(pouchId)
    if (!pouch) {
      return
    }

    const confirmed = window.confirm(`Delete "${pouch.name}" and all of its transfers?`)
    if (!confirmed) {
      return
    }

    const response = await app.apiFetch('DELETE', `/pouches/${pouchId}`)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({error: 'Failed to delete pouch'}))
      alert(payload.error || 'Failed to delete pouch')
      return
    }

    await loadPouches()
    app.switchTab('overview')
    app.render()
  }

  async function addTransfer(pouchId, payload) {
    const response = await app.apiFetch('POST', `/pouches/${pouchId}/transfers`, payload)
    if (!response.ok) {
      const message = await response.json().catch(() => ({error: 'Failed to transfer money'}))
      alert(message.error || 'Failed to transfer money')
      return false
    }

    await loadPouches()
    app.render()
    app.switchTab(`pouch-${pouchId}`)
    return true
  }

  function openPouchModal() {
    if (!app.dom.pouchModal) {
      return
    }

    app.dom.pouchModal.hidden = false
    app.dom.newPouchNameInput?.focus()
  }

  function closePouchModal() {
    if (!app.dom.pouchModal) {
      return
    }

    app.dom.pouchModal.hidden = true
    app.dom.createPouchForm?.reset()
  }

  function renderPouchTabs() {
    if (!app.dom.pouchTabsEl) {
      return
    }

    app.dom.pouchTabsEl.innerHTML = ''

    app.state.pouches.forEach((pouch) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'tab-btn tab-btn-pouch'
      button.dataset.tab = `pouch-${pouch.id}`
      button.textContent = pouch.name
      app.dom.pouchTabsEl.appendChild(button)
    })
  }

  function renderTransferListMarkup(transfers) {
    if (transfers.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">+</div>
          <div class="empty-state-title">No transfers yet</div>
          <div class="helper-text">Move money into this pouch to start tracking its balance.</div>
        </div>
      `
    }

    return transfers.slice(0, 8).map((transfer) => {
      const directionClass = transfer.direction === 'to_pouch' ? 'income' : 'expense'
      const directionPrefix = transfer.direction === 'to_pouch' ? '+' : '-'
      const transferDate = new Date(transfer.date).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})

      return `
        <div class="entry">
          <div class="left">
            <div class="chip pouch-transfer-chip ${directionClass}">${formatTransferDirection(transfer.direction)}</div>
            <div>
              <div>${transfer.description}</div>
              <div class="muted" style="font-size:12px">${transferDate}</div>
            </div>
          </div>
          <div class="amount ${directionClass}">${directionPrefix}${app.fmt(transfer.amount)}</div>
        </div>
      `
    }).join('')
  }

  function renderPouchView(pouch) {
    const transfers = getPouchTransfers(pouch.id)
    const currentBalanceClass = pouch.balance >= 0 ? 'income' : 'expense'

    return `
      <div id="pouch-${pouch.id}-view" class="tab-view">
        <section class="card">
          <div class="header-title-row">
            <div>
              <h3 class="section-title">${pouch.name}</h3>
              <p class="lead">A separate pouch balance with lightweight transfer history.</p>
            </div>
            <button type="button" class="btn-danger btn-sm" data-delete-pouch="${pouch.id}">Delete Pouch</button>
          </div>

          <div class="stats-grid pouch-stats-grid">
            <div class="stat-box">
              <div class="value ${currentBalanceClass}">${app.fmt(pouch.balance)}</div>
              <div class="label">Current Balance</div>
            </div>
            <div class="stat-box income">
              <div class="value">${app.fmt(pouch.totalIn)}</div>
              <div class="label">Transferred In</div>
            </div>
            <div class="stat-box expense">
              <div class="value">${app.fmt(pouch.totalOut)}</div>
              <div class="label">Transferred Out</div>
            </div>
          </div>
        </section>

        <div class="split-grid">
          <section class="card input-card">
            <h3 class="panel-title">Transfer Money</h3>
            <form data-pouch-transfer-form="${pouch.id}">
              <div class="row">
                <label>Direction</label>
                <select name="direction" required>
                  <option value="to_pouch">Main Account -> ${pouch.name}</option>
                  <option value="from_pouch">${pouch.name} -> Main Account</option>
                </select>
              </div>

              <div class="row two-up">
                <div>
                  <label>Amount</label>
                  <input name="amount" type="number" step="0.01" min="0.01" placeholder="0.00" required />
                </div>
                <div>
                  <label>Date</label>
                  <input name="date" type="date" value="${formatDateInputValue()}" required />
                </div>
              </div>

              <div class="row">
                <label>Note</label>
                <input name="description" type="text" maxlength="255" placeholder="e.g., Monthly savings transfer" />
              </div>

              <div class="row actions">
                <button type="submit" class="btn-primary">Transfer</button>
              </div>
            </form>
          </section>

          <section class="card ledger-card">
            <h3 class="panel-title">Recent Transfers</h3>
            <div class="entries">${renderTransferListMarkup(transfers)}</div>
          </section>
        </div>
      </div>
    `
  }

  function renderPouches() {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab
    renderPouchTabs()

    if (app.dom.pouchViewsEl) {
      app.dom.pouchViewsEl.innerHTML = app.state.pouches.map((pouch) => renderPouchView(pouch)).join('')
    }

    if (activeTab?.startsWith('pouch-')) {
      const activePouchId = Number(activeTab.replace('pouch-', ''))
      if (!getPouchById(activePouchId)) {
        app.switchTab('overview')
      } else {
        app.switchTab(activeTab)
      }
    }

    app.$all('[data-pouch-transfer-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        const pouchId = Number(form.dataset.pouchTransferForm)
        const formData = new FormData(form)
        const saved = await addTransfer(pouchId, {
          direction: formData.get('direction'),
          amount: parseFloat(formData.get('amount')),
          description: (formData.get('description') || '').toString().trim(),
          date: formData.get('date'),
        })

        if (saved) {
          form.reset()
          const dateInput = form.querySelector('input[name="date"]')
          if (dateInput) {
            dateInput.value = formatDateInputValue()
          }
        }
      })
    })

    app.$all('[data-delete-pouch]').forEach((button) => {
      button.addEventListener('click', () => {
        removePouch(Number(button.dataset.deletePouch))
      })
    })
  }

  function setupPouchInteractions() {
    app.dom.addPouchBtn?.addEventListener('click', openPouchModal)
    app.dom.closePouchModalBtn?.addEventListener('click', closePouchModal)
    app.dom.cancelPouchModalBtn?.addEventListener('click', closePouchModal)

    app.dom.pouchModal?.addEventListener('click', (event) => {
      if (event.target instanceof HTMLElement && event.target.dataset.closePouchModal === 'true') {
        closePouchModal()
      }
    })

    app.dom.createPouchForm?.addEventListener('submit', async (event) => {
      event.preventDefault()
      const name = app.dom.newPouchNameInput?.value || ''
      const created = await createPouch(name)
      if (created) {
        closePouchModal()
      }
    })
  }

  app.loadPouches = loadPouches
  app.renderPouches = renderPouches
  app.setupPouchInteractions = setupPouchInteractions
})()
