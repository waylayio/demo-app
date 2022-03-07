class RuleBuilder {
  constructor(client, plugins) {
    this.client = client
    this.plugins = plugins
  }

  getPlugin(name) {
    return this.plugins.find(x=> x.name === name)
  }

  prepareStream(trigger, iter = 0) {
    const { resource, metric = 'temperature', lowerLimit=0, upperLimit=10, targetNode = 'problem' } = trigger
    const suffix = iter === 0 ? '' : '' + iter
    const value = '${streamdata.' + metric + '}'
    const inRangePlug = {...this.getPlugin('inRange'), label: 'inRange' + suffix}
    //this node will hold a result
    const conditionPlug = {...this.getPlugin('condition'), label: targetNode}

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
          position: [ 350 + x_offset, 150 + y_offset]
        }
      ],
      triggers: [
        {
          sourceLabel: inRangePlug.label,
          destinationLabel: conditionPlug.label
        }
      ]
    }
    return network
  }

  preparePolling(trigger, iter = 0) {
    const { resource, metric = 'temperature', lowerLimit=0, upperLimit=10, targetNode = 'problem', polling_window, aggregate = mean} = trigger
    const suffix = iter === 0 ? '' : '' + iter
    const pollingInterval = moment.duration(polling_window).asMilliseconds() / 2
    const getMetricValuePlug = {...this.getPlugin('getMetricValue'), label: 'getMetricValue' + suffix}
    const conditionPlug = {...this.getPlugin('condition'), label: targetNode}
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
            polling_window,
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
        }
      ],
      triggers: [
       {
          sourceLabel: getMetricValuePlug.label,
          destinationLabel: conditionPlug.label,
          statesTrigger: [ 'Collected' ]
        }
      ]
    }
    return network
  }

  createTaskResultGate(nodes) {
    const createAlarmPlug = {...this.getPlugin('createAlarm'), label: 'createResultAlarm'}
    const clearAlarmPlug = {...this.getPlugin('clearAlarm'), label: 'clearResultAlarm'}
    const relations = [{
      label: 'RESULT',
      type: 'AND',
      parentLabels: nodes,
      combinations: [nodes.map( () => 'True')],
      position: [ 800 , 150]
    }]
    const sensors = [{
      label: createAlarmPlug.label,
      name: createAlarmPlug.name,
      version: createAlarmPlug.version,
      properties: {
        text: 'Result',
        severity: 'CRITICAL',
        type: 'Taks result',
        resource: '${task.TASK_ID}'
        },
        position: [ 1000, 100 ]
      },
      {
      label: clearAlarmPlug.label,
      name: clearAlarmPlug.name,
      version: clearAlarmPlug.version,
      properties: {
        type: 'Taks result',
        resource: '${task.TASK_ID}'
      },
      position: [ 1000, 300 ]
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

  async startTaskForTriggers(name='Task builder', triggers) {
    var task =  {
      sensors: [],
      triggers: [],
      task: {
        type: 'reactive',
        start: true,
        name
      }
    }
    var i = 0
    var nodes = []
    triggers.forEach(trigger => {
      var network
      if(trigger.type === 'reactive')
        network = this.prepareStream(trigger, i++)
      else
        network = this.preparePolling(trigger, i++)
      task.sensors = task.sensors.concat(network.sensors)
      task.triggers = task.triggers.concat(network.triggers)
      nodes.push(trigger.targetNode)
    })
    task.task.tags = {
        demo: 'demo-task',
        targetNodes: nodes
    }
    const resultNetwork = this.createTaskResultGate(nodes)
    task.relations = resultNetwork.relations
    task.sensors = task.sensors.concat(resultNetwork.sensors)
    task.triggers = task.triggers.concat(resultNetwork.triggers)
    const result = await this.client.tasks.create(task)
    return result
  }

  async checkStatus(id) {
    // var node = task.nodes.find(x => x.name === 'RESULT')
    // return (node !== undefined && node.mostLikelyState.state === 'FALSE' && node.mostLikelySta`te.probability === 1)
    const task = await this.client.tasks.get(id)
    const alarms =  await this.client.alarms.search({source: id})
    const problem = alarms.alarms.length > 0
    const nodes = task.tags.targetNodes || []
    const targetNodes = nodes.map(node => {
      let n = task.nodes.find(x => x.name === node)
      return {
        name: n.name,
        problem: n.mostLikelyState.state === 'FALSE' && n.mostLikelyState.probability === 1
      }
    })
    return { problem, targetNodes }
  }

  async startNotificationTask(resource, states=["Created", "Occurred again"], plugin = 'mandrillMail', name = 'notification task') {
    const alarmEventSensorPlug = this.getPlugin('AlarmEventSensor')
    const notificationPlug = this.getPlugin(plugin)
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
          type: 'notification'
        }
      }
    }
    return await this.client.tasks.create(task, {})
  }
}
