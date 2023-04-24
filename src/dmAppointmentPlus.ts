import { MachineConfig, send, Action, assign } from "xstate";

function say(text: string): Action<SDSContext, SDSEvent> {
  return send((_context: SDSContext) => ({ type: "SPEAK", value: text }));
}

function prompt(context:SDSContext, text: string): Action<SDSContext, SDSEvent>{
  return [say(text), assign({promtCount: (context) => context.promptCount + 1})]
}

const getConfirmedEntity = (context: SDSContext, entity: string) => {
  for (var ent of context.confirmedEnts){
    if (ent.category == entity) {
      return ent.text;
    }
  }
  return false; 
}

const getEntity = (context: SDSContext, entity: string) => {
  // lowercase the utterance and remove tailing "."
  for (var ent of context.nluResult.prediction.entities) {
    if (ent.category == entity) {
      return ent.text
    }
  }
  return false;
};


const isIntent = (context: SDSContext, intent: string) => {
  if (context.nluResult.prediction.topIntent == intent) {
    return true;
  }
  return false;
}

const abbreviateAbstract = (abstract: string) => {
  var firstDotIdx = abstract.indexOf('. ')
  if (firstDotIdx == -1) {
    return abstract
  }
  else {
    return abstract.slice(0, firstDotIdx)
  }
}

const intentCR = (context: SDSContext) => {
  var intent = context.nluResult.prediction.topIntent
  if (intent == 'affirmative') {
    return "Is that a 'yes'?"
  }
  else if (intent == 'negatory') {
    return "Is that a 'no'?"
  }
  else if (intent == 'create a meeting'){
    return "Did you want me to create a meeting?"
  }
  else if (intent == 'who is') {
    var victim = getEntity(context, 'victim')
    if (victim) {
      return `Sorry, did you mean to ask who ${victim} is?`
    }
    else {
      return "Sorry, did you mean to ask who someone is?"
    }
  }
  else {
    return `Did you mean ${intent}?`
  }
}



