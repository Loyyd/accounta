const STORAGE_KEY = 'finance-tracker.entries'
const TOKEN_KEY = 'finance-tracker.token'
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
const entriesEl = $('#entries')
const totalIncomeEl = $('#totalIncome')
const totalExpenseEl = $('#totalExpense')
const netTotalEl = $('#netTotal')
const categoryListEl = $('#categoryList')
const clearAllBtn = $('#clearAll')

let entries = []

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
    if(isLoggedIn()){
      // fetch from server
      const res = await apiFetch('GET', '/entries')
      if(!res.ok) throw new Error('Failed to load entries')
      const data = await res.json()
      // backend dates are iso strings
      entries = data.map(e => ({...e, date: new Date(e.date).getTime()}))
      return
    }

    const raw = localStorage.getItem(STORAGE_KEY)
    if(!raw){
      entries = sampleEntries()
      saveEntries()
    } else {
      entries = JSON.parse(raw)
    }
  } catch(e){
    console.error('Failed to load entries', e)
    entries = []
  }
}

function saveEntries(){
  // In server mode, entries are persisted via API, so only localStorage mode writes here
  if(isLoggedIn()) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function sampleEntries(){
  // Useful starter data so the first open shows how the UI works
  return [
    {id: id(), type: 'income', description: 'Paycheck', amount: 2500, category: 'Salary', date: Date.now()},
    {id: id(), type: 'expense', description: 'Groceries', amount: 120.5, category: 'Food', date: Date.now()-1000*60*60*24},
    {id: id(), type: 'expense', description: 'Rent', amount: 950, category: 'Housing', date: Date.now()-1000*60*60*24*5},
  ]
}

function id(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8)
}

async function addEntry({type, description, amount, category}){
  if(isLoggedIn()){
    const res = await apiFetch('POST', '/entries', {type, description, amount, category})
    if(!res.ok){
      const j = await res.json().catch(()=>({error:'Failed'}))
      alert(j.error || 'Failed to save')
      return
    }
    // refresh list from server
    await loadEntries()
    render()
    return
  }

  const record = {id: id(), type, description: description || (type === 'income' ? 'Income' : 'Expense'), amount: +amount, category: (category||'Other'), date: Date.now()}
  entries.unshift(record)
  saveEntries()
  render()
}

async function removeEntry(idValue){
  if(isLoggedIn()){
    const res = await apiFetch('DELETE', '/entries/' + idValue)
    if(!res.ok){
      const j = await res.json().catch(()=>({error:'Failed'}))
      alert(j.error || 'Delete failed')
      return
    }
    await loadEntries()
    render()
    return
  }

  entries = entries.filter(e => e.id !== idValue)
  saveEntries()
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
  const description = descriptionInput.value.trim()
  const amount = parseFloat(amountInput.value)
  const category = categoryInput.value.trim() || (type === 'income' ? 'Salary' : 'Other')
  if(!description || isNaN(amount)) return
  addEntry({type, description, amount, category})
  entryForm.reset()
})

clearAllBtn.addEventListener('click', ()=>{
  if(!confirm('Clear ALL entries? This cannot be undone.')) return
  clearAll()
})

// Initialization
async function init(){
  await loadEntries()
  render()
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
      if(loginLink) loginLink.style.display = 'inline-block'
      if(signOutBtn) signOutBtn.style.display = 'none'
      if(footer) footer.textContent = 'Stored locally in your browser (localStorage).'
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
