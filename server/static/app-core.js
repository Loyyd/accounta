(function () {
  const common = window.AccountaCommon

  if (!common) {
    throw new Error('AccountaCommon is required before app-core.js loads')
  }

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
    tabBar: $('.tab-bar'),
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
    customStartMonth: $('#customStartMonth'),
    customStartYear: $('#customStartYear'),
    customEndMonth: $('#customEndMonth'),
    customEndYear: $('#customEndYear'),
    breakdownTypeSelector: $('#breakdownType'),
    trendTimeframeSelector: $('#trendTimeframe'),
    showIncomeTrendCheckbox: $('#showIncomeTrend'),
    showExpenseTrendCheckbox: $('#showExpenseTrend'),
    pouchTabsEl: $('#pouchTabs'),
    pouchViewsEl: $('#pouchViews'),
    addPouchBtn: $('#addPouchTabBtn'),
    pouchModal: $('#pouchModal'),
    createPouchForm: $('#createPouchForm'),
    newPouchNameInput: $('#newPouchName'),
    closePouchModalBtn: $('#closePouchModal'),
    cancelPouchModalBtn: $('#cancelPouchModal'),
  }

  const app = {
    $,
    $all,
    dom,
    escapeHtml: common.escapeHtml,
    fmt,
    safeHexColor: common.safeHexColor,
    state: {
      entries: [],
      pouches: [],
      pouchTransfers: [],
      categories: {expense: [], income: []},
      subscriptions: [],
      currentTimeline: 'all',
      customStart: null,
      customEnd: null,
      trendTimeframeMonths: 6,
      showIncomeTrend: true,
      showExpenseTrend: true,
      breakdownType: 'expense',
    },
    charts: {
      expense: null,
      compare: null,
      trend: null,
      profit: null,
    },
    token() {
      return common.getToken()
    },
    isLoggedIn() {
      return common.isLoggedIn()
    },
    async apiFetch(method, path, body) {
      return common.apiFetch(method, path, body)
    },
    switchTab(tabName) {
      app.$all('.tab-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tabName)
      })

      app.$all('.tab-view').forEach((view) => {
        view.classList.toggle('active', view.id === `${tabName}-view`)
      })

      if (tabName === 'admin') {
        window.AccountaAdmin?.ensureLoaded?.()
      }
    },
    initTabs() {
      if (!app.dom.tabBar) {
        return
      }

      const mobileNavToggle = document.getElementById('mobileNavToggle')
      const mobileNavBackdrop = document.getElementById('mobileNavBackdrop')
      const pageHeaderTop = document.querySelector('.page-header-top')
      const brandRow = pageHeaderTop?.querySelector('.brand-row')

      if (mobileNavToggle && pageHeaderTop && brandRow && mobileNavToggle.parentElement !== pageHeaderTop) {
        pageHeaderTop.insertBefore(mobileNavToggle, brandRow)
      }

      if (brandRow && !brandRow.dataset.overviewLinkWired) {
        brandRow.dataset.overviewLinkWired = 'true'
        brandRow.setAttribute('role', 'button')
        brandRow.tabIndex = 0

        const goToOverview = () => {
          app.switchTab('overview')
          if (window.history?.replaceState) {
            window.history.replaceState(null, '', '#overview')
          }
        }

        brandRow.addEventListener('click', goToOverview)
        brandRow.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            goToOverview()
          }
        })
      }

      document.getElementById('importBtn')?.parentElement?.classList.add('settings-action-cell')
      document.getElementById('openPasswordModalBtn')?.closest('.settings-row')?.remove()
      document.getElementById('passwordModal')?.remove()

      if (!document.getElementById('mobileHeaderOrderStyles')) {
        const mobileHeaderOrderStyles = document.createElement('style')
        mobileHeaderOrderStyles.id = 'mobileHeaderOrderStyles'
        mobileHeaderOrderStyles.textContent = `
          .stat p {
            margin: 0;
          }

          .page-header-top .brand-row {
            cursor: pointer;
          }

          .page-header-top .brand-row:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 4px;
            border-radius: var(--radius-sm);
          }

          @media (max-width: 720px) {
            .page-header-top {
              display: grid;
              grid-template-columns: 48px minmax(0, 1fr) 48px;
              align-items: center;
              gap: 8px;
            }

            .page-header-top .brand-row {
              grid-column: 2;
              justify-content: center;
              justify-self: center;
              margin: 0;
            }

            .auth-area {
              grid-column: 3;
              justify-self: end;
            }

            .mobile-nav-toggle {
              grid-column: 1;
              flex: 0 0 42px;
              justify-self: start;
            }

            .stat p {
              order: 1;
              color: var(--muted);
              font-size: 13px;
              font-weight: 600;
            }

            .stat h3 {
              order: 2;
              margin: 0;
            }

            .settings-row #exportBtn,
            .settings-row #importBtn {
              width: 100%;
              min-width: 136px;
            }

            .settings-action-cell {
              width: 100%;
            }
          }
        `
        document.head.appendChild(mobileHeaderOrderStyles)
      }

      function setMobileNavOpen(isOpen) {
        document.body.classList.toggle('mobile-nav-open', isOpen)
        mobileNavToggle?.setAttribute('aria-expanded', String(isOpen))
        mobileNavToggle?.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation')
        if (mobileNavBackdrop) {
          mobileNavBackdrop.hidden = !isOpen
        }
      }

      mobileNavToggle?.addEventListener('click', () => {
        setMobileNavOpen(!document.body.classList.contains('mobile-nav-open'))
      })

      mobileNavBackdrop?.addEventListener('click', () => {
        setMobileNavOpen(false)
      })

      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          setMobileNavOpen(false)
        }
      })

      app.dom.tabBar.addEventListener('click', (event) => {
        const button = event.target.closest('.tab-btn[data-tab]')
        if (!button) {
          return
        }

        app.switchTab(button.dataset.tab)
        if (history.replaceState) {
          history.replaceState(null, '', `#${button.dataset.tab}`)
        }
        setMobileNavOpen(false)
      })

      const initialTab = location.hash.replace('#', '')
      if (initialTab && document.getElementById(`${initialTab}-view`)) {
        app.switchTab(initialTab)
      }
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
    getRollingMonths(count = 12, baseDate = new Date()) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']

      return Array.from({length: count}, (_, offset) => {
        const date = new Date(baseDate.getFullYear(), baseDate.getMonth() - offset, 1)
        return {
          key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
          monthValue: String(date.getMonth() + 1).padStart(2, '0'),
          yearValue: String(date.getFullYear()),
          monthLabel: monthNames[date.getMonth()],
          monthYearLabel: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
        }
      })
    },
    getSelectableMonths(baseDate = new Date()) {
      return app.getRollingMonths(12, baseDate).map((month) => ({
        value: String(Number(month.monthValue)),
        label: month.monthLabel,
      }))
    },
    getSelectableYears(baseDate = new Date()) {
      const currentYear = baseDate.getFullYear()
      return Array.from({length: 6}, (_, offset) => String(currentYear - offset))
    },
    populateTransactionMonthOptions() {
      if (!app.dom.monthInput) {
        return
      }

      app.dom.monthInput.innerHTML = ''

      app.getSelectableMonths().forEach((month) => {
        const option = document.createElement('option')
        option.value = month.value
        option.textContent = month.label
        app.dom.monthInput.appendChild(option)
      })
    },
    populateTransactionYearOptions() {
      if (!app.dom.yearInput) {
        return
      }

      const currentYear = String(new Date().getFullYear())
      app.dom.yearInput.innerHTML = ''

      app.getSelectableYears().forEach((year) => {
        const option = document.createElement('option')
        option.value = year
        option.textContent = year
        option.selected = year === currentYear
        app.dom.yearInput.appendChild(option)
      })
    },
    populateCustomRangeOptions() {
      const monthSelects = [app.dom.customStartMonth, app.dom.customEndMonth].filter(Boolean)
      const yearSelects = [app.dom.customStartYear, app.dom.customEndYear].filter(Boolean)

      if (!monthSelects.length || !yearSelects.length) {
        return
      }

      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const currentYear = now.getFullYear()

      monthSelects.forEach((select) => {
        select.innerHTML = ''
        app.getSelectableMonths(now).forEach((month) => {
          const option = document.createElement('option')
          option.value = month.value.padStart(2, '0')
          option.textContent = month.label
          option.selected = Number(month.value) === currentMonth
          select.appendChild(option)
        })
      })

      yearSelects.forEach((select) => {
        select.innerHTML = ''
        app.getSelectableYears(now).forEach((year) => {
          const option = document.createElement('option')
          option.value = year
          option.textContent = year
          option.selected = year === String(currentYear)
          select.appendChild(option)
        })
      })

      app.state.customStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
      app.state.customEnd = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
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
      if (app.renderPouches) {
        app.renderPouches()
      }

      const filteredEntries = app.getDisplayEntries ? app.getDisplayEntries() : []
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
