const {apiFetch, clearToken, fmtCurrency, loadProfile, requireLogin} = window.AccountaCommon

let googleClientId = ''

function hasSettingsView() {
  return !!document.getElementById('settings-view')
}

function showFlashMessage(id, message) {
  const successEl = document.getElementById('successMessage')
  const errorEl = document.getElementById('errorMessage')
  if (!successEl || !errorEl) {
    return
  }

  successEl.style.display = 'none'
  errorEl.style.display = 'none'

  const element = document.getElementById(id)
  if (!element) {
    return
  }

  element.textContent = message
  element.style.display = 'block'

  setTimeout(() => {
    element.style.display = 'none'
  }, 5000)
}

function showSuccess(message) {
  showFlashMessage('successMessage', message)
}

function showError(message) {
  showFlashMessage('errorMessage', message)
}

function openModal(id, focusSelector = 'input, button') {
  const modal = document.getElementById(id)
  if (!modal) {
    return
  }
  modal.hidden = false
  modal.querySelector(focusSelector)?.focus()
}

function closeModal(id) {
  const modal = document.getElementById(id)
  if (!modal) {
    return
  }
  modal.hidden = true
}

async function loadAccountProfile() {
  if (!hasSettingsView()) {
    return null
  }

  const profile = await loadProfile()
  if (!profile) {
    return null
  }

  document.getElementById('username').textContent = profile.username
  document.getElementById('createdAt').textContent = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString()
    : 'Unknown'
  document.getElementById('deleteConfirmInput').placeholder = profile.username
  updateGoogleStatus(profile)

  return profile
}

function updateGoogleStatus(profile) {
  const status = document.getElementById('googleStatus')
  const button = document.getElementById('googleLinkBtn')

  if (!status || !button) {
    return
  }

  if (profile.googleLinked) {
    status.textContent = profile.googleEmail
      ? `Linked to ${profile.googleEmail}`
      : 'Linked to Google'
    button.style.display = 'none'
    return
  }

  status.textContent = googleClientId ? 'Not linked yet' : 'Google login is not configured'
  button.style.display = googleClientId ? 'inline-flex' : 'none'
}

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

async function initGoogleLinking() {
  const configResponse = await apiFetch('GET', '/auth/google/config')
  if (!configResponse.ok) {
    return
  }

  const config = await configResponse.json()
  if (!config.enabled || !config.clientId) {
    updateGoogleStatus({googleLinked: false})
    return
  }

  googleClientId = config.clientId
  await loadGoogleScript()
}

async function requestGoogleLink() {
  if (!googleClientId) {
    showError('Google login is not configured')
    return
  }

  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: async (response) => {
      if (!response?.credential) {
        showError('Google sign-in did not return a credential')
        return
      }

      const linkResponse = await apiFetch('POST', '/profile/google-link', {
        credential: response.credential,
      })
      const payload = await linkResponse.json().catch(() => ({error: 'Failed to link Google account'}))

      if (!linkResponse.ok) {
        showError(payload.error || 'Failed to link Google account')
        return
      }

      updateGoogleStatus(payload)
      showSuccess('Google account linked successfully')
    },
  })

  window.google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
      showError('Google sign-in was not completed')
    }
  })
}

async function loadStats() {
  const response = await apiFetch('GET', '/entries')
  if (!response.ok) {
    showError('Failed to load account statistics')
    return
  }

  const entries = await response.json()
  let totalIncome = 0
  let totalExpense = 0

  for (const entry of entries) {
    if (entry.type === 'income') {
      totalIncome += entry.amount
    } else {
      totalExpense += entry.amount
    }
  }

  document.getElementById('totalTransactions').textContent = entries.length
  document.getElementById('settingsTotalIncome').textContent = fmtCurrency(totalIncome)
  document.getElementById('settingsTotalExpense').textContent = fmtCurrency(totalExpense)
}

