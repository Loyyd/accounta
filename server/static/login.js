const {apiFetch, setToken} = window.AccountaCommon

const $ = (selector) => document.querySelector(selector)
const messages = $('#messages')

function showMessage(message, isError = false) {
  messages.textContent = message
  messages.style.color = isError ? '#ff6b6b' : 'var(--muted)'
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

  setToken(payload.token)
  showMessage(successMessage)
  setTimeout(() => {
    location.href = 'index.html'
  }, 700)
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
