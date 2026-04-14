(function () {
  const app = window.AccountaApp

  async function loadBudgets() {
    try {
      const response = await app.apiFetch('GET', '/budgets')
      if (!response.ok) {
        throw new Error('Failed to load budgets')
      }
      app.state.budgets = await response.json()
    } catch (error) {
      console.error('Failed to load budgets', error)
      app.state.budgets = []
    }
  }

  async function setBudget(category, amount) {
    const response = await app.apiFetch('POST', '/budgets', {
      category,
      amount: parseFloat(amount),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({error: 'Failed'}))
      alert(payload.error || 'Failed to set budget')
      return false
    }

    await loadBudgets()
    renderBudgets()
    renderBudgetOverview()
    return true
  }

  async function deleteBudget(category) {
    const response = await app.apiFetch('DELETE', `/budgets/${encodeURIComponent(category)}`)
    if (!response.ok) {
      alert('Failed to delete budget')
      return
    }

    await loadBudgets()
    renderBudgets()
    renderBudgetOverview()
  }

  function getCategorySpending(category) {
    const viewDate = app.state.budgetViewMonth ? new Date(app.state.budgetViewMonth + '-01') : new Date()
    const viewMonth = viewDate.getMonth()
    const viewYear = viewDate.getFullYear()

    return app.state.entries
      .filter((entry) => {
        if (entry.type !== 'expense' || entry.category !== category) {
          return false
        }
        const entryDate = new Date(entry.date)
        return entryDate.getMonth() === viewMonth && entryDate.getFullYear() === viewYear
      })
      .reduce((sum, entry) => sum + parseFloat(entry.amount), 0)
  }

  function renderBudgets() {
    const list = app.$('#budgetsList')
    if (!list) {
      return
    }

    if (app.state.budgets.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">+</div>
          <div class="empty-state-title">No budgets yet</div>
          <div class="helper-text">Set a monthly target to start tracking spending against your limits.</div>
        </div>
      `
      return
    }

    list.innerHTML = ''
    app.state.budgets.forEach((budget) => {
      const row = document.createElement('div')
      row.className = 'budget-row'
      row.innerHTML = `
        <div class="budget-row-meta">
          <div class="budget-row-title">${budget.category}</div>
          <div class="budget-row-value">${app.fmt(budget.amount)} / month</div>
        </div>
        <button onclick="deleteBudget('${budget.category}')" class="btn-ghost btn-sm danger-copy" title="Delete budget">
          Remove
        </button>
      `
      list.appendChild(row)
    })
  }

  function renderBudgetOverview() {
    const card = app.$('#budgetOverviewCard')
    const list = app.$('#budgetProgressList')
    const selector = app.dom.budgetMonthSelector

    if (!card || !list) {
      return
    }

    if (selector) {
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

      if (!app.state.budgetViewMonth) {
        app.state.budgetViewMonth = currentMonth
      }

      selector.innerHTML = ''
      const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']

      for (let i = 0; i < 12; i += 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        const option = document.createElement('option')
        option.value = monthKey
        option.textContent = `${months[date.getMonth()]} ${date.getFullYear()}`
        option.selected = monthKey === app.state.budgetViewMonth
        selector.appendChild(option)
      }
    }

    if (app.state.budgets.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">%</div>
          <div class="empty-state-title">No budgets set yet</div>
          <div class="helper-text">Set a budget below to start tracking your spending for each category.</div>
        </div>
      `
      return
    }

    list.innerHTML = ''

    let totalBudget = 0
    let totalSpent = 0
    let overBudgetCount = 0
    let warningCount = 0

    app.state.budgets.forEach((budget) => {
      const spent = getCategorySpending(budget.category)
      totalBudget += budget.amount
      totalSpent += spent
      const percentage = (spent / budget.amount) * 100

      if (spent > budget.amount) {
        overBudgetCount += 1
      } else if (percentage > 80) {
        warningCount += 1
      }
    })

    const totalPercentage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
    const summaryCard = document.createElement('div')
    summaryCard.style.cssText = 'padding:20px;margin-bottom:20px;background:rgba(255,255,255,0.05);border-radius:12px;border:1px solid rgba(255,255,255,0.1)'

    let statusIcon = '✅'
    let statusText = 'All budgets on track!'
    let statusTone = 'budget-good'

    if (overBudgetCount > 0) {
      statusIcon = '⚠️'
      statusText = `${overBudgetCount} ${overBudgetCount === 1 ? 'budget' : 'budgets'} exceeded`
      statusTone = 'budget-danger'
    } else if (warningCount > 0) {
      statusIcon = '⚡'
      statusText = `${warningCount} ${warningCount === 1 ? 'budget' : 'budgets'} at 80%+`
      statusTone = 'budget-warning'
    }

    const circumference = 2 * Math.PI * 70
    const offset = circumference - (Math.min(totalPercentage, 100) / 100) * circumference
    const progressColor = totalPercentage > 100 ? 'var(--danger)' : totalPercentage > 80 ? '#fbbf24' : 'var(--accent)'

    summaryCard.innerHTML = `
      <div class="panel-surface budget-summary">
        <div class="budget-summary-chart">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="12"></circle>
            <circle cx="80" cy="80" r="70" fill="none"
              stroke="${progressColor}"
              stroke-width="12"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${offset}"
              stroke-linecap="round"
              style="transition: stroke-dashoffset 0.5s ease, stroke 0.3s ease;"></circle>
          </svg>
          <div class="budget-summary-center">
            <div class="budget-summary-percent ${statusTone}">${totalPercentage.toFixed(0)}%</div>
            <div class="budget-summary-label">used</div>
          </div>
        </div>

        <div>
          <div class="budget-summary-status ${statusTone}">
            <span>${statusIcon}</span>
            <span>${statusText}</span>
          </div>
          <div class="budget-summary-metrics">
            <div class="budget-metric">
              <div class="budget-metric-label">Spent</div>
              <div class="budget-metric-value ${totalPercentage > 100 ? 'budget-danger' : ''}">${app.fmt(totalSpent)}</div>
            </div>
            <div class="budget-metric">
              <div class="budget-metric-label">Budget</div>
              <div class="budget-metric-value">${app.fmt(totalBudget)}</div>
            </div>
            <div class="budget-metric">
              <div class="budget-metric-label">Remaining</div>
              <div class="budget-metric-value ${totalSpent > totalBudget ? 'budget-danger' : 'budget-good'}">
                ${totalSpent > totalBudget ? '-' : ''}${app.fmt(Math.abs(totalBudget - totalSpent))}
              </div>
            </div>
          </div>
        </div>
      </div>
    `
    list.appendChild(summaryCard)

    app.state.budgets.forEach((budget) => {
      const spent = getCategorySpending(budget.category)
      const percentage = (spent / budget.amount) * 100
      const isOverBudget = spent > budget.amount
      const isWarning = percentage > 80 && !isOverBudget
      const remaining = budget.amount - spent
      const statusToneClass = isOverBudget ? 'budget-danger' : isWarning ? 'budget-warning' : 'budget-good'
      const progressColorValue = isOverBudget ? 'var(--danger)' : isWarning ? '#fbbf24' : 'var(--accent)'

      const item = document.createElement('div')
      item.className = 'budget-item'

      let statusEmoji = '✓'
      if (isOverBudget) {
        statusEmoji = '⚠️'
      } else if (isWarning) {
        statusEmoji = '⚡'
      }

      item.innerHTML = `
        <div class="budget-item-head">
          <div>
            <div class="budget-item-title">${budget.category}</div>
            <div class="budget-item-meta">${app.fmt(spent)} / ${app.fmt(budget.amount)}</div>
          </div>
          <div class="budget-item-status">
            <div class="budget-item-percentage ${statusToneClass}">
              ${statusEmoji} ${percentage.toFixed(0)}%
            </div>
            <div class="budget-item-remaining ${isOverBudget ? 'budget-danger' : ''}">
              ${isOverBudget ? 'Over by ' + app.fmt(Math.abs(remaining)) : app.fmt(remaining) + ' left'}
            </div>
          </div>
        </div>
        <div class="budget-progress">
          <div class="budget-progress-bar" style="background:${progressColorValue};width:${Math.min(percentage, 100)}%"></div>
        </div>
      `
      list.appendChild(item)
    })
  }

  function refreshBudgetCategoryInput() {
    const categorySelect = app.$('#budgetCategory')
    if (!categorySelect) {
      return
    }

    categorySelect.innerHTML = '<option value="">Select a category</option>'
    app.state.categories.expense.forEach((category) => {
      const option = document.createElement('option')
      option.value = category.name
      option.textContent = category.name
      categorySelect.appendChild(option)
    })
  }

  function setupBudgetForm() {
    const form = app.$('#budgetForm')
    if (!form) {
      return
    }

    refreshBudgetCategoryInput()

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const category = app.$('#budgetCategory').value
      const amount = app.$('#budgetAmount').value

      const saved = await setBudget(category, amount)
      if (saved) {
        form.reset()
        refreshBudgetCategoryInput()
      }
    })

    if (app.dom.budgetMonthSelector) {
      app.dom.budgetMonthSelector.addEventListener('change', (event) => {
        app.state.budgetViewMonth = event.target.value
        renderBudgetOverview()
      })
    }
  }

  app.loadBudgets = loadBudgets
  app.setBudget = setBudget
  app.getCategorySpending = getCategorySpending
  app.renderBudgets = renderBudgets
  app.renderBudgetOverview = renderBudgetOverview
  app.setupBudgetForm = setupBudgetForm
  app.refreshBudgetCategoryInput = refreshBudgetCategoryInput

  window.deleteBudget = deleteBudget
})()
