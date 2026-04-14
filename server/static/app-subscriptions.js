(function () {
  const app = window.AccountaApp

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
      `<option value="${category.name}" ${category.name === subscription.category ? 'selected' : ''}>${category.name}</option>`
    ).join('')

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
            <input id="editSubAmount" type="number" step="0.01" value="${subscription.amount}" required />
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
          <input id="editSubDescription" type="text" value="${subscription.description}" required />
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
            <input id="editSubStartDate" type="date" value="${subscription.startDate.split('T')[0]}" required />
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

    typeSelect.addEventListener('change', () => {
      const nextCategories = app.state.categories[typeSelect.value] || []
      categorySelect.innerHTML = nextCategories.map((category) =>
        `<option value="${category.name}">${category.name}</option>`
      ).join('')
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
        startDate: modal.querySelector('#editSubStartDate').value,
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

      card.innerHTML = `
        <div class="subscription-main">
          <div class="subscription-title">${subscription.description}</div>
          <div class="subscription-meta">${subscription.category} • ${frequencyLabel} • Since ${new Date(subscription.startDate).toLocaleDateString()}</div>
        </div>
        <div class="subscription-amount" style="color:${typeColor}">${app.fmt(subscription.amount)}</div>
        <div class="subscription-actions">
          <button onclick="editSubscription(${subscription.id})" class="btn-ghost btn-sm" title="Edit">
            Edit
          </button>
          <button onclick="toggleSubscription(${subscription.id})" class="btn-ghost btn-sm" title="${subscription.active ? 'Pause' : 'Activate'}">
            ${subscription.active ? 'Pause' : 'Activate'}
          </button>
          <button onclick="deleteSubscription(${subscription.id})" class="btn-ghost btn-sm danger-copy" title="Delete">
            Remove
          </button>
        </div>
      `

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
    const startDateInput = app.$('#subStartDate')

    if (!form) {
      return
    }

    if (startDateInput) {
      startDateInput.value = new Date().toISOString().split('T')[0]
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
        app.$('#subStartDate').value,
      )

      if (saved) {
        form.reset()
        if (startDateInput) {
          startDateInput.value = new Date().toISOString().split('T')[0]
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
