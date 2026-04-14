(function () {
  const app = window.AccountaApp

  function destroyCharts() {
    if (app.charts.expense) {
      app.charts.expense.destroy()
      app.charts.expense = null
    }
    if (app.charts.compare) {
      app.charts.compare.destroy()
      app.charts.compare = null
    }
    if (app.charts.trend) {
      app.charts.trend.destroy()
      app.charts.trend = null
    }
    if (app.charts.profit) {
      app.charts.profit.destroy()
      app.charts.profit = null
    }
  }

  function renderCharts() {
    destroyCharts()

    const filteredEntries = app.getFilteredEntries()
    if (filteredEntries.length === 0) {
      return
    }

    const {categoryTotal, totals: categoryTotals} = app.breakdownByCategoryFiltered(app.state.breakdownType)
    if (categoryTotal > 0) {
      const context = document.getElementById('expenseChart')
      const sortedCategories = Object.entries(categoryTotals).sort((left, right) => right[1] - left[1])
      const labels = sortedCategories.map(([category]) => category)
      const data = sortedCategories.map(([, value]) => value)
      const categoryList = app.state.breakdownType === 'expense' ? app.state.categories.expense : app.state.categories.income
      const colors = labels.map((categoryName) => {
        const category = categoryList.find((item) => item.name === categoryName)
        return category ? category.color : '#9aa5b1'
      })

      app.charts.expense = new Chart(context, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: colors,
            borderColor: '#0f1724',
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {display: false},
            tooltip: {
              callbacks: {
                label(context) {
                  const value = context.parsed
                  const total = context.dataset.data.reduce((sum, item) => sum + item, 0)
                  const percentage = ((value / total) * 100).toFixed(1)
                  return `${context.label}: ${app.fmt(value)} (${percentage}%)`
                },
              },
            },
          },
        },
      })

      const legend = document.getElementById('expenseChartLegend')
      legend.innerHTML = ''
      sortedCategories.forEach(([category, value], index) => {
        const percent = ((value / categoryTotal) * 100).toFixed(1)
        const item = document.createElement('div')
        item.className = 'chart-legend-item'
        item.innerHTML = `
          <div class="chart-legend-color" style="background: ${colors[index]}"></div>
          <span>${category}: ${app.fmt(value)} (${percent}%)</span>
        `
        legend.appendChild(item)
      })
    }

    const compareContext = document.getElementById('compareChart')
    const totals = app.totalsFiltered()
    app.charts.compare = new Chart(compareContext, {
      type: 'bar',
      data: {
        labels: ['Income', 'Expense'],
        datasets: [{
          data: [totals.income, totals.expense],
          backgroundColor: ['#6ee7b7', '#ff6b6b'],
          borderColor: ['#6ee7b7', '#ff6b6b'],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {display: false},
          tooltip: {
            callbacks: {
              label(context) {
                return app.fmt(context.parsed.y)
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback(value) {
                return '$' + value.toLocaleString()
              },
              color: '#9aa5b1',
            },
            grid: {color: 'rgba(255,255,255,0.05)'},
          },
          x: {
            ticks: {color: '#e6eef6'},
            grid: {display: false},
          },
        },
      },
    })

    const monthlyData = {}
    const categoryTrends = {}
    const now = new Date()
    const trendCutoffDate = new Date(now.getFullYear(), now.getMonth() - app.state.trendTimeframeMonths, 1)

    app.state.entries.forEach((entry) => {
      const date = new Date(entry.date)
      if (date < trendCutoffDate) {
        return
      }

      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {income: 0, expense: 0}
      }

      if (entry.type === 'income') {
        monthlyData[monthKey].income += entry.amount
      } else {
        monthlyData[monthKey].expense += entry.amount
      }

      if (!categoryTrends[entry.category]) {
        categoryTrends[entry.category] = {type: entry.type}
      }
      if (!categoryTrends[entry.category][monthKey]) {
        categoryTrends[entry.category][monthKey] = 0
      }
      categoryTrends[entry.category][monthKey] += entry.amount
    })

    const sortedMonths = Object.keys(monthlyData).sort()
    const monthLabels = sortedMonths.map((key) => {
      const [year, month] = key.split('-')
      return new Date(year, parseInt(month, 10) - 1).toLocaleDateString('en-US', {month: 'short', year: 'numeric'})
    })
    const incomeData = sortedMonths.map((key) => monthlyData[key].income)
    const expenseData = sortedMonths.map((key) => monthlyData[key].expense)
    const categoryDatasets = Object.entries(categoryTrends).map(([categoryName, monthData]) => {
      const categoryType = monthData.type || 'expense'
      const category = app.state.categories[categoryType].find((item) => item.name === categoryName)
      const color = category ? category.color : '#9aa5b1'

      return {
        label: categoryName,
        data: sortedMonths.map((key) => monthData[key] || 0),
        borderColor: color,
        backgroundColor: color + '20',
        tension: 0.3,
        fill: false,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 7,
        hitRadius: 15,
      }
    })

    const trendDatasets = []
    if (app.state.showIncomeTrend) {
      trendDatasets.push({
        label: 'Income',
        data: incomeData,
        borderColor: '#6ee7b7',
        backgroundColor: 'rgba(110, 231, 183, 0.1)',
        tension: 0.3,
        fill: true,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 8,
        hitRadius: 15,
      })
    }
    if (app.state.showExpenseTrend) {
      trendDatasets.push({
        label: 'Total Expense',
        data: expenseData,
        borderColor: '#ff6b6b',
        backgroundColor: 'rgba(255, 107, 107, 0.1)',
        tension: 0.3,
        fill: true,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 8,
        hitRadius: 15,
      })
    }

    trendDatasets.push(...categoryDatasets.filter((dataset) => {
      const categoryType = categoryTrends[dataset.label]?.type || 'expense'
      return categoryType === 'income' ? app.state.showIncomeTrend : app.state.showExpenseTrend
    }))

    const trendContext = document.getElementById('trendChart')
    app.charts.trend = new Chart(trendContext, {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: trendDatasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: '#e6eef6',
              usePointStyle: true,
              padding: 10,
            },
            onClick(event, legendItem, legend) {
              const index = legendItem.datasetIndex
              const chart = legend.chart

              if (event.native.ctrlKey || event.native.metaKey) {
                const visibleDatasets = chart.data.datasets.filter((dataset, datasetIndex) => chart.isDatasetVisible(datasetIndex))

                if (visibleDatasets.length === 1 && chart.isDatasetVisible(index)) {
                  chart.data.datasets.forEach((dataset) => {
                    dataset.borderWidth = dataset.chartBorderWidth || 2
                    dataset.pointRadius = dataset.chartPointRadius || 3
                    dataset.backgroundColor = dataset.chartBackgroundColor || (dataset.borderColor + '20')
                  })
                  chart.update('none')
                  chart.data.datasets.forEach((dataset, datasetIndex) => {
                    chart.show(datasetIndex)
                  })
                  chart.update()
                } else {
                  chart.data.datasets.forEach((dataset, datasetIndex) => {
                    chart.show(datasetIndex)
                    if (!dataset.chartBorderWidth) {
                      dataset.chartBorderWidth = dataset.borderWidth || 2
                      dataset.chartPointRadius = dataset.pointRadius || 3
                      dataset.chartBackgroundColor = dataset.backgroundColor || (dataset.borderColor + '20')
                    }
                    dataset.borderWidth = dataset.chartBorderWidth
                    dataset.pointRadius = dataset.chartPointRadius
                    dataset.backgroundColor = dataset.chartBackgroundColor
                  })
                  chart.update('none')

                  chart.data.datasets.forEach((dataset, datasetIndex) => {
                    if (datasetIndex !== index) {
                      dataset.borderWidth = 0
                      dataset.pointRadius = 0
                      dataset.backgroundColor = (dataset.borderColor || '#9aa5b1') + '00'
                    }
                  })
                  chart.update()

                  setTimeout(() => {
                    chart.data.datasets.forEach((dataset, datasetIndex) => {
                      if (datasetIndex === index) {
                        chart.show(datasetIndex)
                      } else {
                        chart.hide(datasetIndex)
                      }
                    })
                    chart.update('none')
                  }, 300)
                }
              } else {
                const isVisible = chart.isDatasetVisible(index)
                if (isVisible) {
                  const dataset = chart.data.datasets[index]
                  dataset.chartBorderWidth = dataset.borderWidth || 2
                  dataset.chartPointRadius = dataset.pointRadius || 3
                  dataset.chartBackgroundColor = dataset.backgroundColor || (dataset.borderColor + '20')
                  dataset.borderWidth = 0
                  dataset.pointRadius = 0
                  dataset.backgroundColor = (dataset.borderColor || '#9aa5b1') + '00'
                  chart.update()

                  setTimeout(() => {
                    chart.hide(index)
                    chart.update('none')
                  }, 300)
                } else {
                  const dataset = chart.data.datasets[index]
                  dataset.borderWidth = dataset.chartBorderWidth || 2
                  dataset.pointRadius = dataset.chartPointRadius || 3
                  dataset.backgroundColor = dataset.chartBackgroundColor || (dataset.borderColor + '20')
                  chart.show(index)
                  chart.update()
                }
              }
            },
          },
          tooltip: {
            enabled: true,
            filter(tooltipItem) {
              return tooltipItem.parsed.y > 0
            },
            callbacks: {
              label(context) {
                return `${context.dataset.label}: ${app.fmt(context.parsed.y)}`
              },
            },
            mode: 'nearest',
            intersect: false,
          },
        },
        interaction: {
          mode: 'nearest',
          intersect: false,
          axis: 'x',
          includeInvisible: false,
        },
        onHover(event, activeElements, chart) {
          const legend = chart.legend
          if (legend && event.native) {
            const y = event.native.offsetY
            if (y >= legend.top && y <= legend.bottom) {
              chart.tooltip.setActiveElements([])
              chart.update()
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback(value) {
                return '$' + value.toLocaleString()
              },
              color: '#9aa5b1',
            },
            grid: {color: 'rgba(255,255,255,0.05)'},
          },
          x: {
            ticks: {color: '#9aa5b1'},
            grid: {color: 'rgba(255,255,255,0.05)'},
          },
        },
      },
    })

    const profitContext = document.getElementById('profitChart')
    if (!profitContext) {
      return
    }

    const lastSixMonths = []
    const netData = []
    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      lastSixMonths.push(date.toLocaleDateString('en-US', {month: 'short', year: 'numeric'}))

      const monthIncome = app.state.entries
        .filter((entry) => {
          const entryDate = new Date(entry.date)
          return entry.type === 'income'
            && entryDate.getFullYear() === date.getFullYear()
            && entryDate.getMonth() === date.getMonth()
        })
        .reduce((sum, entry) => sum + entry.amount, 0)

      const monthExpense = app.state.entries
        .filter((entry) => {
          const entryDate = new Date(entry.date)
          return entry.type === 'expense'
            && entryDate.getFullYear() === date.getFullYear()
            && entryDate.getMonth() === date.getMonth()
        })
        .reduce((sum, entry) => sum + entry.amount, 0)

      netData.push(monthIncome - monthExpense)
    }

    app.charts.profit = new Chart(profitContext, {
      type: 'bar',
      data: {
        labels: lastSixMonths,
        datasets: [{
          label: 'Monthly Net',
          data: netData,
          backgroundColor: netData.map((value) => value >= 0 ? 'rgba(110, 231, 183, 0.6)' : 'rgba(255, 107, 107, 0.6)'),
          borderColor: netData.map((value) => value >= 0 ? '#6ee7b7' : '#ff6b6b'),
          borderWidth: 2,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {display: false},
          tooltip: {
            callbacks: {
              label(context) {
                return `Net: ${app.fmt(context.parsed.y)}`
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback(value) {
                return app.fmt(value)
              },
              color: '#9aa5b1',
            },
            grid: {color: 'rgba(255,255,255,0.05)'},
          },
          x: {
            ticks: {color: '#e6eef6'},
            grid: {display: false},
          },
        },
      },
    })
  }

  app.destroyCharts = destroyCharts
  app.renderCharts = renderCharts
})()
