/*
you need to provide list of templates (playbooks) that you want to combine together
each playbook should have a tags.targetNode and tags.targetState, if not, assumtion is that
the last node in the template (by x position) will be a targetNode, with first state as
being the end goal.
For the start node, we will take the first left node in the graph.
*/
class RulePlaybooksBuilder {

  constructor(client, plugins) {
    this.client = client
    this.plugins = plugins
  }

  static async initialize(client) {
    let plugins = await client.sensors.list()
    return new RulePlaybooksBuilder(client, plugins)
  }

  getPlugin(name) {
    return this.plugins.find(x=> x.name === name)
  }

  async startFromPlaybooks(name, playbooks, variables = {}, resource, tags) {
    let task  = {
      sensors: [],
      relations: [],
      triggers: [],
      task: {
        name, tags,
        type: 'reactive',
        start: true
      }
    }
    if(resource !== '')
      task.task.resource = resource

    let targetNodes = []
    let i = 0
    let x_offset = 0
    let periodic_frequency = 0
    for(i in playbooks){
      let playbook = await client.templates.get(playbooks[i], {format: "simplified"})
      let prefix = playbook.name + "_"

      const startSensor = playbook.sensors.reduce((prev, curr) => {
        return prev.position[0] < curr.position[0] ? prev : curr
      })
      const index = playbook.sensors.findIndex(s => s.label === startSensor.label)
      const y_offset = playbook.sensors.reduce((prev, curr) => {
        return prev.position[1] > curr.position[1] ? prev : curr
      }).position[1] + 100

      const lastNode = playbook.sensors.reduce((prev, curr) => {
        return prev.position[0] > curr.position[0] ? prev : curr
      })
      const lastNodePlugin = this.getPlugin(lastNode.name)

      const targetNode = (playbook?.tags?.targetNode) ? playbook.tags.targetNode : lastNode.label
      const targetState = (playbook.tags?.targetState) ? playbook.tags.targetState : lastNodePlugin.states[0]

      const x_offset_ = lastNode.position[0] + 10

      if(x_offset < x_offset_){
        x_offset = x_offset_
      }

      if(playbook.taskDefaults?.type === "periodic"){
        task.task.type = "periodic"
        if(periodic_frequency === 0) {
          periodic_frequency = playbook.taskDefaults.frequency
          task.task.pollingInterval = periodic_frequency
          playbook.sensors[index].evictionTime = (periodic_frequency - 1 ) * 1000
        } else if(periodic_frequency !== playbook.taskDefaults.frequency){
          //this playbook is not with the same polling frequency, hence we need to start it with its own clock
          playbook.sensors[index].tickTrigger = true
          playbook.sensors[index].dataTrigger = false
          playbook.sensors[index].pollingPeriod = playbook.taskDefaults.frequency * 1000
          playbook.sensors[index].evictionTime = (playbook.taskDefaults.frequency - 1 ) * 1000
        }
      } else if(playbook.taskDefaults?.type === "reactive"){
        playbook.sensors[index].tickTrigger = false
        playbook.sensors[index].dataTrigger = true
        playbook.sensors[index].evictionTime = 1000
      } else if(playbook.taskDefaults?.type === "scheduled") {
        task.task.type = "scheduled"
        task.task.cron = playbook.taskDefaults.cron
      } else {
        playbook.sensors[index].tickTrigger = true
        playbook.sensors[index].dataTrigger = false
        playbook.sensors[index].duration = 900 * 1000
        playbook.sensors[index].evictionTime = (900 - 1 ) * 1000
      }

      // handle missing playbook variables using the defaults
      playbook.variables.forEach( varDecl => {
        if (!variables[varDecl.name] && varDecl.defaultValue) {
          variables[varDecl.name] = varDecl.defaultValue
        }
      })

      this.updateWithPrefix(task, playbook, prefix, i, y_offset)
      targetNodes.push({
        node: prefix + targetNode,
        state: targetState
      })
    }
    const resultNetwork = this.createTaskResultGate(targetNodes, x_offset + 200)
    task.relations = task.relations.concat(resultNetwork.relations)
    task.sensors = task.sensors.concat(resultNetwork.sensors)
    task.triggers = task.triggers.concat(resultNetwork.triggers)
    task.task.variables = variables

    return await this.client.tasks.create(task, {})
  }

