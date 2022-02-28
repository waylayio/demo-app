var client
var chart = null
var gridTasks = null
var gridAlarms = null
var plugins

async function login(ops) {
  if(ops.domain) {
    client = new waylay({domain: ops.domain})
    await client.login($('#user').val(), $('#pwd').val())
    .catch(error => {
      $('.login-error').show()
    })
  } else {
    client = new waylay({token: ops.token})
  }

  await client.loadSettings()
  .then(()=>{
    $('#formConnect').hide()
    $('#app').show()
    $('.page-content').hide()
    $("#tabs").show()
    $("#user-name").text($('#user').val())
    showMessage("Connected", 500)
  })
  .catch(error => {
    $('.login-error').show()
    $('#formConnect').show()
    $('#app').hide()
  })
  plugins = await client.sensors.list()
}

function getPlugin(name) {
  return plugins.find(x=> x.name === name)
}

function getHeatmap(num) {
  const map = ["#543005", "#8c510a", "#bf812d", "#dfc27d", "#f6e8c3", "#f5f5f5","#c7eae5","#80cdc1","#35978f","#01665e","#003c30"]
  if(num > map.length)
    num = num % map.length
  return map[num]
}

function showMessage(text, delay=5000) {
  $("#popup").text(text)
  $("#popup").show().delay(delay).fadeOut()
}

async function listTasks(resource) {
  const tasks = await client.tasks.list({'tags.demo':'demo-task', status: 'running', resource: resource})
  $("#tasks_num").text(tasks.length)
  const notification_tasks = tasks.filter(task => 
      {return(task.tags.type !== undefined && 
              task.tags.type ==='notification')}).length
  $("#notifications_num").text(notification_tasks)
  $("#monitoring_num").text(tasks.length - notification_tasks)
  const t = tasks.map(task => { 
    return {
      name: task.name,
      user: task.user,
      status: task.status,
      resource: task.resource,
      type: task.type
      }
  })
  if(gridTasks === null) {
      gridTasks = new gridjs.Grid({
      columns: ['Name', 'User', { 
      name: 'status', 
      attributes: (cell) => {
          if (cell === 'running') { 
            return {
              //'data-cell-content': cell,
              'style': 'color: green',
            }
          } else if (cell === 'stopped'){
             return {
              'style': 'color: red',
            }
          } 
        }
      }, 'resource', 'type'],     
      data: t,
      search: true,
      pagination: true,
      sort: true
    }).render(document.getElementById("tasks"))
  } else {
    gridTasks.updateConfig({data: t}).forceRender()
  }
}

async function listAlarms(source) {
  const alarms = await client.alarms.search({status:'ACTIVE', source})
  $(".alarms_num").text(alarms.alarms.length)
  const t = alarms.alarms.map(alarm => { 
    return {
      time: alarm.lastUpdateTime,
      resource: alarm.source.id,
      severity: alarm.severity,
      type: alarm.type,
      text: alarm.text,
      count: alarm.count
    }
  })
  if(gridAlarms === null) {
      gridAlarms = new gridjs.Grid({
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
      data: t,
      search: true,
      pagination: true,
      sort: true
    }).render(document.getElementById("alarms"))
  } else {
    gridAlarms.updateConfig({data: t}).forceRender()
  }
}

function plot(data) {
  var ctx = document.getElementById('my-simple-chart').getContext('2d')
  if(chart !== null){
    chart.data.datasets = data
    chart.update()
  } else {
    chart = new Chart(ctx, {
    type: 'line',
    data: { datasets: data },
    options: {
      spanGaps: true,
      scales: {
        xAxes: [{
          type: 'time'
        }]
      }
    }
    })
  }
}

