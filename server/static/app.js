(function () {
  const app = window.AccountaApp

  async function setupAuthUI() {
    try {
      const loginLink = document.getElementById('loginLink')
      const userActions = document.getElementById('userActions')
      const footer = document.querySelector('.footer')

      if (app.isLoggedIn()) {
        if (loginLink) {
          loginLink.style.display = 'none'
        }
        if (userActions) {
          userActions.style.display = 'flex'
        }

        try {
          const response = await app.apiFetch('GET', '/profile')
          if (response.ok) {
            const profile = await response.json()
            window.AccountaCommon?.initUserMenu?.(profile)
            if (footer) {
              footer.textContent = 'Saved to your account (server)'
            }
          }
        } catch (error) {
          // Keep the rest of the page usable if profile loading fails.
        }
      } else {
        location.href = 'login.html'
        return
      }

    } catch (error) {
      // Ignore missing auth shell elements on partial renders.
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

    await app.loadCategories()
    await app.loadSubscriptions()
    await app.loadEntries()
    await app.loadPouches?.()

    app.render()
    app.renderCategories()
    app.renderSubscriptions()
    app.renderPouches?.()

    await setupAuthUI()
  }

  app.init = init
  init()
})()
