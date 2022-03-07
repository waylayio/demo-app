function prepareStream(resource, metric = 'temperature', lowerLimit=0, upperLimit=10, targetNode = 'problem', iter = 0) {
  const suffix = iter === 0 ? '' : '' + iter
  const value = '${streamdata.' + metric + '}'
  const inRangePlug = {...getPlugin('inRange'), label: 'inRange' + suffix}
  const createAlarmPlug = {...getPlugin('createAlarm'), label: 'createAlarm' + suffix}
  const clearAlarmPlug = {...getPlugin('clearAlarm'), label: 'clearAlarm' + suffix}
  //this node will hold a result
  const conditionPlug = {...getPlugin('condition'), label: targetNode}

  const x_offset = 0//iter * 100
  const y_offset = iter * 400
  const network = {
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
        position: [ 150 + x_offset, 150 + y_offset]
      },
      {
        label: conditionPlug.label,
        name: conditionPlug.name,
        version: conditionPlug.version,
        properties: {
          condition: '$${nodes.' + inRangePlug.label + '.state} === "In Range" '
        },
        position: [ 800 + x_offset, 150 + y_offset]
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
          position: [ 800 + x_offset, 300 + y_offset]
        },
        {
        label: clearAlarmPlug.label,
        name: clearAlarmPlug.name,
        version: clearAlarmPlug.version,
        properties: {
          type: 'Out of range ' + metric,
          resource: resource
        },
        position: [ 800 + x_offset, 450 + y_offset]
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
    ]
  }
  return network
}

function preparePolling(resource, metric = 'temperature', duration="PT30M", aggregate='mean', lowerLimit=0, upperLimit=10, targetNode = 'problem', iter = 0) {
  const suffix = iter === 0 ? '' : '' + iter
  const pollingInterval = moment.duration(duration).asMilliseconds() / 2
  const getMetricValuePlug = {...getPlugin('getMetricValue'), label: 'getMetricValue' + suffix}
  const conditionPlug = {...getPlugin('condition'), label: 'condition' + suffix}
  const createAlarmPlug = {...getPlugin('createAlarm'), label: 'createAlarm' + suffix}
  const clearAlarmPlug = {...getPlugin('clearAlarm'), label: 'clearAlarm' + suffix}
  const x_offset = 0//iter * 100
  const y_offset = iter * 400
  const network = {
    sensors: [
      {
        label: getMetricValuePlug.label,
        name: getMetricValuePlug.name,
        version: getMetricValuePlug.version,
        dataTrigger: false,
        tickTrigger: true,
        pollingPeriod: pollingInterval,
        properties: {
          resource,
          metric,
          duration,
          aggregate
        },
        position: [ 150 + x_offset, 150 + y_offset]
      },
      {
        label: conditionPlug.label,
        name: conditionPlug.name,
        version: conditionPlug.version,
        properties: {
          condition: '${nodes.' + getMetricValuePlug.label + '.rawData.result} < ' + upperLimit + ' || ${nodes.' + getMetricValuePlug.label + '.rawData.result}  > ' + lowerLimit
        },
        position: [ 350 + x_offset, 250 + y_offset]
      },
      {
        label: targetNode,
        name: conditionPlug.name,
        version: conditionPlug.version,
        properties: {
          condition: '$${nodes.' + conditionPlug.label + '.state} === "True" '
        },
        position: [ 800 + x_offset, 150 + y_offset]
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
        position: [ 800 + x_offset, 300 + y_offset]
      },
      {
        label: clearAlarmPlug.label,
        name: clearAlarmPlug.name,
        version: clearAlarmPlug.version,
        properties: {
          type: 'Out of range ' + metric,
          resource: resource
        },
        position: [ 800 + x_offset, 450 + y_offset]
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
        destinationLabel: targetNode
      },
      {
        sourceLabel: conditionPlug.label,
        destinationLabel: createAlarmPlug.label,
        statesTrigger: [ 'False' ]
      },
      {
        sourceLabel: conditionPlug.label,
        destinationLabel: clearAlarmPlug.label,
        stateChangeTrigger: {
          stateFrom: "*",
          stateTo: 'True'
        }
      }
    ]
  }
  return network
}

function createTaskResultGate(nodes) {
  const createAlarmPlug = {...getPlugin('createAlarm'), label: 'createResultAlarm'}
  const clearAlarmPlug = {...getPlugin('clearAlarm'), label: 'clearResultAlarm'}
  const relations = [{
    label: 'RESULT',
    type: 'AND',
    parentLabels: nodes,
    combinations: [nodes.map( () => 'True')],
    position: [ 1000 , 150]
  }]
  const sensors = [{
    label: createAlarmPlug.label,
    name: createAlarmPlug.name,
    version: createAlarmPlug.version,
    properties: {
      text: 'Result',
      severity: 'CRITICAL',
      type: 'Taks result',
      resource: '${task.ID}'
      },
      position: [ 1200, 100 ]
    },
    {
    label: clearAlarmPlug.label,
    name: clearAlarmPlug.name,
    version: clearAlarmPlug.version,
    properties: {
      type: 'Taks result',
      resource: '${task.TASK_ID}'
    },
    position: [ 1200, 300 ]
  }]
  const triggers = [
    {
      sourceLabel: 'RESULT',
      destinationLabel: createAlarmPlug.label,
      statesTrigger: [ 'FALSE']
    },
    {
      sourceLabel: 'RESULT',
      destinationLabel: clearAlarmPlug.label,
      statesTrigger: [ 'TRUE']
    }]
  return  {relations, sensors, triggers}
}

async function startAllTasks(triggers) {
  var task =  {
    sensors: [],
    triggers: [],
    task: {
      type: 'reactive',
      start: true,
      name: '',
      tags: {
        demo: 'demo-task'
      }
    }
  }
  var i = 0
  var nodes = []
  triggers.forEach(t => {
    var network
    if(t.type === 'reactive')
      network = prepareStream(t.resource, t.metric, t.lowerLimit, t.upperLimit, t.name, i++)
    else
      network = preparePolling(t.resource, t.metric, t.polling_window, t.aggregate, t.lowerLimit, t.upperLimit, t.name, i++)
    task.sensors = task.sensors.concat(network.sensors)
    task.triggers = task.triggers.concat(network.triggers)
    nodes.push(t.name)
  })
  const resultNetwork = createTaskResultGate(nodes)
  task.relations = resultNetwork.relations
  task.sensors = task.sensors.concat(resultNetwork.sensors)
  task.triggers = task.triggers.concat(resultNetwork.triggers)
  const result = await client.tasks.create(task)
  return result
}

async function checkIfProblem(id) {
  const task = await client.tasks.get(id)
  var node = task.nodes.find(x => x.name === 'RESULT')
  return (node && node.mostLikelyState.state === 'FALSE' && node.mostLikelyState.probability === 1)
}

async function startNotificationTask(resource, states=["Created", "Occurred again"], plugin = 'mandrillMail', name = 'notification task') {
  const alarmEventSensorPlug = getPlugin('AlarmEventSensor')
  const notificationPlug = getPlugin(plugin)
  const task = {
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
      resource, name,
      type: 'reactive',
      start: true,
      tags :{
        demo: 'demo-task',
        use_case: use_case_id,
        type: 'notification'
      }
    }
  }
  return await client.tasks.create(task, {})
}
