/*
you need to provide list of templates (playbooks) that you want to combine together
each playbook should have a tags.targetNode and tags.targetState, if not, assumtion is that
the last node in the template (by x position) will be a targetNode, with first state as
being the end goal. For the start node, we will take the first left node in the graph.
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

  /*  
  playbook_variables is list of variables for playbooks (in the same format): 
  [[{name:'threshold', value:12}, {name:'metric', value:'temperature'}]]. If not specified 
  playbook defaults will be in use. If the list is not empty, must be of the same size as playbooks.
  Additionaly, playbook_variables can hold as well a resource name in this format {name: 'resource', value: 'foobar'}. 
  The result of the task runner will either be alarm on the task Id (alarmOnTask) or on the resource itself, for which both alarmOnTask
  must be false and resource must be defined
  */
  async startFromPlaybooks(name, playbooks, playbook_variables = [], resource, tags, alarmOnTask = true) {
    if(playbook_variables.length === 0 ) {
      playbook_variables = new Array(playbooks.length)
    } 
    if(playbook_variables.length !== playbooks.length){
      throw new Error(`playbook_variables ${playbook_variables.length} not the same as playbooks length ${ playbooks.length}`)
    }
    
    let variables = {}
    let alarmId = '${task.TASK_ID}'
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
    if(resource !== undefined && resource !== '') {
      task.task.resource = resource
      if(!alarmOnTask)
        alarmId = resource
    }
      

    let targetNodes = []
    let i = 0
    let x_offset = 0
    let periodic_frequency = 0
    for(i in playbooks){
      let playbook = await client.templates.get(playbooks[i], {format: "simplified"})
      let prefix = "p" + i + "_"
      let playbook_variable = playbook_variables[i]
      let playbook_resource = playbook_variable.find(x => x.name === 'resource')
      if(playbook_resource)
        playbook_resource = playbook_resource.value

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

      let nodeLabels = (playbook.sensors?.map(s => s.label) ?? []).concat(playbook.relations?.map(r => r.label) ?? [])
      if (!nodeLabels?.includes(targetNode)) {
        throw new Error(`Did not find targetNode ${targetNode} in playbook ${playbook.name} `)
      }

      const x_offset_ = lastNode.position[0] + 10

      if(x_offset < x_offset_){
        x_offset = x_offset_
      }

      let pl_StartSensor =  playbook.sensors[index]
      if(playbook.taskDefaults?.type === "periodic"){
        task.task.type = "periodic"
        if(periodic_frequency === 0) {
          periodic_frequency = playbook.taskDefaults.frequency
          task.task.pollingInterval = periodic_frequency
          pl_StartSensor.tickTrigger = true
          pl_StartSensor.dataTrigger = false
          pl_StartSensor.evictionTime = (periodic_frequency - 1 ) * 1000
        } else if(periodic_frequency !== playbook.taskDefaults.frequency){
          //this playbook is not with the same polling frequency, hence we need to start it with its own clock
          pl_StartSensor.tickTrigger = true
          pl_StartSensor.dataTrigger = false
          pl_StartSensor.pollingPeriod = playbook.taskDefaults.frequency * 1000
          pl_StartSensor.evictionTime = (playbook.taskDefaults.frequency - 1 ) * 1000
        }
      } else if(playbook.taskDefaults?.type === "reactive"){
        pl_StartSensor.tickTrigger = false
        pl_StartSensor.dataTrigger = true
        pl_StartSensor.evictionTime = 1000
      } else if(playbook.taskDefaults?.type === "scheduled") {
        task.task.type = "scheduled"
        task.task.cron = playbook.taskDefaults.cron
      } else { //default is reactive task
        pl_StartSensor.tickTrigger = false
        pl_StartSensor.dataTrigger = true
      }
      
      if(playbook.variables) {
        playbook.variables.forEach( varDecl => {
          let variable = playbook_variable.find(v => v.name === varDecl.name)
          variables[prefix + varDecl.name] = variable ? variable.value : varDecl.defaultValue
        })
      }

      this.updateWithPrefix(task, playbook, prefix, i, y_offset, playbook_resource)
      targetNodes.push({
        node: prefix + targetNode,
        state: targetState
      })
    }
    const resultNetwork = this.createTaskResultGate(targetNodes, x_offset + 200, alarmId)
    task.relations = task.relations.concat(resultNetwork.relations)
    task.sensors = task.sensors.concat(resultNetwork.sensors)
    task.triggers = task.triggers.concat(resultNetwork.triggers)
    task.task.variables = variables

    return await this.client.tasks.create(task, {})
  }

  updateWithPrefix(task, playbook, prefix, i, y_offset, playbook_resource) {
    let k = 0
    let labels = playbook.sensors.map(sensor => sensor.label)

    for(k in playbook.sensors) {
      let sensor = playbook.sensors[k]
      sensor.label = prefix + sensor.label
      if(i > 0){
        sensor.position[1] = sensor.position[1] + y_offset
      }
      if(playbook_resource !== undefined && sensor.resource !== undefined) {
        sensor.resource =  sensor.resource.replaceAll('task.RESOURCE', playbook_resource)
        sensor.resource =  sensor.resource.replaceAll('task.resource', playbook_resource)
        sensor.resource =  sensor.resource.replaceAll('$', playbook_resource)
      }

      labels.forEach((label,i)=> {
        if(sensor.properties) {
          for (const [key, value] of Object.entries(sensor.properties)) {
            sensor.properties[key] = sensor.properties[key].replaceAll('{nodes.' + label, '{nodes.' + prefix + label)
            sensor.properties[key] = sensor.properties[key].replaceAll('{?nodes.' + label, '{?nodes.' + prefix + label)
            if(i===0) //only once, since this is not label specific
              sensor.properties[key] = sensor.properties[key].replaceAll('{variables.' , '{variables.' + prefix)
          }
        }
      })
    }
    if(playbook.triggers) {
      playbook.triggers = playbook.triggers.map( x=> { return {sourceLabel: prefix + x.sourceLabel, destinationLabel: prefix + x.destinationLabel}})
    } else {
      playbook.triggers = []
    }
    for(k in playbook.relations){
      let relation = playbook.relations[k]
      relation.label = prefix + relation.label
      relation.parentLabels = relation.parentLabels.map(x=> prefix + x)
      if(i > 0){
        relation.position[1] = relation.position[1] + y_offset
      }
    }
    task.sensors = task.sensors.concat(playbook.sensors)
    task.triggers = task.triggers.concat(playbook.triggers)
    if(playbook.relations && playbook.relations.length > 0)
      task.relations = task.relations.concat(playbook.relations)
  }

  async  checkStatus(id) {
    const task = await this.client.tasks.get(id)
    var node = task.nodes.find(x => x.label === 'PROBLEM')
    const problemGATE =  (node !== undefined && node.mostLikelyState.state === 'TRUE' && node.mostLikelyState.probability === 1)
    const alarms =  await this.client.alarms.search({source: id})
    return alarms.alarms.length > 0 || problemGATE
  }

  createTaskResultGate(nodes, x_offset, resource = '${task.TASK_ID}') {
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
        resource
      },
      position: [ x_offset + 200, 100 ]
    },
    {
      label: clearAlarmPlug.label,
      name: clearAlarmPlug.name,
      version: clearAlarmPlug.version,
      properties: {
        type: 'Taks result',
        resource
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

    async subscribePlaybooksToTask(id, name, playbooks, variables, states = ["Created", "Occurred again"], tags) {
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
        let prefix = "p" + i + "_"

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
          statesTrigger: states
        })
      })
      return await this.client.tasks.create(task, {})
    }
  }
