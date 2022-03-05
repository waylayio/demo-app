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
    const conditionPlug = getPlugin('condition')

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
          label: 'problem',
          name: 'condition',
          version: conditionPlug.version,
          properties: {
            condition: '$${nodes.inRange.state} === "In Range" '
          },
          position: [ 800, 150 ]
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
            position: [ 800, 300 ]
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
          destinationLabel: 'problem'
        },
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

async function startPollingTask(resource, metric = 'temperature', duration="PT30M", aggregate='mean', lowerLimit=0, upperLimit=10, name = 'example polling task') {
  const use_case_id = createPollingUseCaseID(resource, metric, duration, aggregate, lowerLimit, upperLimit)
  const tasks = await client.tasks.list({'tags.use_case': use_case_id, status: 'running'})
  if(tasks.length > 0) {
    const task = {...tasks[0], created_before: true}
    return task
  } else {
    const pollingInterval = moment.duration(duration).asSeconds() / 2
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
            resource,
            metric,
            duration,
            aggregate
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
          label: 'problem',
          name: 'condition',
          version: conditionPlug.version,
          properties: {
            condition: '$${nodes.condition.state} === "In Range" '
          },
          position: [ 800, 150 ]
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
          position: [ 800, 300 ]
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
          destinationLabel: 'problem'
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
