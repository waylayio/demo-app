const formConnect = $('#formConnect')
const loginError = $('.login-error')
const app = $('#app')
const page = $('.page-content')
const loggedUser = $('#user-name')
const loadButton = $('#load-btn')
const resourceEntry = $('#resource')
const connectButton = $('#btnFormConnect')
const logoutButton = $('#logout')
const metricSelect = $('#metricSelect')
const notifyButton = $('#notify-btn')
const toggle = $('#legend-toggle')
const addTaskButton = $('#add-task-btn')
const clearTaskButton = $('#clear-task-btn')
const alarmsButton = $('#alarms-btn')
const removeTasksButton = $('#tasks-remove-btn')
const startTasksButton = $('#task-btn')

const map = ["#543005", "#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5","#c7eae5","#80cdc1","#35978f","#01665e","#003c30"]
function getHeatmap(num) {
  return map[num % map.length]
}

var gridTasks = new gridjs.Grid({
  columns: ['Name', 'User', {
  name: 'status',
  attributes: (cell) => {
      if (cell === 'running') {
        return {
          'style': 'color: green',
        }
      } else if (cell === 'stopped'){
         return {
          'style': 'color: red',
        }
      }
    }
  }, 'resource', 'type'],
  data: [],
  search: true,
  pagination: true,
  sort: true
}).render(document.getElementById("tasks"))

var gridAlarms = null
const ctx = document.getElementById('my-simple-chart').getContext('2d')
var chart = new Chart(ctx, {
  type: 'line',
  data: { datasets: []},
  options: {
    spanGaps: true,
    scales: {
      xAxes: [{
        type: 'time'
      }]
    }
  }
})


$(".sidebar-dropdown > a").click(function() {
  $(".sidebar-submenu").slideUp(200)
  if ($(this).parent().hasClass("active")) {
    $(".sidebar-dropdown").removeClass("active");
    $(this).parent().removeClass("active")
  } else {
    $(".sidebar-dropdown").removeClass("active")
    $(this).next(".sidebar-submenu").slideDown(200)
    $(this).parent().addClass("active")
  }
})

$("#close-sidebar").click(function() {
  $(".page-wrapper").removeClass("toggled")
})

$("#show-sidebar").click(function() {
  $(".page-wrapper").addClass("toggled")
})

function showMessage(text, delay=5000) {
  $("#popup").text(text)
  $("#popup").show().delay(delay).fadeOut()
}
