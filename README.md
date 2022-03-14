# Demo app with waylay-js

Please check the [config.js](js/config.js) to setup the right domain.
Demo is written in jQuery :), nothing fancy. Should be easy to convert it to react or vue or whatever.

## Who is this for?

In case you want to create your custom dashboards, widgets or rules, it is always good to code from the example. Idea behind this project is to give you some ideas. Most of the examples are simple, you can browse the code and see how we fetch data, how we list or start new tasks, or how we search for alarms. There is only one waylay package in this app, which is based on this [sdk](https://sdk.waylay.io/).

## Builder libraries
This demo comes with two different rules builder libraries `RulePlaybooksBuilder` which allows you to merge playbooks to one expanded task: and `RuleBuilder`, which allows you to dynamically create rules by creating task network on the fly.

In order to setup a client, you can for instance use this code:

```
if(ops.domain) {
  client = new waylay({domain: ops.domain})
  await client.login(ops.user, ops.password)
  .catch(error => {
    loginError.show()
  })
} else {
  client = new waylay({token: ops.token})
}
await client.loadSettings()
```

Normally these rules will be in the backend code, so that your front end has a different login flow the what you would have in the waylay console. In the example, we have setup the waylay client using waylay credentials.

Then you can setup rules this way:

```
rulePlaybook = await RulePlaybooksBuilder.initialize(client)
ruleBuilder = await RuleBuilder.initialize(client)
```

Further we will only discuss RulePlaybooksBuilder class.

### Using RulePlaybooksBuilder
First you need to create several playbooks, and then you can start them this way:

```
let task = await rulePlaybook.startFromPlaybooks(task_name, playbooks, variables, resource, tags)
```

variables is flat list of all variables that will be provided to all playbooks. Each playbook should have one `targetNode` and `targetState` which will be used to deduct if the particular condition of the playbook has been reached. Resulting task will merge all target nodes and generate an alarm with the task Id of the running task, in case any of underlying playbooks has reached its condition. If that is not specified, code will assume that the last right node with the first state is used as the end condition of that playbook.

You can then subscribe other playbooks to 'fire' any time this condition is reached, using that task id (`task.ID`):

```
let task2 = await rulePlaybook.subscribePlaybooksToTask(id, task_name, playbooks, variables,  tags)
```

This is similar to subscribing to the task event and invoking playbooks any time condition is met. Other option is to check the status of the running playbook this way and in case that result is true, run some other logic. Again, the id is (`task.ID`)

```
let result = await checkStatus(id)
```
