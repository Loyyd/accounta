const STORAGE_KEY = 'finance-tracker.entries'
const TOKEN_KEY = 'finance-tracker.token'
const CATEGORIES_KEY = 'finance-tracker.categories'
const API_BASE = 'http://127.0.0.1:5000/api' // change if backend is hosted elsewhere

// Helpers
const $ = (s) => document.querySelector(s)
const $all = (s) => document.querySelectorAll(s)
const fmt = (n) => n.toLocaleString(undefined, {style: 'currency', currency: 'USD', maximumFractionDigits: 2})

// DOM
const entryForm = $('#entryForm')
const typeInput = $('#type')
const descriptionInput = $('#description')
const amountInput = $('#amount')
const categoryInput = $('#category')
const dateInput = $('#date')
const entriesEl = $('#entries')
const totalIncomeEl = $('#totalIncome')
const totalExpenseEl = $('#totalExpense')
const netTotalEl = $('#netTotal')
const categoryListEl = $('#categoryList')
const clearAllBtn = $('#clearAll')

let entries = []
let categories = {expense: [], income: []}

// Tab switching
function switchTab(tabName) {
  // Update tab buttons
  $all('.tab-btn').forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active')
    } else {
      btn.classList.remove('active')
    }
  })
  
  // Update views
  $all('.tab-view').forEach(view => {
    if (view.id === tabName + '-view') {
      view.classList.add('active')
    } else {
      view.classList.remove('active')
    }
  })
}

// Initialize tab listeners
function initTabs() {
  $all('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab)
    })
  })
}

// Categories Management
function loadCategories() {
  const raw = localStorage.getItem(CATEGORIES_KEY)
  if (!raw) {
    categories = {
      expense: [
        {name: 'Food', color: '#6ee7b7'},        // Green - fresh/healthy
        {name: 'Housing', color: '#60a5fa'},     // Blue - stable/essential
        {name: 'Transport', color: '#fbbf24'},   // Yellow - movement/energy
        {name: 'Entertainment', color: '#f472b6'}, // Pink - fun/leisure
        {name: 'Shopping', color: '#a78bfa'},    // Purple - luxury/retail
        {name: 'Healthcare', color: '#ef4444'},  // Red - medical/important
        {name: 'Other', color: '#fb923c'}        // Orange - miscellaneous
      ],
      income: [
        {name: 'Salary', color: '#6ee7b7'},      // Green - primary income
        {name: 'Freelance', color: '#60a5fa'},   // Blue - professional
        {name: 'Investment', color: '#fbbf24'},  // Yellow - growth
        {name: 'Gift', color: '#f472b6'},        // Pink - pleasant surprise
        {name: 'Other', color: '#fb923c'}        // Orange - miscellaneous
      ]
    }
    saveCategories()
  } else {
    categories = JSON.parse(raw)
    // Migrate old format (array of strings) to new format (array of objects)
    if (categories.expense && categories.expense.length > 0 && typeof categories.expense[0] === 'string') {
      categories.expense = categories.expense.map(name => ({name, color: '#6ee7b7'}))
    }
    if (categories.income && categories.income.length > 0 && typeof categories.income[0] === 'string') {
      categories.income = categories.income.map(name => ({name, color: '#6ee7b7'}))
    }
  }
}

function saveCategories() {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories))
}

function addCategory(name, type, color) {
  const trimmed = name.trim()
  if (!trimmed) return false
  if (categories[type].some(cat => cat.name === trimmed)) {
    alert('Category already exists!')
    return false
  }
  categories[type].push({name: trimmed, color: color || '#6ee7b7'})
  saveCategories()
  renderCategories()
  return true
}

function removeCategory(name, type) {
  categories[type] = categories[type].filter(c => c.name !== name)
  saveCategories()
  renderCategories()
}

function renderCategories() {
  const expenseList = $('#expenseCategoriesList')
  const incomeList = $('#incomeCategoriesList')
  
  // Render expense categories
  expenseList.innerHTML = ''
  if (categories.expense.length === 0) {
    expenseList.innerHTML = '<li class="muted">No expense categories</li>'
  } else {
    categories.expense.forEach(cat => {
      const li = document.createElement('li')
      li.innerHTML = `
        <span style="color: ${cat.color}; font-weight: 600;">
          <span style="display: inline-block; width: 12px; height: 12px; background: ${cat.color}; border-radius: 3px; margin-right: 8px;"></span>
          ${cat.name}
        </span>
        <button class="btn-ghost" style="padding:4px 8px;font-size:12px" onclick="removeCategory('${cat.name}', 'expense')">Delete</button>
      `
      expenseList.appendChild(li)
    })
  }
  
  // Render income categories
  incomeList.innerHTML = ''
  if (categories.income.length === 0) {
    incomeList.innerHTML = '<li class="muted">No income categories</li>'
  } else {
    categories.income.forEach(cat => {
      const li = document.createElement('li')
      li.innerHTML = `
        <span style="color: ${cat.color}; font-weight: 600;">
          <span style="display: inline-block; width: 12px; height: 12px; background: ${cat.color}; border-radius: 3px; margin-right: 8px;"></span>
          ${cat.name}
        </span>
        <button class="btn-ghost" style="padding:4px 8px;font-size:12px" onclick="removeCategory('${cat.name}', 'income')">Delete</button>
      `
      incomeList.appendChild(li)
    })
  }
  
  // Update category input datalist
  updateCategoryInput()
}

