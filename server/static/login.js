const {apiFetch, setToken} = window.AccountaCommon

const $ = (selector) => document.querySelector(selector)
const messages = $('#messages')
let googleClientId = ''

function showMessage(message, isError = false) {
  messages.textContent = message
  messages.style.color = isError ? '#ff6b6b' : 'var(--muted)'
}

function finishLogin(payload, successMessage) {
  setToken(payload.token)
  showMessage(successMessage)
  setTimeout(() => {
    location.href = 'index.html'
  }, 700)
}

async function submitAuth(endpoint, successMessage) {
  const username = $('#username').value.trim()
  const password = $('#password').value

  if (!username || !password) {
    showMessage('username and password are required', true)
    return
  }

  const response = await apiFetch('POST', endpoint, {username, password}, {
    redirectOnUnauthorized: false,
  })
  const payload = await response.json().catch(() => ({error: 'Request failed'}))

  if (!response.ok) {
    showMessage(payload.error || 'Request failed', true)
    return
  }

  finishLogin(payload, successMessage)
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
    return
  }

  const config = await configResponse.json()
  if (!config.enabled || !config.clientId) {
    return
  }

  googleClientId = config.clientId
  await loadGoogleScript()

  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: submitGoogleCredential,
  })

  document.getElementById('googleLoginRow').style.display = 'flex'
  document.getElementById('authDivider').style.display = 'flex'
  window.google.accounts.id.renderButton(document.getElementById('googleLoginButton'), {
    theme: 'filled_black',
    size: 'large',
    width: 320,
    text: 'continue_with',
  })
}

document.getElementById('loginBtn').addEventListener('click', () => {
  submitAuth('/login', 'Login successful, redirecting...')
})

document.getElementById('regBtn').addEventListener('click', () => {
  submitAuth('/register', 'Account created, signing you in...')
})

document.getElementById('authForm').addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    document.getElementById('loginBtn').click()
  }
})

initGoogleLogin().catch((error) => {
  console.error('Failed to initialize Google login', error)
})
