(function () {
  const TOKEN_KEY = 'finance-tracker.token'
  const API_BASE = '/api'

  function getToken() {
    return localStorage.getItem(TOKEN_KEY)
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token)
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY)
  }

  function isLoggedIn() {
    return !!getToken()
  }

  function redirectToLogin(message) {
    clearToken()
    if (message) {
      alert(message)
    }
    location.href = 'login.html'
  }

  async function apiFetch(method, path, body, options = {}) {
    const headers = {...(options.headers || {})}
    if (options.json !== false) {
      headers['Content-Type'] = 'application/json'
    }

    const token = getToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : options.json === false ? body : JSON.stringify(body),
    })

    if (response.status === 401 && options.redirectOnUnauthorized !== false) {
      redirectToLogin(options.unauthorizedMessage || 'Session expired or invalid, please log in again.')
      throw new Error('Unauthorized')
    }

    return response
  }

  async function loadProfile(options = {}) {
    const response = await apiFetch('GET', '/profile', undefined, {
      redirectOnUnauthorized: options.redirectOnUnauthorized,
    })
    if (!response.ok) {
      return null
    }
    return response.json()
  }

  function requireLogin() {
    if (!isLoggedIn()) {
      location.href = 'login.html'
      return false
    }
    return true
  }

  function setupDropdown(button, menu) {
    if (!button || !menu) {
      return
    }

    button.addEventListener('click', (event) => {
      event.stopPropagation()
      menu.classList.toggle('show')
    })

    document.addEventListener('click', () => {
      menu.classList.remove('show')
    })
  }

  function wireSignOut(button) {
    if (!button) {
      return
    }

    button.addEventListener('click', (event) => {
      event.preventDefault()
      clearToken()
      location.href = 'login.html'
    })
  }

  function fmtCurrency(value) {
    return Number(value || 0).toLocaleString(undefined, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    })
  }

  window.AccountaCommon = {
    API_BASE,
    TOKEN_KEY,
    apiFetch,
    clearToken,
    fmtCurrency,
    getToken,
    isLoggedIn,
    loadProfile,
    redirectToLogin,
    requireLogin,
    setToken,
    setupDropdown,
    wireSignOut,
  }
})()