  updateWithPrefix(task, playbook, prefix, i, y_offset) {
    let k = 0
    let labels = playbook.sensors.map(sensor => sensor.label)

    for(k in playbook.sensors) {
      playbook.sensors[k].label = prefix + playbook.sensors[k].label
      if(i > 0){
        playbook.sensors[k].position[1] = playbook.sensors[k].position[1] + y_offset
      }

      labels.forEach(label => {
        if(playbook.sensors[k].properties) {
          for (const [key, value] of Object.entries(playbook.sensors[k].properties)) {
              playbook.sensors[k].properties[key] = playbook.sensors[k].properties[key].replaceAll('${nodes.' + label, '${nodes.' + prefix + label)
          }
        }
      })
    }

    playbook.triggers = playbook.triggers.map( x=> { return {sourceLabel: prefix + x.sourceLabel, destinationLabel: prefix + x.destinationLabel}})

    for(k in playbook.relations){
      playbook.relations[k].label = prefix + playbook.relations[k].label
      playbook.relations[k].parentLabels = playbook.relations[k].parentLabels.map(x=> prefix + x)
      if(i > 0){
        playbook.relations[k].position[1] = playbook.relations[k].position[1] + y_offset
      }
    }
    task.sensors = task.sensors.concat(playbook.sensors)
    task.triggers = task.triggers.concat(playbook.triggers)
    if(playbook.relations && playbook.relations.length > 0)
      task.relations = task.relations.concat(playbook.relations)
  }

  async checkStatus(id) {
    const task = await this.client.tasks.get(id)
    var node = task.nodes.find(x => x.label === 'PROBLEM')
    const problemGATE =  (node !== undefined && node.mostLikelyState.state === 'TRUE' && node.mostLikelyState.probability === 1)
    const alarms =  await this.client.alarms.search({source: id})
    return alarms.alarms.length > 0 || problemGATE
  }

  createTaskResultGate(nodes, x_offset) {
    const createAlarmPlug = {...this.getPlugin('createAlarm'), label: 'createResultAlarm'}
    const clearAlarmPlug = {...this.getPlugin('clearAlarm'), label: 'clearResultAlarm'}
    const relations = [{
      label: 'PROBLEM',
      type: 'OR',
      parentLabels: nodes.map(x=> x.node),
      combinations: [nodes.map((x) => x.state)],
      position: [ x_offset , 150]
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
      position: [ x_offset + 200, 100 ]
    },
    {
      label: clearAlarmPlug.label,
      name: clearAlarmPlug.name,
      version: clearAlarmPlug.version,
      properties: {
        type: 'Taks result',
        resource: '${task.TASK_ID}'
      },
      position: [ x_offset + 200, 300 ]
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

    async subscribePlaybooksToTask(id, name, playbooks, variables, tags) {
      const alarmEventSensorPlug = {...this.getPlugin('AlarmEventSensor'), label: 'AlarmEventSensor'}
      let task  = {
        sensors: [{
          label: alarmEventSensorPlug.label,
          name: alarmEventSensorPlug.name,
          version: alarmEventSensorPlug.version,
          resource: id,
          dataTrigger: false,
          tickTrigger: false,
          properties: {
            status: 'ACTIVE'
          },
          position: [ 50, 50 ]
        }],
        relations: [],
        triggers: [],
        task: {
          name, variables, tags,
          type: 'reactive',
          start: true
        }
      }
      let targetNodes = []
      let i = 0

      for(i in playbooks){
        let playbook = await client.templates.get(playbooks[i], {format: "simplified"})
        let prefix = playbook.name + "_"

        const startSensor = playbook.sensors.reduce((prev, curr) => {
          return prev.position[0] < curr.position[0] ? prev : curr
        })

        const y_offset = playbook.sensors.reduce((prev, curr) => {
          return prev.position[1] > curr.position[1] ? prev : curr
        }).position[1] + 100

        const targetNode = (playbook?.taskDefaults?.tags?.targetNode) ? playbook.taskDefaults.tags.targetNode : startSensor.label
        this.updateWithPrefix(task, playbook, prefix, i, y_offset)
        targetNodes.push(prefix + targetNode)
      }
      targetNodes.forEach((node) => {
        task.triggers.push({
          sourceLabel: alarmEventSensorPlug.label,
          destinationLabel: node,
          statesTrigger: ["Created", "Occurred again"]
        })
      })
      return await this.client.tasks.create(task, {})
    }
  }
