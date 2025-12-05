const STORAGE_KEY = 'finance-tracker.entries'
const TOKEN_KEY = 'finance-tracker.token'
const CATEGORIES_KEY = 'finance-tracker.categories'
const SUBSCRIPTIONS_KEY = 'finance-tracker.subscriptions'
const API_BASE = 'http://127.0.0.1:5000/api' // change if backend is hosted elsewhere

// Helpers
const $ = (s) => document.querySelector(s)
const $all = (s) => document.querySelectorAll(s)
const fmt = (n) => n.toLocaleString(undefined, {style: 'currency', currency: 'EUR', maximumFractionDigits: 2})

// DOM
const entryForm = $('#entryForm')
const typeInput = $('#type')
const descriptionInput = $('#description')
const amountInput = $('#amount')
const categoryInput = $('#category')
const monthInput = $('#month')
const yearInput = $('#year')
const entriesEl = $('#entries')
const totalIncomeEl = $('#totalIncome')
const totalExpenseEl = $('#totalExpense')
const netTotalEl = $('#netTotal')
const categoryListEl = $('#categoryList')
const clearAllBtn = $('#clearAll')
const timelineFilter = $('#timelineFilter')
const customDateRange = $('#customDateRange')
const customStartDate = $('#customStartDate')
const customEndDate = $('#customEndDate')

let entries = []
let categories = {expense: [], income: []}
let subscriptions = []
let currentTimeline = 'all'
let customStart = null
let customEnd = null

// Chart instances
let expenseChart = null
let compareChart = null
let trendChart = null

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

// Subscriptions Management
function loadSubscriptions() {
  const raw = localStorage.getItem(SUBSCRIPTIONS_KEY)
  subscriptions = raw ? JSON.parse(raw) : []
}

function saveSubscriptions() {
  localStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions))
}

function addSubscription(type, amount, category, description, frequency, startDate) {
  const sub = {
    id: Date.now(),
    type,
    amount: parseFloat(amount),
    category,
    description,
    frequency,
    startDate,
    active: true
  }
  subscriptions.push(sub)
  saveSubscriptions()
  renderSubscriptions()
  processSubscriptions()
  return true
}

function deleteSubscription(id) {
  subscriptions = subscriptions.filter(s => s.id !== id)
  saveSubscriptions()
  renderSubscriptions()
}

function toggleSubscription(id) {
  const sub = subscriptions.find(s => s.id === id)
  if (sub) {
    sub.active = !sub.active
    saveSubscriptions()
    renderSubscriptions()
  }
}

function processSubscriptions() {
  // Process active subscriptions and add entries if needed
  const today = new Date()
  
  subscriptions.forEach(sub => {
    if (!sub.active) return
    
    const start = new Date(sub.startDate)
    if (start > today) return
    
    // Generate all missing entries from start date to today
    if (sub.frequency === 'monthly') {
      let current = new Date(start)
      while (current <= today) {
        const year = current.getFullYear()
        const month = current.getMonth() + 1
        const day = current.getDate()
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        
        // Check if entry exists for this month
        if (!hasSubscriptionEntry(sub, current)) {
          addEntry({
            type: sub.type,
            description: sub.description,
            amount: sub.amount,
            category: sub.category,
            date: date
          })
        }
        
        // Move to next month
        current.setMonth(current.getMonth() + 1)
      }
    } else if (sub.frequency === 'weekly') {
      let current = new Date(start)
      while (current <= today) {
        const year = current.getFullYear()
        const month = current.getMonth() + 1
        const day = current.getDate()
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        
        if (!hasSubscriptionEntry(sub, current)) {
          addEntry({
            type: sub.type,
            description: sub.description,
            amount: sub.amount,
            category: sub.category,
            date: date
          })
        }
        
        // Move to next week
        current.setDate(current.getDate() + 7)
      }
    } else if (sub.frequency === 'yearly') {
      let current = new Date(start)
      while (current <= today) {
        const year = current.getFullYear()
        const month = current.getMonth() + 1
        const day = current.getDate()
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        
        if (!hasSubscriptionEntry(sub, current)) {
          addEntry({
            type: sub.type,
            description: sub.description,
            amount: sub.amount,
            category: sub.category,
            date: date
          })
        }
        
        // Move to next year
        current.setFullYear(current.getFullYear() + 1)
      }
    }
  })
}

