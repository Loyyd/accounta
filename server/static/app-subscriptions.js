(function () {
  const app = window.AccountaApp

  function formatLocalDate(date = new Date()) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function getDaysInMonth(year, month) {
    return new Date(Number(year), Number(month), 0).getDate()
  }

  function renderDayOptions(selectedDay, dayCount) {
    return Array.from({length: dayCount}, (_, index) => {
      const value = String(index + 1)
      const selected = value === String(selectedDay) ? ' selected' : ''
      return `<option value="${value}"${selected}>${value}</option>`
    }).join('')
  }

  function renderMonthOptions(selectedMonth) {
    const months = app.getSelectableMonths ? app.getSelectableMonths() : []
    return months.map((month) => {
      const selected = month.value === String(selectedMonth) ? ' selected' : ''
      return `<option value="${month.value}"${selected}>${month.label}</option>`
    }).join('')
  }

  function renderYearOptions(selectedYear) {
    const years = app.getSelectableYears ? app.getSelectableYears() : []
    return years.map((year) => {
      const selected = year === String(selectedYear) ? ' selected' : ''
      return `<option value="${year}"${selected}>${year}</option>`
    }).join('')
  }

  function syncDateSelects(daySelect, monthSelect, yearSelect, selectedDay) {
    if (!daySelect || !monthSelect || !yearSelect) {
      return
    }

    const dayCount = getDaysInMonth(yearSelect.value, monthSelect.value)
    const dayValue = Math.min(Number(selectedDay || daySelect.value || 1), dayCount)
    daySelect.innerHTML = renderDayOptions(dayValue, dayCount)
    daySelect.value = String(dayValue)
  }

  function buildDateFromSelects(daySelect, monthSelect, yearSelect) {
    const day = String(daySelect.value).padStart(2, '0')
    const month = String(monthSelect.value).padStart(2, '0')
    const year = String(yearSelect.value)
    return `${year}-${month}-${day}`
  }

  async function loadSubscriptions() {
    try {
      const response = await app.apiFetch('GET', '/subscriptions')
      if (!response.ok) {
        throw new Error('Failed to load subscriptions')
      }
      app.state.subscriptions = await response.json()
    } catch (error) {
      console.error('Failed to load subscriptions', error)
      app.state.subscriptions = []
    }
  }

  async function addSubscription(type, amount, category, description, frequency, startDate) {
    const response = await app.apiFetch('POST', '/subscriptions', {
      type,
      amount: parseFloat(amount),
      category,
      description,
      frequency,
      startDate,
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({error: 'Failed'}))
      alert(payload.error || 'Failed to add subscription')
      return false
    }

    await loadSubscriptions()
    await app.loadEntries()
    renderSubscriptions()
    app.render()
    return true
  }

  async function deleteSubscription(id) {
    const response = await app.apiFetch('DELETE', `/subscriptions/${id}`)
    if (!response.ok) {
      alert('Failed to delete subscription')
      return
    }

    await loadSubscriptions()
    renderSubscriptions()
    app.render()
  }

  async function toggleSubscription(id) {
    const response = await app.apiFetch('POST', `/subscriptions/${id}/toggle`)
    if (!response.ok) {
      alert('Failed to toggle subscription')
      return
    }

    await loadSubscriptions()
    await app.loadEntries()
    renderSubscriptions()
    app.render()
  }

  async function updateSubscription(id, updates) {
    const response = await app.apiFetch('PUT', `/subscriptions/${id}`, updates)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({error: 'Failed'}))
      alert(payload.error || 'Failed to update subscription')
      return false
    }

    await loadSubscriptions()
    await app.loadEntries()
    renderSubscriptions()
    app.render()
    return true
  }

  function openEditSubscriptionModal(subscription) {
    const overlay = document.createElement('div')
    overlay.id = 'editSubModal'
    overlay.className = 'subscription-modal-overlay'

    const categoryType = subscription.type || 'expense'
    const categoryList = app.state.categories[categoryType] || []
    const categoryOptions = categoryList.map((category) =>
      `<option value="${app.escapeHtml(category.name)}" ${category.name === subscription.category ? 'selected' : ''}>${app.escapeHtml(category.name)}</option>`
    ).join('')

    const selectedDate = subscription.startDate.split('T')[0]
    const [selectedYear, selectedMonth, selectedDay] = selectedDate.split('-').map(Number)
    const modal = document.createElement('div')
    modal.className = 'subscription-modal'
    modal.innerHTML = `
      <h3 class="subscription-modal-title">Edit Subscription</h3>
      <form id="editSubForm" class="subscription-modal-form">
        <div class="subscription-modal-row">
          <label>Type</label>
          <select id="editSubType" required>
            <option value="expense" ${subscription.type === 'expense' ? 'selected' : ''}>Expense</option>
            <option value="income" ${subscription.type === 'income' ? 'selected' : ''}>Income</option>
          </select>
        </div>
        <div class="subscription-modal-grid">
          <div class="subscription-modal-row">
            <label>Amount</label>
            <input id="editSubAmount" type="number" step="0.01" required />
          </div>
          <div class="subscription-modal-row">
            <label>Category</label>
            <select id="editSubCategory" required>
              ${categoryOptions}
            </select>
          </div>
        </div>
        <div class="subscription-modal-row">
          <label>Description</label>
          <input id="editSubDescription" type="text" required />
        </div>
        <div class="subscription-modal-grid">
          <div class="subscription-modal-row">
            <label>Frequency</label>
            <select id="editSubFrequency" required>
              <option value="weekly" ${subscription.frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="monthly" ${subscription.frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
              <option value="yearly" ${subscription.frequency === 'yearly' ? 'selected' : ''}>Yearly</option>
            </select>
          </div>
          <div class="subscription-modal-row">
            <label>Start Date</label>
            <div class="subscription-date-grid">
              <select id="editSubStartDay" required>
                ${renderDayOptions(selectedDay, getDaysInMonth(selectedYear, selectedMonth))}
              </select>
              <select id="editSubStartMonth" required>
                ${renderMonthOptions(selectedMonth)}
              </select>
              <select id="editSubStartYear" required>
                ${renderYearOptions(selectedYear)}
              </select>
            </div>
          </div>
        </div>
        <div class="subscription-modal-actions">
          <button type="button" id="cancelEditSub" class="btn-ghost">Cancel</button>
          <button type="submit" class="btn-primary">Save Changes</button>
        </div>
      </form>
    `

    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    const typeSelect = modal.querySelector('#editSubType')
    const categorySelect = modal.querySelector('#editSubCategory')
    const amountInput = modal.querySelector('#editSubAmount')
    const descriptionInput = modal.querySelector('#editSubDescription')
    const editDaySelect = modal.querySelector('#editSubStartDay')
    const editMonthSelect = modal.querySelector('#editSubStartMonth')
    const editYearSelect = modal.querySelector('#editSubStartYear')

    amountInput.value = subscription.amount
    descriptionInput.value = subscription.description

    typeSelect.addEventListener('change', () => {
      const nextCategories = app.state.categories[typeSelect.value] || []
      categorySelect.innerHTML = ''
      nextCategories.forEach((category) => {
        const option = document.createElement('option')
        option.value = category.name
        option.textContent = category.name
        categorySelect.appendChild(option)
      })
    })

    ;[editMonthSelect, editYearSelect].forEach((select) => {
      select.addEventListener('change', () => {
        syncDateSelects(editDaySelect, editMonthSelect, editYearSelect, editDaySelect.value)
      })
    })

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        overlay.remove()
      }
    })

    modal.querySelector('#cancelEditSub').addEventListener('click', () => {
      overlay.remove()
    })

    modal.querySelector('#editSubForm').addEventListener('submit', async (event) => {
      event.preventDefault()

      const success = await updateSubscription(subscription.id, {
        type: modal.querySelector('#editSubType').value,
        amount: parseFloat(modal.querySelector('#editSubAmount').value),
        category: modal.querySelector('#editSubCategory').value,
        description: modal.querySelector('#editSubDescription').value,
        frequency: modal.querySelector('#editSubFrequency').value,
        startDate: buildDateFromSelects(editDaySelect, editMonthSelect, editYearSelect),
      })

      if (success) {
        overlay.remove()
      }
    })
  }

  function renderSubscriptions() {
    const list = app.$('#subscriptionsList')
    if (!list) {
      return
    }

    if (app.state.subscriptions.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">+</div>
          <div class="empty-state-title">No subscriptions yet</div>
          <div class="helper-text">Add a recurring payment or income stream to keep future entries in sync.</div>
        </div>
      `
      return
    }

    list.innerHTML = ''
    app.state.subscriptions.forEach((subscription) => {
      const card = document.createElement('div')
      card.className = `subscription-card${subscription.active ? '' : ' is-inactive'}`

      const typeColor = subscription.type === 'income' ? 'var(--accent)' : 'var(--danger)'
      const frequencyLabel = subscription.frequency.charAt(0).toUpperCase() + subscription.frequency.slice(1)
      const meta = `${subscription.category} - ${frequencyLabel} - Since ${new Date(subscription.startDate).toLocaleDateString()}`

      const main = document.createElement('div')
      main.className = 'subscription-main'
      const title = document.createElement('div')
      title.className = 'subscription-title'
      title.textContent = subscription.description
      const metaEl = document.createElement('div')
      metaEl.className = 'subscription-meta'
      metaEl.textContent = meta
      main.appendChild(title)
      main.appendChild(metaEl)

      const amount = document.createElement('div')
      amount.className = 'subscription-amount'
      amount.style.color = typeColor
      amount.textContent = app.fmt(subscription.amount)

      const actions = document.createElement('div')
      actions.className = 'subscription-actions'

      const editButton = document.createElement('button')
      editButton.type = 'button'
      editButton.className = 'btn-ghost btn-sm'
      editButton.title = 'Edit'
      editButton.textContent = 'Edit'
      editButton.addEventListener('click', () => {
        window.editSubscription(subscription.id)
      })

      const toggleButton = document.createElement('button')
      toggleButton.type = 'button'
      toggleButton.className = 'btn-ghost btn-sm'
      toggleButton.title = subscription.active ? 'Pause' : 'Activate'
      toggleButton.textContent = subscription.active ? 'Pause' : 'Activate'
      toggleButton.addEventListener('click', () => {
        toggleSubscription(subscription.id)
      })

      const deleteButton = document.createElement('button')
      deleteButton.type = 'button'
      deleteButton.className = 'btn-ghost btn-sm danger-copy'
      deleteButton.title = 'Delete'
      deleteButton.textContent = 'Remove'
      deleteButton.addEventListener('click', () => {
        deleteSubscription(subscription.id)
      })

      actions.appendChild(editButton)
      actions.appendChild(toggleButton)
      actions.appendChild(deleteButton)
      card.appendChild(main)
      card.appendChild(amount)
      card.appendChild(actions)

      list.appendChild(card)
    })
  }

  function refreshSubscriptionCategoryInput() {
    const typeSelect = app.$('#subType')
    const categorySelect = app.$('#subCategory')

    if (!typeSelect || !categorySelect) {
      return
    }

    const categoryType = typeSelect.value
    categorySelect.innerHTML = '<option value="">Select a category</option>'
    app.state.categories[categoryType].forEach((category) => {
      const option = document.createElement('option')
      option.value = category.name
      option.textContent = category.name
      categorySelect.appendChild(option)
    })
  }

  function setupSubscriptionForm() {
    const form = app.$('#subscriptionForm')
    const typeSelect = app.$('#subType')
    const startDaySelect = app.$('#subStartDay')
    const startMonthSelect = app.$('#subStartMonth')
    const startYearSelect = app.$('#subStartYear')

    if (!form) {
      return
    }

    if (startMonthSelect) {
      startMonthSelect.innerHTML = renderMonthOptions(new Date().getMonth() + 1)
    }

    if (startYearSelect) {
      startYearSelect.innerHTML = renderYearOptions(new Date().getFullYear())
    }

    if (startDaySelect && startMonthSelect && startYearSelect) {
      syncDateSelects(startDaySelect, startMonthSelect, startYearSelect, new Date().getDate())
      ;[startMonthSelect, startYearSelect].forEach((select) => {
        select.addEventListener('change', () => {
          syncDateSelects(startDaySelect, startMonthSelect, startYearSelect, startDaySelect.value)
        })
      })
    }

    if (typeSelect) {
      typeSelect.addEventListener('change', refreshSubscriptionCategoryInput)
      refreshSubscriptionCategoryInput()
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault()

      const saved = await addSubscription(
        app.$('#subType').value,
        app.$('#subAmount').value,
        app.$('#subCategory').value,
        app.$('#subDescription').value,
        app.$('#subFrequency').value,
        buildDateFromSelects(startDaySelect, startMonthSelect, startYearSelect),
      )

      if (saved) {
        form.reset()
        if (startMonthSelect) {
          startMonthSelect.innerHTML = renderMonthOptions(new Date().getMonth() + 1)
        }
        if (startYearSelect) {
          startYearSelect.innerHTML = renderYearOptions(new Date().getFullYear())
        }
        if (startDaySelect && startMonthSelect && startYearSelect) {
          syncDateSelects(startDaySelect, startMonthSelect, startYearSelect, new Date().getDate())
        }
        refreshSubscriptionCategoryInput()
      }
    })
  }

  app.loadSubscriptions = loadSubscriptions
  app.addSubscription = addSubscription
  app.updateSubscription = updateSubscription
  app.renderSubscriptions = renderSubscriptions
  app.setupSubscriptionForm = setupSubscriptionForm
  app.refreshSubscriptionCategoryInput = refreshSubscriptionCategoryInput

  window.editSubscription = function (id) {
    const subscription = app.state.subscriptions.find((item) => item.id === id)
    if (subscription) {
      openEditSubscriptionModal(subscription)
    }
  }
  window.deleteSubscription = deleteSubscription
  window.toggleSubscription = toggleSubscription
})()
