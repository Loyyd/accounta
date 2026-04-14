(function () {
  const common = window.AccountaCommon || {}

  const $ = (selector) => document.querySelector(selector)
  const $all = (selector) => document.querySelectorAll(selector)
  const fmt = common.fmtCurrency
    ? common.fmtCurrency
    : (value) => Number(value || 0).toLocaleString(undefined, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 2,
      })

  const dom = {
    entryForm: $('#entryForm'),
    typeInput: $('#type'),
    descriptionInput: $('#description'),
    amountInput: $('#amount'),
    categoryInput: $('#category'),
    monthInput: $('#month'),
    yearInput: $('#year'),
    entriesEl: $('#entries'),
    overviewEntriesEl: $('#overviewEntries'),
    totalIncomeEl: $('#totalIncome'),
    totalExpenseEl: $('#totalExpense'),
    netTotalEl: $('#netTotal'),
    clearAllBtn: $('#clearAll'),
    timelineFilter: $('#timelineFilter'),
    customDateRange: $('#customDateRange'),
    customStartDate: $('#customStartDate'),
    customEndDate: $('#customEndDate'),
    breakdownTypeSelector: $('#breakdownType'),
    trendTimeframeSelector: $('#trendTimeframe'),
    showIncomeTrendCheckbox: $('#showIncomeTrend'),
    showExpenseTrendCheckbox: $('#showExpenseTrend'),
    budgetMonthSelector: $('#budgetMonthSelector'),
  }

  const app = {
    $,
    $all,
    dom,
    fmt,
    state: {
      entries: [],
      categories: {expense: [], income: []},
      subscriptions: [],
      budgets: [],
      currentTimeline: 'all',
      customStart: null,
      customEnd: null,
      trendTimeframeMonths: 6,
      showIncomeTrend: true,
      showExpenseTrend: true,
      budgetViewMonth: null,
      breakdownType: 'expense',
    },
    charts: {
      expense: null,
      compare: null,
      trend: null,
      profit: null,
    },
    token() {
      return common.getToken ? common.getToken() : localStorage.getItem('finance-tracker.token')
    },
    isLoggedIn() {
      return common.isLoggedIn ? common.isLoggedIn() : !!app.token()
    },
    async apiFetch(method, path, body) {
      if (common.apiFetch) {
        return common.apiFetch(method, path, body)
      }

      const headers = {'Content-Type': 'application/json'}
      const token = app.token()
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch('/api' + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })

      if (response.status === 401) {
        localStorage.removeItem('finance-tracker.token')
        alert('Session expired or invalid, please log in again.')
        location.href = 'login.html'
        throw new Error('Unauthorized')
      }

      return response
    },
    switchTab(tabName) {
      app.$all('.tab-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tabName)
      })

      app.$all('.tab-view').forEach((view) => {
        view.classList.toggle('active', view.id === `${tabName}-view`)
      })
    },
    initTabs() {
      app.$all('.tab-btn').forEach((button) => {
        button.addEventListener('click', () => {
          app.switchTab(button.dataset.tab)
        })
      })
    },
    populateMonthOptions() {
      const now = new Date()
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']

      for (let i = 0; i < 4; i += 1) {
        const monthIndex = now.getMonth() - i
        const year = now.getFullYear()
        const actualMonth = monthIndex < 0 ? monthIndex + 12 : monthIndex
        const actualYear = monthIndex < 0 ? year - 1 : year
        const option = document.getElementById(`month${i}Option`)

        if (option) {
          option.textContent = `${monthNames[actualMonth]} ${actualYear}`
        }
      }
    },
    render() {
      const totals = app.totalsFiltered()
      if (app.dom.totalIncomeEl) {
        app.dom.totalIncomeEl.textContent = app.fmt(totals.income)
      }
      if (app.dom.totalExpenseEl) {
        app.dom.totalExpenseEl.textContent = app.fmt(totals.expense)
      }
      if (app.dom.netTotalEl) {
        app.dom.netTotalEl.textContent = app.fmt(totals.net)
      }

      if (app.renderCharts) {
        app.renderCharts()
      }
      if (app.renderBudgetOverview) {
        app.renderBudgetOverview()
      }

      const filteredEntries = app.getFilteredEntries ? app.getFilteredEntries() : []
      const monthEntries = app.getEntriesForMonthYear
        ? app.getEntriesForMonthYear(app.dom.monthInput?.value, app.dom.yearInput?.value)
        : []

      if (app.renderEntriesList) {
        app.renderEntriesList(app.dom.overviewEntriesEl, filteredEntries, 'No transactions in this period.')
        app.renderEntriesList(app.dom.entriesEl, monthEntries, 'No transactions in this month.')
      }
    },
  }

  window.AccountaApp = app
})()
