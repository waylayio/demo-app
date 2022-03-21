const formConnect = $('#formConnect')
const loginError = $('.login-error')
const app = $('#app')
const page = $('.page-content')
const loggedUser = $('#user-name')
const loadButton = $('#load-btn')
const resetButton = $('#reset-zoom')
const resourceEntry = $('#resource')
const resourceTriggerEntry = $('#resource-trigger-name')
const connectButton = $('#btnFormConnect')
const logoutButton = $('#logout')
const metricSelect = $('#metricSelect')
const notifyButton = $('#notify-btn')
const toggle = $('#legend-toggle')
const addTriggerButton = $('#add-task-btn')
const clearTriggerButton = $('#clear-task-btn')
const alarmsButton = $('#alarms-btn')
const removeTasksButton = $('#tasks-remove-btn')
const startTasksButton = $('#task-btn')
const listTasksButton = $('#tasks-list-btn')
const templatesSelection = $('#templates')
const triggerName = $('#trigger-name')

$.urlParam = function(name){
  var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
  if (results==null) {
     return null;
  }
  return decodeURI(results[1]) || 0;
}

const autocolors = window['chartjs-plugin-autocolors']
Chart.register(autocolors)

const ctx = document.getElementById('data-chart').getContext('2d')
var chart = new Chart(ctx, {
  type: 'line',
  data: { datasets: []},
  options: {
    aspectRatio: 5 / 3,
    layout: {
      padding: 20
    },
    elements: {
      line: {
        fill: false,
        tension: 0.4
      }
    },
    scales: {
      x: {
        type: "time"
      }
    },
    plugins: {
      autocolors,
      zoom: {
        pan: {
            enabled: true,
            modifierKey: 'ctrl',
            mode: 'xy'
        },
        zoom: {
          drag: {
            enabled: true
          },
          mode: 'xy'
        }
     }
    }
  }
})

var gridTriggers = new gridjs.Grid({
  columns: ['Resource', 'Metric', 'Type', 'lowerLimit', 'upperLimit', 'path'],
  data: []
}).render(document.getElementById("triggers"))

var gridTasks = new gridjs.Grid({
  columns: ['Name', 'Id', {
  name: 'Problem',
  attributes: (cell) => {
      if (cell === 'true') {
        return {
          'style': 'color: red',
        }
      } else if (cell === 'false'){
         return {
          'style': 'color: green',
        }
      }
    }
  }, 'resource', 'type'],
  data: [],
  search: true,
  pagination: true,
  sort: true
}).render(document.getElementById("tasks"))

var gridAlarms = new gridjs.Grid({
      columns: ['Time', 'Resource', {
      name: 'Severity',
      attributes: (cell) => {
          if (cell === 'MAJOR' || cell === 'CRITICAL') {
            return {
              'style': 'color: red',
            }
          } else if (cell === 'MINOR'){
            return {
              'style': 'color: orange',
            }
          }
        }
      }, 'Type', 'Text', 'Count'],
      data: [],
      search: true,
      pagination: true,
      sort: true
    }).render(document.getElementById("alarms"))

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

function updateTaskTypeSelection() {
  $("#path_settings").hide()
  $("#type").change(() =>{
    if($("#type").val() === 'periodic'){
      $("#polling_settings").show()
    } else {
      $("#polling_settings").hide()
    }
    if($("#type").val() === 'periodic' || $("#type").val() === 'reactive' ) {
      $("#metricSelect").show()
      $("#lowerLimit").show()
      $("#upperLimit").show()
      $("#path_settings").hide()
    }
    if($("#type").val() === 'event'){
      $("#path_settings").show()
      $("#polling_settings").hide()
      $("#metricSelect").hide()
      $("#lowerLimit").hide()
      $("#upperLimit").hide()
    } else {
      $("#path_settings").hide()
    }
  })
}
