(function () {
  const app = window.AccountaApp

  async function setupAuthUI() {
    try {
      const loginLink = document.getElementById('loginLink')
      const userActions = document.getElementById('userActions')
      const footer = document.querySelector('.footer')

      if (!app.isLoggedIn()) {
        location.href = 'login.html'
        return null
      }

      if (loginLink) {
        loginLink.style.display = 'none'
      }
      if (userActions) {
        userActions.style.display = 'flex'
      }

      const response = await app.apiFetch('GET', '/profile')
      if (!response.ok) {
        return null
      }

      const profile = await response.json()
      window.AccountaCommon?.initUserMenu?.(profile)
      window.AccountaAdmin?.setProfile?.(profile)
      if (!profile.is_admin && location.hash === '#admin') {
        app.switchTab('overview')
        if (history.replaceState) {
          history.replaceState(null, '', '#overview')
        }
      }
      if (footer) {
        footer.textContent = 'Saved to your account (server)'
      }

      return profile
    } catch (error) {
      console.error('Failed to load profile', error)
      return null
    }
  }

  async function init() {
    app.initTabs()
    app.populateMonthOptions()
    app.populateTransactionMonthOptions()
    app.populateTransactionYearOptions()
    app.populateCustomRangeOptions()

    if (app.dom.monthInput && app.dom.yearInput) {
      const now = new Date()
      app.dom.monthInput.value = String(now.getMonth() + 1)
      app.dom.yearInput.value = String(now.getFullYear())
    }

    app.setupEntryInteractions()
    app.setupSubscriptionForm()
    app.setupCategoryForm()
    app.setupPouchInteractions?.()

    const profile = await setupAuthUI()
    if (!profile) {
      return
    }

    await Promise.all([
      app.loadCategories(),
      app.loadSubscriptions(),
      app.loadEntries(),
      app.loadPouches?.() || Promise.resolve(),
    ])

    try {
      await app.ensureTabAssets?.(app.getActiveTab?.() || 'overview')
    } catch (error) {
      console.error('Failed to load initial tab assets', error)
    }

    app.render()
    app.renderCategories()
    app.renderSubscriptions()
    app.renderPouches?.()
  }

  app.init = init
  init()
})()
