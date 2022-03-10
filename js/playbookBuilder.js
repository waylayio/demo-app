/*
you need to provide list of templates (playbooks) that you want to combine together
each playbook should have a tags.targetNode and tags.targetState, if not, assumtion is that
the last node in the template (by x position) will be a targetNode, with first state as
being the end goal.
For the start node, we will take the first left node in the graph.
*/
class RulePlaybooksBuilder {

  constructor(client, templates, variables, resource) {
    this.client = client
    this.templates = templates
    this.variables = variables
    this.resource = resource
  }

  // TODO: if there is a polling task, and every polling playbook has the same
  // frequency, then make the final task periodic, and don't add the polling to the first node
  async startPlaybook(name= "playbook run", tags) {
    this.plugins = await client.sensors.list()
    this.playbook = {
      task: {
        name, tags,
        resource: this.resource,
        variables: this.variables,
        type: 'reactive',
        start: true
      },
      sensors: [],
      relations: [],
      triggers: []
    }
    let targetNodes = []
    let i,k,j = 0
    let x_offset = 0
    for(i in this.templates){
      let playbook = await client.templates.get(this.templates[i], {format: "simplified"})
      let prefix = playbook.name + "_"

      const startSensor = playbook.sensors.reduce((prev, curr) => {
        return prev.position[0] < curr.position[0] ? prev : curr
      })
      const index = playbook.sensors.findIndex(s => s.label === startSensor.label)
      const y_offset = playbook.sensors.reduce((prev, curr) => {
        return prev.position[1] > curr.position[1] ? prev : curr
      }).position[1] + 300

      const lastNode = playbook.sensors.reduce((prev, curr) => {
        return prev.position[0] > curr.position[0] ? prev : curr
      })
      const lastNodePlugin = this.getPlugin(lastNode.name)
      const targetNode = playbook.taskDefaults.tags.targetNode || lastNode.label
      const targetState = playbook.taskDefaults.tags.targetState || lastNodePlugin.states[0]

      const x_offset_ = lastNode.position[0] + 10

      if(x_offset < x_offset_){
        x_offset = x_offset_
      }

      if(playbook.taskDefaults.type === "periodic"){
        // TODO: see comments at the top
        playbook.sensors[index].tickTrigger = true
        playbook.sensors[index].dataTrigger = false
        playbook.sensors[index].pollingPeriod = playbook.taskDefaults.frequency * 1000
        playbook.sensors[index].evictionTime = (playbook.taskDefaults.frequency - 1 ) * 1000
      } else if(playbook.taskDefaults.type === "reactive"){
        playbook.sensors[index].tickTrigger = false
        playbook.sensors[index].dataTrigger = true
        playbook.sensors[index].evictionTime = 1000
      } else {
        playbook.sensors[index].tickTrigger = true
        playbook.sensors[index].dataTrigger = false
        playbook.sensors[index].duration = 900 * 1000
        playbook.sensors[index].evictionTime = (900 - 1 ) * 1000
      }

      for(k in playbook.sensors) {
        playbook.sensors[k].label = prefix + playbook.sensors[k].label
        if(i > 0){
          playbook.sensors[k].position[1] = playbook.sensors[k].position[1] + y_offset
        }
      }

      playbook.triggers = playbook.triggers.map( x=> { return {sourceLabel: prefix + x.sourceLabel, destinationLabel: prefix + x.destinationLabel}})

      for(k in playbook.relations){
        playbook.relations[k].label = prefix + playbook.relations[k].label
        playbook.relations[k].parentLabels = playbook.relations[k].parentLabels.map(x=> prefix + x)
        if(i > 0){
          playbook.relations[k].position[1] = playbook.relations[k].position[1] + y_offset
        }
      }
      targetNodes.push({
        node: prefix + targetNode,
        state: targetState
      })
      this.playbook.sensors = this.playbook.sensors.concat(playbook.sensors)
      this.playbook.triggers = this.playbook.triggers.concat(playbook.triggers)
      if(playbook.relations && playbook.relations.length > 0)
      this.playbook.relations = this.playbook.relations.concat(playbook.relations)
    }
    const resultNetwork = this.createTaskResultGate(targetNodes, x_offset + 200)
    this.playbook.relations = this.playbook.relations.concat(resultNetwork.relations)
    this.playbook.sensors = this.playbook.sensors.concat(resultNetwork.sensors)
    this.playbook.triggers = this.playbook.triggers.concat(resultNetwork.triggers)

    return await this.client.tasks.create(this.playbook, {})
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

    getPlugin(name) {
      return this.plugins.find(x=> x.name === name)
    }
  }