function updateCategoryInput() {
  const categoryInput = $('#category')
  const currentType = $('#type').value
  const availableCategories = categories[currentType] || []
  
  // Clear existing options
  categoryInput.innerHTML = '<option value="">Select a category</option>'
  
  // Add options for each category
  availableCategories.forEach(cat => {
    const option = document.createElement('option')
    option.value = cat.name
    option.textContent = cat.name
    categoryInput.appendChild(option)
  })
}

// Make removeCategory globally accessible
window.removeCategory = removeCategory

function token(){
  return localStorage.getItem(TOKEN_KEY)
}

function isLoggedIn(){
  return !!token()
}

async function apiFetch(method, path, body){
  const headers = {'Content-Type': 'application/json'}
  const t = token()
  if(t) headers['Authorization'] = 'Bearer ' + t
  const res = await fetch(API_BASE + path, {method, headers, body: body ? JSON.stringify(body) : undefined})
  if(res.status === 401){
    // token expired or invalid, clear and fall back
    localStorage.removeItem(TOKEN_KEY)
    alert('Session expired or invalid, please log in again.')
    location.href = 'login.html'
    throw new Error('Unauthorized')
  }
  return res
}

async function loadEntries(){
  try {
    if(!isLoggedIn()){
      // Require login
      location.href = 'login.html'
      return
    }
    
    // fetch from server
    const res = await apiFetch('GET', '/entries')
    if(!res.ok) throw new Error('Failed to load entries')
    const data = await res.json()
    // backend dates are iso strings
    entries = data.map(e => ({...e, date: new Date(e.date).getTime()}))
  } catch(e){
    console.error('Failed to load entries', e)
    entries = []
  }
}

function saveEntries(){
  // Entries are now always persisted via API only
  return
}



function id(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8)
}

async function addEntry({type, description, amount, category, date}){
  const res = await apiFetch('POST', '/entries', {type, description, amount, category, date})
  if(!res.ok){
    const j = await res.json().catch(()=>({error:'Failed'}))
    alert(j.error || 'Failed to save')
    return
  }
  // refresh list from server
  await loadEntries()
  render()
}

async function removeEntry(idValue){
  const res = await apiFetch('DELETE', '/entries/' + idValue)
  if(!res.ok){
    const j = await res.json().catch(()=>({error:'Failed'}))
    alert(j.error || 'Delete failed')
    return
  }
  await loadEntries()
  render()
}

function clearAll(){
  entries = []
  saveEntries()
  render()
}

// Computation
function totals(){
  const out = {income: 0, expense: 0}
  for(const e of entries){
    if(e.type === 'income') out.income += e.amount
    else out.expense += e.amount
  }
  out.net = out.income - out.expense
  return out
}

function breakdownByCategory(){
  const totals = {}
  let expenseTotal = 0
  for(const e of entries){
    if(e.type !== 'expense') continue
    expenseTotal += e.amount
    const key = (e.category || 'Other').trim()
    totals[key] = (totals[key] || 0) + e.amount
  }
  return {expenseTotal, totals}
}