$(function () {
  $('.login-error').hide()
  $.urlParam = function(name){
    var results = new RegExp('[\?&]' + name + '=([^&#]*)').exec(window.location.href);
    if (results==null) {
       return null;
    }
    return decodeURI(results[1]) || 0;
  }
  if($.urlParam('token')){
    $('#formConnect').hide()
    login({token: $.urlParam('token')})
  } else {
    $('#formConnect').show()
  } 

  $("#cover").hide()
  $('#app').hide()
  $('#domain').val(config.domain)

  $(".sidebar-dropdown > a").click(function() {
    $(".sidebar-submenu").slideUp(200);
    if ($(this).parent().hasClass("active")) {
      $(".sidebar-dropdown").removeClass("active");
      $(this).parent().removeClass("active");
    } else {
      $(".sidebar-dropdown").removeClass("active");
      $(this).next(".sidebar-submenu").slideDown(200);
      $(this).parent().addClass("active");
    }
  });

  $("#close-sidebar").click(function() {
    $(".page-wrapper").removeClass("toggled");
  });

  $("#show-sidebar").click(function() {
    $(".page-wrapper").addClass("toggled");
  });


  $('#btnFormConnect').click(function () {
    login({domain: $('#domain').val()})
  })


  $('#logout').click( function(e) {
    e.preventDefault(); 
    delete client 
    window.location.reload() 
    return false 
  })

  $('#load-btn').on('click', function(e) {
    const resource = $('#resource').val()
    getMetrics(resource)
    .then(metrics => {
      const time = $('#time :selected').val()
      loadData(resource, metrics, time)
      $('#metricSelect').find('option').remove()
      metrics.forEach(metric => {
        $('#metricSelect').append($('<option>', { 
            value: metric,
            text : metric 
        }))
      })
    })
  })

  $('#legend-toggle').on('click', function(e) {
    chart.data.datasets.forEach(function(ds) {
      ds.hidden = !ds.hidden
    })
    chart.update()
  })
  
  $('#notify-btn').on('click', function(e) {
    const resource = $('#resource').val()
    let states_option = $('#states :selected').val() 
    let states = ['Created']
    if(states_option === 'Always')
      states.push('Occurred again')

    startNotificationTask(resource, states)
    .then(task=>{
      if(task.created_before) {
        showMessage('Already configured ' + task.ID)
      } else {
        showMessage('Started a task ' + task.ID)
        listTasks(resource)
      }
    })
  })

  $('#task-btn').on('click', function(e) {
    const resource = $('#resource').val()
    const metric = $('#metricSelect').val()
    const lowerLimit = parseFloat($('#lowerLimit').val())
    const upperLimit = parseFloat($('#upperLimit').val())
    const taskName = $('#task-name').val()
    const type = $('#type').val()
    if(metric === undefined || metric == '') {
      showMessage("Please select a metric")
    } else if(lowerLimit > upperLimit) {
      showMessage("The upper limit must be bigger or equal to the lower limit")
    } else {
      if(type === 'reactive') {
        startStreamTask(resource, metric, lowerLimit, upperLimit, taskName)
        .then(task=> {
          if(task.created_before) {
            showMessage('The task with the same config ' + task.ID)
          } else {
            showMessage('New task ' + task.ID)
            listTasks(resource)
          }
        })
      } else {
        const duration = $('#time :selected').val()
        startPollingTask(resource, metric, duration, lowerLimit, upperLimit, taskName)
        .then(task=> {
          if(task.created_before) {
            showMessage('The task with the same config ' + task.ID)
          } else {
            showMessage('New task ' + task.ID)
            listTasks(resource)
          }
        })
      }
    }
  })

  $('#tasks-btn').on('click', function(e) {
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

  $('#alarms-btn').on('click', function(e) {
    client.alarms.removeAll({status: 'ACTIVE'})
  })

  $('#resource').autocomplete({
    source: function(request, response) {
      client.resources.search({
       filter: request.term,
       skip: 0,
       limit: 100
    })
    .then(data => {
        $('.page-content').hide()
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
        $('.page-content').show()
        loadData(resource, metrics)
        listTasks(resource)
        setInterval(() => listAlarms(resource), 5000)
        $('#metricSelect').find('option').remove()
        metrics.forEach(metric => {
          $('#metricSelect').append($('<option>', { 
              value: metric,
              text : metric 
          }))
        })
      })
    } 
  })

  $('#time').on('change', function() {
    const resource = $('#resource').val()
    getMetrics(resource)
  })

  async function getMetrics(resource) {
    const res = await client.data.getSeries(resource, { metadata: true })
    const metrics = res.map( x => {return x.name })
    return metrics.filter(metric => {return metric !== 'collectedTime'})
  }

  async function loadData(resource, metrics, time = 'P1D') {
    const from = (moment().unix() - moment.duration(time).asSeconds()) * 1000
    var ts = []
    var i = 0
    for (const metric of metrics) {
      var data = await client.data.getMetricSeries(resource, encodeURI(metric), {from})
      if(data.series.length) {
        ts.push( 
        { 
          label: metric, 
          borderColor: getHeatmap(i++),
          data: data.series.map(d=> {return {x: new Date(d[0]), y:d[1] }} )
        })
      }
    }
    plot(ts) 
  }

  function createStreamUseCaseID(resource, metric, lowerLimit, upperLimit) {
    return btoa(JSON.stringify({resource, metric, lowerLimit, upperLimit}))
  }

  function createNotificationUseCaseID(resource, states, plugin) {
    return btoa(JSON.stringify({resource, states, plugin}))
  }

  function createPollingUseCaseID(resource, metric, from, lowerLimit, upperLimit) {
    return btoa(JSON.stringify({resource, metric, from, lowerLimit, upperLimit}))
  }

  async function startStreamTask(resource, metric = 'temperature', lowerLimit=0, upperLimit=10, name = 'example reactive task') {
    const use_case_id = createStreamUseCaseID(resource, metric, lowerLimit, upperLimit)
    const tasks = await client.tasks.list({'tags.use_case': use_case_id, status: 'running'})
    if(tasks.length > 0) {
      const task = {...tasks[0], created_before: true}
      return task
    } else {
      const value = '${streamdata.' + metric + '}'
      const inRangePlug = getPlugin('inRange')
      const createAlarmPlug = getPlugin('createAlarm')
      const clearAlarmPlug = getPlugin('clearAlarm')
      var task = {
        sensors: [
          {
            label: 'inRange',
            name: 'inRange',
            version: inRangePlug.version,
            dataTrigger: true,
            tickTrigger: false,
            resource: resource,
            properties: {
              value: value,
              lowerLimit: lowerLimit,
              upperLimit: upperLimit
            },
            position: [ 150, 150 ]
          },
          {
            label: 'createAlarm',
            name: 'createAlarm',
            version: createAlarmPlug.version,
            properties: { 
              text: 'Out of range',
              severity: 'MINOR',
              type: 'Out of range ' + metric,
              resource: resource
              },
              position: [ 800, 250 ]
            },
            {
            label: 'clearAlarm',
            name: 'clearAlarm',
            version: clearAlarmPlug.version,
            properties: { 
              type: 'Out of range ' + metric,
              resource: resource
            },
            position: [ 800, 450 ]
          }
        ],
        triggers: [
          {
            sourceLabel: 'inRange',
            destinationLabel: 'createAlarm',
            statesTrigger: [ 'Above' , 'Below']
          },
          {
            sourceLabel: 'inRange',
            destinationLabel: 'clearAlarm',
            stateChangeTrigger: {
              stateFrom: "*",
              stateTo: 'In Range'
            }
          }
        ],
        task: { 
          resource: resource,
          type: 'reactive', 
          start: true, 
          name: name,
          tags :{
            demo: 'demo-task',
            use_case: use_case_id
          }
        }
      }
      return await client.tasks.create(task, {})
    }
   
  }

  async function startPollingTask(resource, metric = 'temperature', from="PT30M", lowerLimit=0, upperLimit=10, name = 'example polling task') {
    const use_case_id = createPollingUseCaseID(resource, metric, from, lowerLimit, upperLimit)
    const tasks = await client.tasks.list({'tags.use_case': use_case_id, status: 'running'})
    if(tasks.length > 0) {
      const task = {...tasks[0], created_before: true}
      return task
    } else {
      const pollingInterval = moment.duration(from).asSeconds() / 2
      const getMetricValuePlug = getPlugin('getMetricValue')
      const conditionPlug = getPlugin('condition')
      const createAlarmPlug = getPlugin('createAlarm')
      const clearAlarmPlug = getPlugin('clearAlarm')
      var task = {
        sensors: [
          {
            label: 'getMetricValue',
            name: 'getMetricValue',
            version: getMetricValuePlug.version,
            dataTrigger: false,
            tickTrigger: true,
            properties: {
              resource: resource,
              metric: metric,
              duration: from
            },
            position: [ 150, 150 ]
          },
          {
            label: 'condition',
            name: 'condition',
            version: conditionPlug.version,
            properties: {
              condition: "${nodes.getMetricValue.rawData.result} > " + upperLimit + " || ${nodes.getMetricValue.rawData.result} < " + lowerLimit
            },
            position: [ 350, 250 ]
          },
          {
            label: 'createAlarm',
            name: 'createAlarm',
            version: createAlarmPlug.version,
            properties: { 
              text: 'Out of range',
              severity: 'MINOR',
              type: 'Out of range ' + metric,
              resource: resource

            },
            position: [ 800, 250 ]
          },
          {
            label: 'clearAlarm',
            name: 'clearAlarm',
            version: clearAlarmPlug.version,
            properties: { 
              type: 'Out of range ' + metric,
              resource: resource
            },
            position: [ 800, 450 ]
          }
        ],
        triggers: [
         {
            sourceLabel: 'getMetricValue',
            destinationLabel: 'condition',
            statesTrigger: [ 'Collected' ]
          },
          {
            sourceLabel: 'condition',
            destinationLabel: 'createAlarm',
            statesTrigger: [ 'True' ]
          },
          {
            sourceLabel: 'condition',
            destinationLabel: 'clearAlarm',
            stateChangeTrigger: {
              stateFrom: "*",
              stateTo: 'False'
            }
          }
        ],
        task: { 
          resource: resource,
          type: 'periodic', 
          pollingInterval: pollingInterval,
          start: true, 
          name: name,
          tags :{
            demo: 'demo-task',
            use_case: use_case_id
          }
        }
      }
      return await client.tasks.create(task, {})
    }
  }

  async function startNotificationTask(resource, states=["Created", "Occurred again"], plugin = 'mandrillMail', name = 'notification task') {
    const use_case_id = createNotificationUseCaseID(resource, states, plugin)
    const tasks = await client.tasks.list({'tags.use_case': use_case_id, status: 'running'})
    if(tasks.length > 0) {
      const task = {...tasks[0], created_before: true}
      return task
    } else {
      const alarmEventSensorPlug = getPlugin('AlarmEventSensor')
      const notificationPlug = getPlugin(plugin)
      var task = {
        sensors: [
          {
            label: alarmEventSensorPlug.name,
            name: alarmEventSensorPlug.name,
            version: alarmEventSensorPlug.version,
            resource: resource,
            dataTrigger: false,
            tickTrigger: false,
            properties: {
              status: 'ACTIVE'
            },
            position: [ 150, 150 ]
          },
          {
            label: notificationPlug.name,
            name: notificationPlug.name,
            version: notificationPlug.version,
            properties: { 
              ...config[plugin],
              message: 'Out of range',
              subject: 'Out of range resource ' + resource,
              },
              position: [ 800, 250 ]
            }
        ],
        triggers: [
          {
            sourceLabel: alarmEventSensorPlug.name,
            destinationLabel: notificationPlug.name,
            statesTrigger: states
          }
        ],
        task: { 
          resource: resource,
          type: 'reactive', 
          start: true, 
          name: name,
          tags :{
            demo: 'demo-task',
            use_case: use_case_id,
            type: 'notification'
          }
        }
      }
      return await client.tasks.create(task, {})
    }
  }
})

