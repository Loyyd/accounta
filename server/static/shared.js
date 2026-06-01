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
    const home = document.getElementById('userMenuHome')
    const admin = document.getElementById('userMenuAdmin')
    const logout = document.getElementById('userMenuLogout')

    if (!button || !menu) {
      return
    }

    if (name) {
      name.textContent = profile?.username || 'Account'
    }
    renderUserAvatar(avatar, profile)
    if (home) {
      const onDashboardRoute = location.pathname.endsWith('/index.html') || location.pathname === '/' || location.pathname.endsWith('/index')
      home.classList.toggle('is-active', onDashboardRoute && location.hash !== '#settings')
    }
    if (admin) {
      admin.hidden = !profile?.is_admin
      admin.classList.toggle('is-active', location.pathname.endsWith('/admin.html'))
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
    fmtCurrency,
    getToken,
    initUserMenu,
    isLoggedIn,
    loadProfile,
    redirectToLogin,
    requireLogin,
    setToken,
    setupDropdown,
    wireSignOut,
  }
})()
