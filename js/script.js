let plugins
let triggers = []
let timerId
let ruleBuilder
let rulePlaybook
let templates
let editor

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
        // borderColor: getHeatmap(i),
        // backgroundColor: getHeatmap(i++),
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
  //two wasys to build rules
  ruleBuilder = await RuleBuilder.initialize(client)
  rulePlaybook = await RulePlaybooksBuilder.initialize(client)
  formConnect.hide()
  app.show()
  //page.hide()
  loggedUser.text($('#user').val())
  templates = await client.templates.list({'tags.targetNode':null, 'tags.targetState':null})
  templates.forEach(template => {
    templatesSelection.append($('<option>', {
        value: template.name,
        text : template.name
    }))
  })
  const container = document.getElementById("jsoneditor")
  const options = {}
  editor = new JSONEditor(container, options)
  $('.s2').select2({ width: '100%'})
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
    const result = await ruleBuilder.checkStatus(t_tasks[i].id)
    t_tasks[i].problem = '' + result.problem //string
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

  resetButton.click(()=>{
    chart.resetZoom()
  })

  toggle.click((e) => {
    chart.data.datasets.forEach(function(ds) {
      ds.hidden = !ds.hidden
    })
    chart.update()
  })

  function resetTriggerTable() {
    triggers = []
    gridTriggers.updateConfig({data: []}).forceRender()
    triggerName.val('f1')
  }

  function storeTriggerInList() {
    const resource = resourceTriggerEntry.val()
    const metric = metricSelect.val()
    const lowerLimit = parseFloat($('#lowerLimit').val())
    const upperLimit = parseFloat($('#upperLimit').val())
    const targetNode = triggerName.val()
    const type = $('#type').val()
    const polling_window = $('#polling_window :selected').val()
    const aggregate = $('#aggregate_window :selected').val()
    const path = $('#path_settings').val()
    triggers.push({ resource, metric, targetNode, lowerLimit, upperLimit, type, polling_window, aggregate, path })
  }

  notifyButton.click(()=> {
    const resource = resourceTriggerEntry.val()
    let states_option = $('#states :selected').val()
    let states = ['Created']
    if(states_option === 'Always')
      states.push('Occurred again')
    const notificationResource = $('#notification-resource').val() || resource
    const notification = $('#notification').val()
    const playbooks = templatesSelection.val()

    if(playbooks.length && notification === 'playbooks') {
      rulePlaybook.subscribePlaybooksToTask(notificationResource, 'playbook-notification', playbooks, {},  {type:'notification'})
      .then(task=>{
        showMessage('Started a notification playbook task ' + task.ID)
        listTasks()
      })
    } else {
      ruleBuilder.startNotificationTask(notificationResource, states, 'mandrillMail', 'notification task', {type:'notification'})
      .then(task=>{
        showMessage('Started a notification task ' + task.ID)
        listTasks()
      })
    }
  })

  addTriggerButton.click(function() {
    storeTriggerInList()
    const count = triggers.length + 1
    const t_triggers = triggers.map(trigger => {
      return {
        resource: trigger.resource,
        type: trigger.type,
        metric: trigger.metric,
        upperLimit: trigger.upperLimit,
        lowerLimit: trigger.lowerLimit,
        path: trigger.path
      }
    })
    gridTriggers.updateConfig({data: t_triggers}).forceRender()
    triggerName.val('f' + count)
  })

  clearTriggerButton.click(() => {
    resetTriggerTable()
  })

  templatesSelection.change(template=>{
    getVariables()
  })

  async function getVariables() {
    let mergeVariables = []
    const playbooks = templatesSelection.val()
    for(let i = 0; i < playbooks.length; i ++ ) {
      let obj = {}
      p = await client.templates.get(playbooks[i], {format: "simplified"})
      if(p.variables) {
        obj[p.name] = p.variables.map(variable => {
          return {...variable, ...{value: variable.defaultValue}}
        })
      }
      const resource = resourceEntry.val()
      if(resource)
        obj[p.name].push({name: 'resource', value: resource})
      mergeVariables.push(obj)
    }
    editor.set(mergeVariables)
  }

  async function startAllTasks() {
    const task_name = $('#task-name').val()
    const playbooks = templatesSelection.val()
    //todo

    if(!triggers.length && playbooks !== ''){
      const resource = resourceEntry.val()
      let variables = editor.get()
      let playbook_variables = [] 
      playbooks.forEach((playbook, i) =>{
        if(variables[i] && variables[i][playbook])
          playbook_variables.push(variables[i][playbook])
        else 
          playbook_variables.push([])
      })

      rulePlaybook.startFromPlaybooks(task_name, playbooks, playbook_variables, resource, {'demo':'demo-task'})
      .then(task=>{
        showMessage('Created task from playbooks: ' + task.ID)
        listTasks()
      })
      .catch(err=> {
        alert(err)
      })
    } else if(triggers.length){
      ruleBuilder.startTaskForTriggers(task_name, triggers)
      .then(task=>{
        showMessage('Created task from triggers: ' + task.ID)
        resetTriggerTable()
        listTasks()
      })
      .catch(err=> {
        alert(err)
      })
    } else {
      showMessage('Create either triggers or select playbooks')
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
      resourceTriggerEntry.val(resource)
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
