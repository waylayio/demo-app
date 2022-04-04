# Demo app with waylay-js

You can check the app here: [demo app](https://waylayio.github.io/demo-app/)

Default domain is configured in [config.js](js/config.js). Demo is written in jQuery :), nothing fancy. Should be easy to convert it to react or vue or whatever.

## Who is this for?

In case you want to create your custom dashboards, widgets or rules, it is always good to code from the example. Idea behind this project is to give you some ideas. Most of the examples are simple, you can browse the code and see how we fetch data, how we list or start new tasks, or how we search for alarms. There is only one waylay package in this app, which is based on this [sdk](https://sdk.waylay.io/).

## Builder libraries
This demo comes with two different rules builder libraries [RulePlaybooksBuilder](js/playbookBuilder.js) which allows you to merge playbooks to one expanded task: and [RuleBuilder](js/rulesBuilder.js), which allows you to dynamically create rules by creating task network on the fly.
These classes are not written as modules, to avoid CORS issues when just opening the index.html file, but you can change that if you like.

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

Normally these rules will be in the backend code, so that your front end has a different login flow then what you would have in the waylay console. In this code example, we have setup the waylay client using waylay credentials. You can login to the app using your console account or you can just provide your JWT token as the URL parameter and hosted it as an app in the console. If you create your own app, normally you would provide your own access control and then you can as well from the backend use waylay [npm package](https://www.npmjs.com/package/@waylay/client), in which case you will probaly start with something like this: 
```
const Waylay = require('@waylay/client')

const client = new Waylay({
  clientID: 'CLIENT_ID',
  secret: 'CLIENT_SECRET',
  domain: 'my-domain.waylay.io'
}).loadSettings()
```

Full Waylay SDK is described  [here](https://sdk.waylay.io/#waylay). 

Then you can setup rules this way:

```
let rulePlaybook = await RulePlaybooksBuilder.initialize(client)
let ruleBuilder = await RuleBuilder.initialize(client)
```

Further we will only discuss RulePlaybooksBuilder class.

## Using RulePlaybooksBuilder
Idea behind this project is that set of playbooks with target nodes/state will result in the alarm creation, either on the task level (taskID) or by specifying one particular resource. Alarm is fired every time any of the running playbooks reach that desired state. Another use case that is also featured in this demo is possiblity to have other set of playbooks subscribing to the alarm events and fire any time alarm is created or updated.

![image](https://user-images.githubusercontent.com/1268521/161003338-480e051e-3e87-4c75-9467-703e64abab8e.png)


### Creating tasks that merges playbooks

First you need to create several playbooks, and then you can start them this way:

```
let task = await rulePlaybook.startFromPlaybooks(task_name, playbooks, variables, resource, tags)
```

variables is flat list of all variables that will be provided to all playbooks. 
Playbooks must have `targetNode` and `targetState` tags which will be used to deduct if the particular condition of the playbook has been reached. 
Resulting task will merge all target nodes and generate an alarm with the task Id of the running task, in case any of underlying playbooks has reached its condition. 

Example of `targetNode` and `targetState` tags:

<img width="633" alt="image" src="https://user-images.githubusercontent.com/30588687/158630192-0af3bdbb-037a-4443-815b-c71e3ff34b4d.png">

In the app, you can select playbooks to be merged (please note that this app is not actually adding any variables into the templates, that is left our. Normally you can read out this from the template in your own wizard UI and add these input variables.

<img width="1125" alt="image" src="https://user-images.githubusercontent.com/1268521/158909126-e2fe7c1b-c518-4d28-98a1-42801b570b94.png">
You can also in JSON editor change input playbook variables, which need to be provided in case you want to change default values that are inside each of the playbook variables.

Once you start all playbooks, they will all unfold into one task:
<img width="1132" alt="image" src="https://user-images.githubusercontent.com/1268521/158449624-9ffebd60-90ef-4bc0-bd50-140d46bcae7e.png">


### Subscribing to the running task (created in previous step)

You can then subscribe other playbooks to 'fire' any time this a particular condition is reached, using that task id (`task.ID`):

```
let task2 = await rulePlaybook.subscribePlaybooksToTask(id, task_name, playbooks, variables,  tags)
```

This is similar to subscribing to the task event and invoking playbooks any time condition is met. Other option is to check the status of the running playbook this way and in case that result is true, run some other logic. Again, the id is (`task.ID`)

```
let result = await checkStatus(id)
```

## Using RuleBuilder
This class creates rules on a fly based on few sensors, which either process data as it arrives, or it uses data statistical processing.

First you need to select a resource, and then select metric and the range:
![image](https://user-images.githubusercontent.com/1268521/158543346-114e1dab-92be-4514-b3de-3086df4b1d9c.png)

This class creates rules on a fly based on few sensors, which either process data as it arrives, or it uses data statistical processing. You need to select out of boundaries for lower and upper limit, if values are above or below, an alarm Out of Range will be generated (on that resource), unlike in the previous example where the alarm is generated on the rules task ID.


This class creates rules on a fly based on few sensors, which either process data as it arrives, or it uses data statistical processing. You need to select out of boundaries for lower and upper limit, if values are above or below, an alarm Out of Range will be generated on the running task ID

After adding all triggers
![image](https://user-images.githubusercontent.com/1268521/158543765-f9f42233-5dba-4b91-bcff-f432f37a7913.png)

You can start a task and check it in the console
![image](https://user-images.githubusercontent.com/1268521/158543936-455804da-aa88-4707-b5a8-b421599d8dba.png)


## Notification rules
Notification rule is creating a subscription task on the ALARMS (or resource if you wish), where playbook(s) or one particular sensor (like SMS or email) are called every time ALARM is raised
![image](https://user-images.githubusercontent.com/1268521/158544225-c1ff0c12-e0a7-4e3e-9774-9102024902d5.png)


In the console you can verify the task:
![image](https://user-images.githubusercontent.com/1268521/158544345-0eadfe4c-784d-423b-b7e1-1922c9a22a1a.png)
