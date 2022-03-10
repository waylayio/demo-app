const formConnect = $('#formConnect')
const loginError = $('.login-error')
const app = $('#app')
const page = $('.page-content')
const loggedUser = $('#user-name')
const loadButton = $('#load-btn')
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
const playbookTaskButton = $('#playbook-task-btn')
const playbooksEntry = $('#playbooks-name')
const templatesSelection = $('#templates')

$.urlParam = function(name){
  var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
  if (results==null) {
     return null;
  }
  return decodeURI(results[1]) || 0;
}

const map = ["#543005", "#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5","#c7eae5","#80cdc1","#35978f","#01665e","#003c30"]
function getHeatmap(num) {
  return map[num % map.length]
}

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
