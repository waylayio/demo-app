function createStreamUseCaseID(resource, metric, lowerLimit, upperLimit) {
  return btoa(JSON.stringify({resource, metric, lowerLimit, upperLimit}))
}

function createNotificationUseCaseID(resource, states, plugin) {
  return btoa(JSON.stringify({resource, states, plugin}))
}

function createPollingUseCaseID(resource, metric, from, lowerLimit, upperLimit) {
  return btoa(JSON.stringify({resource, metric, from, lowerLimit, upperLimit}))
}

async function startStreamTask(resource, metric = 'temperature', lowerLimit=0, upperLimit=10, name = 'example reactive task', suffix = '') {
  const use_case_id = createStreamUseCaseID(resource, metric, lowerLimit, upperLimit)
  const tasks = await client.tasks.list({'tags.use_case': use_case_id, status: 'running'})
  if(tasks.length > 0) {
    const task = {...tasks[0], created_before: true}
    return task
  } else {
    const value = '${streamdata.' + metric + '}'
    const inRangePlug = {...getPlugin('inRange'), label: 'inRange' + suffix}
    const createAlarmPlug = {...getPlugin('createAlarm'), label: 'createAlarm' + suffix}
    const clearAlarmPlug = {...getPlugin('clearAlarm'), label: 'clearAlarm' + suffix}
    const conditionPlug = {...getPlugin('condition'), label: 'problem' + suffix}

    var task = {
      sensors: [
        {
          label: inRangePlug.label,
          name: inRangePlug.name,
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
          label: conditionPlug.label,
          name: conditionPlug.name,
          version: conditionPlug.version,
          properties: {
            condition: '$${nodes.' + inRangePlug.label + '.state} === "In Range" '
          },
          position: [ 800, 150 ]
        },
        {
          label: createAlarmPlug.label,
          name: createAlarmPlug.name,
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
          label: clearAlarmPlug.label,
          name: clearAlarmPlug.name,
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
          sourceLabel: inRangePlug.label,
          destinationLabel: conditionPlug.label
        },
        {
          sourceLabel: inRangePlug.label,
          destinationLabel: createAlarmPlug.label,
          statesTrigger: [ 'Above' , 'Below']
        },
        {
          sourceLabel: inRangePlug.label,
          destinationLabel: clearAlarmPlug.label,
          stateChangeTrigger: {
            stateFrom: "*",
            stateTo: 'In Range'
          }
        }
      ],
      task: {
        resource, name,
        type: 'reactive',
        start: true,
        tags :{
          demo: 'demo-task',
          use_case: use_case_id
        }
      }
    }
    return await client.tasks.create(task, {})
  }
}

async function startPollingTask(resource, metric = 'temperature', duration="PT30M", aggregate='mean', lowerLimit=0, upperLimit=10, name = 'example polling task', suffix = '') {
  const use_case_id = createPollingUseCaseID(resource, metric, duration, aggregate, lowerLimit, upperLimit)
  const tasks = await client.tasks.list({'tags.use_case': use_case_id, status: 'running'})
  if(tasks.length > 0) {
    const task = {...tasks[0], created_before: true}
    return task
  } else {
    const pollingInterval = moment.duration(duration).asSeconds() / 2
    const getMetricValuePlug = {...getPlugin('getMetricValue'), label: 'getMetricValue' + suffix}
    const conditionPlug = {...getPlugin('condition'), label: 'condition' + suffix}
    const createAlarmPlug = {...getPlugin('createAlarm'), label: 'createAlarm' + suffix}
    const clearAlarmPlug = {...getPlugin('clearAlarm'), label: 'clearAlarm' + suffix}
    var task = {
      sensors: [
        {
          label: getMetricValuePlug.label,
          name: getMetricValuePlug.name,
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
          label: conditionPlug.label,
          name: conditionPlug.name,
          version: conditionPlug.version,
          properties: {
            condition: '${nodes.' + getMetricValuePlug.label + '.rawData.result} > ' + upperLimit + ' || ${nodes.' + getMetricValuePlug.label + '.rawData.result}  < ' + lowerLimit
          },
          position: [ 350, 250 ]
        },
        {
          label: 'problem',
          name: conditionPlug.name,
          version: conditionPlug.version,
          properties: {
            condition: '$${nodes.' + conditionPlug.label + '.state} === "In Range" '
          },
          position: [ 800, 150 ]
        },
        {
          label: createAlarmPlug.label,
          name: createAlarmPlug.name,
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
          label: clearAlarmPlug.label,
          name: clearAlarmPlug.name,
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
          sourceLabel: getMetricValuePlug.label,
          destinationLabel: conditionPlug.label,
          statesTrigger: [ 'Collected' ]
        },
        {
          sourceLabel: conditionPlug.label,
          destinationLabel: 'problem'
        },
        {
          sourceLabel: conditionPlug.label,
          destinationLabel: createAlarmPlug.label,
          statesTrigger: [ 'True' ]
        },
        {
          sourceLabel: 'condition',
          destinationLabel: clearAlarmPlug.label,
          stateChangeTrigger: {
            stateFrom: "*",
            stateTo: 'False'
          }
        }
      ],
      task: {
        resource, name,
        type: 'periodic',
        pollingInterval: pollingInterval,
        start: true,
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