export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = {
  type: 'parallel',
  states: {
    flow: {

      initial: "idle",
      states: {

        idle: {
          on: {
            CLICK: "init",
          },
        },

        init: {
          on: {
            TTS_READY: "welcome",
            CLICK: "welcome",
          },
        },

        welcome: {
          initial: "prompt",
          entry: [send("RESETPROMPT"), send("CONFIRMINTENTS")],
          on: {
            UNDERSTOOD: [
              {
                target: "createMeeting",
                cond: (context) => context.confirmedIntent == "create a meeting",
              },
              {
                target: "tellWhoIs",
                cond: (context) => context.confirmedIntent == "who is" && !!getConfirmedEntity(context, "victim"),
                actions: assign({
                  victim: (context) => getConfirmedEntity(context, "victim"),
                }),
              },
              {
                target: "welcomeHelp",
                cond: (context) => context.confirmedIntent == "get help",
              },
              {
                target: ".nomatch",
              },
            ],
            NOTUNDERSTOOD: ".prompt",
            RESET: "idle",
          },
          states: {
            prompt: {
              entry: send("PROMPT"),
              on: {
                ENDSPEECH: "ask",
                PROMPT1: {actions: say("Welcome! I can put events in your calendar and tell you about people.")},
                PROMPT2: {actions: say("Would you like to create an event? You can also ask me who someone is.")},
                PROMPT3: {actions: say("To create a calendar event, try saying 'create a meeting'. Or if you want to know about who someone is, try asking a question like this: 'who is Beyoncé?'")},
              }
            },
            ask: { 
              entry: send("LISTEN"),
              on: { TIMEOUT: "prompt", },
            },
            nomatch: {
              entry: say("I didn't understand that."),
              on: { ENDSPEECH: "prompt" },
            },
      hist: {
        type: "history",
        history: "shallow"
      }
          },
        },

        welcomeHelp: {
          entry: send((context) => ({
            type: "SPEAK",
            value: "This app can do two things: Book meetings in your calendar or tell you about someone famous. If you want to create a meeting, try saying 'create a meeting'. If you want to know who someone is, try asking me a question like this: 'Who is Beyoncé?'",
          })),
          on: { ENDSPEECH: "welcome.hist" },
        },

        tellWhoIs: {
          initial: "okcool",
          on : { ENDSPEECH: "meetVictim" },
          states: {
            okcool: {
              entry: send((context) => ({
                type: "SPEAK",
                value: `Ok cool, so you want to know who ${context.victim} is. Let me look that up for you.`,
              })),
              on: { ENDSPEECH: "lookup" },
            },
            lookup: {
              invoke: {
                src: (context, event) => kbRequest(context.victim),
                onDone: {
                  target: "saywhois",
                  actions: assign({ 
                    victimInfo: (context, event) => event.data
                  }),
                },
                onError: {
                  target: "failure",
                  actions: assign({ 
                    error : (context, event) => event.data
                  }),
                }
              }
            },
            failure:{
              on: {
                RETRY: {target: 'lookup'}
              }
            },
            saywhois: {
              entry: send((context) => ({
                type: "SPEAK",
                value: `${abbreviateAbstract(context.victimInfo.Abstract)}`,
              })),
            },
          }
        },

        meetVictim: {
          initial: "prompt",
	        entry: [send("RESETPROMPT"), send("CONFIRMINTENTS") ],
          on: {
            UNDERSTOOD: [
              {
                target: "meetVictimHelp",
                cond: (context) => tent(context, "get help"),
                cond: (context) => context.confirmedIntent == "get help",
              },
              {
                target: "askDay",
                cond: (context) => context.confirmedIntent == "affirmative",
                actions: assign({
                  title: (context) => `meeting with ${context.victim}`
                }),
              },
              {
                target: "idle",
                cond: (context) => context.confirmedIntent == "negatory",
              },
              {
                target: ".nomatch",
              },
            ],
            NOTUNDERSTOOD: ".prompt",
            RESET: "idle",
          },
          states: {
            prompt: {
              entry: send("PROMPT"),
	            on: {
                ENDSPEECH: "ask" ,
                PROMPT1: {actions: send((context) => ({type:"SPEAK", value:`Do you want to meet ${context.victim}?`}))},
                PROMPT2: {actions: send((context) => ({type:"SPEAK", value:`I told you who ${context.victim} is. I can set up a meeting with them if you want. Do you want me to set up a meeting?`}))},
                PROMPT3: {actions: send((context) => ({type:"SPEAK", value:`Should I schedule a meeting with ${context.victim}?`}))},
              }
            },
            ask: { 
              entry: send("LISTEN"),
              on: { TIMEOUT: "prompt", },
            },
            nomatch: {
              entry: say("I didn't understand that."),
              on: { ENDSPEECH: "prompt" },
            },
          }
        },

        meetVictimHelp: {
          entry: send((context) => ({
            type: "SPEAK",
            value: "I'm asking you if you want to meet the person I just described. If you do, I can put a meeting in your calendar. And they have to come because I put it in the calendar. I'll tell you about them again so you can decide if you want to meet them.",
          })),
          on: { ENDSPEECH: "tellWhoIs.saywhois" },
        },

        createMeeting: {
          initial: "prompt",
	        entry: [ send("RESETPROMPT"), send("FREESPEECH") ],
          exit: send("CONFIRMINTENTS"),
          on: {
            RECOGNISED: [
              {
                target: "createMeetingHelp",
                cond: (context) => context.confirmedIntent == "help",
              },
              {
                target: "askDay",
                cond: (context) => !!getEntity(context, "title"),
                actions: assign({
                  title: (context) => getEntity(context, "title"),
                }),
              },
              {
                target: ".nomatch",
              },
            ],
            NOTUNDERSTOOD: ".prompt",
            RESET: "idle",
          },
          states: {
            prompt: {
              entry: send("PROMPT"),
	            on: {
                ENDSPEECH: "ask" ,
                PROMPT1: {actions: say("What is the meeting about?")},
                PROMPT2: {actions: say("Tell me what you want the meeting to be called.")},
                PROMPT3: {actions: say("Give me a meeting title.")},
              }
            },
            ask: { 
              entry: send("LISTEN"),
              on: { TIMEOUT: "prompt", },
            },
            nomatch: {
              entry: say("I didn't understand that."),
              on: { ENDSPEECH: "prompt" },
            },
          }
        },

        createMeetingHelp: {
          entry: send((context) => ({
            type: "SPEAK",
            value: "I'm asking for a title for the meeting. It will appear under this title in your calendar. If you really want to call the meeting 'help', then I'm sorry, there's no way to do that. So let's try again. What do you want the meeting to be called?",
          })),
          on: { ENDSPEECH: "createMeeting.ask" },
        },

        askDay: {
          initial: "prompt",
	        entry: [send("RESETPROMPT"), send("FREESPEECH")],
          on: {
            RECOGNISED: [
              {
                target: "wholeDay",
                cond: (context) => !!getEntity(context, "day"),
                actions: assign({
                  day: (context) => getEntity(context, "day"),
                }),
              },
              {
                target: ".nomatch",
              },
            ],
            TIMEOUT: ".prompt",
            RESET: "idle",
          },
          states: {
            prompt: {
              entry: send("PROMPT"),
	            on: {
                ENDSPEECH: "ask" ,
                PROMPT1: {actions: say("What day?")},
                PROMPT2: {actions: say("What day of the week is the meeting?")},
                PROMPT3: {actions: say("For which day of the week do you want me to schedule the meeting?")},
              }
            },
            ask: { entry: send("LISTEN") },
            nomatch: {
              entry: say("I didn't understand that."),
              on: { ENDSPEECH: "prompt" },
            },
          }
        },

        time: {
          initial: "prompt",
	        entry: [send("RESETPROMPT"), send("FREESPEECH")],
          on: {
            RECOGNISED: [
              {
                target: "confirmMeeting",
                cond: (context) => !!getEntity(context, "time"),
                actions: assign({
                  time: (context) => getEntity(context, "time"),
                }),
              },
              {
                target: ".nomatch",
              },
            ],
            TIMEOUT: ".prompt",
            RESET: "idle",
          },
          states: {
            prompt: {
              entry: send("PROMPT"),
	            on: {
                ENDSPEECH: "ask" ,
                PROMPT1: {actions: say("For what time?")},
                PROMPT2: {actions: say("What time is the meeting?")},
                PROMPT3: {actions: say("What time do you want me to schedule the meeting for?")},
              }
            },
            ask: {
              entry: send("LISTEN"),
            },
            nomatch: {
              entry: say(
                "Sorry, I don't understand that. Please tell me what time the meeting is."
              ),
              on: { ENDSPEECH: "ask" },
            },
          },
        },

        timeHelp: {
          entry: send((context) => ({
            type: "SPEAK",
            value: "I'm trying to ask you at what time the meeting is. Try saying '10AM' or whenever the meeting is.",
          })),
          on: { ENDSPEECH: "time.ask" },
        },

        wholeDay: {
          initial: "prompt",
	        entry: [ send("RESETPROMPT"), send("CONFIRMINTENTS") ],
          on: {
            UNDERSTOOD: [
              {
                target: "wholeDayHelp",
                cond: (context) => context.confirmedIntent == "get help",
              },
              {
                target: "confirmMeeting",
                cond: (context) => context.confirmedIntent == "affirmative",
                actions: assign({
                  time: (context) => null
                }),
              },
              {
                target: "time",
                cond: (context) => context.confirmedIntent == "negatory",
              },
              {
                target: ".nomatch",
              },
            ],
            NOTUNDERSTOOD: ".prompt",
            RESET: "idle",
          },
          states: {
            prompt: {
              entry: send("PROMPT"),
	            on: {
                ENDSPEECH: "ask" ,
                PROMPT1: {actions: say("Will it take the whole day?")},
                PROMPT2: {actions: say("Is it a whole-day meeting?")},
                PROMPT3: {actions: say("If you want me to schedule it for the whole day say 'yes'. Or say 'no' if you want to schedule it for a particular time.")},
              }
            },
            ask: { 
              entry: send("LISTEN"),
              on: { TIMEOUT: "prompt", },
            },
            nomatch: {
              entry: say("I didn't understand that."),
              on: { ENDSPEECH: "prompt" },
            },
          }
        },

        wholeDayHelp: {
          entry: send((context) => ({
            type: "SPEAK",
            value: "I need to know if I should put a time for the meeting. If it's the whole day then I won't put a specific time. So just answer yes or no: will the meeting take the whole day?",
          })),
          on: { ENDSPEECH: "wholeDay.ask" },
        },

        info: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `OK, ${context.title} on ${context.day}`,
          })),
          on: { ENDSPEECH: "init" },
        },

        confirmMeeting: {
          initial: "prompt",
          on: {
            RECOGNISED: [
              {
                target: "info",
                cond: (context) => isIntent(context, "affirmative"),
              },
              {
                target: "welcome",
                cond: (context) => isIntent(context, "negatory"),
              },
              {
                target: ".nomatch",
              },
            ]
          },
          states: {
            prompt: {
              entry: send((context) => ({
                type: "SPEAK",
                value: `Do you want me to create a meeting titled ${context.title} on ${context.day}` + (context.time ? ` at ${context.time}?` : '?')
              })),
              on: { ENDSPEECH: "ask" },
            },
            ask: {
              entry: send("LISTEN"),
            },
            nomatch: {
              entry: say(
                "Sorry, I don't understand that. Is the meeting ok yes or no??"
              ),
              on: { ENDSPEECH: "ask" },
            },
          },
        },

        confirmMeetingHelp: {
          entry: send((context) => ({
            type: "SPEAK",
            value: "I need you to confirm that the meeting details are correct so I can put it in your calendar.",
          })),
          on: { ENDSPEECH: "confirmMeeting.prompt" },
        },

      }
    },

    prompt: {
      type: 'parallel',
      id: 'prompt',
      states: {
        repromptCount: {
          initial: 'init',
          states: {
            init: {
              on: {PROMPT: {target: 'one', actions: send("PROMPT1")}},
            },
            one: {
              on: {PROMPT: {target: 'two', actions: send("PROMPT2")}},
            },
            two: {
              on: {PROMPT: {target: 'three', actions: send("PROMPT3")}},
            },
            three: {
              on: {
                PROMPT: {actions: send("PROMPTDONE")} 
              }
            }
          }
        },
        userInput:{
          states:{
            yes: { 
              on: {
                PROMPTDONE: {actions: [send("RESETPROMPT"), send("PROMPT")]}
              }
            },
            no: {
              on: {
                RECOGNISED: 'yes',
                PROMPTDONE: {actions: [send("RESET"), say("I'm going to sleep now.")] }
              }
            }
          }
        }
      },
      on : {RESETPROMPT: {target: ['.repromptCount.init', '.userInput.no']}}
    },

    nluConfirm: {
      initial: 'init',
      on: { FREESPEECH: '.void', CONFIRMINTENTS: '.init'},
      states: {
        void: { },
        init: { 
          on: { RECOGNISED: [
            { 
              target: 'understood',
              cond: (context) => context.nluResult.prediction.intents[0].confidenceScore > 0.90,
              actions: [
                assign({ pendingIntent: (context) => context.nluResult.prediction.topIntent, }),
                assign({ pendingEnts: (context) => context.nluResult.prediction.entities, }),
              ],
            },
            { 
              target: 'clarify',
              cond: (context) => context.nluResult.prediction.intents[0].confidenceScore < 0.6,
            },
            {
              target: 'confirm', // default action for between high and low thresholds 
              actions: [assign({ 
                pendingIntent: (context) => context.nluResult.prediction.topIntent,
              }),
                assign({
                pendingEnts: (context) => context.nluResult.prediction.entities,
              }),],
            }
          ]},
        },
        understood: {
          entry: [ 
             assign({ confirmedIntent: (context) => context.pendingIntent, }),
             assign({ confirmedEnts: (context) => context.pendingEnts, }),
            send("UNDERSTOOD"), send("CONFIRMINTENTS")
          ],
        },
        confirm: { 
          initial: "prompt",
          on: {
            RECOGNISED: [
              {
                target: 'understood',
                cond: (context) => isIntent(context, "affirmative"),
              },
              {
                target: 'clarify',
              }
            ]
          },
          states: {
            prompt: {
              entry: send((context) => ({
                type: "SPEAK",
                value: `${intentCR(context)}`
              })),
              on: { ENDSPEECH: "ask" },
            },
            ask: {
              entry: send("LISTEN"),
            },
          }
        },
        clarify: {
          entry: [ // clarification is handeled by the calling state (e.g. with a re-prompt)
            assign({ confirmedIntent: (context) => null}),
            assign({ confirmedEnts: (context) => null }),
            send("NOTUNDERSTOOD"), send("CONFIRMINTENTS"),
            say("Let's try again."),
          ]
        },
      },
    }

  }
};

const kbRequest = (text: string) =>
  fetch(
    new Request(
      `https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`
    )
  ).then((data) => data.json());
