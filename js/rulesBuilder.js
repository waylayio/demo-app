class RuleBuilder {

  constructor(client, plugins) {
    this.client = client
    this.plugins = plugins
  }

  static async initialize(client) {
    let plugins = await client.sensors.list()
    return new RuleBuilder(client, plugins)
  }

  getPlugin(name) {
    return this.plugins.find(x=> x.name === name)
  }

  /*
    stream template that has a threshold crossing lower and upper boundaries
    if you want to make it only the higher or lower threshold rule, you make one of these
    two values very high. E.g. if the lowerLimit is negative and INFINIT BIG value, and upperLimit 20,
    then it is safe to assumet that the rule will trigger only when incoming value is above 20.
    TRUE state means that the condition is out of boundaries
 */
  prepareStream(trigger, iter = 0) {
    const { resource, metric = 'temperature', lowerLimit=0, upperLimit=10, targetNode = 'problem' } = trigger
    const suffix = iter === 0 ? '' : '' + iter
    const value = '${streamdata.' + metric + '}'
    const inRangePlug = {...this.getPlugin('inRange'), label: 'inRange' + suffix}
    //this node will hold a result, and it will be TRUE id the issue is found
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
          resource,
          evictionTime: 1000,
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
            condition: '$${nodes.' + inRangePlug.label + '.state} !== "In Range" '
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

  /*
    polling template with the same boundary conditions, but it also has polling window - duration,
    and statistical inputs, such as the aggregation type (mean, nax etc..).
    TRUE state means that the conditio is out of boudnaries
  */
  preparePolling(trigger, iter = 0) {
    const { resource, metric = 'temperature', lowerLimit=0, upperLimit=10, targetNode = 'problem', polling_window, aggregate = mean} = trigger
    const suffix = iter === 0 ? '' : '' + iter
    const pollingInterval = moment.duration(polling_window).asMilliseconds() / 2
    const evictionTime = 2 * pollingInterval
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
          evictionTime: evictionTime,
          properties: {
            resource, metric, aggregate,
            duration : polling_window,
          },
          position: [ 150 + x_offset, 150 + y_offset]
        },
        {
          label: conditionPlug.label,
          name: conditionPlug.name,
          version: conditionPlug.version,
          properties: {
            condition: '${nodes.' + getMetricValuePlug.label + '.rawData.result} > ' + upperLimit + ' || ${nodes.' + getMetricValuePlug.label + '.rawData.result}  < ' + lowerLimit
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

/*
can be used to process events, such as camera events etc, where in the JSON part expression
you need to specity the condition under which the target node will be in the TRUE state
*/
  prepareEventStream(trigger, iter = 0) {
    const { resource, targetNode = 'problem', path } = trigger
    const suffix = iter === 0 ? '' : '' + iter
    const conditionPlug = {...this.getPlugin('condition'), label: targetNode}
    const streamPlug = {...this.getPlugin('stream'), label: 'stream' + suffix}
    const x_offset = 0//iter * 100
    const y_offset = iter * 400

    const network = {
      sensors: [
        {
          label: streamPlug.label,
          name: streamPlug.name,
          version: streamPlug.version,
          dataTrigger: true,
          tickTrigger: false,
          resource,
          evictionTime: 1000,
          position: [ 150 + x_offset, 150 + y_offset]
        },
        {
          label: conditionPlug.label,
          name: conditionPlug.name,
          version: conditionPlug.version,
          properties: {
            condition: '(() => {\n let data = $${?nodes.'+ streamPlug.label + '.rawData.stream.' + path +'}\n  return data !== "" \n})()'
          },
          position: [ 350 + x_offset, 250 + y_offset]
        }
      ],
      triggers: [
       {
          sourceLabel: streamPlug.label,
          destinationLabel: conditionPlug.label,
          statesTrigger: [ 'Data' ]
        }
      ]
    }
    return network
  }

 /*
 merging all templates via the target node, and it will fire an alarm any time one
 of the networks is in the TRUE state.
 */
  createTaskResultGate(nodes, relation = 'OR', state = 'True', resource = '${task.TASK_ID}') {
    const createAlarmPlug = {...this.getPlugin('createAlarm'), label: 'createResultAlarm'}
    const clearAlarmPlug = {...this.getPlugin('clearAlarm'), label: 'clearResultAlarm'}
    const relations = [{
      label: 'PROBLEM',
      type: relation,
      parentLabels: nodes,
      combinations: [nodes.map( () => state)],
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
        resource
        },
        position: [ 1000, 100 ]
      },
      {
      label: clearAlarmPlug.label,
      name: clearAlarmPlug.name,
      version: clearAlarmPlug.version,
      properties: {
        type: 'Taks result',
        resource
      },
      position: [ 1000, 300 ]
    }]
    const triggers = [
      {
        sourceLabel: 'PROBLEM',
        destinationLabel: createAlarmPlug.label,
        statesTrigger: [ 'TRUE']
      },
      {
        sourceLabel: 'PROBLEM',
        destinationLabel: clearAlarmPlug.label,
        statesTrigger: [ 'FALSE']
      }]
    return  {relations, sensors, triggers}
  }

  async startTaskForTriggers(name='Task builder', triggers, resource, tags, alarmOnTask = true) {
    let alarmId = '${task.TASK_ID}'
    var task =  {
      sensors: [],
      triggers: [],
      task: {
        type: 'reactive',
        start: true,
        name, tags
      }
    }
    if(resource !== undefined && resource !== '') {
      task.task.resource = resource
      if(!alarmOnTask)
        alarmId = resource
    }
    var i = 0
    var nodes = []
    triggers.forEach(trigger => {
      var network
      if(trigger.type === 'reactive')
        network = this.prepareStream(trigger, i++)
      else if(trigger.type === 'periodic')
        network = this.preparePolling(trigger, i++)
      else if(trigger.type === 'event')
        network = this.prepareEventStream(trigger, i++)
      task.sensors = task.sensors.concat(network.sensors)
      task.triggers = task.triggers.concat(network.triggers)
      nodes.push(trigger.targetNode)
    })
    
    const resultNetwork = this.createTaskResultGate(nodes, 'OR', 'True', alarmId)
    task.relations = resultNetwork.relations
    task.sensors = task.sensors.concat(resultNetwork.sensors)
    task.triggers = task.triggers.concat(resultNetwork.triggers)
    const result = await this.client.tasks.create(task)
    return result
  }

/*
check the status of the running task. Since the gate genererate ALARM for a given
task id, we can simply check if that alarm is present. Other option, if the alarm
service is not present is to check if the GATE (PROBLEM) is in the state TRUE.
*/
  async checkStatus(id) {
    const task = await this.client.tasks.get(id)

    var node = task.nodes.find(x => x.name === 'PROBLEM')
    const problemGATE =  (node !== undefined && node.mostLikelyState.state === 'TRUE' && node.mostLikelyState.probability === 1)
    const alarms =  await this.client.alarms.search({source: id})
    const problem = alarms.alarms.length > 0 || problemGATE
    const nodes = task.tags.targetNodes || []
    const targetNodes = nodes.map(node => {
      let n = task.nodes.find(x => x.name === node)
      return {
        name: n.name,
        problem: n.mostLikelyState.state === 'TRUE' && n.mostLikelyState.probability === 1
      }
    })
    return { problem, targetNodes }
  }

  async startNotificationTask(resource, name = 'notification task', plugin = 'mandrillMail', states = ["Created", "Occurred again"], tags = {}) {
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
        resource, name, tags,
        type: 'reactive',
        start: true
      }
    }
    return await this.client.tasks.create(task, {})
  }
}
