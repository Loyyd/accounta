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

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char])
  }

  function safeHexColor(value, fallback = '#9aa5b1') {
    const color = String(value || '').trim()
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback
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

    function closeMenu() {
      menu.classList.remove('show')
      button.setAttribute('aria-expanded', 'false')
    }

    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const willOpen = !menu.classList.contains('show')
      menu.classList.toggle('show', willOpen)
      button.setAttribute('aria-expanded', String(willOpen))
    })

    menu.addEventListener('click', (event) => {
      event.stopPropagation()
    })

    document.addEventListener('click', () => {
      closeMenu()
    })

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
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

  function userInitials(username) {
    return String(username || 'Account')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'A'
  }

  function renderUserAvatar(target, profile) {
    if (!target) {
      return
    }

    target.textContent = ''
    target.classList.remove('user-menu-avatar-fallback')

    if (profile?.googlePicture) {
      const image = document.createElement('img')
      image.src = profile.googlePicture
      image.alt = ''
      image.referrerPolicy = 'no-referrer'
      target.appendChild(image)
      return
    }

    target.classList.add('user-menu-avatar-fallback')
    target.textContent = userInitials(profile?.username)
  }

  function initUserMenu(profile) {
    const button = document.getElementById('userMenuBtn')
    const menu = document.getElementById('userMenuDropdown')
    const name = document.getElementById('userMenuName')
    const avatar = document.getElementById('userMenuAvatar')
    const adminNav = document.getElementById('adminNavLink')
    const logout = document.getElementById('userMenuLogout')

    if (!button || !menu) {
      return
    }

    if (name) {
      name.textContent = profile?.username || 'Account'
    }
    renderUserAvatar(avatar, profile)
    if (adminNav) {
      adminNav.hidden = !profile?.is_admin
    }
    wireSignOut(logout)

    button.addEventListener('click', (event) => {
      event.stopPropagation()
      const isOpen = menu.classList.toggle('show')
      button.setAttribute('aria-expanded', String(isOpen))
    })

    menu.addEventListener('click', (event) => {
      event.stopPropagation()
    })

    document.addEventListener('click', () => {
      menu.classList.remove('show')
      button.setAttribute('aria-expanded', 'false')
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
    escapeHtml,
    fmtCurrency,
    getToken,
    initUserMenu,
    isLoggedIn,
    loadProfile,
    redirectToLogin,
    requireLogin,
    safeHexColor,
    setToken,
    setupDropdown,
    wireSignOut,
  }
})()
