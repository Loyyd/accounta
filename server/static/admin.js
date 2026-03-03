const TOKEN_KEY = 'finance-tracker.token'
const API_BASE = 'http://127.0.0.1:5001/api'

const $ = (s) => document.querySelector(s)
const $all = (s) => document.querySelectorAll(s)
const fmt = (n) => n.toLocaleString(undefined, {style: 'currency', currency: 'EUR', maximumFractionDigits: 2})

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
  const opts = {method, headers}
  if(body) opts.body = JSON.stringify(body)
  return fetch(API_BASE + path, opts)
}

async function loadUsers() {
  const res = await apiFetch('GET', '/admin/users')
  if (!res.ok) {
    if (res.status === 403) {
      alert('Admin access required')
      location.href = 'login.html'
      return
    }
    alert('Failed to load users')
    return
  }
  
  const data = await res.json()
  const users = data.users || []
  
  $('#totalUsers').textContent = users.length
  
  const usersList = $('#usersList')
  usersList.innerHTML = ''
  
  if (users.length === 0) {
    usersList.innerHTML = '<div class="muted" style="padding:20px;text-align:center">No users found</div>'
    return
  }
  
  users.forEach(user => {
    const userRow = document.createElement('div')
    userRow.className = 'user-row'
    userRow.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 120px;gap:12px;padding:16px 12px;border-bottom:1px solid rgba(255,255,255,0.05);align-items:center'
    
    const roleColor = user.is_admin ? 'var(--accent)' : 'var(--muted)'
    const roleText = user.is_admin ? '🛡️ Admin' : '👤 User'
    
    userRow.innerHTML = `
      <div id="username-${user.id}" style="font-weight:600;cursor:pointer;" onclick="editUsername(${user.id}, '${user.username}')" title="Click to edit username">${user.username}</div>
      <div style="color:${roleColor};font-size:13px">${roleText}</div>
      <div style="color:var(--muted);font-size:14px">${user.entry_count}</div>
      <div style="display:flex;gap:6px">
        <button class="btn-ghost" style="padding:6px 10px;font-size:12px" onclick="toggleAdmin(${user.id})" title="Toggle admin status">
          ${user.is_admin ? '👤' : '🛡️'}
        </button>
        <button class="btn-ghost" style="padding:6px 10px;font-size:12px;color:var(--danger)" onclick="deleteUser(${user.id}, '${user.username}')" title="Delete user">
          🗑️
        </button>
      </div>
    `
    
    usersList.appendChild(userRow)
  })
}

window.deleteUser = async function(userId, username) {
  if (!confirm(`Delete user "${username}"? This will permanently delete their account and all associated data.`)) {
    return
  }
  
  const res = await apiFetch('DELETE', `/admin/users/${userId}`)
  if (!res.ok) {
    const j = await res.json().catch(() => ({error: 'Failed to delete user'}))
    alert(j.error || 'Failed to delete user')
    return
  }
  
  await loadUsers()
}

window.toggleAdmin = async function(userId) {
  const res = await apiFetch('POST', `/admin/users/${userId}/toggle-admin`)
  if (!res.ok) {
    const j = await res.json().catch(() => ({error: 'Failed to update user'}))
    alert(j.error || 'Failed to update user')
    return
  }
  
  await loadUsers()
}

window.editUsername = async function(userId, currentUsername) {
  const element = document.getElementById(`username-${userId}`)
  if (!element) return
  
  // Create input field
  const input = document.createElement('input')
  input.type = 'text'
  input.value = currentUsername
  input.style.cssText = 'padding: 6px 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: inherit; font-size: 14px; font-weight: 600; width: 100%;'
  
  const save = async () => {
    const newUsername = input.value.trim()
    if (!newUsername) {
      alert('Username cannot be empty')
      await loadUsers()
      return
    }
    
    if (newUsername !== currentUsername) {
      const res = await apiFetch('PUT', `/admin/users/${userId}`, { username: newUsername })
      if (!res.ok) {
        const j = await res.json().catch(() => ({error: 'Failed to update username'}))
        alert(j.error || 'Failed to update username')
      }
    }
    
    await loadUsers()
  }
  
  input.onblur = save
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      loadUsers()
    }
  }
  
  element.replaceWith(input)
  input.focus()
  input.select()
}

async function init() {
  // Check if logged in
  if (!isLoggedIn()) {
    location.href = 'login.html'
    return
  }
  
  // Load profile to verify admin status
  const profileRes = await apiFetch('GET', '/profile')
  if (!profileRes.ok) {
    location.href = 'login.html'
    return
  }
  
  const profile = await profileRes.json()
  
  // Redirect if not admin
  if (!profile.is_admin) {
    alert('Admin access required')
    location.href = 'index.html'
    return
  }
  
  // Set up user menu
  const userDropdown = $('#userDropdown')
  const userMenuBtn = $('#userMenuBtn')
  const userDropdownMenu = $('#userDropdownMenu')
  const userHint = $('#userHint')
  const signOutBtn = $('#signOutBtn')
  
  if (userDropdown) userDropdown.style.display = 'block'
  if (userHint) userHint.textContent = profile.username
  
  // Toggle dropdown menu
  if (userMenuBtn && userDropdownMenu) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      userDropdownMenu.classList.toggle('show')
    })
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      userDropdownMenu.classList.remove('show')
    })
  }
  
  // Sign out
  if (signOutBtn) {
    signOutBtn.addEventListener('click', (e) => {
      e.preventDefault()
      localStorage.removeItem(TOKEN_KEY)
      location.href = 'login.html'
    })
  }
  
  // Load users
  await loadUsers()
}

init()
