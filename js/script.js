var client
var plugins
var triggers = []
var timerId
var ruleBuilder

async function getMetrics(resource) {
  const res = await client.data.getSeries(resource, { metadata: true })
  const metrics = res.map( x => x.name )
  return metrics.filter(metric => metric !== 'collectedTime')
}

async function getData(resource, metrics, time = 'P1D') {
  const from = (moment().unix() - moment.duration(time).asSeconds()) * 1000
  var timeseries = []
  var i = 0
  for (const metric of metrics) {
    var data = await client.data.getMetricSeries(resource, encodeURI(metric), {from})
    if(data.series.length) {
      timeseries.push({
        label: metric,
        borderColor: getHeatmap(i++),
        data: data.series.map(d=> {return {x: new Date(d[0]), y:d[1] }} )
      })
    }
  }
  return timeseries
}

async function login(ops) {
  if(ops.domain) {
    client = new waylay({domain: ops.domain})
    await client.login(ops.user, ops.password)
    .catch(error => {
      loginError.show()
    })
  } else {
    client = new waylay({token: ops.token})
  }

  await client.loadSettings()
  plugins = await client.sensors.list()
  ruleBuilder = new RuleBuilder(client, plugins)
  formConnect.hide()
  app.show()
  page.hide()
  loggedUser.text($('#user').val())
  showMessage("Connected", 500)
}

async function listTasks(resource) {
  const tasks = await client.tasks.list({'tags.demo':'demo-task', status: 'running', resource: resource})
  $("#tasks_num").text(tasks.length)
  const notification_tasks = tasks.filter(task =>
      {return(task.tags.type !== undefined &&
              task.tags.type ==='notification')}).length
  $("#notifications_num").text(notification_tasks)
  $("#monitoring_num").text(tasks.length - notification_tasks)
  const t_tasks = tasks.map(task => {
    return {
      name: task.name,
      id: task.ID,
      resource: task.resource,
      type: task.type
      }
  })
  for(i=0; i < t_tasks.length; i++) {
    const result = await ruleBuilder.checkIfProblem(t_tasks[i].id)
    t_tasks[i].problem = '' + result //string
  }
  gridTasks.updateConfig({data: t_tasks}).forceRender()
}


async function listAlarms(source) {
  const alarms = await client.alarms.search({status:'ACTIVE', source})
  $(".alarms_num").text(alarms.alarms.length)
  const t_alarms = alarms.alarms.map(alarm => {
    return {
      time: alarm.lastUpdateTime,
      resource: alarm.source.id,
      severity: alarm.severity,
      type: alarm.type,
      text: alarm.text,
      count: alarm.count
    }
  })
  gridAlarms.updateConfig({data: t_alarms}).forceRender()
}

connectButton.click(()=> {
  login({domain: $('#domain').val(), user: $('#user').val(), password: $('#pwd').val()})
})

logoutButton.click( (e)=> {
  e.preventDefault();
  delete client
  window.location.reload()
  return false
})

function plot(data) {
  chart.data.datasets = data
  chart.update()
}

function init() {
  loginError.hide()
  $("#cover").hide()
  app.hide()
  $('#domain').val(config.domain)
  updateTaskTypeSelection()
  if($.urlParam('token')){
    formConnect.hide()
    login({token: $.urlParam('token')})
  } else {
    formConnect.show()
  }

  loadButton.click(() => {
    const resource = resourceEntry.val()
    getMetrics(resource)
    .then(metrics => {
      const time = $('#time :selected').val()
      getData(resource, metrics, time)
      .then(data => plot(data))
      metricSelect.find('option').remove()
      metrics.forEach(metric => {
        metricSelect.append($('<option>', {
            value: metric,
            text : metric
        }))
      })
    })
  })

  toggle.click((e) => {
    chart.data.datasets.forEach(function(ds) {
      ds.hidden = !ds.hidden
    })
    chart.update()
  })

  function resetTriggerTable() {
    triggers = []
    $('#task-name').val('f1')
  }

  function storeTriggerInList() {
    const resource = resourceEntry.val()
    const metric = metricSelect.val()
    const lowerLimit = parseFloat($('#lowerLimit').val())
    const upperLimit = parseFloat($('#upperLimit').val())
    const name = $('#task-name').val()
    const type = $('#type').val()
    const polling_window = $('#polling_window :selected').val()
    const aggregate = $('#aggregate_window :selected').val()
    triggers.push({ resource, metric, name, lowerLimit, upperLimit, type, polling_window, aggregate })
  }

  notifyButton.click(()=> {
    const resource = resourceEntry.val()
    let states_option = $('#states :selected').val()
    let states = ['Created']
    if(states_option === 'Always')
      states.push('Occurred again')

    ruleBuilder.startNotificationTask(resource, states)
    .then(task=>{
      if(task.created_before) {
        showMessage('Already configured ' + task.ID)
      } else {
        showMessage('Started a task ' + task.ID)
        listTasks(resource)
      }
    })
  })

  addTriggerButton.click(function() {
    storeTriggerInList()
    const count = triggers.length + 1
    $('#task-name').val('f' + count)
  })

  clearTriggerButton.click(() => {
    resetTriggerTable()
  })

  async function startAllTasks() {
    if(!triggers.length){
      showMessage('No trigger defined yet')
    } else {
      const task = await ruleBuilder.startTaskForTriggers(triggers)
      showMessage('Created task ' + task.ID)
      resetTriggerTable()
      listTasks()
    }
  }

  startTasksButton.click(()=> {
    startAllTasks()
  })

  listTasksButton.click(()=> {
    listTasks()
  })

  removeTasksButton.click(() => {
    client.tasks.list({'tags.demo':'demo-task', status: 'running'})
    .then(tasks => {
      tasks.forEach(task => {
        client.tasks.stopAndRemove(task.ID)
      })
    })
    .catch(err=> {
      alert(err)
    })
    setTimeout(listTasks, 3000)
  })

  alarmsButton.click(() => {
    client.alarms.removeAll({status: 'ACTIVE'})
  })

  resourceEntry.autocomplete({
    source: function(request, response) {
      client.resources.search({
       filter: request.term,
       skip: 0,
       limit: 100
    })
    .then(data => {
        page.hide()
        var resource = data.values.map(x=> {return x.id})
        response(resource)
      })
    },
    minLength: 1,
    cacheLength: 0,
    select: function(event, ui) {
      const resource = ui.item.value
      getMetrics(resource)
      .then(metrics => {
        page.show()
        getData(resource, metrics)
        .then(data => plot(data))
        listTasks(resource)
        clearTimeout(timerId)
        timerId = setInterval(() => listAlarms(resource), 5000)
        metricSelect.find('option').remove()
        metrics.forEach(metric => {
          metricSelect.append($('<option>', {
              value: metric,
              text : metric
          }))
        })
      })
    }
  })

  $('#time').change(() => {
    const resource = resourceEntry.val()
    const time = $('#time :selected').val()
    getMetrics(resource)
    .then((metrics)=>{
      getData(resource, metrics, time)
      .then(data => plot(data))
    })
  })

}

init()
