(function () {
  const app = window.AccountaApp

  async function loadEntries() {
    try {
      if (!app.isLoggedIn()) {
        location.href = 'login.html'
        return
      }

      const response = await app.apiFetch('GET', '/entries')
      if (!response.ok) {
        throw new Error('Failed to load entries')
      }

      const payload = await response.json()
      app.state.entries = payload.map((entry) => ({...entry, date: new Date(entry.date).getTime()}))
    } catch (error) {
      console.error('Failed to load entries', error)
      app.state.entries = []
    }
  }

  async function updateEntry(entryId, updates) {
    const response = await app.apiFetch('PUT', `/entries/${entryId}`, updates)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({error: 'Failed'}))
      alert(payload.error || 'Failed to update')
      return false
    }

    await loadEntries()
    app.render()
    return true
  }

  async function addEntry({type, description, amount, category, date}) {
    const response = await app.apiFetch('POST', '/entries', {type, description, amount, category, date})
    if (!response.ok) {
      const payload = await response.json().catch(() => ({error: 'Failed'}))
      alert(payload.error || 'Failed to save')
      return false
    }

    await loadEntries()
    app.render()
    return true
  }

  async function removeEntry(idValue) {
    if (idValue === undefined || idValue === null || idValue === '') {
      alert('Could not determine which transaction to delete')
      return
    }

    const response = await app.apiFetch('DELETE', `/entries/${idValue}`)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({error: 'Failed'}))
      alert(payload.error || 'Delete failed')
      return
    }

    await loadEntries()
    app.render()
  }

  function getFilteredEntries() {
    const now = new Date()
    let startDate
    let endDate

    switch (app.state.currentTimeline) {
      case 'month-0':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        break
      case 'month-1':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
        break
      case 'month-2':
        startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1)
        endDate = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999)
        break
      case 'month-3':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1)
        endDate = new Date(now.getFullYear(), now.getMonth() - 2, 0, 23, 59, 59, 999)
        break
      case 'this-year':
        startDate = new Date(now.getFullYear(), 0, 1)
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
        break
      case 'last-year':
        startDate = new Date(now.getFullYear() - 1, 0, 1)
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
        break
      case 'custom':
        if (!app.state.customStart || !app.state.customEnd) {
          return app.state.entries
        }
        startDate = parseMonthRangeStart(app.state.customStart)
        endDate = parseMonthRangeEnd(app.state.customEnd)

        if (!startDate || !endDate) {
          return app.state.entries
        }

        if (startDate > endDate) {
          const originalStart = startDate
          startDate = parseMonthRangeStart(app.state.customEnd)
          endDate = parseMonthRangeEnd(app.state.customStart)
          if (!startDate || !endDate) {
            startDate = originalStart
          }
        }
        break
      case 'all':
      default:
        return app.state.entries
    }

    return app.state.entries.filter((entry) => {
      const entryDate = new Date(entry.date)
      return entryDate >= startDate && entryDate <= endDate
    })
  }

  function parseMonthRangeStart(value) {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) {
      return null
    }

    const [year, month] = value.split('-').map(Number)
    return new Date(year, month - 1, 1)
  }

  function parseMonthRangeEnd(value) {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) {
      return null
    }

    const [year, month] = value.split('-').map(Number)
    return new Date(year, month, 0, 23, 59, 59, 999)
  }

  function updateCustomRangeValue(boundary) {
    const monthSelect = boundary === 'start' ? app.dom.customStartMonth : app.dom.customEndMonth
    const yearSelect = boundary === 'start' ? app.dom.customStartYear : app.dom.customEndYear

    if (!monthSelect || !yearSelect || !monthSelect.value || !yearSelect.value) {
      return
    }

    if (boundary === 'start') {
      app.state.customStart = `${yearSelect.value}-${monthSelect.value}`
    } else {
      app.state.customEnd = `${yearSelect.value}-${monthSelect.value}`
    }
  }

  function getEntriesForMonthYear(month, year) {
    if (!month || !year) {
      return []
    }

    return app.state.entries.filter((entry) => {
      const entryDate = new Date(entry.date)
      return entryDate.getMonth() + 1 === Number(month) && entryDate.getFullYear() === Number(year)
    })
  }

  function totalsFiltered() {
    return getFilteredEntries().reduce((totals, entry) => {
      if (entry.type === 'income') {
        totals.income += entry.amount
      } else {
        totals.expense += entry.amount
      }
      totals.net = totals.income - totals.expense
      return totals
    }, {income: 0, expense: 0, net: 0})
  }

  function breakdownByCategoryFiltered(type = 'expense') {
    const totals = {}
    let categoryTotal = 0

    getFilteredEntries().forEach((entry) => {
      if (entry.type !== type) {
        return
      }
      totals[entry.category] = (totals[entry.category] || 0) + entry.amount
      categoryTotal += entry.amount
    })

    return {categoryTotal, totals}
  }

  function editTransactionField(entry, field, element) {
    const categoryType = entry.type || 'expense'
    const categoryList = app.state.categories[categoryType] || []

    if (field === 'description') {
      const currentText = element.querySelector('div:first-child').textContent
      const input = document.createElement('input')
      input.type = 'text'
      input.value = currentText
      input.style.cssText = 'padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: inherit; font-size: 14px; width: 100%; font-weight: 600;'

      const save = async () => {
        const newValue = input.value.trim()
        if (newValue && newValue !== currentText) {
          await updateEntry(entry.id, {
            type: entry.type,
            description: newValue,
            amount: entry.amount,
            category: entry.category,
            date: new Date(entry.date).toISOString(),
          })
        } else {
          app.render()
        }
      }

      input.onblur = save
      input.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          save()
        } else if (event.key === 'Escape') {
          app.render()
        }
      }

      element.querySelector('div:first-child').replaceWith(input)
      input.focus()
      input.select()
      return
    }

    if (field === 'category') {
      const currentCategory = element.textContent
      const select = document.createElement('select')
      select.style.cssText = `padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: ${element.style.background}; color: ${element.style.color}; font-size: 12px; font-weight: 700; cursor: pointer;`

      categoryList.forEach((category) => {
        const option = document.createElement('option')
        option.value = category.name
        option.textContent = category.name
        option.selected = category.name === currentCategory
        select.appendChild(option)
      })

      const save = async () => {
        const newCategory = select.value
        if (newCategory !== currentCategory) {
          await updateEntry(entry.id, {
            type: entry.type,
            description: entry.description,
            amount: entry.amount,
            category: newCategory,
            date: new Date(entry.date).toISOString(),
          })
        } else {
          app.render()
        }
      }

      select.onchange = save
      select.onblur = save
      select.onkeydown = (event) => {
        if (event.key === 'Escape') {
          app.render()
        }
      }

      element.replaceWith(select)
      select.focus()
      return
    }

    if (field === 'amount') {
      const currentAmount = entry.amount
      const input = document.createElement('input')
      input.type = 'number'
      input.step = '0.01'
      input.value = currentAmount
      input.style.cssText = `padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: ${element.style.color}; font-size: 14px; width: 120px; text-align: right; font-weight: 700;`

      const save = async () => {
        const newAmount = parseFloat(input.value)
        if (!Number.isNaN(newAmount) && newAmount !== currentAmount) {
          await updateEntry(entry.id, {
            type: entry.type,
            description: entry.description,
            amount: newAmount,
            category: entry.category,
            date: new Date(entry.date).toISOString(),
          })
        } else {
          app.render()
        }
      }

      input.onblur = save
      input.onkeydown = (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          save()
        } else if (event.key === 'Escape') {
          app.render()
        }
      }

      element.replaceWith(input)
      input.focus()
      input.select()
      return
    }

    if (field === 'date') {
      const currentDate = new Date(entry.date)
      const currentMonth = currentDate.getMonth() + 1
      const currentYear = currentDate.getFullYear()

      const select = document.createElement('select')
      select.style.cssText = 'padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: var(--muted); font-size: 12px; cursor: pointer;'

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const now = new Date()

      for (let year = now.getFullYear(); year >= now.getFullYear() - 1; year -= 1) {
        for (let month = 12; month >= 1; month -= 1) {
          const option = document.createElement('option')
          option.value = `${year}-${String(month).padStart(2, '0')}`
          option.textContent = `${months[month - 1]} ${year}`
          option.selected = month === currentMonth && year === currentYear
          select.appendChild(option)
        }
      }

      let saved = false
      const save = async () => {
        if (saved) {
          return
        }
        saved = true

        const [newYear, newMonth] = select.value.split('-').map(Number)
        if (newMonth !== currentMonth || newYear !== currentYear) {
          await updateEntry(entry.id, {
            type: entry.type,
            description: entry.description,
            amount: entry.amount,
            category: entry.category,
            date: `${newYear}-${String(newMonth).padStart(2, '0')}-01T00:00:00Z`,
          })
        } else {
          app.render()
        }
      }

      select.onchange = save
      select.onblur = save
      select.onkeydown = (event) => {
        if (event.key === 'Escape') {
          app.render()
        }
      }

      element.replaceWith(select)
      select.focus()
    }
  }

  function renderEntriesList(container, list, emptyMessage) {
    if (!container) {
      return
    }

    container.innerHTML = ''
    if (list.length === 0) {
      const placeholder = document.createElement('div')
      placeholder.className = 'muted'
      placeholder.textContent = emptyMessage
      container.appendChild(placeholder)
      return
    }

    const sortedEntries = [...list].sort((left, right) => new Date(right.date) - new Date(left.date))

    sortedEntries.forEach((entry) => {
      const row = document.createElement('div')
      row.className = 'entry'
      row.style.cursor = 'pointer'
      row.style.transition = 'background 0.2s'

      row.onmouseenter = () => {
        row.style.background = 'rgba(255,255,255,0.05)'
        row.setAttribute('data-hovering', 'true')
      }
      row.onmouseleave = () => {
        row.style.background = ''
        row.removeAttribute('data-hovering')
      }

      const left = document.createElement('div')
      left.className = 'left'

      const chip = document.createElement('div')
      chip.className = 'chip'

      const categoryType = entry.type || 'expense'
      const categoryList = app.state.categories[categoryType] || []
      const category = categoryList.find((item) => item.name === entry.category)
      const categoryColor = category ? category.color : '#9aa5b1'

      chip.style.background = categoryColor + '20'
      chip.style.color = categoryColor
      chip.style.borderLeft = `3px solid ${categoryColor}`
      chip.textContent = entry.category
      chip.style.cursor = 'pointer'
      chip.onclick = (event) => {
        event.stopPropagation()
        editTransactionField(entry, 'category', chip)
      }

      const description = document.createElement('div')
      const entryDate = new Date(entry.date)
      const dateLabel = entryDate.toLocaleDateString('en-US', {month: 'short', year: 'numeric'})
      description.innerHTML = `<div style="cursor: pointer;">${entry.description}</div><div class="muted" style="font-size:12px; cursor: pointer;" title="Click to edit month">${dateLabel}</div>`

      description.querySelector('div:first-child').onclick = (event) => {
        event.stopPropagation()
        editTransactionField(entry, 'description', description)
      }

      description.querySelector('div.muted').onclick = (event) => {
        event.stopPropagation()
        editTransactionField(entry, 'date', description.querySelector('div.muted'))
      }

      left.appendChild(chip)
      left.appendChild(description)

      const right = document.createElement('div')
      const amount = document.createElement('div')
      amount.className = `amount ${entry.type === 'income' ? 'income' : 'expense'}`
      amount.textContent = `${entry.type === 'income' ? '+' : '-'}${app.fmt(Math.abs(entry.amount))}`
      amount.style.cursor = 'pointer'
      amount.onclick = (event) => {
        event.stopPropagation()
        editTransactionField(entry, 'amount', amount)
      }

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'btn-ghost'
      button.textContent = 'Delete'
      button.onclick = async (event) => {
        event.stopPropagation()
        await removeEntry(entry.id ?? entry.entry_id)
      }

      right.appendChild(amount)
      right.appendChild(button)
      row.appendChild(left)
      row.appendChild(right)
      container.appendChild(row)
    })
  }

  function setupEntryInteractions() {
    if (app.dom.entryForm) {
      app.dom.entryForm.addEventListener('submit', async (event) => {
        event.preventDefault()

        const type = app.dom.typeInput.value
        const description = app.dom.descriptionInput.value.trim() || (type === 'income' ? 'Income' : 'Expense')
        const amount = parseFloat(app.dom.amountInput.value)
        const category = app.dom.categoryInput.value
        const month = app.dom.monthInput.value
        const year = app.dom.yearInput.value

        if (Number.isNaN(amount) || !category || !month || !year) {
          alert('Please fill in all required fields')
          return
        }

        const saved = await addEntry({
          type,
          description,
          amount,
          category,
          date: `${year}-${month.padStart(2, '0')}-01`,
        })

        if (saved) {
          app.dom.amountInput.value = ''
          app.dom.descriptionInput.value = ''
        }
      })
    }

    if (app.dom.monthInput) {
      app.dom.monthInput.addEventListener('change', () => app.render())
    }

    if (app.dom.yearInput) {
      app.dom.yearInput.addEventListener('change', () => app.render())
    }

    if (app.dom.timelineFilter) {
      app.dom.timelineFilter.addEventListener('change', (event) => {
        app.state.currentTimeline = event.target.value
        if (app.state.currentTimeline === 'custom') {
          app.dom.customDateRange.style.display = 'block'
        } else {
          app.dom.customDateRange.style.display = 'none'
          app.render()
        }
      })
    }

    ;[
      app.dom.customStartMonth,
      app.dom.customStartYear,
    ].filter(Boolean).forEach((element) => {
      element.addEventListener('change', () => {
        updateCustomRangeValue('start')
        if (app.state.customStart && app.state.customEnd) {
          app.render()
        }
      })
    })

    ;[
      app.dom.customEndMonth,
      app.dom.customEndYear,
    ].filter(Boolean).forEach((element) => {
      element.addEventListener('change', () => {
        updateCustomRangeValue('end')
        if (app.state.customStart && app.state.customEnd) {
          app.render()
        }
      })
    })

    if (app.dom.breakdownTypeSelector) {
      app.dom.breakdownTypeSelector.addEventListener('change', (event) => {
        app.state.breakdownType = event.target.value
        app.render()
      })
    }

    if (app.dom.trendTimeframeSelector) {
      app.dom.trendTimeframeSelector.addEventListener('change', (event) => {
        app.state.trendTimeframeMonths = parseInt(event.target.value, 10)
        app.render()
      })
    }

    if (app.dom.showIncomeTrendCheckbox) {
      app.dom.showIncomeTrendCheckbox.addEventListener('change', (event) => {
        app.state.showIncomeTrend = event.target.checked
        app.render()
      })
    }

    if (app.dom.showExpenseTrendCheckbox) {
      app.dom.showExpenseTrendCheckbox.addEventListener('change', (event) => {
        app.state.showExpenseTrend = event.target.checked
        app.render()
      })
    }

    if (app.dom.typeInput) {
      app.dom.typeInput.addEventListener('change', app.updateCategoryInput)
    }
  }

  app.loadEntries = loadEntries
  app.updateEntry = updateEntry
  app.addEntry = addEntry
  app.removeEntry = removeEntry
  app.getFilteredEntries = getFilteredEntries
  app.getEntriesForMonthYear = getEntriesForMonthYear
  app.totalsFiltered = totalsFiltered
  app.breakdownByCategoryFiltered = breakdownByCategoryFiltered
  app.renderEntriesList = renderEntriesList
  app.editTransactionField = editTransactionField
  app.setupEntryInteractions = setupEntryInteractions
})()
