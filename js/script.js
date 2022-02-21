const DOMAIN = config.domain
var waylay
var chart = null
var gridTasks = null
var gridAlarms = null
var plugins

async function login() {
  waylay = new waylay({
    domain: DOMAIN
  })
  await waylay.login($('#user').val(), $('#pwd').val())
  await waylay.loadSettings()
  .then(()=>{
    $('.login-error').hide()
    $('#formConnect').hide()
    $('#app').show()
    $("#tabs").show()
    showMessage("Connected to waylay", 500)
  })
  .catch(error => {
    $('.login-error').show()
    $('#formConnect').show()
    $('#app').hide()
  })
  plugins = await waylay.sensors.list()
  listTasks()
  setInterval(() => listAlarms(), 5000)
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

async function listTasks() {
  const tasks = await waylay.tasks.list({'tags.demo':'demo-task', status: 'running'})
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

async function listAlarms() {
  const alarms = await waylay.alarms.search({status:'ACTIVE'})
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
  $("#cover").hide()
  $('#formConnect').show()
  $('#app').hide()
  $('.login-error').hide()

  $('#btnFormConnect').click(function () {
    login()
  })

  $('#btnLogout').click(function () {
    delete waylay 
    window.location.reload();
  })

  $('#load-btn').on('click', function(e) {
    const resource = $('#resource').val()
    getMetrics(resource)
    .then(metrics => {
      loadData(resource, metrics)
      $('#metricSelect').find('option').remove()
      metrics.forEach(metric => {
        $('#metricSelect').append($('<option>', { 
            value: metric,
            text : metric 
        }))
      })
    })
  })
  
  $('#notify-btn').on('click', function(e) {
    const resource = $('#resource').val()
    startNotificationTask(resource)
    .then(task=>{
      if(task.created_before) {
        showMessage('Notification task started before ' + task.ID)
      } else {
        showMessage('started a notification task ' + task.ID)
        listTasks()
      }
    })
  })

  $('#task-btn').on('click', function(e) {
    const resource = $('#resource').val()
    const metric = $('#metricSelect').val()
    const lowerLimit = parseFloat($('#lowerLimit').val())
    const upperLimit = parseFloat($('#upperLimit').val())
    const type = $('#type').val()
    if(metric === undefined || metric == '') {
      showMessage("please select a metric")
    } else if(lowerLimit > upperLimit) {
      showMessage("the upper limit must be bigger or equal to the lower limit")
    } else {
      if(type === 'reactive') {
        startStreamTask(resource, metric, lowerLimit, upperLimit)
        .then(task=> {
          if(task.created_before) {
            showMessage('The task with the same config already started before ' + task.ID)
          } else {
            showMessage('started a reactive task ' + task.ID)
            listTasks()
          }
        })
      } else {
        const duration = $('#time :selected').val()
        startPollingTask(resource, metric, duration, lowerLimit, upperLimit)
        .then(task=> {
          if(task.created_before) {
            showMessage('The task with the same config already started before ' + task.ID)
          } else {
            showMessage('started a polling task ' + task.ID)
            listTasks()
          }
        })
      }
    }
  })

  $('#resource').autocomplete({
    source: function(request, response) {
      waylay.resources.search({
       filter: request.term,
       skip: 0,
       limit: 100
     })
      .then(data => {
        var resource = data.values.map(x=> {return x.id})
        response(resource)
      })
    },
    minLength: 1,
    cacheLength: 0,
    select: function(event, ui) {
      getMetrics(ui.item.value)
      .then(metrics => {
        //loadData(resource, metrics)
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
    const res = await waylay.data.getSeries(resource, { metadata: true })
    const metrics = res.map( x => {return x.name })
    return metrics
  }

  async function loadData(resource, metrics) {
    const time = $('#time :selected').val()
    const from = (moment().unix() - moment.duration(time).asSeconds()) * 1000
    var ts = []
    var i = 0
    for (const metric of metrics) {
      var data = await waylay.data.getMetricSeries(resource, encodeURI(metric), {from})
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

  // function getStreamUseCaseID(guid) {
  //   const uid = JSON.parse(atob(guid))
  // }

  async function startStreamTask(resource, metric = 'temperature', lowerLimit=0, upperLimit=10) {
    const tasks = await waylay.tasks.list({'tags.use_case':createStreamUseCaseID(resource, metric, lowerLimit, upperLimit), status: 'running'})
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
          name: 'example-reactive-task',
          tags :{
            demo: 'demo-task',
            use_case: createStreamUseCaseID(resource, metric, lowerLimit, upperLimit)
          }
        }
      }
      return await waylay.tasks.create(task, {})
    }
   
  }

  async function startPollingTask(resource, metric = 'temperature', from="PT30M", lowerLimit=0, upperLimit=10) {
    const tasks = await waylay.tasks.list({'tags.use_case':createStreamUseCaseID(resource, metric, from, lowerLimit, upperLimit), status: 'running'})
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
          name: 'example-polling-task',
          tags :{
            demo: 'demo-task',
            use_case: createStreamUseCaseID(resource, metric, from, lowerLimit, upperLimit)
          }
        }
      }
      return await waylay.tasks.create(task, {})
    }
    
  }

  async function startNotificationTask(resource, plugin = 'mandrillMail') {
    const tasks = await waylay.tasks.list({'tags.use_case':createStreamUseCaseID(resource, plugin), status: 'running'})
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
            statesTrigger: ["Created", "Occurred again", "Updated"]
          }
        ],
        task: { 
          resource: resource,
          type: 'reactive', 
          start: true, 
          name: 'notification-task',
          tags :{
            demo: 'demo-task',
            use_case: createStreamUseCaseID(resource, plugin)
          }
        }
      }
      return await waylay.tasks.create(task, {})
    }
  }
})