function hasSubscriptionEntry(sub, targetDate) {
  // Check if there's already an entry for this subscription at this specific period
  return entries.some(e => {
    if (e.description !== sub.description) return false
    if (e.type !== sub.type) return false
    if (parseFloat(e.amount) !== sub.amount) return false
    
    const entryDate = new Date(e.date)
    
    if (sub.frequency === 'monthly') {
      return entryDate.getMonth() === targetDate.getMonth() && 
             entryDate.getFullYear() === targetDate.getFullYear()
    } else if (sub.frequency === 'weekly') {
      // Check if dates are within the same week
      const daysDiff = Math.abs((entryDate - targetDate) / (1000 * 60 * 60 * 24))
      return daysDiff < 7
    } else if (sub.frequency === 'yearly') {
      return entryDate.getFullYear() === targetDate.getFullYear()
    }
    return false
  })
}

function renderSubscriptions() {
  const subsList = $('#subscriptionsList')
  if (!subsList) return
  
  if (subscriptions.length === 0) {
    subsList.innerHTML = '<div class="muted" style="text-align:center;padding:20px">No subscriptions yet. Add one above!</div>'
    return
  }
  
  subsList.innerHTML = ''
  subscriptions.forEach(sub => {
    const div = document.createElement('div')
    div.className = 'entry'
    div.style.opacity = sub.active ? '1' : '0.5'
    
    const typeColor = sub.type === 'income' ? 'var(--accent)' : 'var(--danger)'
    const freqText = sub.frequency.charAt(0).toUpperCase() + sub.frequency.slice(1)
    
    div.innerHTML = `
      <div style="flex:1">
        <div style="font-weight:600;margin-bottom:4px">${sub.description}</div>
        <div style="font-size:13px;color:var(--muted)">${sub.category} • ${freqText} • Since ${new Date(sub.startDate).toLocaleDateString()}</div>
      </div>
      <div style="font-weight:600;color:${typeColor};margin-right:12px">${fmt(sub.amount)}</div>
      <div style="display:flex;gap:8px">
        <button onclick="toggleSubscription(${sub.id})" class="btn-ghost" style="padding:6px 10px;font-size:12px" title="${sub.active ? 'Pause' : 'Activate'}">
          ${sub.active ? '⏸' : '▶️'}
        </button>
        <button onclick="deleteSubscription(${sub.id})" class="btn-ghost" style="padding:6px 10px;font-size:12px;color:var(--danger)" title="Delete">
          🗑️
        </button>
      </div>
    `
    subsList.appendChild(div)
  })
}

// Make functions global for onclick handlers
window.deleteSubscription = deleteSubscription
window.toggleSubscription = toggleSubscription

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
    const defaultColors = ['#6ee7b7', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#ef4444']
    
    if (categories.expense && categories.expense.length > 0 && typeof categories.expense[0] === 'string') {
      categories.expense = categories.expense.map((name, index) => ({
        name, 
        color: defaultColors[index % defaultColors.length]
      }))
    }
    if (categories.income && categories.income.length > 0 && typeof categories.income[0] === 'string') {
      categories.income = categories.income.map((name, index) => ({
        name, 
        color: defaultColors[index % defaultColors.length]
      }))
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
    if(e.type === 'expense'){
      totals[e.category] = (totals[e.category] || 0) + e.amount
      expenseTotal += e.amount
    }
  }
  return {expenseTotal, totals}
}

// Timeline filtering
function getFilteredEntries() {
  const now = new Date()
  let startDate, endDate
  
  switch(currentTimeline) {
    case 'this-month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      break
    case 'last-month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      endDate = new Date(now.getFullYear(), now.getMonth(), 0)
      break
    case 'this-year':
      startDate = new Date(now.getFullYear(), 0, 1)
      endDate = new Date(now.getFullYear(), 11, 31)
      break
    case 'last-year':
      startDate = new Date(now.getFullYear() - 1, 0, 1)
      endDate = new Date(now.getFullYear() - 1, 11, 31)
      break
    case 'custom':
      if (!customStart || !customEnd) return entries
      startDate = new Date(customStart)
      endDate = new Date(customEnd)
      break
    case 'all':
    default:
      return entries
  }
  
  return entries.filter(e => {
    const entryDate = new Date(e.date)
    return entryDate >= startDate && entryDate <= endDate
  })
}

