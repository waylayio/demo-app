//you need to provide list of templates (playbooks) that you want to combine together
class RulePlaybooksBuilder {

  constructor(client, templates) {
    this.client = client
    this.templates = templates
  }

  async startPlaybook(name= "playbook run", tags, resource) {
    this.plugins = await client.sensors.list()
    this.playbook = {
      task: {
        name, tags, resource,
        type: 'reactive',
        start: true
      },
      sensors: [],
      relations: [],
      triggers: []
    }
    let targetNodes = []
    let i,k,j = 0
    for(i in this.templates){
      let playbook = await client.templates.get(this.templates[i], {format: "simplified"})
      let prefix = playbook.name + "_"

      const startSensor = playbook.sensors.reduce((prev, curr) => {
          return prev.position[0] < curr.position[0] ? prev : curr
      })
      const index = playbook.sensors.findIndex(s => s.label === startSensor.label)
      if(playbook.taskDefaults.tags.targetNode && playbook.taskDefaults.tags.targetState){
        if(playbook.taskDefaults.type === "periodic"){
          playbook.sensors[index].tickTrigger = true
          playbook.sensors[index].dataTrigger = false
          playbook.sensors[index].duration = playbook.taskDefaults.frequency * 1000
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

        //NOTE:  that the target name will also change with this, we need to avoid label colision
        for(k in playbook.sensors) {
           playbook.sensors[k].label = prefix + playbook.sensors[k].label
        }

        playbook.triggers = playbook.triggers.map( x=> { return {sourceLabel: prefix + x.sourceLabel, destinationLabel: prefix + x.destinationLabel}})

        for(k in playbook.relations){
          playbook.relations[k].label = prefix + playbook.relations[k].label
          playbook.relations[k].parentLabels = playbook.relations[k].parentLabels.map(x=> prefix + x)
        }
        targetNodes.push({
          node: prefix + playbook.taskDefaults.tags.targetNode,
          state: playbook.taskDefaults.tags.targetState
        })
        this.playbook.sensors = this.playbook.sensors.concat(playbook.sensors)
        this.playbook.triggers = this.playbook.triggers.concat(playbook.triggers)
        if(playbook.relations && playbook.relations.length > 0)
          this.playbook.relations = this.playbook.relations.concat(playbook.relations)
      }
    }
    const resultNetwork = this.createTaskResultGate(targetNodes)
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

  createTaskResultGate(nodes) {
    const createAlarmPlug = {...this.getPlugin('createAlarm'), label: 'createResultAlarm'}
    const clearAlarmPlug = {...this.getPlugin('clearAlarm'), label: 'clearResultAlarm'}
    const relations = [{
      label: 'PROBLEM',
      type: 'OR',
      parentLabels: nodes.map(x=> x.node),
      combinations: [nodes.map((x) => x.state)],
      position: [ 1800 , 150]
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
        position: [ 2000, 100 ]
      },
      {
      label: clearAlarmPlug.label,
      name: clearAlarmPlug.name,
      version: clearAlarmPlug.version,
      properties: {
        type: 'Taks result',
        resource: '${task.TASK_ID}'
      },
      position: [ 2000, 300 ]
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
