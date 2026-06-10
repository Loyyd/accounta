(function () {
const {apiFetch, loadProfile} = window.AccountaCommon

const $ = (selector) => document.querySelector(selector)
let profile = null
let isLoadingUsers = false
let queuedLoadTimer = null

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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char])
}

function googleFullName(user) {
  return [user.google_given_name, user.google_family_name].filter(Boolean).join(' ') || user.google_name || ''
}

function avatarMarkup(user) {
  const fullName = googleFullName(user)
  const label = fullName || user.username
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?'

  if (user.google_linked && user.google_picture) {
    return `<img class="admin-avatar" src="${escapeHtml(user.google_picture)}" alt="${escapeHtml(label)} profile picture" loading="lazy" referrerpolicy="no-referrer" />`
  }

  return `<div class="admin-avatar admin-avatar-fallback" aria-label="${escapeHtml(label)} profile picture">${escapeHtml(initials)}</div>`
}

function googleDetailsMarkup(user) {
  if (!user.google_linked) {
    return '<div class="helper-text">Google not linked</div>'
  }

  const fullName = googleFullName(user)
  const details = []

  if (fullName) {
    details.push(`<div class="admin-google-name">${escapeHtml(fullName)}</div>`)
  }

  if (user.google_email) {
    details.push(`<div class="admin-google-email">${escapeHtml(user.google_email)}</div>`)
  }

  return `
    <div class="admin-google-details">
      <span class="google-linked-badge">Google synced</span>
      ${details.join('')}
    </div>
  `
}

async function resetUserPassword(userId, username) {
  const newPassword = prompt(`Enter the new one-time password for ${username}. This replaces their current password.`)
  if (!newPassword) {
    return
  }

  const response = await apiFetch('POST', `/admin/users/${userId}/reset-password`, {
    newPassword,
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({error: 'Failed to reset password'}))
    alert(payload.error || 'Failed to reset password')
    return
  }

  alert(`Password reset for ${username}. The new password has replaced the old one.`)
}

async function importUserData(userId, username) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'

  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      const response = await apiFetch('POST', `/admin/users/${userId}/import`, payload)

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({error: 'Failed to import data'}))
        alert(errorPayload.error || 'Failed to import data')
        return
      }

      const result = await response.json()
      if (result.imported > 0) {
        alert(
          `Imported ${result.imported} transaction${result.imported === 1 ? '' : 's'} for ${username}${result.skipped ? `, ${result.skipped} skipped` : ''}.`
        )
      } else {
        alert('No transactions were imported')
      }
      await loadUsers()
    } catch (error) {
      console.error('Failed to import admin data', error)
      alert('Failed to parse the selected JSON file')
    }
  }, {once: true})

  input.click()
}

async function loadUsers() {
  if (!document.getElementById('admin-view')) {
    return
  }

  const usersList = $('#usersList')
  const totalUsers = $('#totalUsers')
  if (!usersList || !totalUsers) {
    return
  }

  if (isLoadingUsers) {
    return
  }

  isLoadingUsers = true
  usersList.innerHTML = '<div class="muted empty-state">Loading users...</div>'

  try {
    const response = await apiFetch('GET', '/admin/users')
    if (!response.ok) {
      if (response.status === 403) {
        usersList.innerHTML = '<div class="muted empty-state">Admin access required</div>'
        return
      }

      usersList.innerHTML = '<div class="muted empty-state">Failed to load users</div>'
      return
    }

    const payload = await response.json()
    const users = payload.users || []
    totalUsers.textContent = users.length

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
          <div class="admin-user-cell">
            ${avatarMarkup(user)}
            <div class="admin-user-copy">
              <div class="admin-user-heading">
                <strong>${escapeHtml(user.username)}</strong>
                <button class="btn-ghost btn-sm admin-password-btn" type="button" title="Reset password">
                  <img src="assets/icons/header/lock.png" alt="" class="admin-password-icon" />
                </button>
              </div>
              ${googleDetailsMarkup(user)}
              <div class="helper-text">${formatDate(user.created_at)}. ${formatNet(user)}</div>
            </div>
          </div>
        </div>
        <div class="role-badge ${roleClass}">${roleText}</div>
        <div class="muted-copy">${user.entry_count}</div>
        <div class="table-actions">
          <button class="btn-ghost btn-sm toggle-admin-btn" title="Toggle admin status">
            ${user.is_admin ? 'Remove admin' : 'Make admin'}
          </button>
          <button class="btn-ghost btn-sm import-user-btn" title="Import data">
            Import data
          </button>
          <button class="btn-ghost btn-sm delete-user-btn danger-copy" title="Delete user">
            Delete
          </button>
        </div>
      `

      userRow.querySelector(`#username-${user.id}`).addEventListener('click', () => {
        window.editUsername(user.id, user.username)
      })
      userRow.querySelector('.admin-password-btn').addEventListener('click', (event) => {
        event.stopPropagation()
        resetUserPassword(user.id, user.username)
      })
      userRow.querySelector('.toggle-admin-btn').addEventListener('click', () => {
        window.toggleAdmin(user.id)
      })
      userRow.querySelector('.import-user-btn').addEventListener('click', () => {
        importUserData(user.id, user.username)
      })
      userRow.querySelector('.delete-user-btn').addEventListener('click', () => {
        window.deleteUser(user.id, user.username)
      })

      usersList.appendChild(userRow)
    })
  } catch (error) {
    usersList.innerHTML = '<div class="muted empty-state">Failed to load users</div>'
  } finally {
    isLoadingUsers = false
  }
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
  if (!profile) {
    profile = await loadProfile().catch(() => null)
  }

  if (!profile?.is_admin) {
    const usersList = $('#usersList')
    if (usersList) {
      usersList.innerHTML = '<div class="muted empty-state">Admin access required</div>'
    }
    return
  }

  await loadUsers()
}

function queueAdminLoad() {
  clearTimeout(queuedLoadTimer)
  queuedLoadTimer = setTimeout(() => {
    window.AccountaAdmin?.ensureLoaded?.()
  }, 0)
}

function wireAdminTabLoader() {
  const adminNav = document.getElementById('adminNavLink')
  if (adminNav) {
    adminNav.addEventListener('click', queueAdminLoad)
  }

  window.addEventListener('hashchange', () => {
    if (location.hash === '#admin') {
      queueAdminLoad()
    }
  })

  if (location.hash === '#admin' || document.getElementById('admin-view')?.classList.contains('active')) {
    queueAdminLoad()
  }
}

window.AccountaAdmin = {
  async ensureLoaded() {
    await init()
  },
  async refresh() {
    if (!profile?.is_admin) {
      return
    }

    await loadUsers()
  },
  setProfile(nextProfile) {
    profile = nextProfile
    if (!profile?.is_admin) {
      const usersList = $('#usersList')
      const totalUsers = $('#totalUsers')
      if (usersList) {
        usersList.innerHTML = ''
      }
      if (totalUsers) {
        totalUsers.textContent = '0'
      }
      return
    }

    this.ensureLoaded()
  },
}

wireAdminTabLoader()
})()