function wireSettingsUi() {
  document.getElementById('openPasswordModalBtn')?.addEventListener('click', () => {
    document.getElementById('passwordForm').reset()
    openModal('passwordModal', '#currentPassword')
  })

  document.getElementById('openDeleteModalBtn')?.addEventListener('click', () => {
    document.getElementById('deleteConfirmInput').value = ''
    openModal('deleteAccountModal', '#deleteConfirmInput')
  })

  document.querySelectorAll('[data-close-modal]').forEach((element) => {
    element.addEventListener('click', () => {
      closeModal(element.dataset.closeModal)
    })
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
      return
    }
    closeModal('passwordModal')
    closeModal('deleteAccountModal')
  })

  document.getElementById('passwordForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()

    const currentPassword = document.getElementById('currentPassword').value
    const newPassword = document.getElementById('newPassword').value
    const confirmPassword = document.getElementById('confirmPassword').value

    if (newPassword !== confirmPassword) {
      showError('New passwords do not match')
      return
    }

    const response = await apiFetch('PUT', '/profile/password', {
      currentPassword,
      newPassword,
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({error: 'Failed to update password'}))
      showError(payload.error || 'Failed to update password')
      return
    }

    document.getElementById('passwordForm').reset()
    closeModal('passwordModal')
    showSuccess('Password updated successfully')
  })

  document.getElementById('exportBtn')?.addEventListener('click', async () => {
    const response = await apiFetch('GET', '/export')
    if (!response.ok) {
      showError('Failed to export data')
      return
    }

    const payload = await response.json()
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'})
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `accounta-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    showSuccess('Export complete')
  })

  const importFileInput = document.getElementById('importFileInput')
  document.getElementById('importBtn')?.addEventListener('click', () => {
    importFileInput?.click()
  })

  importFileInput?.addEventListener('change', async (event) => {
    const file = event.target.files[0]
    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      const entries = Array.isArray(payload) ? payload : payload.entries

      if (!Array.isArray(entries)) {
        showError('Invalid import file. Expected a transaction array or full account export.')
        importFileInput.value = ''
        return
      }

      let successCount = 0
      let failureCount = 0

      for (const entry of entries) {
        if (!entry || !entry.type || entry.amount === undefined || !entry.category || !entry.date) {
          failureCount += 1
          continue
        }

        const response = await apiFetch('POST', '/entries', {
          type: entry.type,
          description: entry.description || '',
          amount: entry.amount,
          category: entry.category,
          date: entry.date,
        })

        if (response.ok) {
          successCount += 1
        } else {
          failureCount += 1
        }
      }

      importFileInput.value = ''
      await loadStats()

      if (successCount > 0) {
        showSuccess(
          `Imported ${successCount} transaction${successCount === 1 ? '' : 's'}${failureCount ? `, ${failureCount} skipped` : ''}.`
        )
        return
      }

      showError('No transactions were imported')
    } catch (error) {
      console.error('Failed to import data', error)
      importFileInput.value = ''
      showError('Failed to parse the selected JSON file')
    }
  })

  document.getElementById('deleteAccountBtn')?.addEventListener('click', async () => {
    const username = document.getElementById('username').textContent.trim()
    const confirmation = document.getElementById('deleteConfirmInput').value.trim()

    if (confirmation !== username) {
      showError(`Type "${username}" to confirm account deletion`)
      return
    }

    const response = await apiFetch('DELETE', '/profile', {confirmText: confirmation})
    if (!response.ok) {
      const payload = await response.json().catch(() => ({error: 'Failed to delete account'}))
      showError(payload.error || 'Failed to delete account')
      return
    }

    closeModal('deleteAccountModal')
    clearToken()
    alert('Your account has been deleted.')
    location.href = 'login.html'
  })

  document.getElementById('googleLinkBtn')?.addEventListener('click', requestGoogleLink)
}

async function initSettings() {
  if (!hasSettingsView()) {
    return
  }

  if (!requireLogin()) {
    return
  }

  wireSettingsUi()
  await initGoogleLinking()
  await loadAccountProfile()
  await loadStats()
}

initSettings()
