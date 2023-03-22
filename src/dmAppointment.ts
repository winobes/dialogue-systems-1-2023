import { MachineConfig, send, Action, assign } from "xstate";

function say(text: string): Action<SDSContext, SDSEvent> {
  return send((_context: SDSContext) => ({ type: "SPEAK", value: text }));
}

interface Grammar {
  [index: string]: {
    intent: string;
    entities: {
      [index: string]: string;
    };
  };
}

const grammar: Grammar = {
  lecture: {
    intent: "None",
    entities: { title: "Dialogue systems lecture" },
  },
  lunch: {
    intent: "None",
    entities: { title: "Lunch at the canteen" },
  },
  "on friday": {
    intent: "None",
    entities: { day: "Friday" },
  },
  "on thursday": {
    intent: "None",
    entities: { day: "Thursday" },
  },
  "on wednesday": {
    intent: "None",
    entities: { day: "Wednesday" },
  },
  "on tuesday": {
    intent: "None",
    entities: { day: "Tuesday" },
  },
  "on monday": {
    intent: "None",
    entities: { day: "Monday" },
  },
  "on sunday": {
    intent: "None",
    entities: { day: "Sunday" },
  },
  "on saturday": {
    intent: "None",
    entities: { day: "Saturday" },
  },
  "at 10": {
    intent: "None",
    entities: { time: "10:00" },
  },
};

const getEntity = (context: SDSContext, entity: string) => {
  // lowercase the utterance and remove tailing "."
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  if (u in grammar) {
    if (entity in grammar[u].entities) {
      return grammar[u].entities[entity];
    }
  }
  return false;
};

const isCreateMeeting = (context: SDSContext) => {
  // lowercase the utterance and remove tailing "."
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  if (u == 'create a meeting') {
    return true
  }
  return false;
};

const getWhoIs = (context: SDSContext, entity: string) => {
  // lowercase the utterance and remove tailing "."
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  const regex = /who is (.[^\?]+)(\?)?/g;
  m = [...u.matchAll(regex)][0]
  if (!(m == undefined)) {
    return m[1]
  }
  return false;
};

const isAffirmative = (context: SDSContext) => {
  // lowercase the utterance and remove tailing "."
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  if (u == 'yes') {
    return true
  }
  return false;
};

const isNegatory = (context: SDSContext) => {
  // lowercase the utterance and remove tailing "."
  let u = context.recResult[0].utterance.toLowerCase().replace(/\.$/g, "");
  if (u == 'no') {
    return true
  }
  return false;
};


export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = {
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
      on: {
        RECOGNISED: [
          {
            target: "createMeeting",
            cond: (context) => isCreateMeeting(context),
          },
          {
            target: "tellWhoIs",
            cond: (context) => !!getWhoIs(context),
            actions: assign({
              victim: (context) => getWhoIs(context),
            }),
          },
          {
            target: ".nomatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("Hi, person. From here, you can create a meeting by saying 'create a meeting' or you can ask me who someone is."),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(
            "I didn't understand that. Tell me something I know."
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
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
            value: `${context.victimInfo.Abstract.slice(0,100)}`,
          })),
        },
      }
    },

    meetVictim: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "askDay",
            cond: (context) => isAffirmative(context),
            actions: assign({
              title: (context) => `meeting with ${context.victim}`
            }),
          },
          {
            target: "idle",
            cond: (context) => isNegatory(context),
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
            value: `Do you want to meet ${context.victim}?`
          })),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Sorry, I don't understand that. Do you want to meet ${context.victim} yes or no??`
          })),
          on: { ENDSPEECH: "ask" },
        },
      }
    },

    createMeeting: {
      initial: "prompt",
      on: {
        RECOGNISED: [
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
        TIMEOUT: "idle",
      },
      states: {
        prompt: {
          entry: say("Let's create a meeting. What is the meeting about?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(
            "Sorry, I don't know what it is. Please tell me something I know."
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },

    askDay: {
      initial: "prompt",
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
      },
      states: {
        prompt: {
          entry: say("What day is the meeting?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(
            "Sorry, I don't understand that. Please tell me what day of the week the meeting is."
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },

    time: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "confirmTimedMeeting",
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
      },
      states: {
        prompt: {
          entry: say("What time is the meeting?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(
            "Sorry, I don't understand that. Please tell me what time week the meeting is."
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },

    wholeDay: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "confirmWholeDayMeeting",
            cond: (context) => isAffirmative(context),
	    actions: assign({
	       time: (context) => null
	    }),
          },
          {
            target: "time",
            cond: (context) => isNegatory(context),
          },
          {
            target: ".nomatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("Will it take the whole day?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(
            "Sorry, I don't understand that. Will it be the whole day yes or no??"
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },

    info: {
      entry: send((context) => ({
        type: "SPEAK",
        value: `OK, ${context.title} on ${context.day}`,
      })),
      on: { ENDSPEECH: "init" },
    },

    confirmTimedMeeting: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "createMeeting",
            cond: (context) => isNegatory(context),
          },
          {
            target: "info",
            cond: (context) => isAffirmative(context),
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
            value: `Do you want me to create a meeting titled ${context.title} on ${context.day} at ${context.time}?`
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
      }
    },

    confirmWholeDayMeeting: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "info",
            cond: (context) => isAffirmative(context),
          },
          {
            target: "createMeeting",
            cond: (context) => isNegatory(context),
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
            value: `Do you want me to create a meeting titled ${context.title} on ${context.day} for the whole day?`
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
      }
    },

  }
};

const kbRequest = (text: string) =>
  fetch(
    new Request(
      `https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`
    )
  ).then((data) => data.json());