function render(){
  // render totals
  const t = totals()
  totalIncomeEl.textContent = fmt(t.income)
  totalExpenseEl.textContent = fmt(t.expense)
  netTotalEl.textContent = fmt(t.net)

  // category breakdown
  const {expenseTotal, totals: catTotals} = breakdownByCategory()
  categoryListEl.innerHTML = ''
  if(expenseTotal === 0){
    categoryListEl.innerHTML = '<li class="muted">No expenses yet</li>'
  } else {
    const sorted = Object.entries(catTotals).sort((a,b)=>b[1]-a[1])
    for(const [cat, value] of sorted){
      const percent = Math.round((value/expenseTotal)*10000)/100
      const li = document.createElement('li')
      li.innerHTML = `<span>${cat}</span><span>${fmt(value)} <span class="muted">(${percent}%)</span></span>`
      categoryListEl.appendChild(li)
    }
  }

  // render entries list
  entriesEl.innerHTML = ''
  if(entries.length === 0){
    const placeholder = document.createElement('div')
    placeholder.className = 'muted'
    placeholder.textContent = 'No entries yet — add income or expense above.'
    entriesEl.appendChild(placeholder)
    return
  }

  for(const e of entries){
    const div = document.createElement('div')
    div.className = 'entry'
    const left = document.createElement('div')
    left.className = 'left'
    const chip = document.createElement('div')
    chip.className = 'chip'
    
    // Find category color
    const categoryType = e.type || 'expense'
    const categoryList = categories[categoryType] || []
    const categoryObj = categoryList.find(c => c.name === e.category)
    const categoryColor = categoryObj ? categoryObj.color : '#9aa5b1'
    
    chip.style.background = categoryColor + '20'  // 20% opacity
    chip.style.color = categoryColor
    chip.style.borderLeft = `3px solid ${categoryColor}`
    chip.textContent = e.category
    
    const desc = document.createElement('div')
    desc.innerHTML = `<div>${e.description}</div><div class="muted" style="font-size:12px">${new Date(e.date).toLocaleString()}</div>`
    left.appendChild(chip)
    left.appendChild(desc)

    const right = document.createElement('div')
    const amt = document.createElement('div')
    amt.className = 'amount ' + (e.type === 'income' ? 'income' : 'expense')
    amt.textContent = (e.type === 'income' ? '+' : '-') + fmt(Math.abs(e.amount))
    const btn = document.createElement('button')
    btn.className = 'btn-ghost'
    btn.textContent = 'Delete'
    btn.onclick = () => removeEntry(e.id)

    right.appendChild(amt)
    right.appendChild(btn)

    div.appendChild(left)
    div.appendChild(right)
    entriesEl.appendChild(div)
  }
}

// UI wiring
entryForm.addEventListener('submit', (ev)=>{
  ev.preventDefault()
  const type = typeInput.value
  const description = descriptionInput.value.trim() || (type === 'income' ? 'Income' : 'Expense')
  const amount = parseFloat(amountInput.value)
  const category = categoryInput.value
  const date = dateInput.value
  
  if(isNaN(amount) || !category || !date) {
    alert('Please fill in all required fields')
    return
  }
  
  addEntry({type, description, amount, category, date})
  entryForm.reset()
  // Set date back to today
  dateInput.value = new Date().toISOString().split('T')[0]
})

clearAllBtn.addEventListener('click', ()=>{
  if(!confirm('Clear ALL entries? This cannot be undone.')) return
  clearAll()
})

// Initialization
async function init(){
  initTabs()
  loadCategories()
  await loadEntries()
  render()
  renderCategories()
  
  // Set today's date as default
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0]
  }
  
  // Setup category form
  const categoryForm = $('#categoryForm')
  if (categoryForm) {
    // Color palette selection
    const colorOptions = $all('.color-option')
    const colorInput = $('#categoryColor')
    
    // Set first color as selected by default
    if (colorOptions.length > 0) {
      colorOptions[0].classList.add('selected')
    }
    
    colorOptions.forEach(option => {
      option.addEventListener('click', () => {
        // Remove selected class from all options
        colorOptions.forEach(opt => opt.classList.remove('selected'))
        // Add selected class to clicked option
        option.classList.add('selected')
        // Update hidden input value
        colorInput.value = option.dataset.color
      })
    })
    
    categoryForm.addEventListener('submit', (ev) => {
      ev.preventDefault()
      const name = $('#newCategoryName').value
      const type = $('#categoryType').value
      const color = $('#categoryColor').value
      if (addCategory(name, type, color)) {
        categoryForm.reset()
        // Reset color selection to first option
        colorOptions.forEach(opt => opt.classList.remove('selected'))
        if (colorOptions.length > 0) {
          colorOptions[0].classList.add('selected')
          colorInput.value = colorOptions[0].dataset.color
        }
      }
    })
  }
  
  // Update category input when type changes
  const typeInput = $('#type')
  if (typeInput) {
    typeInput.addEventListener('change', updateCategoryInput)
  }
  
  // Setup auth UI
  try{
    const loginLink = document.getElementById('loginLink')
    const signOutBtn = document.getElementById('signOutBtn')
    const userHint = document.getElementById('userHint')
    const footer = document.querySelector('.footer')

    if(isLoggedIn()){
      if(loginLink) loginLink.style.display = 'none'
      if(signOutBtn) signOutBtn.style.display = 'inline-block'
      // load username
      try{
        const res = await apiFetch('GET', '/profile')
        if(res.ok){
          const j = await res.json()
          if(userHint) userHint.textContent = j.username
          if(footer) footer.textContent = 'Saved to your account (server)'
        }
      } catch(e) {}
    } else {
      // Not logged in - redirect to login
      location.href = 'login.html'
      return
    }

    if(signOutBtn){
      signOutBtn.addEventListener('click', ()=>{
        localStorage.removeItem(TOKEN_KEY)
        location.href = 'login.html'
      })
    }
  } catch(e){
    // ignore if elements are not present
  }
}

init()
