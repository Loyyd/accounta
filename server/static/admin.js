const {apiFetch, isLoggedIn, loadProfile, setupDropdown, wireSignOut} = window.AccountaCommon

const $ = (selector) => document.querySelector(selector)

function formatDate(value) {
  if (!value) {
    return 'Unknown join date'
  }
  return `Joined ${new Date(value).toLocaleDateString()}`
}

function formatNet(user) {
  const net = Number(user.total_income || 0) - Number(user.total_expense || 0)
  return `Net ${net.toLocaleString(undefined, {style: 'currency', currency: 'EUR', maximumFractionDigits: 2})}`
}

async function loadUsers() {
  const response = await apiFetch('GET', '/admin/users')
  if (!response.ok) {
    if (response.status === 403) {
      alert('Admin access required')
      location.href = 'index.html'
      return
    }

    alert('Failed to load users')
    return
  }

  const payload = await response.json()
  const users = payload.users || []
  $('#totalUsers').textContent = users.length

  const usersList = $('#usersList')
  usersList.innerHTML = ''

  if (!users.length) {
    usersList.innerHTML = '<div class="muted empty-state">No users found</div>'
    return
  }

  users.forEach((user) => {
    const userRow = document.createElement('div')
    userRow.className = 'table-row'
    const roleText = user.is_admin ? 'Admin' : 'User'
    const roleClass = user.is_admin ? 'admin' : 'user'

    userRow.innerHTML = `
      <div id="username-${user.id}" class="table-meta" style="cursor:pointer" title="Click to edit username">
        <div><strong>${user.username}</strong></div>
        <div class="helper-text">${formatDate(user.created_at)}. ${formatNet(user)}</div>
      </div>
      <div class="role-badge ${roleClass}">${roleText}</div>
      <div class="muted-copy">${user.entry_count}</div>
      <div class="table-actions">
        <button class="btn-ghost btn-sm toggle-admin-btn" title="Toggle admin status">
          ${user.is_admin ? 'Remove admin' : 'Make admin'}
        </button>
        <button class="btn-ghost btn-sm delete-user-btn danger-copy" title="Delete user">
          Delete
        </button>
      </div>
    `

    userRow.querySelector(`#username-${user.id}`).addEventListener('click', () => {
      window.editUsername(user.id, user.username)
    })
    userRow.querySelector('.toggle-admin-btn').addEventListener('click', () => {
      window.toggleAdmin(user.id)
    })
    userRow.querySelector('.delete-user-btn').addEventListener('click', () => {
      window.deleteUser(user.id, user.username)
    })

    usersList.appendChild(userRow)
  })
}

window.deleteUser = async function deleteUser(userId, username) {
  const confirmation = prompt(`Type "${username}" to delete this user and all associated data.`)
  if (confirmation !== username) {
    return
  }

  const response = await apiFetch('DELETE', `/admin/users/${userId}`)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({error: 'Failed to delete user'}))
    alert(payload.error || 'Failed to delete user')
    return
  }

  await loadUsers()
}

window.toggleAdmin = async function toggleAdmin(userId) {
  const response = await apiFetch('POST', `/admin/users/${userId}/toggle-admin`)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({error: 'Failed to update user'}))
    alert(payload.error || 'Failed to update user')
    return
  }

  await loadUsers()
}

window.editUsername = async function editUsername(userId, currentUsername) {
  const element = document.getElementById(`username-${userId}`)
  if (!element) {
    return
  }

  const input = document.createElement('input')
  input.type = 'text'
  input.value = currentUsername
  input.className = 'admin-inline-input'

  const save = async () => {
    const newUsername = input.value.trim()
    if (!newUsername) {
      alert('Username cannot be empty')
      await loadUsers()
      return
    }

    if (newUsername !== currentUsername) {
      const response = await apiFetch('PUT', `/admin/users/${userId}`, {username: newUsername})
      if (!response.ok) {
        const payload = await response.json().catch(() => ({error: 'Failed to update username'}))
        alert(payload.error || 'Failed to update username')
      }
    }

    await loadUsers()
  }

  input.addEventListener('blur', save)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      save()
    } else if (event.key === 'Escape') {
      loadUsers()
    }
  })

  element.replaceWith(input)
  input.focus()
  input.select()
}

async function init() {
  if (!isLoggedIn()) {
    location.href = 'login.html'
    return
  }

  const profile = await loadProfile()
  if (!profile) {
    return
  }

  if (!profile.is_admin) {
    alert('Admin access required')
    location.href = 'index.html'
    return
  }

  const userDropdown = $('#userDropdown')
  const userMenuBtn = $('#userMenuBtn')
  const userDropdownMenu = $('#userDropdownMenu')
  const userHint = $('#userHint')
  const signOutBtn = $('#signOutBtn')

  if (userDropdown) {
    userDropdown.style.display = 'block'
  }
  if (userHint) {
    userHint.textContent = profile.username
  }

  setupDropdown(userMenuBtn, userDropdownMenu)
  wireSignOut(signOutBtn)

  await loadUsers()
}

init()
