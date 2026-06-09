const {apiFetch, setToken} = window.AccountaCommon

const $ = (selector) => document.querySelector(selector)
const messages = $('#messages')
const googleDisabledMessage = $('#googleDisabledMessage')
let googleClientId = ''

function showMessage(message, isError = false) {
  messages.textContent = message
  messages.style.color = isError ? '#ff6b6b' : 'var(--muted)'
}

function showGoogleDisabled(message) {
  googleDisabledMessage.textContent = message
  googleDisabledMessage.style.display = 'block'
}

function finishLogin(payload, successMessage) {
  setToken(payload.token)
  showMessage(successMessage)
  setTimeout(() => {
    location.href = 'index.html'
  }, 700)
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

async function submitGoogleCredential(response) {
  if (!response?.credential) {
    showMessage('Google sign-in did not return a credential', true)
    return
  }

  const loginResponse = await apiFetch('POST', '/auth/google', {credential: response.credential}, {
    redirectOnUnauthorized: false,
  })
  const payload = await loginResponse.json().catch(() => ({error: 'Google sign-in failed'}))

  if (!loginResponse.ok) {
    showMessage(payload.error || 'Google sign-in failed', true)
    return
  }

  finishLogin(payload, 'Google login successful, redirecting...')
}

async function initGoogleLogin() {
  const configResponse = await apiFetch('GET', '/auth/google/config', undefined, {
    redirectOnUnauthorized: false,
  })

  if (!configResponse.ok) {
    showGoogleDisabled('Google login is not available right now.')
    return
  }

  const config = await configResponse.json()
  if (!config.enabled || !config.clientId) {
    showGoogleDisabled('Google login is not configured for this site.')
    return
  }

  googleClientId = config.clientId
  if (config.passwordAuthAllowed) {
    document.getElementById('manualLoginRow').style.display = 'block'
  }

  await loadGoogleScript()

  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: submitGoogleCredential,
  })

  document.getElementById('googleLoginRow').style.display = 'flex'
  window.google.accounts.id.renderButton(document.getElementById('googleLoginButton'), {
    theme: 'filled_black',
    size: 'large',
    width: 320,
    text: 'continue_with',
  })
}

initGoogleLogin().catch((error) => {
  console.error('Failed to initialize Google login', error)
})

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const username = $('#username').value
  const password = $('#password').value

  if (!username || !password) {
    showMessage('Username and password are required', true)
    return
  }

  const response = await apiFetch('POST', '/login', {username, password}, {
    redirectOnUnauthorized: false,
  })
  const payload = await response.json().catch(() => ({error: 'Login failed'}))

  if (!response.ok) {
    showMessage(payload.error || 'Login failed', true)
    return
  }

  finishLogin(payload, 'Login successful, redirecting...')
})

$('#registerBtn').addEventListener('click', async () => {
  const username = $('#username').value
  const password = $('#password').value

  if (!username || !password) {
    showMessage('Enter a username and password to register', true)
    return
  }

  const response = await apiFetch('POST', '/register', {username, password}, {
    redirectOnUnauthorized: false,
  })
  const payload = await response.json().catch(() => ({error: 'Registration failed'}))

  if (!response.ok) {
    showMessage(payload.error || 'Registration failed', true)
    return
  }

  finishLogin(payload, 'Registration successful, redirecting...')
})
