(function () {
  const app = window.AccountaApp

  async function setupAuthUI() {
    try {
      const loginLink = document.getElementById('loginLink')
      const userDropdown = document.getElementById('userDropdown')
      const userMenuBtn = document.getElementById('userMenuBtn')
      const userDropdownMenu = document.getElementById('userDropdownMenu')
      const userHint = document.getElementById('userHint')
      const signOutBtn = document.getElementById('signOutBtn')
      const settingsLink = document.getElementById('settingsLink')
      const adminLink = document.getElementById('adminLink')
      const footer = document.querySelector('.footer')

      if (app.isLoggedIn()) {
        if (loginLink) {
          loginLink.style.display = 'none'
        }
        if (userDropdown) {
          userDropdown.style.display = 'block'
        }

        try {
          const response = await app.apiFetch('GET', '/profile')
          if (response.ok) {
            const profile = await response.json()
            if (userHint) {
              userHint.textContent = profile.username
            }
            if (footer) {
              footer.textContent = 'Saved to your account (server)'
            }
            if (profile.is_admin && adminLink) {
              adminLink.style.display = 'block'
            }
          }
        } catch (error) {
          // Keep the rest of the page usable if profile loading fails.
        }
      } else {
        location.href = 'login.html'
        return
      }

      if (window.AccountaCommon?.setupDropdown) {
        window.AccountaCommon.setupDropdown(userMenuBtn, userDropdownMenu)
      }

      if (settingsLink) {
        settingsLink.addEventListener('click', (event) => {
          event.preventDefault()
          location.href = 'settings.html'
        })
      }

      if (window.AccountaCommon?.wireSignOut) {
        window.AccountaCommon.wireSignOut(signOutBtn)
      } else if (signOutBtn) {
        signOutBtn.addEventListener('click', (event) => {
          event.preventDefault()
          localStorage.removeItem('finance-tracker.token')
          location.href = 'login.html'
        })
      }
    } catch (error) {
      // Ignore missing auth shell elements on partial renders.
    }
  }

  async function init() {
    app.initTabs()
    app.populateMonthOptions()

    if (app.dom.monthInput && app.dom.yearInput) {
      const now = new Date()
      app.dom.monthInput.value = String(now.getMonth() + 1)
      app.dom.yearInput.value = String(now.getFullYear())
    }

    app.setupEntryInteractions()
    app.setupSubscriptionForm()
    app.setupBudgetForm()
    app.setupCategoryForm()

    await app.loadCategories()
    await app.loadSubscriptions()
    await app.loadBudgets()
    await app.loadEntries()

    app.render()
    app.renderCategories()
    app.renderSubscriptions()
    app.renderBudgets()
    app.renderBudgetOverview()

    await setupAuthUI()
  }

  app.init = init
  init()
})()
