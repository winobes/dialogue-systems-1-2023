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
  vlad: {
    intent: "None",
    entities: { title: "Vlad Maraev" },
  },
  staffan: {
    intent: "None",
    entities: { title: "Staffan Larsson" },
  },
  "on friday": {
    intent: "None",
    entities: { day: "Friday" },
  },
  "at ten": {
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
            target: "info",
            cond: (context) => !!getEntity(context, "title"),
            actions: assign({
              title: (context) => getEntity(context, "title"),
            }),
          },
          {
            target: "chitchat",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("Tell me who do you want to meet."),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
      },
    },
    info: {
      entry: send((context) => ({
        type: "SPEAK",
        value: `OK, ${context.title}`,
      })),
      on: { ENDSPEECH: "init" },
    },
    chitchat: {
      initial: "apiCall",
      entry: assign({
        chatInput: (context) => ({
          past_user_inputs: [],
          generated_responses: [],
          text: context.recResult[0].utterance,
        }),
      }),
      on: {
        RECOGNISED: {
          target: ".apiCall",
          actions: assign({
            chatInput: (context) => ({
              past_user_inputs: context.chatInput.past_user_inputs,
              generated_responses: context.chatInput.generated_responses,
              text: context.recResult[0].utterance,
            }),
          }),
        },
      },
      states: {
        apiCall: {
          invoke: {
            id: "getResponce",
            src: (context) => chatRequest(context.chatInput),
            onDone: {
              target: "respond",
              actions: assign({
                chatInput: (_context, event) => event.data.conversation,
              }),
            },
          },
        },
        respond: {
          entry: (context) => console.log(context.chatInput),
          initial: "prompt",
          states: {
            prompt: {
              entry: send((context) => ({
                type: "SPEAK",
                value:
                  context.chatInput.generated_responses[
                    context.chatInput.generated_responses.length - 1
                  ],
              })),
              on: { ENDSPEECH: "ask" },
            },
            ask: { entry: send("LISTEN") },
          },
        },
      },
    },
  },
};

const kbRequest = (text: string) =>
  fetch(
    new Request(
      `https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`
    )
  ).then((data) => data.json());

const API_TOKEN = "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";
const chatRequest = (data: ChatInput) =>
  fetch(
    new Request(
      "https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill",
      {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
        method: "POST",
        body: JSON.stringify({ inputs: data }),
      }
    )
  ).then((data) => data.json());
