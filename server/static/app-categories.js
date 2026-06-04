(function () {
  const app = window.AccountaApp

  async function loadCategories() {
    try {
      const response = await app.apiFetch('GET', '/categories')
      if (!response.ok) {
        throw new Error('Failed to load categories')
      }

      app.state.categories = await response.json()
    } catch (error) {
      console.error('Failed to load categories', error)
      app.state.categories = {expense: [], income: []}
    }
  }

  async function ensureDefaultCategories() {
    // Only create defaults if account is completely new (no categories AND no entries)
    if (app.state.categories.expense.length === 0 && app.state.categories.income.length === 0 && app.getFilteredEntries().length === 0) {
      const defaults = {
        expense: [
          {name: 'Housing', color: '#60a5fa'},
          {name: 'Food', color: '#6ee7b7'},
          {name: 'Transport', color: '#fbbf24'},
          {name: 'Healthcare', color: '#ef4444'},
          {name: 'Entertainment', color: '#f472b6'},
          {name: 'Shopping', color: '#a78bfa'},
        ],
        income: [
          {name: 'Salary', color: '#6ee7b7'},
          {name: 'Freelance', color: '#60a5fa'},
          {name: 'Investment', color: '#fbbf24'},
        ],
      }

      for (const type of ['expense', 'income']) {
        for (const category of defaults[type]) {
          await app.apiFetch('POST', '/categories', {name: category.name, type, color: category.color})
        }
      }

      const reload = await app.apiFetch('GET', '/categories')
      if (reload.ok) {
        app.state.categories = await reload.json()
      }
    }
  }

  async function addCategory(name, type) {
    const trimmed = name.trim()
    if (!trimmed) {
      return false
    }

    if (app.state.categories[type].some((category) => category.name === trimmed)) {
      alert('Category already exists!')
      return false
    }

    const defaultColor = type === 'expense' ? '#6ee7b7' : '#60a5fa'
    const response = await app.apiFetch('POST', '/categories', {name: trimmed, type, color: defaultColor})
    if (!response.ok) {
      const payload = await response.json().catch(() => ({error: 'Failed'}))
      alert(payload.error || 'Failed to add category')
      return false
    }

    await loadCategories()
    renderCategories()
    return true
  }

  async function updateCategoryColor(name, type, newColor) {
    const category = app.state.categories[type].find((item) => item.name === name)
    if (!category) {
      return
    }

    category.color = newColor
    const response = await app.apiFetch('PUT', '/categories/0', {name, type, color: newColor})
    if (response.ok) {
      await loadCategories()
      renderCategories()
    }
  }

  async function updateCategoryName(oldName, type, newName) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) {
      return
    }

    if (app.state.categories[type].some((category) => category.name === trimmed && category.name !== oldName)) {
      alert('A category with that name already exists')
      return
    }

    const category = app.state.categories[type].find((item) => item.name === oldName)
    if (!category) {
      return
    }

    const response = await app.apiFetch('PUT', '/categories/0', {
      name: trimmed,
      type,
      color: category.color,
      oldName,
    })

    if (response.ok) {
      await loadCategories()
      await app.loadEntries()
      renderCategories()
      app.render()
    } else {
      const payload = await response.json().catch(() => ({error: 'Failed'}))
      alert(payload.error || 'Failed to update category name')
    }
  }

  async function removeCategory(name, type) {
    const category = app.state.categories[type].find((item) => item.name === name)
    if (!category) {
      return
    }

    const response = await app.apiFetch('DELETE', `/categories/0?name=${encodeURIComponent(name)}&type=${type}`)
    if (response.ok) {
      await loadCategories()
      renderCategories()
    }
  }

  function updateCategoryInput() {
    const categoryInput = app.dom.categoryInput
    const currentType = app.dom.typeInput?.value
    const availableCategories = app.state.categories[currentType] || []

    if (!categoryInput) {
      return
    }

    categoryInput.innerHTML = '<option value="">Select a category</option>'
    availableCategories.forEach((category) => {
      const option = document.createElement('option')
      option.value = category.name
      option.textContent = category.name
      categoryInput.appendChild(option)
    })
  }

  function renderCategoryList(listElement, type) {
    if (!listElement) {
      return
    }

    listElement.innerHTML = ''

    if (app.state.categories[type].length === 0) {
      const empty = document.createElement('li')
      empty.className = 'muted'
      empty.textContent = `No ${type} categories`
      listElement.appendChild(empty)
      return
    }

    app.state.categories[type].forEach((category) => {
      const item = document.createElement('li')
      item.style.display = 'flex'
      item.style.alignItems = 'center'
      item.style.justifyContent = 'space-between'
      item.style.padding = '8px 0'
      item.style.borderBottom = '1px dashed rgba(255,255,255,0.02)'

      const categoryColor = app.safeHexColor(category.color)
      const colorId = `color-${type}-${category.id || category.name.replace(/\W/g, '-')}`
      const content = document.createElement('span')
      content.style.fontWeight = '600'
      content.style.flex = '1'
      content.style.display = 'flex'
      content.style.alignItems = 'center'
      content.style.gap = '12px'

      const label = document.createElement('label')
      label.htmlFor = colorId
      label.style.position = 'relative'
      label.style.cursor = 'pointer'
      label.style.display = 'inline-block'

      const swatch = document.createElement('div')
      swatch.style.width = '24px'
      swatch.style.height = '24px'
      swatch.style.background = categoryColor
      swatch.style.borderRadius = '50%'
      swatch.style.border = '2px solid rgba(255,255,255,0.2)'
      swatch.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)'
      swatch.style.transition = 'transform 0.2s'
      swatch.addEventListener('mouseover', () => {
        swatch.style.transform = 'scale(1.1)'
      })
      swatch.addEventListener('mouseout', () => {
        swatch.style.transform = 'scale(1)'
      })

      const colorInput = document.createElement('input')
      colorInput.type = 'color'
      colorInput.id = colorId
      colorInput.value = categoryColor
      colorInput.title = 'Change color'
      colorInput.style.position = 'absolute'
      colorInput.style.opacity = '0'
      colorInput.style.width = '0'
      colorInput.style.height = '0'
      colorInput.addEventListener('change', () => {
        updateCategoryColor(category.name, type, colorInput.value)
      })

      label.appendChild(swatch)
      label.appendChild(colorInput)

      const name = document.createElement('span')
      name.style.color = categoryColor
      name.style.cursor = 'pointer'
      name.title = 'Click to edit name'
      name.textContent = category.name
      name.addEventListener('click', () => {
        editCategoryName(name, category.name, type)
      })

      content.appendChild(label)
      content.appendChild(name)

      const deleteButton = document.createElement('button')
      deleteButton.type = 'button'
      deleteButton.className = 'btn-ghost'
      deleteButton.style.padding = '4px 8px'
      deleteButton.style.fontSize = '12px'
      deleteButton.textContent = 'Delete'
      deleteButton.addEventListener('click', () => {
        removeCategory(category.name, type)
      })

      item.appendChild(content)
      item.appendChild(deleteButton)
      listElement.appendChild(item)
    })
  }

  function renderCategories() {
    renderCategoryList(app.$('#expenseCategoriesList'), 'expense')
    renderCategoryList(app.$('#incomeCategoriesList'), 'income')
    updateCategoryInput()
    app.refreshSubscriptionCategoryInput?.()
  }

  function editCategoryName(element, oldName, type) {
    const currentText = element.textContent
    const currentColor = element.style.color

    const input = document.createElement('input')
    input.type = 'text'
    input.value = currentText
    input.style.cssText = `padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: ${currentColor}; font-size: inherit; font-weight: 600; width: 200px;`

    const save = async () => {
      const nextValue = input.value.trim()
      if (nextValue && nextValue !== oldName) {
        await updateCategoryName(oldName, type, nextValue)
      } else {
        renderCategories()
      }
    }

    input.onblur = save
    input.onkeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        save()
      } else if (event.key === 'Escape') {
        renderCategories()
      }
    }

    element.replaceWith(input)
    input.focus()
    input.select()
  }

  function setupCategoryForm() {
    const form = app.$('#categoryForm')
    if (!form) {
      return
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const saved = await addCategory(app.$('#newCategoryName').value, app.$('#categoryType').value)
      if (saved) {
        form.reset()
      }
    })
  }

  app.loadCategories = loadCategories
  app.addCategory = addCategory
  app.ensureDefaultCategories = ensureDefaultCategories
  app.updateCategoryName = updateCategoryName
  app.renderCategories = renderCategories
  app.updateCategoryInput = updateCategoryInput
  app.editCategoryName = editCategoryName
  app.setupCategoryForm = setupCategoryForm

  window.removeCategory = removeCategory
  window.updateCategoryColor = updateCategoryColor
  window.editCategoryName = editCategoryName
})()