function totalsFiltered() {
  const filtered = getFilteredEntries()
  const out = {income: 0, expense: 0}
  for(const e of filtered){
    if(e.type === 'income') out.income += e.amount
    else out.expense += e.amount
  }
  out.net = out.income - out.expense
  return out
}

function breakdownByCategoryFiltered() {
  const filtered = getFilteredEntries()
  const totals = {}
  let expenseTotal = 0
  for(const e of filtered){
    if(e.type === 'expense'){
      totals[e.category] = (totals[e.category] || 0) + e.amount
      expenseTotal += e.amount
    }
  }
  return {expenseTotal, totals}
}

// Chart rendering
function destroyCharts() {
  if (expenseChart) {
    expenseChart.destroy()
    expenseChart = null
  }
  if (compareChart) {
    compareChart.destroy()
    compareChart = null
  }
  if (trendChart) {
    trendChart.destroy()
    trendChart = null
  }
}

function renderCharts() {
  destroyCharts()
  
  const filtered = getFilteredEntries()
  if (filtered.length === 0) {
    // Show empty state
    return
  }
  
  // Expense Breakdown Chart (Doughnut)
  const {expenseTotal, totals: catTotals} = breakdownByCategoryFiltered()
  if (expenseTotal > 0) {
    const ctx1 = document.getElementById('expenseChart')
    const sortedCategories = Object.entries(catTotals).sort((a,b) => b[1] - a[1])
    const labels = sortedCategories.map(([cat]) => cat)
    const data = sortedCategories.map(([,val]) => val)
    
    // Get colors from category definitions
    const colors = labels.map(catName => {
      const catObj = categories.expense.find(c => c.name === catName)
      return catObj ? catObj.color : '#9aa5b1'
    })
    
    expenseChart = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderColor: '#0f1724',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = context.parsed
                const total = context.dataset.data.reduce((a,b) => a + b, 0)
                const percentage = ((value / total) * 100).toFixed(1)
                return `${context.label}: ${fmt(value)} (${percentage}%)`
              }
            }
          }
        }
      }
    })
    
    // Create custom legend
    const legendEl = document.getElementById('expenseChartLegend')
    legendEl.innerHTML = ''
    sortedCategories.forEach(([cat, val], idx) => {
      const percent = ((val / expenseTotal) * 100).toFixed(1)
      const item = document.createElement('div')
      item.className = 'chart-legend-item'
      item.innerHTML = `
        <div class="chart-legend-color" style="background: ${colors[idx]}"></div>
        <span>${cat}: ${fmt(val)} (${percent}%)</span>
      `
      legendEl.appendChild(item)
    })
  }
  
  // Income vs Expense Chart (Bar)
  const ctx2 = document.getElementById('compareChart')
  const t = totalsFiltered()
  
  compareChart = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: ['Income', 'Expense'],
      datasets: [{
        data: [t.income, t.expense],
        backgroundColor: ['#6ee7b7', '#ff6b6b'],
        borderColor: ['#6ee7b7', '#ff6b6b'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return fmt(context.parsed.y)
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '$' + value.toLocaleString()
            },
            color: '#9aa5b1'
          },
          grid: {
            color: 'rgba(255,255,255,0.05)'
          }
        },
        x: {
          ticks: {
            color: '#e6eef6'
          },
          grid: {
            display: false
          }
        }
      }
    }
  })
  
  // Trend Chart (Line) - Group by month and category
  const monthlyData = {}
  const categoryTrends = {}
  
  filtered.forEach(e => {
    const date = new Date(e.date)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {income: 0, expense: 0}
    }
    
    if (e.type === 'income') {
      monthlyData[monthKey].income += e.amount
    } else {
      monthlyData[monthKey].expense += e.amount
      
      // Track category trends for expenses
      if (!categoryTrends[e.category]) {
        categoryTrends[e.category] = {}
      }
      if (!categoryTrends[e.category][monthKey]) {
        categoryTrends[e.category][monthKey] = 0
      }
      categoryTrends[e.category][monthKey] += e.amount
    }
  })
  
  const sortedMonths = Object.keys(monthlyData).sort()
  const monthLabels = sortedMonths.map(key => {
    const [year, month] = key.split('-')
    const date = new Date(year, parseInt(month) - 1)
    return date.toLocaleDateString('en-US', {month: 'short', year: 'numeric'})
  })
  const incomeData = sortedMonths.map(key => monthlyData[key].income)
  const expenseData = sortedMonths.map(key => monthlyData[key].expense)
  
  // Create datasets for categories
  const categoryDatasets = Object.entries(categoryTrends).map(([categoryName, monthData]) => {
    const categoryObj = categories.expense.find(c => c.name === categoryName)
    const color = categoryObj ? categoryObj.color : '#9aa5b1'
    
    return {
      label: categoryName,
      data: sortedMonths.map(key => monthData[key] || 0),
      borderColor: color,
      backgroundColor: color + '20',
      tension: 0.3,
      fill: false,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5
    }
  })
  
  const ctx3 = document.getElementById('trendChart')
  
  trendChart = new Chart(ctx3, {
    type: 'line',
    data: {
      labels: monthLabels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          borderColor: '#6ee7b7',
          backgroundColor: 'rgba(110, 231, 183, 0.1)',
          tension: 0.3,
          fill: true,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'Total Expense',
          data: expenseData,
          borderColor: '#ff6b6b',
          backgroundColor: 'rgba(255, 107, 107, 0.1)',
          tension: 0.3,
          fill: true,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        ...categoryDatasets
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#e6eef6',
            usePointStyle: true,
            padding: 10
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${fmt(context.parsed.y)}`
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '$' + value.toLocaleString()
            },
            color: '#9aa5b1'
          },
          grid: {
            color: 'rgba(255,255,255,0.05)'
          }
        },
        x: {
          ticks: {
            color: '#9aa5b1'
          },
          grid: {
            color: 'rgba(255,255,255,0.05)'
          }
        }
      }
    }
  })
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
  // render totals with filtered data
  const t = totalsFiltered()
  totalIncomeEl.textContent = fmt(t.income)
  totalExpenseEl.textContent = fmt(t.expense)
  netTotalEl.textContent = fmt(t.net)

  // Render charts
  renderCharts()

  // render entries list (show filtered entries)
  const filtered = getFilteredEntries()
  entriesEl.innerHTML = ''
  if(filtered.length === 0){
    const placeholder = document.createElement('div')
    placeholder.className = 'muted'
    placeholder.textContent = 'No transactions in this period.'
    entriesEl.appendChild(placeholder)
    return
  }

  // Sort by date descending
  const sorted = [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date))
  
  for(const e of sorted){
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
    const entryDate = new Date(e.date)
    const dateString = entryDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    desc.innerHTML = `<div>${e.description}</div><div class="muted" style="font-size:12px">${dateString}</div>`
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
  const month = monthInput.value
  const year = yearInput.value
  
  if(isNaN(amount) || !category || !month || !year) {
    alert('Please fill in all required fields')
    return
  }
  
  // Create date from month/year (first day of the month)
  const date = `${year}-${month.padStart(2, '0')}-01`
  
  addEntry({type, description, amount, category, date})
  
  // Only reset amount and description, keep month/year/type/category selected
  amountInput.value = ''
  descriptionInput.value = ''
})

clearAllBtn.addEventListener('click', ()=>{
  if(!confirm('Clear ALL entries? This cannot be undone.')) return
  clearAll()
})

// Timeline filter event listeners
if (timelineFilter) {
  timelineFilter.addEventListener('change', (e) => {
    currentTimeline = e.target.value
    
    if (currentTimeline === 'custom') {
      customDateRange.style.display = 'block'
    } else {
      customDateRange.style.display = 'none'
      render()
    }
  })
}

if (customStartDate) {
  customStartDate.addEventListener('change', (e) => {
    customStart = e.target.value
    if (customStart && customEnd) {
      render()
    }
  })
}

if (customEndDate) {
  customEndDate.addEventListener('change', (e) => {
    customEnd = e.target.value
    if (customStart && customEnd) {
      render()
    }
  })
}

// Initialization
async function init(){
  initTabs()
  loadCategories()
  loadSubscriptions()
  await loadEntries()
  processSubscriptions() // Check and add subscription entries if needed
  render()
  renderCategories()
  renderSubscriptions()
  
  // Set current month and year as default
  if (monthInput && yearInput) {
    const now = new Date()
    monthInput.value = (now.getMonth() + 1).toString() // getMonth() is 0-indexed
    yearInput.value = now.getFullYear().toString()
  }
  
  // Setup subscription form
  const subscriptionForm = $('#subscriptionForm')
  if (subscriptionForm) {
    const subType = $('#subType')
    const subCategory = $('#subCategory')
    const subStartDate = $('#subStartDate')
    
    // Set default date to today
    if (subStartDate) {
      subStartDate.value = new Date().toISOString().split('T')[0]
    }
    
    // Update category dropdown based on type
    const updateSubCategoryInput = () => {
      if (!subCategory || !subType) return
      const type = subType.value
      subCategory.innerHTML = '<option value="">Select a category</option>'
      categories[type].forEach(cat => {
        const opt = document.createElement('option')
        opt.value = cat.name
        opt.textContent = cat.name
        subCategory.appendChild(opt)
      })
    }
    
    if (subType) {
      subType.addEventListener('change', updateSubCategoryInput)
      updateSubCategoryInput()
    }
    
    subscriptionForm.addEventListener('submit', (ev) => {
      ev.preventDefault()
      const type = $('#subType').value
      const amount = $('#subAmount').value
      const category = $('#subCategory').value
      const description = $('#subDescription').value
      const frequency = $('#subFrequency').value
      const startDate = $('#subStartDate').value
      
      if (addSubscription(type, amount, category, description, frequency, startDate)) {
        subscriptionForm.reset()
        if (subStartDate) {
          subStartDate.value = new Date().toISOString().split('T')[0]
        }
        updateSubCategoryInput()
        render() // Re-render in case subscription added new entries
      }
    })
  }
  
  // Setup category form
  const categoryForm = $('#categoryForm')
  if (categoryForm) {
    // Initialize color palette after a short delay to ensure DOM is ready
    setTimeout(() => {
      const colorOptions = $all('.color-option')
      const colorInput = $('#categoryColor')
      
      console.log('Color options found:', colorOptions.length)
      
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
          console.log('Color selected:', option.dataset.color)
        })
      })
    }, 100)
    
    categoryForm.addEventListener('submit', (ev) => {
      ev.preventDefault()
      const name = $('#newCategoryName').value
      const type = $('#categoryType').value
      const color = $('#categoryColor').value
      console.log('Adding category:', {name, type, color})
      if (addCategory(name, type, color)) {
        categoryForm.reset()
        // Reset color selection to first option
        const colorOptions = $all('.color-option')
        colorOptions.forEach(opt => opt.classList.remove('selected'))
        if (colorOptions.length > 0) {
          colorOptions[0].classList.add('selected')
          $('#categoryColor').value = colorOptions[0].dataset.color
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
    const userDropdown = document.getElementById('userDropdown')
    const userMenuBtn = document.getElementById('userMenuBtn')
    const userDropdownMenu = document.getElementById('userDropdownMenu')
    const userHint = document.getElementById('userHint')
    const signOutBtn = document.getElementById('signOutBtn')
    const settingsLink = document.getElementById('settingsLink')
    const adminLink = document.getElementById('adminLink')
    const footer = document.querySelector('.footer')

    if(isLoggedIn()){
      if(loginLink) loginLink.style.display = 'none'
      if(userDropdown) userDropdown.style.display = 'block'
      // load username
      try{
        const res = await apiFetch('GET', '/profile')
        if(res.ok){
          const j = await res.json()
          if(userHint) userHint.textContent = j.username
          if(footer) footer.textContent = 'Saved to your account (server)'
          
          // Show admin link if user is admin
          if(j.is_admin && adminLink){
            adminLink.style.display = 'block'
          }
        }
      } catch(e) {}
    } else {
      // Not logged in - redirect to login
      location.href = 'login.html'
      return
    }

    // Toggle dropdown menu
    if(userMenuBtn && userDropdownMenu){
      userMenuBtn.addEventListener('click', (e)=>{
        e.stopPropagation()
        userDropdownMenu.classList.toggle('show')
      })
      
      // Close dropdown when clicking outside
      document.addEventListener('click', ()=>{
        userDropdownMenu.classList.remove('show')
      })
    }

    // Settings link (placeholder)
    if(settingsLink){
      settingsLink.addEventListener('click', (e)=>{
        e.preventDefault()
        // Placeholder for future settings functionality
        console.log('Settings clicked - feature coming soon')
      })
    }

    // Sign out
    if(signOutBtn){
      signOutBtn.addEventListener('click', (e)=>{
        e.preventDefault()
        localStorage.removeItem(TOKEN_KEY)
        location.href = 'login.html'
      })
    }
  } catch(e){
    // ignore if elements are not present
  }
}

init()
